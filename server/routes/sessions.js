const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { requireAuth } = require('../auth');
const {
  getSessions, getSessionById, createSession, deleteSession, touchSession, getServerById
} = require('../db');

const router = express.Router();

// GET /api/sessions
router.get('/', requireAuth, (req, res) => {
  res.json(getSessions());
});

// POST /api/sessions
router.post('/', requireAuth, (req, res) => {
  const { name, server_id, notes } = req.body;
  if (!name || !server_id) {
    return res.status(400).json({ error: 'name and server_id are required' });
  }
  const server = getServerById(server_id);
  if (!server) return res.status(404).json({ error: 'Server not found' });

  const session = createSession({
    id: uuidv4(),
    name,
    server_id,
    notes: notes || null,
  });
  res.status(201).json(session);
});

// POST /api/sessions/:id/use — mark session as used
router.post('/:id/use', requireAuth, (req, res) => {
  const session = getSessionById(req.params.id);
  if (!session) return res.status(404).json({ error: 'Not found' });
  touchSession(req.params.id);
  res.json({ ok: true });
});

// DELETE /api/sessions/:id
router.delete('/:id', requireAuth, (req, res) => {
  const session = getSessionById(req.params.id);
  if (!session) return res.status(404).json({ error: 'Not found' });
  deleteSession(req.params.id);
  res.json({ ok: true });
});

module.exports = router;
