const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { requireAuth } = require('../auth');
const { getServers, getServerById, createServer, updateServer, deleteServer, getKeyById, getProxyById, createTempServer } = require('../db');
const { Client } = require('ssh2');
const { SocksClient } = require('socks');
const net = require('net');

const router = express.Router();

function sanitize(s) {
  const { password, private_key, ...safe } = s;
  return safe;
}

// ── Proxy Socket Helper ──────────────────────────────────────────────────────
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

// GET /api/servers
router.get('/', requireAuth, (req, res) => res.json(getServers().map(sanitize)));

// GET /api/servers/:id
router.get('/:id', requireAuth, (req, res) => {
  const s = getServerById(req.params.id);
  if (!s) return res.status(404).json({ error: 'Not found' });
  res.json(sanitize(s));
});

// POST /api/servers
router.post('/', requireAuth, (req, res) => {
  const { name, host, port, username, auth_type, password, private_key, key_id, proxy_id, label_color, term_theme, notes } = req.body;
  if (!name || !host || !username) return res.status(400).json({ error: 'name, host, and username are required' });
  const s = createServer({
    id: uuidv4(), name, host, port: port || 22, username,
    auth_type: auth_type || 'password',
    password: password || null,
    private_key: private_key || null,
    key_id: key_id || null,
    proxy_id: proxy_id || null,
    label_color: label_color || '#6366f1',
    term_theme: term_theme || 'default',
    notes: notes || null,
  });
  res.status(201).json({ success: true, ...sanitize(s) });
});

// POST /api/servers/temp
router.post('/temp', requireAuth, (req, res) => {
  const { name, host, port, username, auth_type, password, private_key, key_id, proxy_id } = req.body;
  if (!host || !username) return res.status(400).json({ error: 'host and username are required' });
  const id = 'temp_' + uuidv4();
  const s = createTempServer({
    id, name: name || 'Quick Connect', host, port: port || 22, username,
    auth_type: auth_type || 'password',
    password: password || null,
    private_key: private_key || null,
    key_id: key_id || null,
    proxy_id: proxy_id || null,
    label_color: '#8b5cf6', // distinctive color
    is_temp: true
  });
  res.status(201).json({ success: true, ...sanitize(s) });
});

// PUT /api/servers/:id
router.put('/:id', requireAuth, (req, res) => {
  if (!getServerById(req.params.id)) return res.status(404).json({ error: 'Not found' });
  const allowed = ['name','host','port','username','auth_type','password','private_key','key_id','proxy_id','label_color','term_theme','notes'];
  const fields = {};
  for (const k of allowed) if (req.body[k] !== undefined) fields[k] = req.body[k];
  const s = updateServer(req.params.id, fields);
  res.json({ success: true, ...sanitize(s) });
});

// DELETE /api/servers/:id
router.delete('/:id', requireAuth, (req, res) => {
  if (!getServerById(req.params.id)) return res.status(404).json({ error: 'Not found' });
  deleteServer(req.params.id);
  res.json({ success: true, ok: true });
});

// POST /api/servers/test (for unsaved data)
router.post('/test', requireAuth, async (req, res) => {
  const server = req.body;
  if (!server.host || !server.username) return res.status(400).json({ error: 'host and username required' });

  const conn = new Client();
  let done = false;
  const finish = (ok, msg, status = 200) => {
    if (done) return; done = true;
    clearTimeout(timer);
    conn.end();
    res.status(status).json({ success: ok, ok, ...(ok ? { message: msg } : { error: msg }) });
  };
  const timer = setTimeout(() => finish(false, 'Connection timed out', 408), 15000);

  try {
    const opts = {
      host: server.host, port: parseInt(server.port) || 22, username: server.username, readyTimeout: 12000,
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

    conn.on('ready', () => finish(true, 'Connection successful'))
        .on('error', err => finish(false, err.message, 400))
        .on('keyboard-interactive', (_n,_i,_l,_p, f) => f([server.password||'']))
        .connect(opts);
  } catch (e) {
    finish(false, `Error: ${e.message}`, 400);
  }
});

// POST /api/servers/:id/test
router.post('/:id/test', requireAuth, async (req, res) => {
  const server = getServerById(req.params.id);
  if (!server) return res.status(404).json({ error: 'Not found' });

  const conn = new Client();
  let done = false;
  const finish = (ok, msg, status = 200) => {
    if (done) return; done = true;
    clearTimeout(timer);
    conn.end();
    res.status(status).json({ ok, ...(ok ? { message: msg } : { error: msg }) });
  };
  const timer = setTimeout(() => finish(false, 'Connection timed out', 408), 15000);

  try {
    const opts = {
      host: server.host, port: server.port, username: server.username, readyTimeout: 12000,
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

    conn.on('ready', () => finish(true, 'Connection successful'))
        .on('error', err => finish(false, err.message, 400))
        .on('keyboard-interactive', (_n,_i,_l,_p, f) => f([server.password||'']))
        .connect(opts);
  } catch (e) {
    finish(false, `Proxy error: ${e.message}`, 400);
  }
});

module.exports = router;
