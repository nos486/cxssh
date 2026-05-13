/* ─── Terminal JS (Multi-tab) ─── */

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

if (!getToken()) { window.location.href = '/'; }

// ── State ──
let tabs = [];
let activeTabId = null;
let allServers = [];

const termTheme = {
  background: '#0d0d0d', foreground: '#e2e8f0', cursor: '#6366f1', cursorAccent: '#0d0d0d',
  selection: 'rgba(99,102,241,0.3)', black: '#1e293b', red: '#ef4444', green: '#22c55e',
  yellow: '#f59e0b', blue: '#6366f1', magenta: '#a855f7', cyan: '#06b6d4', white: '#f1f5f9',
  brightBlack: '#475569', brightRed: '#f87171', brightGreen: '#4ade80', brightYellow: '#fbbf24',
  brightBlue: '#818cf8', brightMagenta: '#c084fc', brightCyan: '#22d3ee', brightWhite: '#ffffff',
};

// ── Session Storage for Tabs ──
function loadPersistedTabs() {
  try {
    const saved = sessionStorage.getItem('cxssh_tabs');
    if (saved) return JSON.parse(saved);
  } catch {}
  return null;
}

function persistTabs() {
  const saved = tabs.map(t => ({ id: t.id, serverId: t.serverId, resumeKey: t.resumeKey }));
  sessionStorage.setItem('cxssh_tabs', JSON.stringify(saved));
}

function getActiveTab() { return tabs.find(t => t.id === activeTabId); }

// ── Server Info ──
async function fetchServer(id) {
  return await api('GET', `/api/servers/${id}`);
}

async function fetchAllServers() {
  allServers = await api('GET', '/api/servers') || [];
  renderServerPicker();
}

// ── Tab Management ──
async function createTab(serverId, resumeKey = null) {
  const tabId = 'tab_' + Math.random().toString(36).substr(2, 9);
  const serverData = await fetchServer(serverId);
  if (!serverData || serverData.error) {
    showToast('Failed to load server', 'error'); return null;
  }

  const tab = {
    id: tabId, serverId, serverData, resumeKey,
    ws: null, term: null, fitAddon: null, status: 'connecting',
    paneEl: null,
  };

  tabs.push(tab);
  
  // Create DOM elements
  const pane = document.createElement('div');
  pane.className = 'term-pane';
  pane.id = `pane_${tabId}`;
  document.getElementById('termPanes').appendChild(pane);
  tab.paneEl = pane;

  // Init xterm
  tab.term = new Terminal({
    theme: termTheme,
    fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace",
    fontSize: 14, lineHeight: 1.4, cursorBlink: true, cursorStyle: 'block', scrollback: 5000, allowProposedApi: true,
  });
  tab.fitAddon = new FitAddon.FitAddon();
  tab.term.loadAddon(tab.fitAddon);
  tab.term.loadAddon(new WebLinksAddon.WebLinksAddon());
  
  tab.term.open(pane);

  // Resize observer on pane
  const ro = new ResizeObserver(() => {
    if (pane.classList.contains('active')) {
      tab.fitAddon.fit();
      if (tab.ws && tab.ws.readyState === 1) {
        tab.ws.send(JSON.stringify({ type: 'resize', cols: tab.term.cols, rows: tab.term.rows }));
      }
    }
  });
  ro.observe(pane);

  // Input
  tab.term.onData(data => {
    if (tab.ws && tab.ws.readyState === 1) {
      tab.ws.send(JSON.stringify({ type: 'input', data }));
    }
  });

  renderTabBar();
  activateTab(tabId);
  connectTab(tab);

  return tab;
}

function closeTab(tabId) {
  const idx = tabs.findIndex(t => t.id === tabId);
  if (idx === -1) return;
  const tab = tabs[idx];
  
  if (tab.ws) tab.ws.close();
  if (tab.term) tab.term.dispose();
  if (tab.paneEl) tab.paneEl.remove();

  tabs.splice(idx, 1);
  persistTabs();

  if (tabs.length === 0) {
    window.location.href = '/dashboard';
  } else if (activeTabId === tabId) {
    activateTab(tabs[Math.min(idx, tabs.length - 1)].id);
  } else {
    renderTabBar();
  }
}

