/* ─── CxSSH SPA Core ─── */

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
let sessions = [];
let keys = [];
let proxies = [];
let terminals = [];
let activeTabId = null;
let currentView = 'dashboard';
let editingId = null; // reused for server/key/proxy
let selectedColor = '#6366f1';

// ── Terminal Theme ──
const termTheme = {
  background: '#0d0d0d', foreground: '#e2e8f0', cursor: '#6366f1', cursorAccent: '#0d0d0d',
  selection: 'rgba(99,102,241,0.3)', black: '#1e293b', red: '#ef4444', green: '#22c55e',
  yellow: '#f59e0b', blue: '#6366f1', magenta: '#a855f7', cyan: '#06b6d4', white: '#f1f5f9',
  brightBlack: '#475569', brightRed: '#f87171', brightGreen: '#4ade80', brightYellow: '#fbbf24',
  brightBlue: '#818cf8', brightMagenta: '#c084fc', brightCyan: '#22d3ee', brightWhite: '#ffffff',
};

// ── Navigation ──
document.querySelectorAll('.nav-item').forEach(item => {
  item.addEventListener('click', () => {
    switchView(item.dataset.view);
  });
});

function switchView(viewId) {
  currentView = viewId;
  document.querySelectorAll('.view-container').forEach(v => v.classList.remove('active'));
  document.getElementById(`view-${viewId}`).classList.add('active');
  
  document.querySelectorAll('.nav-item').forEach(i => {
    i.classList.toggle('active', i.dataset.view === viewId);
  });

  if (viewId === 'dashboard') loadServers();
  if (viewId === 'keys') loadKeys();
  if (viewId === 'proxies') loadProxies();
  if (viewId === 'sessions') loadSessions();
  if (viewId === 'terminal') {
    if (terminals.length > 0 && activeTabId) {
      activateTab(activeTabId);
    }
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
  countLabel.textContent = `${servers.length} server${servers.length === 1 ? '' : 's'} managed`;

  if (servers.length === 0) {
    grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1">
      <div class="empty-state-icon">🖥️</div>
      <div class="empty-state-title">No servers yet</div>
      <button class="btn btn-primary btn-sm mt-2" onclick="openAddServer()">Add your first server</button>
    </div>`;
    return;
  }

  grid.innerHTML = servers.map(s => `
    <div class="server-card" style="--card-color:${s.label_color || '#6366f1'}">
      <div class="server-card-header">
        <div>
          <div class="server-card-title">${esc(s.name)}</div>
          <div class="server-card-host">${esc(s.username)}@${esc(s.host)}</div>
        </div>
        <div class="flex gap-2">
          <button class="btn btn-ghost btn-icon btn-sm" onclick="openEditServer('${s.id}')">✏️</button>
          <button class="btn btn-danger btn-icon btn-sm" onclick="deleteServer('${s.id}')">🗑</button>
        </div>
      </div>
      <div class="server-card-meta">
        <span class="badge badge-accent">${s.auth_type}</span>
        ${s.proxy_id ? '<span class="badge badge-warning">🌐 Proxy</span>' : ''}
      </div>
      <div class="server-card-footer">
        <button class="btn btn-primary btn-sm w-full" onclick="connectToServer('${s.id}')">▶ Connect</button>
      </div>
    </div>
  `).join('');
}

function openAddServer() {
  editingId = null;
  resetServerForm();
  document.getElementById('serverModalTitle').textContent = 'Add Server';
  openModal('serverModal');
}

async function openEditServer(id) {
  const s = servers.find(x => x.id === id);
  if (!s) return;
  editingId = id;
  resetServerForm();
  document.getElementById('serverModalTitle').textContent = 'Edit Server';
  
  document.getElementById('sName').value = s.name;
  document.getElementById('sHost').value = s.host;
  document.getElementById('sPort').value = s.port;
  document.getElementById('sUsername').value = s.username;
  document.getElementById('sAuthType').value = s.auth_type;
  document.getElementById('sKeyId').value = s.key_id || '';
  document.getElementById('sProxyId').value = s.proxy_id || '';
  
  updateAuthFields(s.auth_type);
  selectColor(s.label_color);
  openModal('serverModal');
}

function resetServerForm() {
  document.getElementById('sName').value = '';
  document.getElementById('sHost').value = '';
  document.getElementById('sPort').value = '22';
  document.getElementById('sUsername').value = '';
  document.getElementById('sPassword').value = '';
  document.getElementById('sPrivateKey').value = '';
  document.getElementById('sAuthType').value = 'password';
  updateAuthFields('password');
  updateKeySelect();
  updateProxySelect();
  selectColor('#6366f1');
}

function updateAuthFields(type) {
  document.querySelectorAll('.auth-fields').forEach(f => f.style.display = 'none');
  document.getElementById(`auth-${type}`).style.display = 'block';
}

document.getElementById('sAuthType').addEventListener('change', e => updateAuthFields(e.target.value));

async function updateKeySelect() {
  keys = await api('GET', '/api/keys') || [];
  const sel = document.getElementById('sKeyId');
  sel.innerHTML = keys.map(k => `<option value="${k.id}">${esc(k.name)}</option>`).join('');
}

async function updateProxySelect() {
  proxies = await api('GET', '/api/proxies') || [];
  const sel = document.getElementById('sProxyId');
  sel.innerHTML = '<option value="">No Proxy (Direct)</option>' + 
    proxies.map(p => `<option value="${p.id}">${esc(p.name)} (${p.type})</option>`).join('');
}

document.getElementById('saveServerBtn').addEventListener('click', async () => {
  const payload = {
    name: document.getElementById('sName').value,
    host: document.getElementById('sHost').value,
    port: parseInt(document.getElementById('sPort').value),
    username: document.getElementById('sUsername').value,
    auth_type: document.getElementById('sAuthType').value,
    password: document.getElementById('sPassword').value,
    private_key: document.getElementById('sPrivateKey').value,
    key_id: document.getElementById('sKeyId').value || null,
    proxy_id: document.getElementById('sProxyId').value || null,
    label_color: selectedColor
  };
  
  const res = editingId 
    ? await api('PUT', `/api/servers/${editingId}`, payload)
    : await api('POST', '/api/servers', payload);
    
  if (res && !res.error) {
    closeModal('serverModal');
    loadServers();
    showToast('Server saved');
  }
});

// ── Proxies ──
async function loadProxies() {
  proxies = await api('GET', '/api/proxies') || [];
  renderProxies();
}

function renderProxies() {
  const grid = document.getElementById('proxyGrid');
  if (proxies.length === 0) {
    grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1">
      <div class="empty-state-icon">🌐</div>
      <div class="empty-state-title">No proxies configured</div>
      <button class="btn btn-primary btn-sm mt-2" onclick="openAddProxy()">Add Proxy</button>
    </div>`;
    return;
  }
  grid.innerHTML = proxies.map(p => `
    <div class="key-card">
      <div class="key-card-header">
        <div class="key-card-name">${esc(p.name)}</div>
        <div class="key-card-type">${esc(p.type)}</div>
      </div>
      <div class="text-sm text-muted font-mono">${esc(p.host)}:${p.port}</div>
      <div class="key-card-actions">
        <button class="btn btn-ghost btn-sm" onclick="openEditProxy('${p.id}')">Edit</button>
        <button class="btn btn-danger btn-sm" onclick="deleteProxy('${p.id}')">Delete</button>
      </div>
    </div>
  `).join('');
}

function openAddProxy() {
  editingId = null;
  document.getElementById('pName').value = '';
  document.getElementById('pHost').value = '';
  document.getElementById('pPort').value = '1080';
  document.getElementById('pUsername').value = '';
  document.getElementById('pPassword').value = '';
  document.getElementById('proxyModalTitle').textContent = 'Add Proxy';
  openModal('proxyModal');
}

function openEditProxy(id) {
  const p = proxies.find(x => x.id === id);
  if (!p) return;
  editingId = id;
  document.getElementById('pName').value = p.name;
  document.getElementById('pType').value = p.type;
  document.getElementById('pHost').value = p.host;
  document.getElementById('pPort').value = p.port;
  document.getElementById('pUsername').value = p.username || '';
  document.getElementById('pPassword').value = p.password || '';
  document.getElementById('proxyModalTitle').textContent = 'Edit Proxy';
  openModal('proxyModal');
}

document.getElementById('saveProxyBtn').addEventListener('click', async () => {
  const payload = {
    name: document.getElementById('pName').value,
    type: document.getElementById('pType').value,
    host: document.getElementById('pHost').value,
    port: parseInt(document.getElementById('pPort').value),
    username: document.getElementById('pUsername').value,
    password: document.getElementById('pPassword').value
  };
  const res = editingId 
    ? await api('PUT', `/api/proxies/${editingId}`, payload)
    : await api('POST', '/api/proxies', payload);
  if (res && !res.error) {
    closeModal('proxyModal');
    loadProxies();
  }
});

async function deleteProxy(id) {
  if (confirm('Delete this proxy? Servers using it will revert to direct connection.')) {
    await api('DELETE', `/api/proxies/${id}`);
    loadProxies();
  }
}

// ── SSH Keys (simplified for brevity, similar to dashboard.js) ──
async function loadKeys() {
  keys = await api('GET', '/api/keys') || [];
  renderKeys();
}
function renderKeys() {
  const grid = document.getElementById('keysGrid');
  grid.innerHTML = keys.map(k => `
    <div class="key-card">
       <div class="key-card-header"><div class="key-card-name">${esc(k.name)}</div></div>
       <div class="key-fingerprint">${esc(k.fingerprint)}</div>
       <button class="btn btn-danger btn-sm" onclick="deleteKey('${k.id}')">Delete</button>
    </div>
  `).join('');
}

// ── Terminal Management ──
async function connectToServer(serverId, resumeKey = null) {
  const server = servers.find(s => s.id === serverId) || await api('GET', `/api/servers/${serverId}`);
  if (!server) return;

  const tabId = 'tab_' + Math.random().toString(36).substr(2, 9);
  const pane = document.createElement('div');
  pane.className = 'term-pane';
  pane.id = `pane_${tabId}`;
  document.getElementById('termPanes').appendChild(pane);

  const term = new Terminal({ theme: termTheme, cursorBlink: true, fontSize: 14 });
  const fit = new FitAddon.FitAddon();
  term.loadAddon(fit);
  term.open(pane);
  
  const terminalObj = {
    id: tabId, serverId, server, term, fit, ws: null, status: 'connecting', resumeKey
  };
  terminals.push(terminalObj);
  
  document.getElementById('terminalEmptyState').style.display = 'none';
  
  switchView('terminal');
  renderTabs();
  activateTab(tabId);
  initWebSocket(terminalObj);
  updateTabBadge();
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
      renderTabs();
    } else if (m.type === 'output') {
      const bytes = new Uint8Array(m.data.length);
      for(let i=0; i<m.data.length; i++) bytes[i] = m.data.charCodeAt(i);
      t.term.write(bytes);
    } else if (m.type === 'error') {
      t.status = 'error';
      t.term.writeln(`\r\n\x1b[31m✖ ${m.data}\x1b[0m`);
      renderTabs();
    }
  };
  t.term.onData(data => {
    if (t.ws && t.ws.readyState === 1) t.ws.send(JSON.stringify({ type: 'input', data }));
  });
}

