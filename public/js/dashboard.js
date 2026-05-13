/* ─── Dashboard JS ─── */

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

// ── Guard ──
if (!getToken()) { window.location.href = '/'; }

// ── State ──
let servers = [];
let sessions = [];
let keys = [];
let editingServerId = null;
let selectedColor = '#6366f1';
let saveSessionForServerId = null;

let currentTab = 'servers'; // 'servers' | 'keys'
let keyModalMode = 'generate'; // 'generate' | 'import'

// ── Logout ──
document.getElementById('logoutBtn').addEventListener('click', () => {
  clearToken();
  window.location.href = '/';
});

// ── Load user info ──
async function loadUser() {
  const data = await api('GET', '/api/auth/me');
  if (!data) return;
  document.getElementById('userNameDisplay').textContent = data.username;
  document.getElementById('userAvatar').textContent = data.username[0].toUpperCase();
}

// ── Nav ──
document.getElementById('navServers').addEventListener('click', () => switchTab('servers'));
document.getElementById('navKeys').addEventListener('click', () => switchTab('keys'));

function switchTab(tab) {
  currentTab = tab;
  document.getElementById('navServers').classList.toggle('active', tab === 'servers');
  document.getElementById('navKeys').classList.toggle('active', tab === 'keys');
  
  if (tab === 'servers') {
    document.getElementById('pageTitle').textContent = 'SSH Servers';
    document.getElementById('serverGrid').style.display = '';
    document.getElementById('keysGrid').style.display = 'none';
    document.getElementById('searchBarContainer').style.display = '';
    document.getElementById('addServerBtn').style.display = '';
    document.getElementById('addKeyBtn').style.display = 'none';
    renderServers(document.getElementById('searchInput').value);
  } else {
    document.getElementById('pageTitle').textContent = 'SSH Keys';
    document.getElementById('pageSubtitle').textContent = `${keys.length} keys managed`;
    document.getElementById('serverGrid').style.display = 'none';
    document.getElementById('keysGrid').style.display = '';
    document.getElementById('searchBarContainer').style.display = 'none';
    document.getElementById('addServerBtn').style.display = 'none';
    document.getElementById('addKeyBtn').style.display = '';
    renderKeys();
  }
}

// ── Keys ──
async function loadKeys() {
  keys = await api('GET', '/api/keys') || [];
  updateKeyDropdown();
  if (currentTab === 'keys') renderKeys();
}

function updateKeyDropdown() {
  const sel = document.getElementById('sKeyId');
  sel.innerHTML = '<option value="">-- Select a key --</option>' + 
    keys.map(k => `<option value="${k.id}">${escHtml(k.name)} (${k.key_type})</option>`).join('');
}

function renderKeys() {
  const grid = document.getElementById('keysGrid');
  document.getElementById('pageSubtitle').textContent = `${keys.length} keys managed`;
  if (keys.length === 0) {
    grid.innerHTML = `
      <div class="empty-state" style="grid-column:1/-1">
        <div class="empty-state-icon">🔑</div>
        <div class="empty-state-title">No SSH keys</div>
        <div class="empty-state-desc">Generate or import an SSH key to securely connect without passwords.</div>
      </div>`;
    grid.style.display = 'block'; // Block for empty state layout
    return;
  }
  grid.style.display = 'grid';

  grid.innerHTML = keys.map(k => `
    <div class="key-card">
      <div class="key-card-header">
        <div class="key-card-name">${escHtml(k.name)}</div>
        <div class="key-card-type">${escHtml(k.key_type)}</div>
      </div>
      <div class="key-fingerprint">${escHtml(k.fingerprint || 'No fingerprint available')}</div>
      <div class="key-card-actions">
        <button class="btn btn-copy" onclick="copyPublicKey('${k.id}', this)">
          📋 Copy Public Key
        </button>
        <div style="flex:1"></div>
        <button class="btn btn-danger btn-sm" onclick="confirmDeleteKey('${k.id}','${escHtml(k.name)}')">
          Delete
        </button>
      </div>
    </div>
  `).join('');
}

async function copyPublicKey(id, btn) {
  const data = await api('GET', `/api/keys/${id}/public`);
  if (data && data.public_key) {
    try {
      await navigator.clipboard.writeText(data.public_key);
      const oldText = btn.innerHTML;
      btn.innerHTML = '✓ Copied!';
      btn.classList.add('copied');
      setTimeout(() => { btn.innerHTML = oldText; btn.classList.remove('copied'); }, 2000);
    } catch (e) {
      showToast('Clipboard access denied', 'error');
    }
  } else {
    showToast('Failed to fetch public key', 'error');
  }
}

