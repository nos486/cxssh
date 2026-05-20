const jwt  = require('jsonwebtoken');
const net  = require('net');
const { Client } = require('ssh2');
const { SocksClient } = require('socks');
const { v4: uuidv4 } = require('uuid');
const { getServerById, getKeyById, getProxyById, touchServer, getTempServerById } = require('./db');

const JWT_SECRET = process.env.JWT_SECRET || 'changeme';
const SESSION_TTL = 30 * 60 * 1000;
const BUF_MAX    = 150 * 1024;

// ── Persistent session registry ────────────────────────────────────────────────
const registry = new Map();

class SessionEntry {
  constructor(resumeKey, serverId, isTempSession = false) {
    this.resumeKey = resumeKey;
    this.serverId  = serverId;
    this.isTempSession = isTempSession;
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
    console.log(`[SSH] Session ${this.resumeKey} destroyed`);
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

// ── Attach ws client to session ───────────────────────────────────────────────
function attachClient(ws, entry, isResume) {
  entry.cancelCleanup();
  entry.clients.add(ws);
  if (isResume && entry.buf.length > 0) {
    ws.send(JSON.stringify({ type: 'output', data: entry.buf.join('') }));
  }
  ws.send(JSON.stringify({ type: isResume ? 'resumed' : 'connected', resumeKey: entry.resumeKey, data: '' }));

  ws.on('message', (msg, isBinary) => {
    if (!isBinary) {
      try {
        const data = JSON.parse(msg.toString());
        if (data.type === 'input' && entry.stream) {
          entry.stream.write(data.data);
        } else if (data.type === 'resize' && entry.stream) {
          entry.stream.setWindow(data.rows, data.cols, 0, 0);
        } else if (data.type === 'toggle_temp') {
          entry.isTempSession = data.isTemp;
        }
      } catch(e) {}
    } else {
      if (entry.stream) entry.stream.write(msg);
    }
  });
  ws.on('close', () => {
    entry.clients.delete(ws);
    if (entry.clients.size === 0 && entry.alive) entry.scheduleCleanup();
  });
}

// ── Main WebSocket handler ─────────────────────────────────────────────────────
function setupWebSocket(wss) {
  wss.on('connection', async (ws, req) => {
    const url       = new URL(req.url, 'http://localhost');
    const token     = url.searchParams.get('token');
    const serverId  = url.searchParams.get('serverId');
    const resumeKey = url.searchParams.get('resumeKey');
    const cols      = parseInt(url.searchParams.get('cols') || '220', 10);
    const rows      = parseInt(url.searchParams.get('rows') || '50',  10);
    const isTempSession = url.searchParams.get('isTemp') === 'true';

    try { jwt.verify(token, JWT_SECRET); }
    catch { ws.send(JSON.stringify({ type: 'error', data: 'Authentication failed' })); ws.close(); return; }

    // Resume
    if (resumeKey && registry.has(resumeKey)) {
      attachClient(ws, registry.get(resumeKey), true);
      return;
    }

    let server;
    if (serverId && serverId.startsWith('temp_')) {
      server = getTempServerById(serverId);
    } else {
      server = getServerById(serverId);
    }
    if (!server) { ws.send(JSON.stringify({ type: 'error', data: 'Server not found' })); ws.close(); return; }

    const newKey = uuidv4();
    const entry  = new SessionEntry(newKey, serverId, isTempSession || server.is_temp);
    registry.set(newKey, entry);

    let connectOpts;
    try { connectOpts = await buildConnectOptions(server); }
    catch (e) {
      ws.send(JSON.stringify({ type: 'error', data: `Proxy error: ${e.message}` }));
      entry.destroy(); return;
    }

    const conn = new Client();
    entry.conn = conn;

    conn.on('ready', () => {
      if (!server.is_temp) touchServer(serverId);
      conn.shell({ term: 'xterm-256color', cols, rows }, (err, stream) => {
        if (err) { entry.broadcast({ type: 'error', data: err.message }); entry.destroy(); return; }
        entry.stream = stream;
        attachClient(ws, entry, false);
        stream.on('data', d => entry.append(d.toString('binary')));
        stream.stderr.on('data', d => entry.append(d.toString('binary')));
        stream.on('close', () => { entry.broadcast({ type: 'disconnect', data: 'Session closed.' }); entry.destroy(); });
      });
    });
    conn.on('error', err => {
      if (ws.readyState === 1) ws.send(JSON.stringify({ type: 'error', data: `SSH Error: ${err.message}` }));
      entry.destroy();
    });
    conn.on('keyboard-interactive', (_n, _i, _l, _p, finish) => finish([server.password || '']));
    conn.connect(connectOpts);
  });
}

function getActiveSessions() {
  const active = [];
  for (const [resumeKey, entry] of registry.entries()) {
    if (entry.alive && !entry.isTempSession) {
      active.push({ resumeKey, serverId: entry.serverId });
    }
  }
  return active;
}

module.exports = { setupWebSocket, getActiveSessions };

// Heartbeat to prevent WebSocket idle timeouts (reverse proxies, firewalls, load balancers)
setInterval(() => {
  for (const entry of registry.values()) {
    if (entry.alive) {
      try {
        entry.broadcast({ type: 'ping' });
      } catch {}
    }
  }
}, 15000);
