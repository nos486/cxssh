const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { requireAuth } = require('../auth');
const { getProxies, getProxyById, createProxy, updateProxy, deleteProxy } = require('../db');

const router = express.Router();

router.get('/', requireAuth, (req, res) => res.json(getProxies()));

router.post('/', requireAuth, (req, res) => {
  const { name, type, host, port, username, password } = req.body;
  if (!name || !host || !port) return res.status(400).json({ error: 'name, host, port required' });
  const p = createProxy({ id: uuidv4(), name, type: type || 'socks5', host, port: parseInt(port), username: username || null, password: password || null });
  res.status(201).json({ success: true, ...p });
});

router.put('/:id', requireAuth, (req, res) => {
  if (!getProxyById(req.params.id)) return res.status(404).json({ error: 'Not found' });
  const fields = {};
  ['name','type','host','port','username','password'].forEach(k => { if (req.body[k] !== undefined) fields[k] = req.body[k]; });
  const p = updateProxy(req.params.id, fields);
  res.json({ success: true, ...p });
});

router.delete('/:id', requireAuth, (req, res) => {
  if (!getProxyById(req.params.id)) return res.status(404).json({ error: 'Not found' });
  deleteProxy(req.params.id);
  res.json({ ok: true });
});

module.exports = router;