async function confirmDeleteKey(id, name) {
  if (!confirm(`Delete key "${name}"? Servers using this key will fail to connect.`)) return;
  await api('DELETE', `/api/keys/${id}`);
  showToast(`Key "${name}" deleted`, 'success');
  loadKeys();
  loadServers(); // servers might have lost their key ref
}

// ── Key Modal ──
document.getElementById('addKeyBtn').addEventListener('click', () => {
  document.getElementById('kName').value = '';
  document.getElementById('kPrivate').value = '';
  document.getElementById('kPublic').value = '';
  switchKeyTab('generate');
  openModal('keyModal');
});

document.getElementById('tabKeyGenerate').addEventListener('click', () => switchKeyTab('generate'));
document.getElementById('tabKeyImport').addEventListener('click', () => switchKeyTab('import'));

function switchKeyTab(mode) {
  keyModalMode = mode;
  document.getElementById('tabKeyGenerate').classList.toggle('active', mode === 'generate');
  document.getElementById('tabKeyImport').classList.toggle('active', mode === 'import');
  document.getElementById('keyGenerateView').style.display = mode === 'generate' ? '' : 'none';
  document.getElementById('keyImportView').style.display = mode === 'import' ? '' : 'none';
  document.getElementById('keyModalSave').textContent = mode === 'generate' ? 'Generate Key' : 'Import Key';
}

document.getElementById('keyModalClose').addEventListener('click', () => closeModal('keyModal'));
document.getElementById('keyModalCancel').addEventListener('click', () => closeModal('keyModal'));

document.getElementById('keyModalSave').addEventListener('click', async () => {
  const name = document.getElementById('kName').value.trim();
  if (!name) { showToast('Key name is required', 'error'); return; }

  const btn = document.getElementById('keyModalSave');
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span>';

  let res;
  if (keyModalMode === 'generate') {
    res = await api('POST', '/api/keys/generate', {
      name,
      key_type: document.getElementById('kType').value,
    });
  } else {
    const priv = document.getElementById('kPrivate').value.trim();
    if (!priv) { showToast('Private key is required', 'error'); btn.disabled = false; btn.textContent = 'Import Key'; return; }
    res = await api('POST', '/api/keys/import', {
      name,
      private_key: priv,
      public_key: document.getElementById('kPublic').value.trim() || undefined,
    });
  }

  btn.disabled = false;
  btn.textContent = keyModalMode === 'generate' ? 'Generate Key' : 'Import Key';

  if (res && !res.error) {
    showToast(`Key "${name}" saved`, 'success');
    closeModal('keyModal');
    loadKeys();
  } else {
    showToast(res?.error || 'Failed to save key', 'error');
  }
});


// ── Servers ──
async function loadServers() {
  servers = await api('GET', '/api/servers') || [];
  if (currentTab === 'servers') renderServers(document.getElementById('searchInput').value);
}

function renderServers(filter = '') {
  const grid = document.getElementById('serverGrid');
  const q = filter.toLowerCase();
  const filtered = servers.filter(s =>
    s.name.toLowerCase().includes(q) ||
    s.host.toLowerCase().includes(q) ||
    (s.notes || '').toLowerCase().includes(q)
  );

  document.getElementById('pageSubtitle').textContent =
    `${filtered.length} server${filtered.length !== 1 ? 's' : ''}`;

  if (filtered.length === 0) {
    grid.innerHTML = `
      <div class="empty-state" style="grid-column:1/-1">
        <div class="empty-state-icon">🖥️</div>
        <div class="empty-state-title">${filter ? 'No matching servers' : 'No servers yet'}</div>
        <div class="empty-state-desc">${filter ? 'Try a different search.' : 'Click "Add Server" to add your first SSH server.'}</div>
      </div>`;
    grid.style.display = 'block';
    return;
  }
  grid.style.display = 'grid';

  grid.innerHTML = filtered.map(s => `
    <div class="server-card" data-id="${s.id}" style="--card-color:${s.label_color || '#6366f1'}">
      <div class="server-card-header">
        <div>
          <div class="server-card-title">${escHtml(s.name)}</div>
          <div class="server-card-host">${escHtml(s.username)}@${escHtml(s.host)}:${s.port}</div>
        </div>
        <div class="server-card-actions">
          <button class="btn btn-ghost btn-icon btn-sm" onclick="openEditServer('${s.id}')" title="Edit" aria-label="Edit ${escHtml(s.name)}">✏️</button>
          <button class="btn btn-danger btn-icon btn-sm" onclick="confirmDeleteServer('${s.id}','${escHtml(s.name)}')" title="Delete" aria-label="Delete ${escHtml(s.name)}">🗑</button>
        </div>
      </div>
      ${s.notes ? `<div class="text-sm text-muted" style="line-height:1.4">${escHtml(s.notes)}</div>` : ''}
      <div class="server-card-meta">
        <span class="badge badge-accent">${s.auth_type === 'password' ? '🔒 Password' : '🔑 Key'}</span>
        ${s.last_connected ? `<span class="text-muted text-sm">Last: ${timeSince(s.last_connected)}</span>` : ''}
      </div>
      <div class="server-card-footer">
        <button class="btn btn-connect btn-sm" onclick="connectServer('${s.id}')">
          ▶ Connect
        </button>
        <button class="btn btn-ghost btn-sm" onclick="openSaveSession('${s.id}')" title="Save Session">
          💾
        </button>
      </div>
    </div>
  `).join('');
}

