const jwt  = require('jsonwebtoken');
const net  = require('net');
const { Client } = require('ssh2');
const { SocksClient } = require('socks');
const { getServerById, getKeyById, getProxyById, touchServer, getTempServerById } = require('./db');

const JWT_SECRET = process.env.JWT_SECRET || 'changeme';

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

// ── Main WebSocket handler ─────────────────────────────────────────────────────
function setupWebSocket(wss) {
  const clients = new Set();

  setInterval(() => {
    for (const ws of clients) {
      if (ws.readyState === 1) {
        try { ws.send(JSON.stringify({ type: 'ping' })); } catch {}
      }
    }
  }, 15000);

  wss.on('connection', async (ws, req) => {
    clients.add(ws);
    ws.on('close', () => clients.delete(ws));

    const url       = new URL(req.url, 'http://localhost');
    const token     = url.searchParams.get('token');
    const serverId  = url.searchParams.get('serverId');
    const cols      = parseInt(url.searchParams.get('cols') || '220', 10);
    const rows      = parseInt(url.searchParams.get('rows') || '50',  10);

    try { jwt.verify(token, JWT_SECRET); }
    catch { ws.send(JSON.stringify({ type: 'error', data: 'Authentication failed' })); ws.close(); return; }

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
          if (data.type === 'input' && stream) {
            stream.write(data.data);
          } else if (data.type === 'resize' && stream) {
            stream.setWindow(data.rows, data.cols, 0, 0);
          }
        } catch(e) {}
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

module.exports = { setupWebSocket };
