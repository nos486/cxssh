const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { requireAuth } = require('../auth');
const { getPermSessions, createPermSession, deletePermSession, getServerById } = require('../db');
const { killPermSession } = require('../ws');

const router = express.Router();
router.use(requireAuth);

// GET /api/perm-sessions — list all saved permanent sessions
router.get('/', (req, res) => {
  const sessions = getPermSessions();
  res.json(sessions);
});

// POST /api/perm-sessions — create a permanent session record
// Body: { serverId }
router.post('/', (req, res) => {
  const { serverId } = req.body;
  if (!serverId) return res.status(400).json({ error: 'serverId is required' });

  const server = getServerById(serverId);
  if (!server) return res.status(404).json({ error: 'Server not found' });

  const id = uuidv4();
  const session = createPermSession(id, serverId);
  res.status(201).json(session);
});

// DELETE /api/perm-sessions/:id — fully terminate & remove a permanent session
router.delete('/:id', (req, res) => {
  const { id } = req.params;
  killPermSession(id);     // Kill the SSH process in the registry if running
  deletePermSession(id);   // Remove from DB
  res.status(204).end();
});

module.exports = router;
