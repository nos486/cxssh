const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const path = require('path');

const DB_PATH = path.join(process.env.DATA_DIR || '/app/data', 'cxssh.db');
let db;

function getDb() {
  if (!db) {
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
  }
  return db;
}

function initDb() {
  const d = getDb();
  d.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS ssh_keys (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      key_type TEXT NOT NULL DEFAULT 'ed25519',
      private_key TEXT NOT NULL,
      public_key TEXT,
      fingerprint TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS proxies (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      type TEXT NOT NULL DEFAULT 'socks5',
      host TEXT NOT NULL,
      port INTEGER NOT NULL DEFAULT 1080,
      username TEXT,
      password TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS servers (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      host TEXT NOT NULL,
      port INTEGER DEFAULT 22,
      username TEXT NOT NULL,
      auth_type TEXT DEFAULT 'password',
      password TEXT,
      private_key TEXT,
      key_id TEXT REFERENCES ssh_keys(id) ON DELETE SET NULL,
      proxy_id TEXT REFERENCES proxies(id) ON DELETE SET NULL,
      label_color TEXT DEFAULT '#6366f1',
      notes TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      last_connected TEXT
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      server_id TEXT NOT NULL,
      notes TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      last_used TEXT,
      FOREIGN KEY (server_id) REFERENCES servers(id) ON DELETE CASCADE
    );
  `);

  // Non-destructive migrations for existing databases
  const migrations = [
    `ALTER TABLE servers ADD COLUMN key_id TEXT REFERENCES ssh_keys(id) ON DELETE SET NULL`,
    `ALTER TABLE servers ADD COLUMN proxy_id TEXT REFERENCES proxies(id) ON DELETE SET NULL`,
  ];
  for (const m of migrations) {
    try { d.exec(m); } catch {}
  }

  const adminUsername = process.env.ADMIN_USERNAME || 'admin';
  const adminPassword = process.env.ADMIN_PASSWORD || 'admin';
  const existing = d.prepare('SELECT id FROM users WHERE username = ?').get(adminUsername);
  if (!existing) {
    const hash = bcrypt.hashSync(adminPassword, 12);
    d.prepare('INSERT INTO users (username, password_hash) VALUES (?, ?)').run(adminUsername, hash);
    console.log(`[DB] Admin user "${adminUsername}" created.`);
  }
  console.log(`[DB] Initialised at ${DB_PATH}`);
}

function getUserByUsername(u) { return getDb().prepare('SELECT * FROM users WHERE username = ?').get(u); }

// SSH Keys
function getKeys() { return getDb().prepare('SELECT id,name,key_type,public_key,fingerprint,created_at FROM ssh_keys ORDER BY created_at DESC').all(); }
function getKeyById(id) { return getDb().prepare('SELECT * FROM ssh_keys WHERE id = ?').get(id); }
function createKey(k) { getDb().prepare('INSERT INTO ssh_keys (id,name,key_type,private_key,public_key,fingerprint) VALUES (@id,@name,@key_type,@private_key,@public_key,@fingerprint)').run(k); return getKeyById(k.id); }
function deleteKey(id) { getDb().prepare('DELETE FROM ssh_keys WHERE id = ?').run(id); }

// Proxies
function getProxies() { return getDb().prepare('SELECT * FROM proxies ORDER BY name ASC').all(); }
function getProxyById(id) { return getDb().prepare('SELECT * FROM proxies WHERE id = ?').get(id); }
function createProxy(p) { getDb().prepare('INSERT INTO proxies (id,name,type,host,port,username,password) VALUES (@id,@name,@type,@host,@port,@username,@password)').run(p); return getProxyById(p.id); }
function updateProxy(id, fields) {
  const allowed = ['name','type','host','port','username','password'];
  const sets = Object.keys(fields).filter(k => allowed.includes(k)).map(k => `${k} = @${k}`).join(', ');
  if (!sets) return null;
  getDb().prepare(`UPDATE proxies SET ${sets} WHERE id = @id`).run({ ...fields, id });
  return getProxyById(id);
}
function deleteProxy(id) { getDb().prepare('DELETE FROM proxies WHERE id = ?').run(id); }

// Servers
function getServers() { return getDb().prepare('SELECT * FROM servers ORDER BY name ASC').all(); }
function getServerById(id) { return getDb().prepare('SELECT * FROM servers WHERE id = ?').get(id); }
function createServer(s) {
  getDb().prepare(`INSERT INTO servers (id,name,host,port,username,auth_type,password,private_key,key_id,proxy_id,label_color,notes)
    VALUES (@id,@name,@host,@port,@username,@auth_type,@password,@private_key,@key_id,@proxy_id,@label_color,@notes)`).run(s);
  return getServerById(s.id);
}
function updateServer(id, fields) {
  const allowed = ['name','host','port','username','auth_type','password','private_key','key_id','proxy_id','label_color','notes'];
  const sets = Object.keys(fields).filter(k => allowed.includes(k)).map(k => `${k} = @${k}`).join(', ');
  if (!sets) return null;
  getDb().prepare(`UPDATE servers SET ${sets} WHERE id = @id`).run({ ...fields, id });
  return getServerById(id);
}
function deleteServer(id) { getDb().prepare('DELETE FROM servers WHERE id = ?').run(id); }
function touchServer(id) { getDb().prepare("UPDATE servers SET last_connected = datetime('now') WHERE id = ?").run(id); }

// Temp Servers (In-memory)
const tempServers = new Map();
function getTempServerById(id) { return tempServers.get(id); }
function createTempServer(s) { tempServers.set(s.id, s); return s; }

// Sessions
function getSessions() {
  return getDb().prepare(`SELECT s.*,srv.name as server_name,srv.host,srv.port,srv.label_color
    FROM sessions s LEFT JOIN servers srv ON s.server_id = srv.id
    ORDER BY s.last_used DESC, s.created_at DESC`).all();
}
function getSessionById(id) { return getDb().prepare('SELECT * FROM sessions WHERE id = ?').get(id); }
function createSession(s) { getDb().prepare('INSERT INTO sessions (id,name,server_id,notes) VALUES (@id,@name,@server_id,@notes)').run(s); return getSessionById(s.id); }
function deleteSession(id) { getDb().prepare('DELETE FROM sessions WHERE id = ?').run(id); }
function touchSession(id) { getDb().prepare("UPDATE sessions SET last_used = datetime('now') WHERE id = ?").run(id); }

module.exports = {
  initDb, getUserByUsername,
  getKeys, getKeyById, createKey, deleteKey,
  getProxies, getProxyById, createProxy, updateProxy, deleteProxy,
  getServers, getServerById, createServer, updateServer, deleteServer, touchServer,
  getTempServerById, createTempServer,
  getSessions, getSessionById, createSession, deleteSession, touchSession,
};
