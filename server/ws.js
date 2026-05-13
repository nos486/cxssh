const jwt  = require('jsonwebtoken');
const { Client } = require('ssh2');
const { v4: uuidv4 } = require('uuid');
const { getServerById, getKeyById, touchServer } = require('./db');

const JWT_SECRET = process.env.JWT_SECRET || 'changeme';
const SESSION_TTL = 30 * 60 * 1000; // 30 min idle before cleanup
const BUF_MAX    = 150 * 1024;       // 150 KB ring-buffer per session

// ── Persistent session registry ────────────────────────────────────────────────
const registry = new Map(); // resumeKey → SessionEntry

class SessionEntry {
  constructor(resumeKey, serverId) {
    this.resumeKey   = resumeKey;
    this.serverId    = serverId;
    this.conn        = null;
    this.stream      = null;
    this.clients     = new Set();
    this.buf         = [];
    this.bufSize     = 0;
    this.alive       = true;
    this._timer      = null;
  }

  append(data) {
    this.buf.push(data);
    this.bufSize += data.length;
    while (this.bufSize > BUF_MAX && this.buf.length > 1) {
      this.bufSize -= this.buf.shift().length;
    }
    // broadcast to all connected ws clients
    const msg = JSON.stringify({ type: 'output', data });
    for (const ws of this.clients) {
      if (ws.readyState === 1) ws.send(msg);
    }
  }

  broadcast(msg) {
    const str = JSON.stringify(msg);
    for (const ws of this.clients) {
      if (ws.readyState === 1) ws.send(str);
    }
  }

  scheduleCleanup() {
    this.cancelCleanup();
    this._timer = setTimeout(() => this.destroy(), SESSION_TTL);
  }

  cancelCleanup() {
    if (this._timer) { clearTimeout(this._timer); this._timer = null; }
  }

  destroy() {
    this.alive = false;
    try { if (this.stream) this.stream.end(); } catch {}
    try { if (this.conn)   this.conn.end();   } catch {}
    registry.delete(this.resumeKey);
    console.log(`[SSH] Session ${this.resumeKey} destroyed`);
  }
}

// ── Helpers ────────────────────────────────────────────────────────────────────
function attachClient(ws, entry, isResume) {
  entry.cancelCleanup();
  entry.clients.add(ws);

  // replay buffer on resume
  if (isResume && entry.buf.length > 0) {
    ws.send(JSON.stringify({ type: 'output', data: entry.buf.join('') }));
  }
  ws.send(JSON.stringify({
    type: isResume ? 'resumed' : 'connected',
    resumeKey: entry.resumeKey,
    data: isResume ? 'Session resumed.' : `Connected to ${entry.serverId}`,
  }));

  ws.on('message', raw => {
    try {
      const msg = JSON.parse(raw);
      if (!entry.alive) return;
      if (msg.type === 'input' && entry.stream) {
        entry.stream.write(msg.data);
      } else if (msg.type === 'resize' && entry.stream) {
        entry.stream.setWindow(msg.rows, msg.cols, 0, 0);
      }
    } catch { /* ignore */ }
  });

  ws.on('close', () => {
    entry.clients.delete(ws);
    if (entry.clients.size === 0 && entry.alive) {
      entry.scheduleCleanup();
    }
  });
}

function buildConnectOptions(server) {
  const opts = {
    host: server.host,
    port: server.port,
    username: server.username,
    readyTimeout: 15000,
    keepaliveInterval: 10000,
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
  return opts;
}

// ── Main WebSocket handler ─────────────────────────────────────────────────────
function setupWebSocket(wss) {
  wss.on('connection', (ws, req) => {
    const url      = new URL(req.url, 'http://localhost');
    const token    = url.searchParams.get('token');
    const serverId = url.searchParams.get('serverId');
    const resumeKey= url.searchParams.get('resumeKey');
    const cols     = parseInt(url.searchParams.get('cols') || '220', 10);
    const rows     = parseInt(url.searchParams.get('rows') || '50',  10);

    // Authenticate
    try { jwt.verify(token, JWT_SECRET); }
    catch {
      ws.send(JSON.stringify({ type: 'error', data: 'Authentication failed' }));
      ws.close(); return;
    }

    // ── Resume existing session ────────────────────────────────────────────
    if (resumeKey && registry.has(resumeKey)) {
      const entry = registry.get(resumeKey);
      attachClient(ws, entry, true);
      return;
    }

    // ── New session ────────────────────────────────────────────────────────
    const server = getServerById(serverId);
    if (!server) {
      ws.send(JSON.stringify({ type: 'error', data: 'Server not found' }));
      ws.close(); return;
    }

    const newKey = uuidv4();
    const entry  = new SessionEntry(newKey, serverId);
    registry.set(newKey, entry);

    const conn = new Client();
    entry.conn = conn;

    conn.on('ready', () => {
      touchServer(serverId);
      conn.shell({ term: 'xterm-256color', cols, rows }, (err, stream) => {
        if (err) {
          entry.broadcast({ type: 'error', data: err.message });
          entry.destroy(); return;
        }
        entry.stream = stream;

        // Attach the requesting ws client
        attachClient(ws, entry, false);

        stream.on('data', d => entry.append(d.toString('binary')));
        stream.stderr.on('data', d => entry.append(d.toString('binary')));
        stream.on('close', () => {
          entry.broadcast({ type: 'disconnect', data: 'Session closed.' });
          entry.destroy();
        });
      });
    });

    conn.on('error', err => {
      console.error('[SSH] Error:', err.message);
      if (ws.readyState === 1)
        ws.send(JSON.stringify({ type: 'error', data: `SSH Error: ${err.message}` }));
      entry.destroy();
    });

    conn.on('keyboard-interactive', (_n, _i, _l, _p, finish) => {
      finish([server.password || '']);
    });

    conn.connect(buildConnectOptions(server));
  });
}

// Expose registry size for health checks
function registrySize() { return registry.size; }

module.exports = { setupWebSocket, registrySize };
