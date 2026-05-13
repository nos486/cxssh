const express = require('express');
const http = require('http');
const path = require('path');
const { WebSocketServer } = require('ws');
const { initDb } = require('./db');
const { router: authRouter } = require('./auth');
const serversRouter  = require('./routes/servers');
const sessionsRouter = require('./routes/sessions');
const keysRouter     = require('./routes/keys');
const { setupWebSocket } = require('./ws');

const PORT = process.env.PORT || 3000;

initDb();

const app = express();
app.use(express.json({ limit: '4mb' })); // allow large private key pastes

// Static frontend
app.use(express.static(path.join(__dirname, '../public')));

// API
app.use('/api/auth',     authRouter);
app.use('/api/servers',  serversRouter);
app.use('/api/sessions', sessionsRouter);
app.use('/api/keys',     keysRouter);

// SPA fallback
app.get('/dashboard', (req, res) => res.sendFile(path.join(__dirname, '../public/dashboard.html')));
app.get('/terminal',  (req, res) => res.sendFile(path.join(__dirname, '../public/terminal.html')));
app.get('*',          (req, res) => res.sendFile(path.join(__dirname, '../public/index.html')));

const server = http.createServer(app);
const wss    = new WebSocketServer({ server, path: '/ws/ssh' });
setupWebSocket(wss);

server.listen(PORT, () => {
  console.log(`[CxSSH] Server running on http://localhost:${PORT}`);
  console.log(`[CxSSH] WebSocket SSH proxy on ws://localhost:${PORT}/ws/ssh`);
});