function activateTab(tabId) {
  activeTabId = tabId;
  const tab = getActiveTab();
  if (!tab) return;

  // Update panes
  tabs.forEach(t => {
    t.paneEl.classList.toggle('active', t.id === tabId);
  });
  
  setTimeout(() => {
    tab.fitAddon.fit();
    tab.term.focus();
    if (tab.ws && tab.ws.readyState === 1) {
      tab.ws.send(JSON.stringify({ type: 'resize', cols: tab.term.cols, rows: tab.term.rows }));
    }
  }, 10);

  // Update topbar info
  document.getElementById('serverNameBar').textContent = tab.serverData.name;
  document.getElementById('serverHostBar').textContent = `${tab.serverData.username}@${tab.serverData.host}:${tab.serverData.port}`;
  document.getElementById('serverDot').style.background = tab.serverData.label_color || '#6366f1';
  document.title = `${tab.serverData.name} — CxSSH`;
  
  updateTabStatusUI(tab);
  renderTabBar();
  hideOverlay(); // manage overlay
}

function renderTabBar() {
  const bar = document.getElementById('tabBar');
  // keep the + button
  const addBtn = document.getElementById('tabAddBtn');
  bar.innerHTML = '';
  
  tabs.forEach(t => {
    const el = document.createElement('div');
    el.className = `tab-item ${t.id === activeTabId ? 'active' : ''}`;
    el.onclick = () => activateTab(t.id);
    
    const dot = document.createElement('div');
    dot.className = `tab-dot ${t.status}`;
    dot.style.background = t.status === 'connecting' ? 'var(--warning)' : 
                          (t.status === 'error' ? 'var(--danger)' : 'var(--success)');
    
    const title = document.createElement('div');
    title.className = 'tab-title';
    title.textContent = t.serverData.name;

    const closeBtn = document.createElement('button');
    closeBtn.className = 'tab-close';
    closeBtn.innerHTML = '✕';
    closeBtn.title = 'Close tab';
    closeBtn.onclick = (e) => { e.stopPropagation(); closeTab(t.id); };

    el.appendChild(dot);
    el.appendChild(title);
    el.appendChild(closeBtn);
    bar.appendChild(el);
  });
  
  bar.appendChild(addBtn);
}

function updateTabStatusUI(tab) {
  if (tab.id === activeTabId) {
    const dot = document.getElementById('statusDot');
    const text = document.getElementById('statusText');
    dot.className = `status-dot ${tab.status}`;
    const labels = { connecting: 'Connecting…', connected: 'Connected', error: 'Disconnected' };
    text.textContent = labels[tab.status] || tab.status;
  }
}

// ── WebSockets ──
function connectTab(tab) {
  tab.status = 'connecting';
  updateTabStatusUI(tab);
  renderTabBar();

  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  let url = `${proto}//${location.host}/ws/ssh?token=${encodeURIComponent(getToken())}&serverId=${encodeURIComponent(tab.serverId)}&cols=${tab.term.cols}&rows=${tab.term.rows}`;
  if (tab.resumeKey) url += `&resumeKey=${encodeURIComponent(tab.resumeKey)}`;

  tab.ws = new WebSocket(url);

  tab.ws.onmessage = (event) => {
    const msg = JSON.parse(event.data);
    if (msg.type === 'connected' || msg.type === 'resumed') {
      tab.status = 'connected';
      if (msg.resumeKey) {
        tab.resumeKey = msg.resumeKey;
        persistTabs(); // save the new resumeKey
      }
      if (msg.type === 'connected') {
        setTimeout(() => { if (tab.id === activeTabId) showSavePrompt(); }, 1200);
      }
      updateTabStatusUI(tab);
      renderTabBar();
      if (tab.id === activeTabId) hideOverlay();
    } else if (msg.type === 'output') {
      const bytes = new Uint8Array(msg.data.length);
      for (let i = 0; i < msg.data.length; i++) bytes[i] = msg.data.charCodeAt(i);
      tab.term.write(bytes);
    } else if (msg.type === 'error' || msg.type === 'disconnect') {
      tab.status = 'error';
      tab.term.writeln(`\r\n\x1b[31m✖ ${msg.data}\x1b[0m\r\n`);
      updateTabStatusUI(tab);
      renderTabBar();
      if (tab.id === activeTabId) hideOverlay();
    }
  };

  tab.ws.onerror = () => {
    tab.status = 'error';
    tab.term.writeln('\r\n\x1b[31m✖ WebSocket connection error\x1b[0m\r\n');
    updateTabStatusUI(tab);
    renderTabBar();
  };

  tab.ws.onclose = () => {
    tab.status = 'error';
    tab.term.writeln('\r\n\x1b[33m⚡ Connection closed\x1b[0m\r\n');
    updateTabStatusUI(tab);
    renderTabBar();
  };
}

// ── UI Overlays ──
function hideOverlay() {
  document.getElementById('connectOverlay').classList.add('hidden');
}
function showSavePrompt() {
  document.getElementById('savePrompt').classList.add('show');
}
function hideSavePrompt() {
  document.getElementById('savePrompt').classList.remove('show');
}

