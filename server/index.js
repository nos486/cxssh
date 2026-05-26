const express = require('express');
const http = require('http');
const path = require('path');
const { WebSocketServer } = require('ws');
const { initDb } = require('./db');
const { router: authRouter, requireAuth } = require('./auth');
const serversRouter = require('./routes/servers');
const keysRouter    = require('./routes/keys');
const proxyRouter        = require('./routes/proxy');
const permSessionsRouter = require('./routes/perm-sessions');
const { setupWebSocket } = require('./ws');

const PORT = process.env.PORT || 3000;
initDb();

const app = express();
app.use(express.json({ limit: '4mb' }));
app.use(express.static(path.join(__dirname, '../public')));

// API
app.use('/api/auth',     authRouter);
app.use('/api/servers',  serversRouter);
app.use('/api/keys',          keysRouter);
app.use('/api/proxies',       proxyRouter);
app.use('/api/perm-sessions', permSessionsRouter);

// Routes
app.get('/app',       (req, res) => res.sendFile(path.join(__dirname, '../public/app.html')));
// Backwards compat redirects
app.get('/dashboard', (req, res) => res.redirect('/app'));
app.get('/terminal',  (req, res) => res.redirect('/app'));
// Login / root
app.get('*',          (req, res) => res.sendFile(path.join(__dirname, '../public/index.html')));

const server = http.createServer(app);
const wss    = new WebSocketServer({ server, path: '/ws/ssh' });
setupWebSocket(wss);

server.listen(PORT, '0.0.0.0', () => {
  console.log(`[CxSSH] Server running on http://0.0.0.0:${PORT}`);
});