// ── Sessions ──
async function loadSessions() {
  sessions = await api('GET', '/api/sessions') || [];
  renderSessions();
}

function renderSessions() {
  const list = document.getElementById('sessionList');
  if (sessions.length === 0) {
    list.innerHTML = `
      <div class="empty-state" style="padding:24px 12px">
        <div class="empty-state-icon">📋</div>
        <div class="empty-state-title">No sessions yet</div>
        <div class="empty-state-desc">Connect and save sessions for quick access.</div>
      </div>`;
    return;
  }
  list.innerHTML = sessions.map(s => `
    <div class="session-item" onclick="connectFromSession('${s.id}','${s.server_id}')" title="Connect to ${escHtml(s.name)}" role="button" tabindex="0">
      <div class="color-dot" style="background:${s.label_color || '#6366f1'}"></div>
      <div class="session-item-info">
        <div class="session-item-name">${escHtml(s.name)}</div>
        <div class="session-item-host">${s.host ? `${s.host}:${s.port}` : ''}</div>
      </div>
      <button class="session-delete" onclick="event.stopPropagation();deleteSession('${s.id}')" title="Delete session" aria-label="Delete session ${escHtml(s.name)}">✕</button>
    </div>
  `).join('');
}

// ── Connect ──
function connectServer(serverId) {
  window.location.href = `/terminal?serverId=${serverId}`;
}

async function connectFromSession(sessionId, serverId) {
  await api('POST', `/api/sessions/${sessionId}/use`);
  window.location.href = `/terminal?serverId=${serverId}&sessionId=${sessionId}`;
}

// ── Delete session ──
async function deleteSession(id) {
  await api('DELETE', `/api/sessions/${id}`);
  showToast('Session deleted', 'info');
  loadSessions();
}

// ── Server modal ──
function openAddServer() {
  editingServerId = null;
  selectedColor = '#6366f1';
  document.getElementById('serverModalTitle').textContent = 'Add Server';
  document.getElementById('serverModalSave').textContent = 'Save Server';
  clearServerForm();
  openModal('serverModal');
}

function openEditServer(id) {
  const s = servers.find(x => x.id === id);
  if (!s) return;
  editingServerId = id;
  selectedColor = s.label_color || '#6366f1';
  document.getElementById('serverModalTitle').textContent = 'Edit Server';
  document.getElementById('serverModalSave').textContent = 'Update Server';
  document.getElementById('sName').value = s.name;
  document.getElementById('sHost').value = s.host;
  document.getElementById('sPort').value = s.port;
  document.getElementById('sUsername').value = s.username;
  document.getElementById('sAuthType').value = s.auth_type;
  document.getElementById('sKeyId').value = s.key_id || '';
  document.getElementById('sNotes').value = s.notes || '';
  document.getElementById('sPassword').value = '';
  document.getElementById('sPrivateKey').value = '';
  updateAuthUI(s.auth_type);
  updateColorPicker(s.label_color);
  openModal('serverModal');
}

function clearServerForm() {
  ['sName','sHost','sPassword','sPrivateKey','sNotes','sKeyId'].forEach(id => {
    document.getElementById(id).value = '';
  });
  document.getElementById('sPort').value = '22';
  document.getElementById('sUsername').value = '';
  document.getElementById('sAuthType').value = 'password';
  updateAuthUI('password');
  updateColorPicker('#6366f1');
}

document.getElementById('addServerBtn').addEventListener('click', openAddServer);
document.getElementById('serverModalClose').addEventListener('click', () => closeModal('serverModal'));
document.getElementById('serverModalCancel').addEventListener('click', () => closeModal('serverModal'));

document.getElementById('sAuthType').addEventListener('change', (e) => {
  updateAuthUI(e.target.value);
});

function updateAuthUI(type) {
  document.getElementById('passwordGroup').style.display = type === 'password' ? '' : 'none';
  document.getElementById('managedKeyGroup').style.display = type === 'managed_key' ? '' : 'none';
  document.getElementById('keyGroup').style.display = type === 'key' ? '' : 'none';
}

// Color picker
document.getElementById('colorPicker').addEventListener('click', (e) => {
  const pill = e.target.closest('.color-pill');
  if (!pill) return;
  selectedColor = pill.dataset.color;
  updateColorPicker(selectedColor);
});

