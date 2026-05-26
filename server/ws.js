const jwt  = require('jsonwebtoken');
const net  = require('net');
const { Client } = require('ssh2');
const { SocksClient } = require('socks');
const { getServerById, getKeyById, getProxyById, touchServer, getTempServerById } = require('./db');

const JWT_SECRET  = process.env.JWT_SECRET || 'changeme';
const SESSION_TTL = 30 * 60 * 1000; // 30 min idle cleanup for permanent sessions
const BUF_MAX     = 150 * 1024;     // 150 KB replay buffer

// ── Permanent session registry ─────────────────────────────────────────────────
const registry = new Map(); // resumeKey -> SessionEntry

class SessionEntry {
  constructor(resumeKey, serverId) {
    this.resumeKey = resumeKey;
    this.serverId  = serverId;
    this.conn      = null;
    this.stream    = null;
    this.clients   = new Set();
    this.buf       = [];
    this.bufSize   = 0;
    this.alive     = true;
    this._timer    = null;
  }
  append(data) {
    this.buf.push(data);
    this.bufSize += data.length;
    while (this.bufSize > BUF_MAX && this.buf.length > 1) this.bufSize -= this.buf.shift().length;
    const msg = JSON.stringify({ type: 'output', data });
    for (const ws of this.clients) if (ws.readyState === 1) ws.send(msg);
  }
  broadcast(msg) {
    const str = JSON.stringify(msg);
    for (const ws of this.clients) if (ws.readyState === 1) ws.send(str);
  }
  scheduleCleanup() {
    this.cancelCleanup();
    this._timer = setTimeout(() => this.destroy(), SESSION_TTL);
  }
  cancelCleanup() { if (this._timer) { clearTimeout(this._timer); this._timer = null; } }
  destroy() {
    this.alive = false;
    try { if (this.stream) this.stream.end(); } catch {}
    try { if (this.conn)   this.conn.end();   } catch {}
    registry.delete(this.resumeKey);
    console.log(`[SSH] Permanent session ${this.resumeKey} destroyed`);
  }
}

// ── Proxy socket creation ──────────────────────────────────────────────────────
async function createProxiedSocket(server, proxy) {
  if (proxy.type === 'socks5') {
    const opts = {
      proxy: { host: proxy.host, port: proxy.port, type: 5 },
      command: 'connect',
      destination: { host: server.host, port: server.port },
    };
    if (proxy.username) { opts.proxy.userId = proxy.username; opts.proxy.password = proxy.password || ''; }
    const { socket } = await SocksClient.createConnection(opts);
    return socket;
  } else if (proxy.type === 'http') {
    return new Promise((resolve, reject) => {
      const sock = net.createConnection(proxy.port, proxy.host, () => {
        const auth = proxy.username
          ? `Proxy-Authorization: Basic ${Buffer.from(`${proxy.username}:${proxy.password || ''}`).toString('base64')}\r\n`
          : '';
        sock.write(`CONNECT ${server.host}:${server.port} HTTP/1.1\r\nHost: ${server.host}:${server.port}\r\n${auth}\r\n`);
      });
      const t = setTimeout(() => reject(new Error('Proxy timeout')), 10000);
      sock.once('data', chunk => {
        clearTimeout(t);
        if (chunk.toString().includes('200')) resolve(sock);
        else reject(new Error(`HTTP proxy error: ${chunk.toString().split('\n')[0]}`));
      });
      sock.once('error', err => { clearTimeout(t); reject(err); });
    });
  }
  throw new Error(`Unknown proxy type: ${proxy.type}`);
}

// ── Build SSH connect options ─────────────────────────────────────────────────
async function buildConnectOptions(server) {
  const opts = {
    host: server.host, port: server.port, username: server.username,
    readyTimeout: 15000, keepaliveInterval: 10000,
  };
  if (server.auth_type === 'managed_key' && server.key_id) {
    const key = getKeyById(server.key_id);
    if (key) opts.privateKey = key.private_key;
  } else if (server.auth_type === 'key' && server.private_key) {
    opts.privateKey = server.private_key;
  } else {
    opts.password = server.password;
    opts.tryKeyboard = true;
  }
  if (server.proxy_id) {
    const proxy = getProxyById(server.proxy_id);
    if (proxy) opts.sock = await createProxiedSocket(server, proxy);
  }
  return opts;
}

// ── Attach browser client to a permanent session ──────────────────────────────
function attachPermClient(ws, entry) {
  entry.cancelCleanup();
  entry.clients.add(ws);

  // Replay buffered output
  if (entry.buf.length > 0) {
    ws.send(JSON.stringify({ type: 'output', data: entry.buf.join('') }));
  }
  ws.send(JSON.stringify({ type: 'connected', resumeKey: entry.resumeKey, data: '' }));

  ws.on('message', (msg, isBinary) => {
    if (!isBinary) {
      try {
        const data = JSON.parse(msg.toString());
        if (data.type === 'input' && entry.stream)  entry.stream.write(data.data);
        else if (data.type === 'resize' && entry.stream) entry.stream.setWindow(data.rows, data.cols, 0, 0);
      } catch {}
    } else {
      if (entry.stream) entry.stream.write(msg);
    }
  });

  ws.on('close', () => {
    entry.clients.delete(ws);
    // Browser disconnected — keep SSH alive, schedule idle cleanup
    if (entry.clients.size === 0 && entry.alive) entry.scheduleCleanup();
  });
}

