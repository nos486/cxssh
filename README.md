# CxSSH — Web SSH Manager

[![Docker](https://img.shields.io/badge/Docker-ready-2496ED?logo=docker&logoColor=white)](https://www.docker.com/)
[![Node.js](https://img.shields.io/badge/Node.js-20-339933?logo=node.js&logoColor=white)](https://nodejs.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-6366f1.svg)](LICENSE)

> A self-hosted, dockerised SSH client that runs entirely in your browser.  
> Manage servers, generate SSH keys, open multiple terminals in tabs, and persist sessions across page reloads — all behind a single Docker container.

---

## ✨ Features

| Feature | Description |
|---|---|
| 🔐 **JWT Auth** | Secure login with 30-day sessions |
| 🖥️ **Server Manager** | Add / edit / delete SSH servers with colour labels |
| 🔑 **SSH Key Manager** | Generate `ed25519` / RSA keys or import existing ones |
| 🗂️ **Multi-Tab Terminal** | Open many servers simultaneously in browser tabs |
| ♻️ **Persistent Sessions** | Refresh the page — SSH sessions stay alive on the server |
| 💾 **Saved Sessions** | One-click reconnect to favourite servers |
| ⚡ **Full xterm.js** | 256-colour terminal with resize, web-links & scrollback |
| 🔌 **Connection Test** | Verify credentials before connecting |
| 🌙 **Glassmorphism UI** | Modern dark UI with smooth animations |

---

## 🚀 Quick Start

```bash
# 1. Clone
git clone https://github.com/nos486/cxssh.git
cd cxssh

# 2. (Optional but recommended) customise credentials
cp .env.example .env
# Edit .env — change ADMIN_PASSWORD and JWT_SECRET!

# 3. Build and run
docker-compose up -d

# 4. Open in browser
open http://localhost:3000
```

Default login: **admin / admin** *(change immediately via `.env`)*

---

## 🔑 SSH Key Manager

Instead of pasting private keys on every server, use the built-in key manager:

1. Go to **Dashboard → SSH Keys**
2. Click **+ Add Key** and choose **Generate New** (ed25519 or RSA 4096)
3. Copy the generated **public key** and paste it into `~/.ssh/authorized_keys` on your remote server
4. When adding a server, set **Authentication → Managed Key** and select the key

You can also **Import** an existing private key PEM and optionally provide its public key.

---

## 🗂️ Multi-Tab Terminal

- Click **▶ Connect** on any server card — opens in the terminal view
- Click **＋** in the tab bar to connect to another server without leaving the page
- Each tab has its own isolated xterm.js session
- Close individual tabs with the **✕** on the tab

---

## ♻️ Session Persistence

If you accidentally refresh the page or navigate away, your SSH sessions keep running server-side:

- The backend holds the live SSH stream in memory with a **150 KB output ring-buffer**
- Your browser stores a `resumeKey` in `sessionStorage`
- On reload, each tab automatically reconnects and replays buffered output
- Idle sessions are cleaned up after **30 minutes** with no active browser tab

---

## ⚙️ Environment Variables

| Variable | Default | Description |
|---|---|---|
| `PORT` | `3000` | Host port |
| `ADMIN_USERNAME` | `admin` | Login username |
| `ADMIN_PASSWORD` | `admin` | **Change in production!** |
| `JWT_SECRET` | `changeme` | **Change in production!** |
| `DATA_DIR` | `/app/data` | SQLite database directory |

---

## 💾 Data Persistence

SQLite database stored in `./data/cxssh.db` — mounted as a Docker volume.  
All servers, SSH keys, and saved sessions survive container restarts.

---

## 🏗️ Tech Stack

| Layer | Technology |
|---|---|
| Backend | Node.js 20, Express, `ssh2`, `ws`, `better-sqlite3` |
| Auth | JWT (`jsonwebtoken`), bcrypt (`bcryptjs`) |
| SSH Keys | Node.js built-in `crypto` (no native binaries needed) |
| Frontend | Vanilla JS, xterm.js 5, CSS glassmorphism |
| Container | Docker / Docker Compose, Node 20 Alpine |

---

## 🔒 Security Notes

- **Change** `ADMIN_PASSWORD` and `JWT_SECRET` before exposing to the internet
- For HTTPS, put CxSSH behind **nginx** or **Caddy** as a reverse proxy
- SSH private keys and passwords are stored in SQLite — secure your `./data/` directory
- JWT tokens expire after 30 days

---

## 📁 Project Structure

```
cxssh/
├── Dockerfile
├── docker-compose.yml
├── .env.example
├── package.json
├── server/
│   ├── index.js          # Express + WebSocket entry point
│   ├── db.js             # SQLite schema & helpers
│   ├── auth.js           # JWT login + middleware
│   ├── ws.js             # SSH ↔ WebSocket proxy (persistent sessions)
│   └── routes/
│       ├── servers.js    # Server CRUD + connection test
│       ├── sessions.js   # Saved session management
│       └── keys.js       # SSH key generate / import / list
└── public/
    ├── index.html        # Login page
    ├── dashboard.html    # Server grid + SSH Keys section
    ├── terminal.html     # Multi-tab terminal
    ├── css/app.css       # Design system (dark glassmorphism)
    └── js/
        ├── login.js
        ├── dashboard.js
        └── terminal.js
```