// ── Topbar Actions ──
document.getElementById('backBtn').addEventListener('click', () => {
  window.location.href = '/dashboard';
});

document.getElementById('saveSessionBtn').addEventListener('click', () => {
  const tab = getActiveTab();
  if (!tab) return;
  document.getElementById('sessionNameInput').value = tab.serverData.name;
  document.getElementById('sessionNotesInput').value = '';
  document.getElementById('saveSessionModal').classList.add('open');
});

document.getElementById('clearBtn').addEventListener('click', () => {
  const tab = getActiveTab();
  if (tab) { tab.term.clear(); tab.term.focus(); }
});

document.getElementById('disconnectBtn').addEventListener('click', () => {
  const tab = getActiveTab();
  if (tab && tab.ws) {
    tab.ws.close();
    showToast('Disconnected', 'info');
  }
});

// ── Save Session Prompt ──
document.getElementById('savePromptYes').addEventListener('click', () => {
  hideSavePrompt();
  const tab = getActiveTab();
  if (!tab) return;
  document.getElementById('sessionNameInput').value = tab.serverData.name;
  document.getElementById('sessionNotesInput').value = '';
  document.getElementById('saveSessionModal').classList.add('open');
});
document.getElementById('savePromptNo').addEventListener('click', hideSavePrompt);

document.getElementById('saveModalClose').addEventListener('click', () => document.getElementById('saveSessionModal').classList.remove('open'));
document.getElementById('saveModalCancel').addEventListener('click', () => document.getElementById('saveSessionModal').classList.remove('open'));

document.getElementById('saveModalConfirm').addEventListener('click', async () => {
  const tab = getActiveTab();
  if (!tab) return;
  const name = document.getElementById('sessionNameInput').value.trim();
  if (!name) { showToast('Session name required', 'error'); return; }
  const data = await api('POST', '/api/sessions', {
    name, server_id: tab.serverId,
    notes: document.getElementById('sessionNotesInput').value.trim() || undefined,
  });
  if (data && !data.error) {
    showToast('Session saved! 🎉', 'success');
    document.getElementById('saveSessionModal').classList.remove('open');
  } else {
    showToast(data?.error || 'Failed to save session', 'error');
  }
});

// ── New Tab / Server Picker ──
document.getElementById('tabAddBtn').addEventListener('click', () => {
  fetchAllServers();
  document.getElementById('pickerSearch').value = '';
  document.getElementById('serverPickerModal').classList.add('open');
});

document.getElementById('pickerModalClose').addEventListener('click', () => {
  document.getElementById('serverPickerModal').classList.remove('open');
});

document.getElementById('pickerSearch').addEventListener('input', (e) => {
  renderServerPicker(e.target.value);
});

function renderServerPicker(filter = '') {
  const list = document.getElementById('pickerList');
  const q = filter.toLowerCase();
  const filtered = allServers.filter(s => s.name.toLowerCase().includes(q) || s.host.toLowerCase().includes(q));
  
  if (filtered.length === 0) {
    list.innerHTML = `<div class="text-muted text-sm" style="text-align:center;padding:20px;">No servers found</div>`;
    return;
  }
  
  list.innerHTML = filtered.map(s => `
    <div class="server-picker-item" onclick="openPickerServer('${s.id}')">
      <div class="color-dot" style="background:${s.label_color || '#6366f1'}"></div>
      <div>
        <div class="server-picker-item-name">${escHtml(s.name)}</div>
        <div class="server-picker-item-host">${escHtml(s.username)}@${escHtml(s.host)}</div>
      </div>
    </div>
  `).join('');
}

window.openPickerServer = async (id) => {
  document.getElementById('serverPickerModal').classList.remove('open');
  await createTab(id);
};

// ── Utilities ──
function escHtml(s) {
  return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

document.querySelectorAll('.modal-overlay').forEach(overlay => {
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) overlay.classList.remove('open');
  });
});

// ── Boot ──
async function boot() {
  const params = new URLSearchParams(location.search);
  const paramServerId = params.get('serverId');
  
  // Clean URL without reloading page
  if (paramServerId) {
    window.history.replaceState({}, document.title, '/terminal');
  }

  const persisted = loadPersistedTabs();
  
  if (paramServerId) {
    // If opened from dashboard
    if (persisted && persisted.length > 0) {
      // Restore persisted tabs first
      for (const t of persisted) { await createTab(t.serverId, t.resumeKey); }
      // Then open the new requested tab
      await createTab(paramServerId);
    } else {
      await createTab(paramServerId);
    }
  } else if (persisted && persisted.length > 0) {
    // Reloaded page directly
    for (const t of persisted) { await createTab(t.serverId, t.resumeKey); }
  } else {
    window.location.href = '/dashboard';
  }
}

boot();
