# CxSSH — Web SSH Manager

[![Docker](https://img.shields.io/badge/Docker-ready-2496ED?logo=docker&logoColor=white)](https://www.docker.com/)
[![Node.js](https://img.shields.io/badge/Node.js-20-339933?logo=node.js&logoColor=white)](https://nodejs.org/)

> A self-hosted, dockerised SSH client that runs entirely in your browser.  
> Manage servers, generate SSH keys, open multiple terminals, and resize/adjust layouts — all in a sleek single-page desktop-style interface.

---

## ✨ Features (v2.1)

| Feature | Description |
|---|---|
| 📱 **SPA Desktop UI** | Everything in one page — Sidebar navigation for a desktop app feel |
| 🗂️ **Draggable Tabs** | Open multiple terminals and **drag-to-swap** them to organise your workspace |
| 📐 **Resizable Grid Layout** | Resize terminal window widths in Tile Grid mode by dragging borders; double-click borders to auto-adjust sizes evenly |
| 🌐 **Proxy Tunneling** | Connect to servers through **SOCKS5** or **HTTP CONNECT** proxies |
| 🔐 **JWT Auth** | Secure login with 30-day sessions |
| 🖥️ **Server Manager** | Add / edit / delete SSH servers with colour labels and proxy selection |
| 🔑 **SSH Key Manager** | Generate `ed25519` / RSA keys or import existing ones |
| 💾 **Saved Sessions** | One-click reconnect to favourite servers |
| 📊 **Full xterm.js** | 256-colour terminal with automatic fit, web-links & scrollback |

---

## 🚀 Quick Start

```bash
# 1. Clone
git clone https://github.com/nos486/cxssh.git
cd cxssh

# 2. Customise credentials
cp .env.example .env
# Edit .env — change ADMIN_PASSWORD and JWT_SECRET!

# 3. Build dependencies image once (safeguards native modules like sqlite)
docker build -t cxssh .

# 4. Run the project (code changes mount dynamically)
docker-compose up -d

# 5. Open in browser
open http://localhost:3000/app
```

Default login: **admin / admin**

---


## 📐 Grid Layout Resizing & Adjustment

- **Drag to Resize**: In Tile Grid mode, hover between terminal windows, grab the border, and drag to resize individual widths.
- **Auto-Adjust (Reset)**: **Double-click** the resize border to reset the flex layout, aligning adjacent windows to equal widths again.

---

## 🌐 Proxy Setup

1. Navigate to **Proxies** in the sidebar.
2. Click **+ Add Proxy** and configure your SOCKS5 or HTTP tunnel.
3. Edit any **Server** and select the proxy profile from the dropdown.
4. All connections (including tests) will now tunnel through that proxy.

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
