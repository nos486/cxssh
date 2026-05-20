/* ─── Shared helpers ─── */

function getToken() {
  return localStorage.getItem('cxssh_token');
}

function setToken(token) {
  localStorage.setItem('cxssh_token', token);
}

function clearToken() {
  localStorage.removeItem('cxssh_token');
}

async function api(method, path, body) {
  const res = await fetch(path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(getToken() ? { 'X-CxSSH-Token': getToken() } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (res.status === 401) {
    clearToken();
    window.location.href = '/';
    return null;
  }
  return res.json();
}

function showToast(message, type = 'info') {
  const icons = { success: '✅', error: '❌', info: 'ℹ️', warning: '⚠️' };
  const container = document.getElementById('toastContainer');
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `<span class="toast-icon">${icons[type] || 'ℹ️'}</span><span>${message}</span>`;
  container.appendChild(toast);
  setTimeout(() => {
    toast.classList.add('removing');
    toast.addEventListener('animationend', () => toast.remove());
  }, 3500);
}

/* ─── Login page logic ─── */

const loginForm = document.getElementById('loginForm');
if (loginForm) {
  // Redirect if already logged in
  if (getToken()) {
    window.location.href = '/app';
  }

  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = document.getElementById('loginBtn');
    const errorEl = document.getElementById('loginError');
    const username = document.getElementById('username').value.trim();
    const password = document.getElementById('password').value;

    errorEl.style.display = 'none';
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span> Signing in…';

    try {
      const data = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      }).then(r => r.json());

      if (data.token) {
        setToken(data.token);
        window.location.href = '/app';
      } else {
        errorEl.textContent = data.error || 'Login failed';
        errorEl.style.display = 'block';
        btn.disabled = false;
        btn.innerHTML = 'Sign in';
      }
    } catch {
      errorEl.textContent = 'Network error. Please try again.';
      errorEl.style.display = 'block';
      btn.disabled = false;
      btn.innerHTML = 'Sign in';
    }
  });
}
