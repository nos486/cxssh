/* ─── CxSSH SPA Core (v2.5) ─── */

// ── Auth helpers ──
function getToken() { return localStorage.getItem('cxssh_token'); }
function clearToken() { localStorage.removeItem('cxssh_token'); }

async function api(method, path, body) {
  const res = await fetch(path, {
    method,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      'X-CxSSH-Token': getToken(),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (res.status === 401 || res.status === 403) { clearToken(); window.location.href = '/'; return null; }
  return res.json();
}

function showToast(message, type = 'info') {
  const icons = { success: '✅', error: '❌', info: 'ℹ️', warning: '⚠️' };
  const container = document.getElementById('toastContainer');
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `<span class="toast-icon">${icons[type]}</span><span>${message}</span>`;
  container.appendChild(toast);
  setTimeout(() => {
    toast.classList.add('removing');
    toast.addEventListener('animationend', () => toast.remove());
  }, 3500);
}

// ── State ──
let servers = [];
let keys = [];
let proxies = [];
let terminals = [];     // ephemeral terminals
let permTerminals = []; // permanent terminals
let activeWindowId = null;
let activePermWindowId = null;
let currentView = 'dashboard';
let editingId = null;
let selectedColor = '#6366f1';

const termTheme = {
  background: '#0d0d0d', foreground: '#e2e8f0', cursor: '#6366f1', cursorAccent: '#0d0d0d',
  selection: 'rgba(99,102,241,0.3)', black: '#1e293b', red: '#ef4444', green: '#22c55e',
  yellow: '#f59e0b', blue: '#6366f1', magenta: '#a855f7', cyan: '#06b6d4', white: '#f1f5f9',
  brightBlack: '#475569', brightRed: '#f87171', brightGreen: '#4ade80', brightYellow: '#fbbf24',
  brightBlue: '#818cf8', brightMagenta: '#c084fc', brightCyan: '#22d3ee', brightWhite: '#ffffff',
};

// ── Persistence ──
function persistWorkspace() {
  // No-op: Sessions are purely ephemeral now
}

async function restoreWorkspace() {
  setLayout('grid');
  // Fetch all servers first to ensure we have data
  servers = await api('GET', '/api/servers') || [];
}

// ── Navigation ──
document.querySelectorAll('.nav-item').forEach(item => {
  item.addEventListener('click', () => switchView(item.dataset.view));
});

function switchView(viewId) {
  currentView = viewId;
  document.querySelectorAll('.view-container').forEach(v => v.classList.remove('active'));
  const target = document.getElementById(`view-${viewId}`);
  if (target) target.classList.add('active');
  
  document.querySelectorAll('.nav-item').forEach(i => {
    i.classList.toggle('active', i.dataset.view === viewId);
  });

  if (viewId === 'dashboard') loadServers();
  if (viewId === 'keys') loadKeys();
  if (viewId === 'proxies') loadProxies();
  if (viewId === 'terminal') {
    setTimeout(() => terminals.forEach(t => t.fit && t.fit.fit()), 100);
  }
  if (viewId === 'perm') {
    setTimeout(() => permTerminals.forEach(t => t.fit && t.fit.fit()), 100);
  }
}

// ── Servers ──
async function loadServers() {
  servers = await api('GET', '/api/servers') || [];
  renderServers();
}

function renderServers() {
  const grid = document.getElementById('serverGrid');
  const countLabel = document.getElementById('serverCountLabel');
  countLabel.textContent = `${servers.length} remote system${servers.length !== 1 ? 's' : ''} mapped`;

  if (servers.length === 0) {
    grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1">
      <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>
      <div class="empty-state-title">No servers added yet</div>
      <p class="empty-state-sub">Add your first server to get started</p>
      <button class="btn btn-primary btn-sm mt-2" onclick="document.getElementById('addServerBtn').click()">Add Server</button>
    </div>`;
    return;
  }

  grid.innerHTML = servers.map(s => `
    <div class="server-card" style="--card-color:${s.label_color || '#6366f1'}">
      <div class="server-card-top">
        <div class="server-icon-box">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>
        </div>
        <div class="server-card-actions">
          <button class="btn btn-ghost btn-icon btn-sm" onclick="openEditServer('${s.id}')" title="Edit">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
          </button>
          <button class="btn btn-danger btn-icon btn-sm" onclick="deleteServer('${s.id}')" title="Delete">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
          </button>
        </div>
      </div>
      <div>
        <div class="server-card-title">${esc(s.name)}</div>
        <div class="server-card-host">${esc(s.username)}@${esc(s.host)}:${s.port}</div>
      </div>
      <div class="server-card-badges">
        <span class="badge badge-accent">${s.auth_type.replace('_',' ')}</span>
        ${s.proxy_id ? '<span class="badge badge-warning">Tunneled</span>' : ''}
      </div>
      <div class="server-card-connect" style="display:flex;gap:6px">
        <button class="btn btn-primary" style="flex:1" onclick="connectToServer('${s.id}')">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="4 17 10 11 4 5"/><line x1="12" y1="19" x2="20" y2="19"/></svg>
          Connect
        </button>
        <button class="btn btn-warning" style="flex:1" onclick="connectPermServer('${s.id}')" title="Open in Permanent Workspace">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
          Permanent
        </button>
      </div>
    </div>
  `).join('');
}

// ── SSH Keys ──
async function loadKeys() {
  keys = await api('GET', '/api/keys') || [];
  renderKeys();
  populateSelectors();
}

function renderKeys() {
  const grid = document.getElementById('keysGrid');
  if (keys.length === 0) {
    grid.innerHTML = `<div class="empty-state">
      <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"/></svg>
      <div class="empty-state-title">No SSH identities yet</div>
      <p class="empty-state-sub">Generate or import a key to get started</p>
    </div>`;
    return;
  }
  grid.innerHTML = keys.map(k => `
    <div class="key-card">
      <div class="key-card-header">
        <div class="key-card-name">${esc(k.name)}</div>
        <div class="key-card-type">${esc(k.key_type)}</div>
      </div>
      <div class="key-fingerprint">${esc(k.fingerprint)}</div>
      <div class="flex gap-2">
        <button class="btn btn-ghost btn-sm" onclick="copyPublicKey('${k.id}', this)">Copy Public Key</button>
        <button class="btn btn-danger btn-sm" onclick="deleteKey('${k.id}')">Delete</button>
      </div>
    </div>
  `).join('');
}

// ── Proxies ──
async function loadProxies() {
  proxies = await api('GET', '/api/proxies') || [];
  renderProxies();
  populateSelectors();
}

function renderProxies() {
  const grid = document.getElementById('proxyGrid');
  if (proxies.length === 0) {
    grid.innerHTML = `<div class="empty-state">
      <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
      <div class="empty-state-title">No proxies configured</div>
      <p class="empty-state-sub">Add a SOCKS5 or HTTP tunnel</p>
    </div>`;
    return;
  }
  grid.innerHTML = proxies.map(p => `
    <div class="key-card">
      <div class="key-card-header">
        <div class="key-card-name">${esc(p.name)}</div>
        <div class="key-card-type">${esc(p.type)}</div>
      </div>
      <div class="font-mono text-sm text-muted">${esc(p.host)}:${p.port}</div>
      <div class="flex gap-2">
        <button class="btn btn-ghost btn-sm" onclick="openEditProxy('${p.id}')">Edit</button>
        <button class="btn btn-danger btn-sm" onclick="deleteProxy('${p.id}')">Delete</button>
      </div>
    </div>
  `).join('');
}

// ── Window Manager (Terminals) ──
async function connectToServer(serverId, shouldFocus = true) {
  const server = servers.find(s => s.id === serverId) || await api('GET', `/api/servers/${serverId}`);
  if (!server) return;

  const winId = 'win_' + Math.random().toString(36).substr(2, 9);
  
  if (shouldFocus) {
    terminals.forEach(t => t.el.classList.remove('active'));
    activeWindowId = winId;
  }

  const win = document.createElement('div');
  win.className = 'term-window' + (shouldFocus ? ' active' : '');
  win.id = winId;
  win.innerHTML = `
    <div class="term-window-header">
      <div class="term-window-title">
        <span class="color-dot" style="background:${server.label_color}"></span>
        ${esc(server.name)} (${esc(server.host)})
      </div>
      <div class="term-window-controls">
        <button class="win-btn win-close" onclick="closeTerminal('${winId}')"></button>
      </div>
    </div>
    <div class="term-window-body" id="body_${winId}"></div>
    <div class="resizer"></div>
  `;
  
  document.getElementById('termWorkspace').appendChild(win);

  const term = new Terminal({
    theme: termTheme,
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: 13,
    lineHeight: 1.2,
    cursorBlink: true,
    allowProposedApi: true
  });
  const fit = new FitAddon.FitAddon();
  term.loadAddon(fit);
  term.loadAddon(new WebLinksAddon.WebLinksAddon());
  
  const body = document.getElementById(`body_${winId}`);
  term.open(body);
  
  const terminalObj = {
    id: winId, serverId, server, term, fit, ws: null, status: 'connecting', el: win
  };
  terminals.push(terminalObj);
  
  // Resize handler
  const ro = new ResizeObserver(() => {
    try {
      fit.fit();
      if (terminalObj.ws && terminalObj.ws.readyState === 1) {
        terminalObj.ws.send(JSON.stringify({
          type: 'resize',
          cols: term.cols,
          rows: term.rows
        }));
      }
    } catch (e) { console.warn('Fit error', e); }
  });
  ro.observe(body);
  terminalObj.ro = ro; // Keep for cleanup

  // Focus handling
  win.addEventListener('mousedown', () => focusWindow(winId));

  // Resizer drag logic
  const resizer = win.querySelector('.resizer');
  if (resizer) {
    let startX, startWidth;
    resizer.addEventListener('mousedown', (e) => {
      e.preventDefault();
      startX = e.clientX;
      startWidth = win.getBoundingClientRect().width;
      
      const overlay = document.createElement('div');
      overlay.style.position = 'fixed';
      overlay.style.top = '0';
      overlay.style.left = '0';
      overlay.style.width = '100vw';
      overlay.style.height = '100vh';
      overlay.style.cursor = 'col-resize';
      overlay.style.zIndex = '9999';
      document.body.appendChild(overlay);

      const doDrag = (moveEvent) => {
        const deltaX = moveEvent.clientX - startX;
        const newWidth = Math.max(200, startWidth + deltaX);
        win.style.flex = `0 0 ${newWidth}px`;
        try {
          fit.fit();
          if (terminalObj.ws && terminalObj.ws.readyState === 1) {
            terminalObj.ws.send(JSON.stringify({
              type: 'resize', cols: term.cols, rows: term.rows
            }));
          }
        } catch (err) {}
      };

      const stopDrag = () => {
        document.removeEventListener('mousemove', doDrag);
        document.removeEventListener('mouseup', stopDrag);
        overlay.remove();
        setTimeout(() => {
          terminals.forEach(t => {
            try { t.fit.fit(); } catch (err) {}
          });
        }, 50);
      };

      document.addEventListener('mousemove', doDrag);
      document.addEventListener('mouseup', stopDrag);
    });

    resizer.addEventListener('dblclick', () => {
      win.style.flex = '1';
      setTimeout(() => {
        terminals.forEach(t => {
          try { t.fit.fit(); } catch (err) {}
        });
      }, 50);
    });
  }

  switchView('terminal');
  // Force fit and init WS
  setTimeout(() => {
    try { 
      fit.fit();
      initWebSocket(terminalObj);
      updateTabBadge();
      if (shouldFocus) {
        focusWindow(winId);
      }
      persistWorkspace();
    } catch(e){ console.warn('Init error', e); }
  }, 50);
}

function focusWindow(id) {
  activeWindowId = id;
  terminals.forEach(t => {
    t.el.classList.toggle('active', t.id === id);
    if (t.id === id) t.term.focus();
  });
  updateTabBadge();
}

function closeTerminal(id) {
  const idx = terminals.findIndex(t => t.id === id);
  if (idx === -1) return;
  const t = terminals[idx];
  if (t.ws) t.ws.close();
  if (t.ro) t.ro.disconnect();
  t.term.dispose();
  t.el.remove();
  terminals.splice(idx, 1);
  
  updateTabBadge();
  persistWorkspace();
}

function initWebSocket(t) {
  // Ensure we have cols/rows
  const cols = t.term.cols || 80;
  const rows = t.term.rows || 24;
  
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  let url = `${proto}//${location.host}/ws/ssh?token=${encodeURIComponent(getToken())}&serverId=${encodeURIComponent(t.serverId)}&cols=${cols}&rows=${rows}`;

  t.ws = new WebSocket(url);
  t.ws.onmessage = (e) => {
    const m = JSON.parse(e.data);
    if (m.type === 'connected') {
      t.status = 'connected';
    } else if (m.type === 'output') {
      const bytes = new Uint8Array(m.data.length);
      for(let i=0; i<m.data.length; i++) bytes[i] = m.data.charCodeAt(i);
      t.term.write(bytes);
    } else if (m.type === 'error' || m.type === 'disconnect') {
      t.status = 'error';
      t.term.writeln(`\r\n\x1b[31m✖ ${m.data}\x1b[0m`);
    }
  };
  t.term.onData(data => {
    if (t.ws && t.ws.readyState === 1) t.ws.send(JSON.stringify({ type: 'input', data }));
  });

  const pingInterval = setInterval(() => {
    if (t.ws && t.ws.readyState === 1) {
      t.ws.send(JSON.stringify({ type: 'ping' }));
    } else {
      clearInterval(pingInterval);
    }
  }, 15000);
}

function updateTabBadge() {
  const container = document.getElementById('termTabs');
  if (!container) return;

  container.innerHTML = terminals.map(t => `
    <div class="terminal-tab ${t.id === activeWindowId ? 'active' : ''}" onclick="focusWindow('${t.id}')">
      <span class="color-dot" style="background:${t.server.label_color || '#6366f1'}"></span>
      <span>${esc(t.server.name)}</span>
      <span class="tab-close" onclick="event.stopPropagation(); closeTerminal('${t.id}')" title="Close">
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </span>
    </div>
  `).join('');

  const badge = document.getElementById('tabCountBadge');
  if (badge) {
    badge.textContent = terminals.length;
    badge.style.display = terminals.length > 0 ? '' : 'none';
  }
}

function setLayout(mode) {
  const ws = document.getElementById('termWorkspace');
  ws.classList.remove('layout-tabs', 'layout-grid');
  ws.classList.add('layout-' + mode);
  terminals.forEach(t => {
    if (t.fit) t.fit.fit();
  });
}

function setPermLayout(mode) {
  const ws = document.getElementById('permWorkspace');
  ws.classList.remove('layout-tabs', 'layout-grid');
  ws.classList.add('layout-' + mode);
  permTerminals.forEach(t => {
    if (t.fit) t.fit.fit();
  });
}

// ── Permanent Workspace ───────────────────────────────────────────────────────

function focusPermWindow(id) {
  activePermWindowId = id;
  permTerminals.forEach(t => {
    t.el.classList.toggle('active', t.id === id);
    if (t.id === id) t.term.focus();
  });
  updatePermTabBadge();
}

function updatePermTabBadge() {
  const container = document.getElementById('permTabs');
  if (!container) return;

  container.innerHTML = permTerminals.map(t => {
    const isDisconnected = !t.ws || t.ws.readyState !== 1;
    return `
    <div class="terminal-tab ${t.id === activePermWindowId ? 'active' : ''}" onclick="focusPermWindow('${t.id}')">
      <span class="color-dot" style="background:${t.server.label_color || '#f59e0b'}"></span>
      <span>${isDisconnected ? '🔌 ' : '📌 '}${esc(t.server.name || t.server.server_name)}</span>
    </div>
  `}).join('');

  const badge = document.getElementById('permCountBadge');
  if (badge) {
    badge.textContent = permTerminals.length;
    badge.style.display = permTerminals.length > 0 ? '' : 'none';
  }
}

// Open a terminal pane in the perm workspace (does NOT create a DB record)
function openPermTerminalPane(server, resumeKey, shouldFocus = true) {
  const winId = 'pwin_' + Math.random().toString(36).substr(2, 9);
  const serverName = server.name || server.server_name || server.host;

  if (shouldFocus) {
    permTerminals.forEach(t => t.el.classList.remove('active'));
    activePermWindowId = winId;
  }

  const win = document.createElement('div');
  win.className = 'term-window' + (shouldFocus ? ' active' : '');
  win.id = winId;
  win.innerHTML = `
    <div class="term-window-header" style="border-bottom-color: rgba(245,158,11,0.3);">
      <div class="term-window-title">
        <span class="color-dot" style="background:${server.label_color || '#f59e0b'}"></span>
        <span style="color:var(--warning);margin-right:4px;font-size:11px">📌</span>
        ${esc(serverName)} (${esc(server.host)})
      </div>
      <div class="term-window-controls">
        <button class="win-btn" onclick="killPermSession('${resumeKey}','${winId}')" title="Terminate session permanently"
          style="width:auto;padding:0 8px;font-size:10px;font-weight:600;border-radius:4px;background:rgba(239,68,68,0.15);color:#ef4444;">
          Kill
        </button>
      </div>
    </div>
    <div class="term-window-body" id="body_${winId}"></div>
    <div class="resizer"></div>
  `;

  document.getElementById('permWorkspace').appendChild(win);

  const term = new Terminal({
    theme: termTheme,
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: 13, lineHeight: 1.2, cursorBlink: true, allowProposedApi: true
  });
  const fit = new FitAddon.FitAddon();
  term.loadAddon(fit);
  term.loadAddon(new WebLinksAddon.WebLinksAddon());

  const body = document.getElementById(`body_${winId}`);
  term.open(body);

  const termObj = {
    id: winId, resumeKey, serverId: server.server_id || server.id,
    server, term, fit, ws: null, status: 'connecting', el: win
  };
  permTerminals.push(termObj);

  // Resize observer
  const ro = new ResizeObserver(() => {
    try {
      fit.fit();
      if (termObj.ws && termObj.ws.readyState === 1) {
        termObj.ws.send(JSON.stringify({ type: 'resize', cols: term.cols, rows: term.rows }));
      }
    } catch {}
  });
  ro.observe(body);
  termObj.ro = ro;

  win.addEventListener('mousedown', () => focusPermWindow(winId));

  // Resizer
  const resizer = win.querySelector('.resizer');
  if (resizer) {
    let startX, startWidth;
    resizer.addEventListener('mousedown', e => {
      e.preventDefault();
      startX = e.clientX; startWidth = win.getBoundingClientRect().width;
      const overlay = document.createElement('div');
      Object.assign(overlay.style, { position:'fixed', top:0, left:0, width:'100vw', height:'100vh', cursor:'col-resize', zIndex:9999 });
      document.body.appendChild(overlay);
      const doDrag = mv => {
        win.style.flex = `0 0 ${Math.max(200, startWidth + mv.clientX - startX)}px`;
        try { fit.fit(); } catch {}
      };
      const stopDrag = () => {
        document.removeEventListener('mousemove', doDrag);
        document.removeEventListener('mouseup', stopDrag);
        overlay.remove();
        setTimeout(() => permTerminals.forEach(t => { try { t.fit.fit(); } catch {} }), 50);
      };
      document.addEventListener('mousemove', doDrag);
      document.addEventListener('mouseup', stopDrag);
    });
    resizer.addEventListener('dblclick', () => {
      win.style.flex = '1';
      setTimeout(() => permTerminals.forEach(t => { try { t.fit.fit(); } catch {} }), 50);
    });
  }

  return termObj;
}

// Initiate WS for a permanent session
function initPermWebSocket(termObj) {
  const cols = termObj.term.cols || 80;
  const rows = termObj.term.rows || 24;
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  const url = `${proto}//${location.host}/ws/ssh?token=${encodeURIComponent(getToken())}&serverId=${encodeURIComponent(termObj.serverId)}&resumeKey=${encodeURIComponent(termObj.resumeKey)}&cols=${cols}&rows=${rows}`;

  termObj.ws = new WebSocket(url);
  termObj.ws.onmessage = e => {
    const m = JSON.parse(e.data);
    if (m.type === 'connected') {
      termObj.status = 'connected';
      updatePermTabBadge();
    } else if (m.type === 'output') {
      const bytes = new Uint8Array(m.data.length);
      for (let i = 0; i < m.data.length; i++) bytes[i] = m.data.charCodeAt(i);
      termObj.term.write(bytes);
    } else if (m.type === 'error' || m.type === 'disconnect') {
      termObj.status = 'error';
      termObj.term.writeln(`\r\n\x1b[31m✖ ${m.data}\x1b[0m`);
      updatePermTabBadge();
    }
  };
  termObj.ws.onclose = () => {
    termObj.status = 'disconnected';
    updatePermTabBadge();
  };
  termObj.term.onData(data => {
    if (termObj.ws && termObj.ws.readyState === 1) termObj.ws.send(JSON.stringify({ type: 'input', data }));
  });
  setInterval(() => {
    if (termObj.ws && termObj.ws.readyState === 1) termObj.ws.send(JSON.stringify({ type: 'ping' }));
  }, 15000);
}

// Create new permanent session (Perm Connect button on server card)
async function connectPermServer(serverId) {
  const server = servers.find(s => s.id === serverId);
  if (!server) return showToast('Server not found', 'error');

  showToast(`Opening permanent session for ${server.name}…`, 'info');

  const res = await api('POST', '/api/perm-sessions', { serverId });
  if (!res || !res.id) return showToast('Failed to create permanent session', 'error');

  // Merge server info into the session record for display
  const sessionRecord = { ...res, ...server, server_id: serverId };
  const termObj = openPermTerminalPane(sessionRecord, res.id, true);

  switchView('perm');
  setTimeout(() => {
    try {
      termObj.fit.fit();
      initPermWebSocket(termObj);
      updatePermTabBadge();
      focusPermWindow(termObj.id);
    } catch (e) { console.warn('Perm init error', e); }
  }, 50);
}

// Restore all permanent sessions on page load
async function restorePermWorkspace() {
  const sessions = await api('GET', '/api/perm-sessions');
  if (!sessions || sessions.length === 0) return;

  for (const session of sessions) {
    const termObj = openPermTerminalPane(session, session.id, sessions.indexOf(session) === 0);
    // Small stagger to avoid hammering the backend
    await new Promise(r => setTimeout(r, 80));
    try {
      termObj.fit.fit();
      initPermWebSocket(termObj);
    } catch {}
  }
  updatePermTabBadge();
}

// Detach (close UI pane but keep SSH running on server)
function closePermTerminal(winId) {
  const idx = permTerminals.findIndex(t => t.id === winId);
  if (idx === -1) return;
  const t = permTerminals[idx];
  if (t.ws) t.ws.close(); // closes WS, SSH keeps running in registry
  if (t.ro) t.ro.disconnect();
  t.term.dispose();
  t.el.remove();
  permTerminals.splice(idx, 1);
  updatePermTabBadge();
}

// Kill: terminate SSH + remove from DB
window.killPermSession = async (resumeKey, winId) => {
  if (!confirm('Terminate this permanent session on the server?')) return;
  await api('DELETE', `/api/perm-sessions/${resumeKey}`);
  closePermTerminal(winId);
  showToast('Permanent session terminated', 'success');
};

// Perm layout buttons
document.getElementById('permLayoutGridBtn')?.addEventListener('click', () => {
  setPermLayout('grid');
  document.getElementById('permLayoutGridBtn').classList.add('active');
  document.getElementById('permLayoutStackBtn').classList.remove('active');
});
document.getElementById('permLayoutStackBtn')?.addEventListener('click', () => {
  setPermLayout('tabs');
  document.getElementById('permLayoutStackBtn').classList.add('active');
  document.getElementById('permLayoutGridBtn').classList.remove('active');
});

// ── Temporary Window Manager (Quick Connect) ──

document.getElementById('qcAuthType')?.addEventListener('change', (e) => {
  document.getElementById('qcKeyGroup').style.display = e.target.value === 'managed_key' ? 'block' : 'none';
});

document.getElementById('btnQuickConnect')?.addEventListener('click', async () => {
  const btn = document.getElementById('btnQuickConnect');
  const host = document.getElementById('qcHost').value;
  const port = parseInt(document.getElementById('qcPort').value, 10);
  const username = document.getElementById('qcUsername').value;
  const password = document.getElementById('qcPassword').value;
  const auth_type = document.getElementById('qcAuthType').value;
  const key_id = document.getElementById('qcKeyId').value;
  
  if (!host || !username) return showToast('Host and User are required', 'error');
  
  btn.disabled = true;
  btn.textContent = '...';
  
  const res = await api('POST', '/api/servers/temp', {
    host, port, username, password, auth_type, key_id
  });
  
  btn.disabled = false;
  btn.textContent = 'Connect';
  
  if (res && res.success) {
    document.getElementById('qcPassword').value = '';
    connectToServer(res.id, true);
  } else {
    showToast(res?.error || 'Failed to start temporary session', 'error');
  }
});

function openModal(id) { document.getElementById(id).classList.add('open'); }
function closeModal(id) { document.getElementById(id).classList.remove('open'); }

document.getElementById('logoutBtn').addEventListener('click', () => {
  clearToken();
  window.location.href = '/';
});

document.getElementById('addServerBtn').addEventListener('click', () => {
  editingId = null;
  resetServerForm();
  openModal('serverModal');
});

document.getElementById('tabAddBtn').addEventListener('click', () => {
  renderServerPicker();
  openModal('serverPickerModal');
});

// Reuse picker logic
function renderServerPicker(filter = '') {
  const list = document.getElementById('pickerList');
  const q = filter.toLowerCase();
  const filtered = servers.filter(s => s.name.toLowerCase().includes(q) || s.host.toLowerCase().includes(q));
  list.innerHTML = filtered.map(s => `
    <div class="server-picker-item" onclick="startPickerSession('${s.id}')">
      <div class="color-dot" style="background:${s.label_color}"></div>
      <div>
        <div class="server-picker-item-name">${esc(s.name)}</div>
        <div class="server-picker-item-host">${esc(s.username)}@${esc(s.host)}</div>
      </div>
    </div>
  `).join('');
}

window.startPickerSession = (id) => {
  closeModal('serverPickerModal');
  connectToServer(id);
};

// Layout buttons
document.getElementById('layoutGridBtn')?.addEventListener('click', () => {
  setLayout('grid');
  document.getElementById('layoutGridBtn').classList.add('active');
  document.getElementById('layoutStackBtn').classList.remove('active');
});
document.getElementById('layoutStackBtn')?.addEventListener('click', () => {
  setLayout('tabs');
  document.getElementById('layoutStackBtn').classList.add('active');
  document.getElementById('layoutGridBtn').classList.remove('active');
});

// Color picker
function initColorPicker() {
  const colors = ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4'];
  const picker = document.getElementById('serverColorPicker');
  picker.innerHTML = colors.map(c => `<div class="color-pill" style="background:${c}" data-color="${c}"></div>`).join('');
  picker.addEventListener('click', (e) => {
    if (e.target.classList.contains('color-pill')) {
      selectColor(e.target.dataset.color);
    }
  });
}
function selectColor(c) {
  selectedColor = c;
  document.querySelectorAll('.color-pill').forEach(p => p.classList.toggle('selected', p.dataset.color === c));
}

// ── Server Form Logic ──
function populateSelectors() {
  const keySelect = document.getElementById('sKeyId');
  const qcKeySelect = document.getElementById('qcKeyId');
  const keyOptions = '<option value="">-- Select Identity --</option>' + keys.map(k => `<option value="${k.id}">${esc(k.name)}</option>`).join('');
  if (keySelect) {
    keySelect.innerHTML = keyOptions;
  }
  if (qcKeySelect) {
    qcKeySelect.innerHTML = keyOptions;
  }
  const proxySelect = document.getElementById('sProxyId');
  if (proxySelect) {
    proxySelect.innerHTML = '<option value="">-- Direct Connection (No Proxy) --</option>' + proxies.map(p => `<option value="${p.id}">${esc(p.name)}</option>`).join('');
  }
}

function resetServerForm() {
  document.getElementById('serverModalTitle').textContent = 'New Server';
  document.getElementById('sName').value = '';
  document.getElementById('sHost').value = '';
  document.getElementById('sPort').value = '22';
  document.getElementById('sUsername').value = 'root';
  document.getElementById('sPassword').value = '';
  document.getElementById('sPrivateKey').value = '';
  document.getElementById('sAuthType').value = 'password';
  document.getElementById('sAuthType').dispatchEvent(new Event('change'));
  selectColor('#6366f1');
  populateSelectors();
}

document.getElementById('sAuthType')?.addEventListener('change', (e) => {
  document.querySelectorAll('.auth-fields').forEach(f => f.style.display = 'none');
  const target = document.getElementById('auth-' + e.target.value);
  if (target) target.style.display = 'block';
});

window.openEditServer = async (id) => {
  editingId = id;
  const s = servers.find(x => x.id === id);
  if (!s) return;
  resetServerForm();
  document.getElementById('serverModalTitle').textContent = 'Edit Server';
  document.getElementById('sName').value = s.name;
  document.getElementById('sHost').value = s.host;
  document.getElementById('sPort').value = s.port;
  document.getElementById('sUsername').value = s.username;
  document.getElementById('sAuthType').value = s.auth_type;
  document.getElementById('sAuthType').dispatchEvent(new Event('change'));
  
  if (s.auth_type === 'managed_key') document.getElementById('sKeyId').value = s.key_id || '';
  if (s.proxy_id) document.getElementById('sProxyId').value = s.proxy_id;
  selectColor(s.label_color);
  openModal('serverModal');
};

document.getElementById('saveServerBtn')?.addEventListener('click', async () => {
  const data = {
    name: document.getElementById('sName').value,
    host: document.getElementById('sHost').value,
    port: parseInt(document.getElementById('sPort').value, 10),
    username: document.getElementById('sUsername').value,
    auth_type: document.getElementById('sAuthType').value,
    password: document.getElementById('sPassword').value,
    private_key: document.getElementById('sPrivateKey').value,
    key_id: document.getElementById('sKeyId').value || null,
    proxy_id: document.getElementById('sProxyId').value || null,
    label_color: selectedColor
  };
  
  if (!data.name || !data.host || !data.username) return showToast('Please fill required fields', 'error');
  
  const method = editingId ? 'PUT' : 'POST';
  const url = editingId ? `/api/servers/${editingId}` : '/api/servers';
  
  const res = await api(method, url, data);
  if (res && res.success) {
    showToast('Server saved successfully', 'success');
    closeModal('serverModal');
    loadServers();
  } else {
    showToast(res?.error || 'Failed to save', 'error');
  }
});

document.getElementById('testServerBtn')?.addEventListener('click', async () => {
  const data = {
    host: document.getElementById('sHost').value,
    port: parseInt(document.getElementById('sPort').value, 10),
    username: document.getElementById('sUsername').value,
    auth_type: document.getElementById('sAuthType').value,
    password: document.getElementById('sPassword').value,
    private_key: document.getElementById('sPrivateKey').value,
    key_id: document.getElementById('sKeyId').value || null,
    proxy_id: document.getElementById('sProxyId').value || null,
  };
  const btn = document.getElementById('testServerBtn');
  btn.textContent = 'Testing...';
  btn.disabled = true;
  
  const res = await api('POST', '/api/servers/test', data);
  btn.textContent = '🔌 Test Connection';
  btn.disabled = false;
  
  if (res && res.success) showToast('Connection successful!', 'success');
  else showToast('Connection failed: ' + (res?.error || 'Unknown error'), 'error');
});

window.deleteServer = async (id) => {
  if (!confirm('Are you sure you want to delete this server?')) return;
  const res = await api('DELETE', `/api/servers/${id}`);
  if (res && res.success) { showToast('Server deleted', 'success'); loadServers(); }
};

// ── Key Form Logic ──
document.getElementById('addKeyBtn')?.addEventListener('click', () => {
  document.getElementById('kName').value = '';
  document.getElementById('kType').value = 'ed25519';
  document.getElementById('kPrivate').value = '';
  document.getElementById('keyGenTab').click();
  openModal('keyModal');
});

document.getElementById('keyGenTab')?.addEventListener('click', (e) => {
  document.querySelectorAll('#keyModal .dash-nav-btn').forEach(b => b.classList.remove('active'));
  e.target.classList.add('active');
  document.getElementById('keyGenFields').style.display = 'block';
  document.getElementById('keyImportFields').style.display = 'none';
});

document.getElementById('keyImportTab')?.addEventListener('click', (e) => {
  document.querySelectorAll('#keyModal .dash-nav-btn').forEach(b => b.classList.remove('active'));
  e.target.classList.add('active');
  document.getElementById('keyGenFields').style.display = 'none';
  document.getElementById('keyImportFields').style.display = 'block';
});

document.getElementById('saveKeyBtn')?.addEventListener('click', async () => {
  const name = document.getElementById('kName').value;
  if (!name) return showToast('Name required', 'error');
  
  const isImport = document.getElementById('keyImportTab').classList.contains('active');
  
  if (isImport) {
    const pk = document.getElementById('kPrivate').value;
    if (!pk) return showToast('Private key required', 'error');
    const res = await api('POST', '/api/keys/import', { name, private_key: pk });
    if (res && res.success) { closeModal('keyModal'); loadKeys(); showToast('Key imported', 'success'); }
    else if (res) showToast(res.error || 'Import failed', 'error');
  } else {
    const type = document.getElementById('kType').value;
    const res = await api('POST', '/api/keys/generate', { name, type });
    if (res && res.success) { closeModal('keyModal'); loadKeys(); showToast('Key generated', 'success'); }
    else if (res) showToast(res.error || 'Generation failed', 'error');
  }
});

window.deleteKey = async (id) => {
  if (!confirm('Delete this identity?')) return;
  const res = await api('DELETE', `/api/keys/${id}`);
  if (res && res.success) { loadKeys(); showToast('Identity deleted', 'success'); }
};

window.copyPublicKey = async (id, btn) => {
  const k = keys.find(x => x.id === id);
  if (!k || !k.public_key) return;
  try {
    await navigator.clipboard.writeText(k.public_key);
    const old = btn.textContent;
    btn.textContent = 'Copied!';
    setTimeout(() => btn.textContent = old, 2000);
  } catch (e) {
    showToast('Failed to copy', 'error');
  }
};

// ── Proxy Form Logic ──
function resetProxyForm() {
  document.getElementById('proxyModalTitle').textContent = 'New Proxy';
  document.getElementById('pName').value = '';
  document.getElementById('pType').value = 'socks5';
  document.getElementById('pHost').value = '';
  document.getElementById('pPort').value = '1080';
  document.getElementById('pUsername').value = '';
  document.getElementById('pPassword').value = '';
}

document.getElementById('addProxyBtn')?.addEventListener('click', () => {
  editingId = null;
  resetProxyForm();
  openModal('proxyModal');
});

window.openEditProxy = (id) => {
  editingId = id;
  const p = proxies.find(x => x.id === id);
  if (!p) return;
  resetProxyForm();
  document.getElementById('proxyModalTitle').textContent = 'Edit Proxy';
  document.getElementById('pName').value = p.name;
  document.getElementById('pType').value = p.type;
  document.getElementById('pHost').value = p.host;
  document.getElementById('pPort').value = p.port;
  document.getElementById('pUsername').value = p.username || '';
  openModal('proxyModal');
};

document.getElementById('saveProxyBtn')?.addEventListener('click', async () => {
  const data = {
    name: document.getElementById('pName').value,
    type: document.getElementById('pType').value,
    host: document.getElementById('pHost').value,
    port: parseInt(document.getElementById('pPort').value, 10),
    username: document.getElementById('pUsername').value,
    password: document.getElementById('pPassword').value
  };
  
  if (!data.name || !data.host) return showToast('Please fill required fields', 'error');
  
  const method = editingId ? 'PUT' : 'POST';
  const url = editingId ? `/api/proxies/${editingId}` : '/api/proxies';
  
  const res = await api(method, url, data);
  if (res && res.success) {
    showToast('Proxy saved', 'success');
    closeModal('proxyModal');
    loadProxies();
  } else if (res) {
    showToast(res.error || 'Failed to save proxy', 'error');
  }
});

window.deleteProxy = async (id) => {
  if (!confirm('Delete this proxy?')) return;
  const res = await api('DELETE', `/api/proxies/${id}`);
  if (res && res.success) { loadProxies(); showToast('Proxy deleted', 'success'); }
};

// ── Utilities ──
function esc(s) { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

// ── Boot ──
async function boot() {
  const data = await api('GET', '/api/auth/me');
  if (data) {
    document.getElementById('userNameDisplay').textContent = data.username;
    document.getElementById('userAvatar').textContent = data.username[0].toUpperCase();
  }
  initColorPicker();
  await Promise.all([
    loadServers(),
    loadKeys(),
    loadProxies()
  ]);
  await restoreWorkspace();
  await restorePermWorkspace();
}

boot();

// Handle global resize
window.addEventListener('resize', () => {
  terminals.forEach(t => t.fit && t.fit.fit());
  permTerminals.forEach(t => t.fit && t.fit.fit());
});

// Sidebar Toggle
document.getElementById('sidebarToggle')?.addEventListener('click', () => {
  const sidebar = document.getElementById('sidebar');
  sidebar.classList.toggle('collapsed');
  // Wait for transition, then fit terminals
  setTimeout(() => {
    terminals.forEach(t => t.fit.fit());
  }, 300);
});

// Spotlight hover effect for server cards
document.addEventListener('mousemove', (e) => {
  document.querySelectorAll('.server-card').forEach(card => {
    const rect = card.getBoundingClientRect();
    card.style.setProperty('--mouse-x', `${e.clientX - rect.left}px`);
    card.style.setProperty('--mouse-y', `${e.clientY - rect.top}px`);
  });
});

// Picker search
document.getElementById('pickerSearch')?.addEventListener('input', e => renderServerPicker(e.target.value));
