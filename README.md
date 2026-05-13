# CxSSH — Web SSH Manager

[![Docker](https://img.shields.io/badge/Docker-ready-2496ED?logo=docker&logoColor=white)](https://www.docker.com/)
[![Node.js](https://img.shields.io/badge/Node.js-20-339933?logo=node.js&logoColor=white)](https://nodejs.org/)

> A self-hosted, dockerised SSH client that runs entirely in your browser.  
> Manage servers, generate SSH keys, open multiple terminals in tabs, and persist sessions across page reloads — all in a sleek single-page desktop-style interface.

---

## ✨ Features (v2.1)

| Feature | Description |
|---|---|
| 📱 **SPA Desktop UI** | Everything in one page — Sidebar navigation for a desktop app feel |
| 🗂️ **Draggable Tabs** | Open multiple terminals and **drag-to-swap** them to organise your workspace |
| 🔳 **Multi-Window Grid** | Toggle **Grid View** to see all active terminals side-by-side |
| ♻️ **Infinite Persistence** | Refresh the page — SSH sessions stay alive and re-attach automatically |
| 🌐 **Proxy Tunneling** | Connect to servers through **SOCKS5** or **HTTP CONNECT** proxies |
| 🔐 **JWT Auth** | Secure login with 30-day sessions |
| 🖥️ **Server Manager** | Add / edit / delete SSH servers with colour labels and proxy selection |
| 🔑 **SSH Key Manager** | Generate `ed25519` / RSA keys or import existing ones |
| 💾 **Saved Sessions** | One-click reconnect to favourite servers |
| ⚡ **Full xterm.js** | 256-colour terminal with automatic resize, web-links & scrollback |

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

## 🔳 Multi-Window & Grid View

- Connect to multiple servers.
- In the **Terminal** view, click the **🔳 Grid View** button in the top right.
- The layout will switch from tabs to a grid, allowing you to monitor and interact with all servers simultaneously.
- Every window is independently resizable and fits its grid cell automatically.

---

## ♻️ Session Persistence

The app is designed for reliability:
- **Refresh-Safe**: If you reload your browser, CxSSH uses `sessionStorage` and `resumeKeys` to re-establish your exact terminal environment.
- **Background Alive**: The backend keeps the SSH connection active for up to 30 minutes even if you close your laptop, buffering output so you don't miss a thing.

---

## 🌐 Proxy Setup

1. Navigate to **Proxies** in the sidebar.
2. Configure your SOCKS5 or HTTP tunnel.
3. Edit any **Server** and select the proxy profile.
4. All connections will now tunnel through that proxy.