function updateColorPicker(color) {
  document.querySelectorAll('.color-pill').forEach(p => {
    const active = p.dataset.color === color;
    p.classList.toggle('selected', active);
    p.setAttribute('aria-checked', String(active));
  });
  selectedColor = color;
}

// Test connection
document.getElementById('testConnBtn').addEventListener('click', async () => {
  const btn = document.getElementById('testConnBtn');
  if (!editingServerId) {
    showToast('Save the server first to test connection', 'warning');
    return;
  }
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span>';
  const data = await api('POST', `/api/servers/${editingServerId}/test`);
  btn.disabled = false;
  btn.innerHTML = '🔌 Test';
  if (data?.ok) showToast('Connection successful! ✓', 'success');
  else showToast(data?.error || 'Connection failed', 'error');
});

// Save server
document.getElementById('serverModalSave').addEventListener('click', async () => {
  const name = document.getElementById('sName').value.trim();
  const host = document.getElementById('sHost').value.trim();
  const username = document.getElementById('sUsername').value.trim();
  const auth_type = document.getElementById('sAuthType').value;
  if (!name || !host || !username) {
    showToast('Name, host, and username are required', 'error');
    return;
  }

  const payload = {
    name, host, username,
    port: parseInt(document.getElementById('sPort').value) || 22,
    auth_type,
    password: auth_type === 'password' ? (document.getElementById('sPassword').value || undefined) : undefined,
    private_key: auth_type === 'key' ? (document.getElementById('sPrivateKey').value || undefined) : undefined,
    key_id: auth_type === 'managed_key' ? (document.getElementById('sKeyId').value || undefined) : undefined,
    label_color: selectedColor,
    notes: document.getElementById('sNotes').value.trim() || undefined,
  };

  if (auth_type === 'managed_key' && !payload.key_id) {
    showToast('Please select an SSH key', 'error'); return;
  }

  const btn = document.getElementById('serverModalSave');
  btn.disabled = true;

  let data;
  if (editingServerId) {
    data = await api('PUT', `/api/servers/${editingServerId}`, payload);
  } else {
    data = await api('POST', '/api/servers', payload);
  }

  btn.disabled = false;
  if (data && !data.error) {
    showToast(editingServerId ? 'Server updated' : 'Server added', 'success');
    closeModal('serverModal');
    loadServers();
  } else {
    showToast(data?.error || 'Failed to save server', 'error');
  }
});

// Delete server
async function confirmDeleteServer(id, name) {
  if (!confirm(`Delete server "${name}"? This will also remove its saved sessions.`)) return;
  await api('DELETE', `/api/servers/${id}`);
  showToast(`"${name}" deleted`, 'info');
  loadServers();
  loadSessions();
}

// ── Save Session modal ──
function openSaveSession(serverId) {
  saveSessionForServerId = serverId;
  const s = servers.find(x => x.id === serverId);
  document.getElementById('sessionName').value = s ? s.name : '';
  document.getElementById('sessionNotes').value = '';
  openModal('saveSessionModal');
}

document.getElementById('saveSessionClose').addEventListener('click', () => closeModal('saveSessionModal'));
document.getElementById('saveSessionCancel').addEventListener('click', () => closeModal('saveSessionModal'));
document.getElementById('saveSessionConfirm').addEventListener('click', async () => {
  const name = document.getElementById('sessionName').value.trim();
  if (!name) { showToast('Session name required', 'error'); return; }
  const data = await api('POST', '/api/sessions', {
    name,
    server_id: saveSessionForServerId,
    notes: document.getElementById('sessionNotes').value.trim() || undefined,
  });
  if (data && !data.error) {
    showToast('Session saved!', 'success');
    closeModal('saveSessionModal');
    loadSessions();
  } else {
    showToast(data?.error || 'Failed to save session', 'error');
  }
});

// ── Search ──
document.getElementById('searchInput').addEventListener('input', (e) => {
  renderServers(e.target.value);
});

// ── Modal helpers ──
function openModal(id) {
  document.getElementById(id).classList.add('open');
}
function closeModal(id) {
  document.getElementById(id).classList.remove('open');
}
// Close on backdrop click
document.querySelectorAll('.modal-overlay').forEach(overlay => {
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) overlay.classList.remove('open');
  });
});

// ── Utilities ──
function escHtml(s) {
  return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function timeSince(dateStr) {
  const d = new Date(dateStr);
  const diff = (Date.now() - d.getTime()) / 1000;
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff/60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff/3600)}h ago`;
  return `${Math.floor(diff/86400)}d ago`;
}

// ── Init ──
loadUser();
loadKeys(); // loads keys, updates dropdown, then renders keys if active
loadServers();
loadSessions();
