const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { requireAuth } = require('../auth');
const { getServers, getServerById, createServer, updateServer, deleteServer, getKeyById } = require('../db');
const { Client } = require('ssh2');

const router = express.Router();

function sanitize(s) {
  const { password, private_key, ...safe } = s;
  return safe;
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
  const { name, host, port, username, auth_type, password, private_key, key_id, label_color, notes } = req.body;
  if (!name || !host || !username) return res.status(400).json({ error: 'name, host, and username are required' });
  const s = createServer({
    id: uuidv4(), name, host, port: port || 22, username,
    auth_type: auth_type || 'password',
    password: password || null,
    private_key: private_key || null,
    key_id: key_id || null,
    label_color: label_color || '#6366f1',
    notes: notes || null,
  });
  res.status(201).json(sanitize(s));
});

// PUT /api/servers/:id
router.put('/:id', requireAuth, (req, res) => {
  if (!getServerById(req.params.id)) return res.status(404).json({ error: 'Not found' });
  const allowed = ['name','host','port','username','auth_type','password','private_key','key_id','label_color','notes'];
  const fields = {};
  for (const k of allowed) if (req.body[k] !== undefined) fields[k] = req.body[k];
  res.json(sanitize(updateServer(req.params.id, fields)));
});

// DELETE /api/servers/:id
router.delete('/:id', requireAuth, (req, res) => {
  if (!getServerById(req.params.id)) return res.status(404).json({ error: 'Not found' });
  deleteServer(req.params.id);
  res.json({ ok: true });
});

// POST /api/servers/:id/test
router.post('/:id/test', requireAuth, (req, res) => {
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
  const timer = setTimeout(() => finish(false, 'Connection timed out', 408), 8000);

  const opts = {
    host: server.host, port: server.port, username: server.username, readyTimeout: 7000,
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

  conn.on('ready', () => finish(true, 'Connection successful'))
      .on('error', err => finish(false, err.message, 400))
      .on('keyboard-interactive', (_n,_i,_l,_p, f) => f([server.password||'']))
      .connect(opts);
});

module.exports = router;