function activateTab(tabId) {
  activeTabId = tabId;
  terminals.forEach(t => {
    const pane = document.getElementById(`pane_${t.id}`);
    pane.classList.toggle('active', t.id === tabId);
    if (t.id === tabId) {
      setTimeout(() => {
        t.fit.fit();
        t.term.focus();
        if (t.ws && t.ws.readyState === 1) {
          t.ws.send(JSON.stringify({ type: 'resize', cols: t.term.cols, rows: t.term.rows }));
        }
      }, 10);
    }
  });
  renderTabs();
}

function renderTabs() {
  const bar = document.getElementById('tabBar');
  bar.innerHTML = terminals.map(t => `
    <div class="tab-item ${t.id === activeTabId ? 'active' : ''}" 
         onclick="activateTab('${t.id}')" 
         draggable="true" 
         ondragstart="handleDragStart(event, '${t.id}')"
         ondragover="handleDragOver(event)"
         ondrop="handleDrop(event, '${t.id}')">
      <div class="tab-dot ${t.status}" style="background:${t.status==='connected'?'var(--success)':'var(--warning)'}"></div>
      <div class="tab-title">${esc(t.server.name)}</div>
      <div class="tab-close" onclick="event.stopPropagation(); closeTab('${t.id}')">✕</div>
    </div>
  `).join('');
}

