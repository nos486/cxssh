/* ─── CxSSH SPA Core (v2.5) ─── */

// ── Auth helpers ──
function getToken() { return localStorage.getItem('cxssh_token'); }
function clearToken() { localStorage.removeItem('cxssh_token'); }

async function api(method, path, body) {
  const res = await fetch(path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${getToken()}`,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (res.status === 401) { clearToken(); window.location.href = '/'; return null; }
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
let terminals = []; // Array of { id, serverId, server, term, fit, ws, status, resumeKey }
let activeWindowId = null;
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
  const state = terminals.map(t => ({
    serverId: t.serverId,
    resumeKey: t.resumeKey
  }));
  sessionStorage.setItem('cxssh_workspace', JSON.stringify(state));
}

async function restoreWorkspace() {
  const saved = sessionStorage.getItem('cxssh_workspace');
  if (saved) {
    const state = JSON.parse(saved);
    // Fetch all servers first to ensure we have data
    servers = await api('GET', '/api/servers') || [];
    for (const item of state) {
      await connectToServer(item.serverId, item.resumeKey);
    }
  }
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
    setTimeout(() => terminals.forEach(t => t.fit.fit()), 100);
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
  countLabel.textContent = `${servers.length} remote systems mapped`;

  if (servers.length === 0) {
    grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1">
      <div class="empty-state-icon">🖥️</div>
      <div class="empty-state-title">No infrastructure added</div>
      <button class="btn btn-primary btn-sm mt-2" onclick="openAddServer()">Add New Server</button>
    </div>`;
    return;
  }

  grid.innerHTML = servers.map(s => `
    <div class="server-card" style="--card-color:${s.label_color || '#6366f1'}">
      <div class="flex justify-between items-center">
        <div class="server-icon-box">🖥️</div>
        <div class="flex gap-1">
          <button class="btn btn-ghost btn-icon btn-sm" onclick="openEditServer('${s.id}')" title="Edit">✏️</button>
          <button class="btn btn-danger btn-icon btn-sm" onclick="deleteServer('${s.id}')" title="Delete">🗑</button>
        </div>
      </div>
      <div>
        <div class="server-card-title" style="font-size: 18px; font-weight: 700; margin-bottom: 2px;">${esc(s.name)}</div>
        <div class="server-card-host" style="font-family:'JetBrains Mono'; font-size: 13px; color: var(--text-secondary);">${esc(s.username)}@${esc(s.host)}</div>
      </div>
      <div class="flex gap-2">
        <span class="badge badge-accent">${s.auth_type.replace('_',' ')}</span>
        ${s.proxy_id ? '<span class="badge badge-warning">🌐 Tunneled</span>' : ''}
      </div>
      <div class="mt-2">
        <button class="btn btn-primary w-full" onclick="connectToServer('${s.id}')">Connect Session</button>
      </div>
    </div>
  `).join('');
}

// ── SSH Keys ──
async function loadKeys() {
  keys = await api('GET', '/api/keys') || [];
  renderKeys();
}