// ── Start a new permanent SSH session ─────────────────────────────────────────
async function startPermSession(ws, resumeKey, server, cols, rows) {
  const entry = new SessionEntry(resumeKey, server.id || server.server_id);
  registry.set(resumeKey, entry);

  let connectOpts;
  try { connectOpts = await buildConnectOptions(server); }
  catch (e) {
    ws.send(JSON.stringify({ type: 'error', data: `Proxy error: ${e.message}` }));
    registry.delete(resumeKey);
    ws.close(); return;
  }

  const conn = new Client();
  entry.conn = conn;

  conn.on('ready', () => {
    touchServer(server.id || server.server_id);
    conn.shell({ term: 'xterm-256color', cols, rows }, (err, stream) => {
      if (err) {
        entry.broadcast({ type: 'error', data: err.message });
        entry.destroy(); return;
      }
      entry.stream = stream;
      attachPermClient(ws, entry);

      stream.on('data', d => entry.append(d.toString('binary')));
      stream.stderr.on('data', d => entry.append(d.toString('binary')));
      stream.on('close', () => {
        entry.broadcast({ type: 'disconnect', data: 'Session closed.' });
        entry.destroy();
      });
    });
  });

  conn.on('error', err => {
    if (ws.readyState === 1) ws.send(JSON.stringify({ type: 'error', data: `SSH Error: ${err.message}` }));
    entry.destroy();
  });
  conn.on('keyboard-interactive', (_n, _i, _l, _p, finish) => finish([server.password || '']));
  conn.connect(connectOpts);
}

// ── Main WebSocket handler ─────────────────────────────────────────────────────
function setupWebSocket(wss) {
  const ephemeralClients = new Set();

  // Heartbeat for all clients
  setInterval(() => {
    for (const ws of ephemeralClients) {
      if (ws.readyState === 1) try { ws.send(JSON.stringify({ type: 'ping' })); } catch {}
    }
    for (const entry of registry.values()) {
      if (entry.alive) entry.broadcast({ type: 'ping' });
    }
  }, 15000);

  wss.on('connection', async (ws, req) => {
    const url       = new URL(req.url, 'http://localhost');
    const token     = url.searchParams.get('token');
    const serverId  = url.searchParams.get('serverId');
    const resumeKey = url.searchParams.get('resumeKey'); // only for permanent sessions
    const cols      = parseInt(url.searchParams.get('cols') || '220', 10);
    const rows      = parseInt(url.searchParams.get('rows') || '50',  10);

    try { jwt.verify(token, JWT_SECRET); }
    catch { ws.send(JSON.stringify({ type: 'error', data: 'Authentication failed' })); ws.close(); return; }

    // ── PERMANENT SESSION PATH ───────────────────────────────────────────────
    if (resumeKey) {
      // Re-attach to existing running session
      if (registry.has(resumeKey)) {
        attachPermClient(ws, registry.get(resumeKey));
        return;
      }
      // resumeKey exists in DB but session died (e.g. server restart) → reconnect
      if (serverId) {
        const server = getServerById(serverId);
        if (!server) { ws.send(JSON.stringify({ type: 'error', data: 'Server not found' })); ws.close(); return; }
        await startPermSession(ws, resumeKey, server, cols, rows);
        return;
      }
      ws.send(JSON.stringify({ type: 'error', data: 'Invalid resumeKey' }));
      ws.close(); return;
    }

    // ── EPHEMERAL SESSION PATH ───────────────────────────────────────────────
    ephemeralClients.add(ws);
    ws.on('close', () => ephemeralClients.delete(ws));

    let server;
    if (serverId && serverId.startsWith('temp_')) {
      server = getTempServerById(serverId);
    } else {
      server = getServerById(serverId);
    }
    if (!server) { ws.send(JSON.stringify({ type: 'error', data: 'Server not found' })); ws.close(); return; }

    let connectOpts;
    try { connectOpts = await buildConnectOptions(server); }
    catch (e) {
      ws.send(JSON.stringify({ type: 'error', data: `Proxy error: ${e.message}` }));
      ws.close(); return;
    }

    const conn = new Client();
    let stream = null;

    conn.on('ready', () => {
      if (!server.is_temp) touchServer(serverId);
      conn.shell({ term: 'xterm-256color', cols, rows }, (err, s) => {
        if (err) { ws.send(JSON.stringify({ type: 'error', data: err.message })); ws.close(); return; }
        stream = s;
        ws.send(JSON.stringify({ type: 'connected', data: '' }));

        stream.on('data', d => {
          if (ws.readyState === 1) ws.send(JSON.stringify({ type: 'output', data: d.toString('binary') }));
        });
        stream.stderr.on('data', d => {
          if (ws.readyState === 1) ws.send(JSON.stringify({ type: 'output', data: d.toString('binary') }));
        });
        stream.on('close', () => {
          if (ws.readyState === 1) ws.send(JSON.stringify({ type: 'disconnect', data: 'Session closed.' }));
          ws.close();
        });
      });
    });

    conn.on('error', err => {
      if (ws.readyState === 1) ws.send(JSON.stringify({ type: 'error', data: `SSH Error: ${err.message}` }));
      ws.close();
    });
    conn.on('keyboard-interactive', (_n, _i, _l, _p, finish) => finish([server.password || '']));

    ws.on('message', (msg, isBinary) => {
      if (!isBinary) {
        try {
          const data = JSON.parse(msg.toString());
          if (data.type === 'input' && stream)  stream.write(data.data);
          else if (data.type === 'resize' && stream) stream.setWindow(data.rows, data.cols, 0, 0);
        } catch {}
      } else {
        if (stream) stream.write(msg);
      }
    });

    ws.on('close', () => {
      try { if (stream) stream.end(); } catch {}
      try { conn.end(); } catch {}
    });

    conn.connect(connectOpts);
  });
}

// ── Kill a permanent session (called from API route) ──────────────────────────
function killPermSession(resumeKey) {
  const entry = registry.get(resumeKey);
  if (entry) entry.destroy();
}

module.exports = { setupWebSocket, startPermSession, killPermSession, registry };
