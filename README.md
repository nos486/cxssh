# CxSSH — Web SSH Manager

[![Docker](https://img.shields.io/badge/Docker-ready-2496ED?logo=docker&logoColor=white)](https://www.docker.com/)
[![Node.js](https://img.shields.io/badge/Node.js-20-339933?logo=node.js&logoColor=white)](https://nodejs.org/)

A self-hosted, dockerised SSH client that runs entirely in your browser. Sleek single-page interface with tab management, resizable gridded layouts, proxy tunneling, secure local key storage, and optional background session persistence.

![alt text](image.png)

---

## ✨ Features

- 🖥️ **SPA Desktop UI**: Sleek, glassmorphism-based single page application.
- 🗂️ **Draggable Tabs & Grid Layout**: Open multiple terminals side-by-side. Drag tabs to reorder, or drag borders to resize window widths.
- 📌 **Permanent Workspaces**: Dedicated sidebar section for background-persistent SSH sessions that survive browser refresh, network drops, or closing tabs (supports output replay and auto-restore).
- 🌐 **Proxy Tunneling**: Route SSH traffic through SOCKS5 or HTTP proxies.
- 🔐 **Secure & Private**: JWT Auth, secure cookies, and local database (SQLite) for storing server profiles and SSH Keys.
- ⚡ **Ephemeral Sessions**: Ephemeral mode closes the remote SSH process instantly upon closing the tab or refreshing the browser.

---

## 🚀 Quick Start

```bash
# 1. Clone & enter
git clone https://github.com/nos486/cxssh.git && cd cxssh

# 2. Setup env
cp .env.example .env
# Edit .env and change ADMIN_PASSWORD and JWT_SECRET!

# 3. Build & Run
docker build -t cxssh .
docker-compose up -d
```

Open **`http://localhost:3000/app`** (Default: `admin` / `admin`).

---

## 📐 Layout Controls

- **Resize**: Hover between terminal windows in grid mode and drag to adjust width.
- **Equalize**: Double-click the resize border to reset layout widths evenly.

---

## 🌐 Proxy Setup

1. Add SOCKS5/HTTP proxies in the **Proxies** tab.
2. Link any proxy profile to a server in the **Servers** manager.

---

## 🔒 Security Notes

- Change default credentials before exposing to the internet.
- Put behind a reverse proxy (like Nginx Proxy Manager, Nginx, or Caddy) with SSL enabled.
