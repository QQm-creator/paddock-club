/**
 * 全局注册/登录系统
 * - 未登录时弹窗提示
 * - 登录后 token 存 localStorage
 * - 暴露 window.PaddockAuth API
 */
(function () {
  var APP_ORIGIN = window.location.origin;

  var TOKEN_KEY = 'paddock-token';
  var USER_KEY = 'paddock-user';

  var currentUser = null;
  try { currentUser = JSON.parse(localStorage.getItem(USER_KEY)); } catch (_) {}
  var token = null;
  try { token = localStorage.getItem(TOKEN_KEY); } catch (_) {}

  // ── Inject auth UI styles ──
  var style = document.createElement('style');
  style.textContent = [
    '.auth-overlay { position:fixed; inset:0; z-index:999999; display:flex; align-items:center; justify-content:center;',
    '  background:rgba(0,0,0,0.72); backdrop-filter:blur(6px); opacity:0; pointer-events:none; transition:opacity 280ms ease; }',
    '.auth-overlay.is-open { opacity:1; pointer-events:auto; }',
    '.auth-card { background:#141416; border:1px solid rgba(255,255,255,0.1); border-radius:12px; padding:32px 28px;',
    '  width:min(380px, calc(100vw - 36px)); box-shadow:0 28px 80px rgba(0,0,0,0.55); }',
    '.auth-card h2 { margin:0 0 6px; font-size:1.3rem; font-weight:900; color:#fff; }',
    '.auth-card p { margin:0 0 20px; font-size:0.72rem; color:rgba(255,255,255,0.4); }',
    '.auth-card label { display:block; margin-bottom:10px; }',
    '.auth-card label span { display:block; margin-bottom:4px; font-size:0.64rem; font-weight:700;',
    '  color:rgba(255,255,255,0.4); text-transform:uppercase; letter-spacing:0.06em; }',
    '.auth-card input { width:100%; padding:10px 14px; border:1px solid rgba(255,255,255,0.12); border-radius:8px;',
    '  background:rgba(255,255,255,0.04); color:#fff; font-size:0.82rem; font-family:inherit; outline:none; }',
    '.auth-card input:focus { border-color:rgba(225,58,63,0.5); }',
    '.auth-card__btns { display:flex; gap:10px; margin-top:18px; }',
    '.auth-card__btn { flex:1; padding:10px 0; border:none; border-radius:999px; font-size:0.74rem; font-weight:800;',
    '  cursor:pointer; font-family:inherit; letter-spacing:0.04em; transition:opacity 160ms ease; }',
    '.auth-card__btn--primary { background:#e13a3f; color:#fff; }',
    '.auth-card__btn--ghost { background:rgba(255,255,255,0.06); color:rgba(255,255,255,0.7); border:1px solid rgba(255,255,255,0.1); }',
    '.auth-card__btn:hover { opacity:0.85; }',
    '.auth-card__switch { margin-top:14px; text-align:center; font-size:0.64rem; color:rgba(255,255,255,0.35); }',
    '.auth-card__switch button { background:none; border:none; color:#e13a3f; cursor:pointer;',
    '  font-size:inherit; font-weight:700; text-decoration:underline; font-family:inherit; }',
    '.auth-card__error { margin-top:10px; font-size:0.62rem; color:#e13a3f; display:none; }',
    '.auth-card__user { display:flex; align-items:center; gap:8px; }',
    '.auth-card__user strong { color:#f0a028; font-size:0.9rem; }',
  ].join('\n');
  document.head.appendChild(style);

  // ── Build overlay ──
  var overlay = document.createElement('div');
  overlay.className = 'auth-overlay';
  overlay.innerHTML = [
    '<div class="auth-card" id="auth-card">',
    '  <div id="auth-login-form">',
    '    <h2>登录 · Login</h2>',
    '    <p>登录后即可发送弹幕和评分</p>',
    '    <label><span>用户名</span><input type="text" id="auth-username" placeholder="输入用户名" maxlength="20" autocomplete="username" /></label>',
    '    <label><span>密码</span><input type="password" id="auth-password" placeholder="输入密码" maxlength="72" autocomplete="current-password" /></label>',
    '    <p class="auth-card__error" id="auth-error"></p>',
    '    <div class="auth-card__btns">',
    '      <button class="auth-card__btn auth-card__btn--ghost" id="auth-cancel">取消</button>',
    '      <button class="auth-card__btn auth-card__btn--primary" id="auth-submit">登录</button>',
    '    </div>',
    '    <p class="auth-card__switch">没有账号？<button id="auth-switch-register">立即注册</button></p>',
    '  </div>',
    '  <div id="auth-register-form" style="display:none">',
    '    <h2>注册 · Register</h2>',
    '    <p>创建账号加入 Paddock Club</p>',
    '    <label><span>用户名</span><input type="text" id="reg-username" placeholder="至少2个字符" maxlength="20" /></label>',
    '    <label><span>密码</span><input type="password" id="reg-password" placeholder="至少8个字符" minlength="8" maxlength="72" autocomplete="new-password" /></label>',
    '    <p class="auth-card__error" id="reg-error"></p>',
    '    <div class="auth-card__btns">',
    '      <button class="auth-card__btn auth-card__btn--ghost" id="reg-cancel">取消</button>',
    '      <button class="auth-card__btn auth-card__btn--primary" id="reg-submit">注册</button>',
    '    </div>',
    '    <p class="auth-card__switch">已有账号？<button id="auth-switch-login">去登录</button></p>',
    '  </div>',
    '  <div id="auth-logged-in" style="display:none">',
    '    <div class="auth-card__user"><h2>已登录</h2><strong id="auth-username-display"></strong></div>',
    '    <p>你可以发送弹幕和评分了</p>',
    '    <div class="auth-card__btns">',
    '      <button class="auth-card__btn auth-card__btn--ghost" id="auth-logout">退出登录</button>',
    '      <button class="auth-card__btn auth-card__btn--primary" id="auth-close-logged">继续</button>',
    '    </div>',
    '  </div>',
    '</div>',
  ].join('\n');
  document.body.appendChild(overlay);
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-hidden', 'true');
  overlay.setAttribute('inert', '');

  // ── DOM refs ──
  var loginForm = document.getElementById('auth-login-form');
  var registerForm = document.getElementById('auth-register-form');
  var loggedInPanel = document.getElementById('auth-logged-in');
  var usernameInput = document.getElementById('auth-username');
  var passwordInput = document.getElementById('auth-password');
  var regUsernameInput = document.getElementById('reg-username');
  var regPasswordInput = document.getElementById('reg-password');
  var authError = document.getElementById('auth-error');
  var regError = document.getElementById('reg-error');
  var usernameDisplay = document.getElementById('auth-username-display');

  var mode = 'login';     // 'login' | 'register' | 'logged-in'
  var resolveAuth = null; // Promise resolve

  function showError(el, msg) {
    el.textContent = msg;
    el.style.display = 'block';
  }

  function hideError(el) {
    el.textContent = '';
    el.style.display = 'none';
  }

  function switchTo(m) {
    mode = m;
    loginForm.style.display = m === 'login' ? '' : 'none';
    registerForm.style.display = m === 'register' ? '' : 'none';
    loggedInPanel.style.display = m === 'logged-in' ? '' : 'none';
    hideError(authError);
    hideError(regError);
  }

  function close() {
    overlay.classList.remove('is-open');
    overlay.setAttribute('aria-hidden', 'true');
    overlay.setAttribute('inert', '');
    switchTo(currentUser ? 'logged-in' : 'login');
  }

  function saveAuth(t, user) {
    token = t;
    currentUser = user;
    try { localStorage.setItem(TOKEN_KEY, t); } catch (_) {}
    try { localStorage.setItem(USER_KEY, JSON.stringify(user)); } catch (_) {}
  }

  function clearAuth() {
    token = null;
    currentUser = null;
    try { localStorage.removeItem(TOKEN_KEY); } catch (_) {}
    try { localStorage.removeItem(USER_KEY); } catch (_) {}
  }

  function openOverlay() {
    overlay.removeAttribute('inert');
    overlay.setAttribute('aria-hidden', 'false');
    overlay.classList.add('is-open');
  }

  // ── API calls ──
  function apiLogin(username, password) {
    return fetch(APP_ORIGIN + '/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: username, password: password }),
    }).then(function (r) { return r.json().then(function (b) { if (!r.ok) throw new Error(b.error); return b; }); });
  }

  function apiRegister(username, password) {
    return fetch(APP_ORIGIN + '/api/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: username, password: password }),
    }).then(function (r) { return r.json().then(function (b) { if (!r.ok) throw new Error(b.error); return b; }); });
  }

  // ── Event handlers ──
  document.getElementById('auth-submit').addEventListener('click', function () {
    var u = usernameInput.value.trim();
    var p = passwordInput.value;
    if (!u || !p) { showError(authError, '请填写用户名和密码'); return; }
    apiLogin(u, p).then(function (data) {
      saveAuth(data.token, data.user);
      switchTo('logged-in');
      usernameDisplay.textContent = data.user.username;
      if (resolveAuth) { resolveAuth(data.user); resolveAuth = null; }
      setTimeout(close, 800);
    }).catch(function (e) { showError(authError, e.message); });
  });

  document.getElementById('reg-submit').addEventListener('click', function () {
    var u = regUsernameInput.value.trim();
    var p = regPasswordInput.value;
    if (u.length < 2) { showError(regError, '用户名至少2个字符'); return; }
    if (p.length < 8) { showError(regError, '密码至少8个字符'); return; }
    apiRegister(u, p).then(function (data) {
      saveAuth(data.token, data.user);
      switchTo('logged-in');
      usernameDisplay.textContent = data.user.username;
      if (resolveAuth) { resolveAuth(data.user); resolveAuth = null; }
      setTimeout(close, 800);
    }).catch(function (e) { showError(regError, e.message); });
  });

  document.getElementById('auth-cancel').addEventListener('click', function () {
    if (resolveAuth) { resolveAuth(null); resolveAuth = null; }
    close();
  });

  document.getElementById('reg-cancel').addEventListener('click', function () {
    if (resolveAuth) { resolveAuth(null); resolveAuth = null; }
    close();
  });

  document.getElementById('auth-close-logged').addEventListener('click', function () {
    close();
  });

  document.getElementById('auth-logout').addEventListener('click', function () {
    if (token) {
      fetch(APP_ORIGIN + '/api/logout', {
        method: 'POST',
        headers: { 'Authorization': 'Bearer ' + token },
      }).catch(function () {});
    }
    clearAuth();
    switchTo('login');
    usernameInput.value = '';
    passwordInput.value = '';
  });

  document.getElementById('auth-switch-register').addEventListener('click', function () {
    switchTo('register');
    regUsernameInput.value = usernameInput.value;
  });

  document.getElementById('auth-switch-login').addEventListener('click', function () {
    switchTo('login');
    usernameInput.value = regUsernameInput.value;
  });

  // Close on overlay click
  overlay.addEventListener('click', function (e) {
    if (e.target === overlay) close();
  });

  // Close on Escape
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && overlay.classList.contains('is-open')) close();
  });

  // ── Public API ──
  window.PaddockAuth = {
    isLoggedIn: function () { return !!token; },
    getToken: function () { return token; },
    getUser: function () { return currentUser; },

    // Require login — returns a Promise that resolves when user logs in (or null if cancelled)
    requireLogin: function () {
      return new Promise(function (resolve) {
        if (token && currentUser) {
          resolve(currentUser);
          return;
        }
        resolveAuth = resolve;
        switchTo('login');
        openOverlay();
        usernameInput.focus();
      });
    },

    openAuth: function () {
      if (token && currentUser) {
        switchTo('logged-in');
        usernameDisplay.textContent = currentUser.username;
      } else {
        switchTo('login');
      }
      openOverlay();
      usernameInput.focus();
    },

    logout: function () {
      clearAuth();
    },
  };

  // A locally stored token may have expired or been revoked.
  if (token && currentUser) {
    fetch(APP_ORIGIN + '/api/me', {
      headers: { 'Authorization': 'Bearer ' + token },
    }).then(function (response) {
      if (!response.ok) clearAuth();
    }).catch(function () {
      // Keep the session during a temporary network outage.
    });
  }
})();
