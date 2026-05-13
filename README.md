# CxSSH — Web SSH Manager

[![Docker](https://img.shields.io/badge/Docker-ready-2496ED?logo=docker&logoColor=white)](https://www.docker.com/)
[![Node.js](https://img.shields.io/badge/Node.js-20-339933?logo=node.js&logoColor=white)](https://nodejs.org/)

> A self-hosted, dockerised SSH client that runs entirely in your browser.  
> Manage servers, generate SSH keys, open multiple terminals in tabs, and persist sessions across page reloads — all in a sleek single-page desktop-style interface.

---

## ✨ Features (v2.0)

| Feature | Description |
|---|---|
| 📱 **SPA Desktop UI** | Everything in one page — Sidebar navigation for a desktop app feel |
| 🗂️ **Draggable Tabs** | Open multiple terminals and **drag-to-swap** them to organise your workspace |
| 🌐 **Proxy Tunneling** | Connect to servers through **SOCKS5** or **HTTP CONNECT** proxies |
| 🔐 **JWT Auth** | Secure login with 30-day sessions |
| 🖥️ **Server Manager** | Add / edit / delete SSH servers with colour labels and proxy selection |
| 🔑 **SSH Key Manager** | Generate `ed25519` / RSA keys or import existing ones |
| ♻️ **Persistent Sessions** | Refresh the page — SSH sessions stay alive on the server |
| 💾 **Saved Sessions** | One-click reconnect to favourite servers |
| ⚡ **Full xterm.js** | 256-colour terminal with resize, web-links & scrollback |

---

## 🚀 Quick Start

```bash
# 1. Clone
git clone https://github.com/nos486/cxssh.git
cd cxssh

# 2. Customise credentials
cp .env.example .env
# Edit .env — change ADMIN_PASSWORD and JWT_SECRET!

# 3. Build and run
docker-compose up -d --build

# 4. Open in browser
open http://localhost:3000/app
```

Default login: **admin / admin**

---

## 🌐 Proxy Setup

1. Navigate to **Proxies** in the sidebar.
2. Click **+ Add Proxy** and configure your SOCKS5 or HTTP tunnel.
3. Edit any **Server** and select the proxy profile from the dropdown.
4. All connections (including tests) will now tunnel through that proxy.

---

## 🗂️ Multi-Tab Terminal

- Open terminals from the **Servers** or **Sessions** view.
- Click **＋** in the terminal tab bar to connect to another server.
- **Drag and Drop** tabs to reorder them exactly how you want.
- Use the sidebar to switch between your dashboard and active terminals.

---

## ♻️ Session Persistence

If you accidentally refresh the page, your SSH sessions keep running server-side:
- Reconnect instantly upon reload.
- **150 KB output buffer** ensures you see what happened while you were away.
- Idle sessions are cleaned up after **30 minutes** of inactivity.

---

## 🏗️ Tech Stack

- **Backend**: Node.js 20, Express, `ssh2`, `ws`, `socks`, `better-sqlite3`
- **Frontend**: Vanilla JS (SPA), xterm.js 5, CSS Glassmorphism
- **Container**: Docker / Docker Compose

---

## 🔒 Security Notes

- **Change** `ADMIN_PASSWORD` and `JWT_SECRET` before exposing to the internet.
- Use a reverse proxy (like Nginx or Caddy) for HTTPS.
- SSH keys are stored in the local SQLite database (`/app/data/cxssh.db`).