function renderKeys() {
  const grid = document.getElementById('keysGrid');
  if (keys.length === 0) {
    grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1"><div class="empty-state-title">No identities found</div></div>`;
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
        <button class="btn btn-ghost btn-sm" onclick="copyPublicKey('${k.id}', this)">Copy Public</button>
        <button class="btn btn-danger btn-sm" onclick="deleteKey('${k.id}')">Delete</button>
      </div>
    </div>
  `).join('');
}

// ── Proxies ──
async function loadProxies() {
  proxies = await api('GET', '/api/proxies') || [];
  renderProxies();
}

function renderProxies() {
  const grid = document.getElementById('proxyGrid');
  if (proxies.length === 0) {
    grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1"><div class="empty-state-title">No proxies configured</div></div>`;
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

let highestZ = 100;
function getHighestZ() { return ++highestZ; }

async function connectToServer(serverId, resumeKey = null) {
  const server = servers.find(s => s.id === serverId) || await api('GET', `/api/servers/${serverId}`);
  if (!server) return;

  const winId = 'win_' + Math.random().toString(36).substr(2, 9);
  
  const win = document.createElement('div');
  win.className = 'term-window active';
  win.id = winId;
  
  // Stagger positions
  const offset = (terminals.length * 30) % 300;
  win.style.left = `${50 + offset}px`;
  win.style.top = `${50 + offset}px`;
  win.style.zIndex = getHighestZ();
  
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
    id: winId, serverId, server, term, fit, ws: null, status: 'connecting', resumeKey, el: win
  };
  terminals.push(terminalObj);
  
  // Initial fit
  setTimeout(() => fit.fit(), 50);

  // Drag logic
  const header = win.querySelector('.term-window-header');
  let isDragging = false;
  let startX, startY, startLeft, startTop;
  header.addEventListener('mousedown', (e) => {
    if (e.target.closest('.win-btn')) return;
    isDragging = true;
    startX = e.clientX;
    startY = e.clientY;
    startLeft = parseInt(win.style.left || 0);
    startTop = parseInt(win.style.top || 0);
    focusWindow(winId);
    e.preventDefault();
  });

  // Resize logic
  const resizer = win.querySelector('.resizer');
  let isResizing = false;
  let startW, startH;
  resizer.addEventListener('mousedown', (e) => {
    isResizing = true;
    startX = e.clientX;
    startY = e.clientY;
    startW = win.offsetWidth;
    startH = win.offsetHeight;
    focusWindow(winId);
    e.preventDefault();
    e.stopPropagation();
  });

  window.addEventListener('mousemove', (e) => {
    if (isDragging) {
      win.style.left = \`\${startLeft + (e.clientX - startX)}px\`;
      win.style.top = \`\${startTop + (e.clientY - startY)}px\`;
    }
    if (isResizing) {
      win.style.width = \`\${Math.max(300, startW + (e.clientX - startX))}px\`;
      win.style.height = \`\${Math.max(200, startH + (e.clientY - startY))}px\`;
      fit.fit();
    }
  });

  window.addEventListener('mouseup', () => {
    isDragging = false;
    if (isResizing) {
      isResizing = false;
      fit.fit();
    }
  });

  // Focus handling
  win.addEventListener('mousedown', () => focusWindow(winId));

  switchView('terminal');
  initWebSocket(terminalObj);
  updateTabBadge();
  persistWorkspace();
}

function focusWindow(id) {
  activeWindowId = id;
  terminals.forEach(t => {
    t.el.classList.toggle('active', t.id === id);
    if (t.id === id) {
      t.el.style.zIndex = getHighestZ();
      t.term.focus();
    }
  });
}

function closeTerminal(id) {
  const idx = terminals.findIndex(t => t.id === id);
  if (idx === -1) return;
  const t = terminals[idx];
  if (t.ws) t.ws.close();
  t.term.dispose();
  t.el.remove();
  terminals.splice(idx, 1);
  
  updateTabBadge();
  persistWorkspace();
}

function initWebSocket(t) {
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  let url = `${proto}//${location.host}/ws/ssh?token=${encodeURIComponent(getToken())}&serverId=${encodeURIComponent(t.serverId)}&cols=${t.term.cols}&rows=${t.term.rows}`;
  if (t.resumeKey) url += `&resumeKey=${encodeURIComponent(t.resumeKey)}`;

  t.ws = new WebSocket(url);
  t.ws.onmessage = (e) => {
    const m = JSON.parse(e.data);
    if (m.type === 'connected' || m.type === 'resumed') {
      t.status = 'connected';
      t.resumeKey = m.resumeKey;
      persistWorkspace();
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
}

function updateTabBadge() {
  const badge = document.getElementById('tabCountBadge');
  badge.textContent = terminals.length;
  badge.style.display = terminals.length > 0 ? 'block' : 'none';
}

// ── Modals & Controls ──
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

// Removed legacy layout buttons

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
  await loadServers();
  await restoreWorkspace();
}

boot();

// Handle global resize
window.addEventListener('resize', () => {
  terminals.forEach(t => t.fit.fit());
});