function closeTab(id) {
  const idx = terminals.findIndex(t => t.id === id);
  if (idx === -1) return;
  const t = terminals[idx];
  if (t.ws) t.ws.close();
  t.term.dispose();
  document.getElementById(`pane_${id}`).remove();
  terminals.splice(idx, 1);
  
  if (terminals.length === 0) {
    document.getElementById('terminalEmptyState').style.display = 'flex';
    activeTabId = null;
  } else if (activeTabId === id) {
    activateTab(terminals[Math.min(idx, terminals.length - 1)].id);
  }
  renderTabs();
  updateTabBadge();
}

// ── Tab Swapping (Drag & Drop) ──
let draggedTabId = null;
window.handleDragStart = (e, id) => { draggedTabId = id; e.dataTransfer.setData('text/plain', id); };
window.handleDragOver = (e) => e.preventDefault();
window.handleDrop = (e, targetId) => {
  e.preventDefault();
  if (draggedTabId === targetId) return;
  const fromIdx = terminals.findIndex(t => t.id === draggedTabId);
  const toIdx = terminals.findIndex(t => t.id === targetId);
  const [moved] = terminals.splice(fromIdx, 1);
  terminals.splice(toIdx, 0, moved);
  renderTabs();
};

function updateTabBadge() {
  const badge = document.getElementById('tabCountBadge');
  badge.textContent = terminals.length;
  badge.style.display = terminals.length > 0 ? 'block' : 'none';
}

// ── Sessions ──
async function loadSessions() {
  sessions = await api('GET', '/api/sessions') || [];
  renderSessions();
}
function renderSessions() {
  const grid = document.getElementById('sessionGrid');
  grid.innerHTML = sessions.map(s => `
    <div class="server-card" onclick="connectToServer('${s.server_id}')">
      <div class="server-card-title">${esc(s.name)}</div>
      <div class="text-sm text-muted">${esc(s.host)}</div>
    </div>
  `).join('');
}

// ── Misc ──
function esc(s) { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
function openModal(id) { document.getElementById(id).classList.add('open'); }
function closeModal(id) { document.getElementById(id).classList.remove('open'); }
function selectColor(c) { selectedColor = c; /* render dots */ }

// ── Init ──
loadServers();
updateKeySelect();
updateProxySelect();
// Handle resize
window.addEventListener('resize', () => {
  if (activeTabId) {
    const t = terminals.find(x => x.id === activeTabId);
    if (t) t.fit.fit();
  }
});
