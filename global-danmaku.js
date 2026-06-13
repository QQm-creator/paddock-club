/**
 * 全局浮动弹幕发送器
 * - 固定在屏幕右下角，不随滚动消失
 * - 可自由拖动，位置持久化
 * - 自动检测所在页面，将弹幕发送到对应弹幕群
 */
(function () {
  var APP_ORIGIN = window.location.origin;
  // ── 注入自包含样式 ──
  var style = document.createElement('style');
  style.textContent = [
    '.global-sender { position:fixed; z-index:99999; cursor:grab; user-select:none; -webkit-user-select:none; }',
    '.global-sender:active { cursor:grabbing; }',
    '.global-sender__form { display:flex; align-items:center; height:44px; width:44px; border-radius:999px;',
    '  background:rgba(0,0,0,0.55); backdrop-filter:blur(12px); -webkit-backdrop-filter:blur(12px);',
    '  border:1px solid rgba(255,255,255,0.22); overflow:hidden; transition:width 380ms cubic-bezier(0.25,0.46,0.45,0.94); }',
    '.global-sender__form:hover, .global-sender__form:focus-within { width:272px; border-color:#e13a3f; }',
    '.global-sender__trigger { order:-1; flex-shrink:0; width:44px; height:44px; display:flex; align-items:center;',
    '  justify-content:center; font-size:0.82rem; font-weight:900; color:#fff; cursor:pointer; }',
    '.global-sender__input { flex:1; min-width:0; height:100%; border:none; background:transparent; color:#fff;',
    '  font-size:0.78rem; padding:0 4px; outline:none; font-family:Arial,Helvetica,sans-serif; caret-color:#e13a3f; }',
    '.global-sender__input::placeholder { color:rgba(255,255,255,0.4); font-size:0.74rem; }',
    '.global-sender__input:disabled { opacity:0.3; }',
    '.global-sender__submit { flex-shrink:0; height:30px; padding:0 14px; margin-right:7px; border:none; border-radius:999px;',
    '  background:#e13a3f; color:#fff; font-size:0.68rem; font-weight:800; cursor:pointer; white-space:nowrap;',
    '  font-family:inherit; letter-spacing:0.04em; opacity:0; transform:translateX(8px);',
    '  transition:opacity 220ms ease,transform 220ms ease; pointer-events:none; }',
    '.global-sender__form:hover .global-sender__submit, .global-sender__form:focus-within .global-sender__submit {',
    '  opacity:1; transform:translateX(0); pointer-events:auto; }',
    '.global-sender__submit:disabled { background:#555; }',
    '@keyframes danmaku-scroll { from { transform:translateX(100vw); } to { transform:translateX(-100%); } }',
    '.detail__danmaku-item { position:absolute; white-space:nowrap; font-size:0.72rem; font-weight:700;',
    '  letter-spacing:0.04em; color:#fff; background:rgba(0,0,0,0.5); backdrop-filter:blur(8px);',
    '  padding:5px 14px; border-radius:999px; border:1px solid rgba(255,255,255,0.15);',
    '  text-shadow:0 1px 3px rgba(0,0,0,0.6); pointer-events:auto; }',
    '.detail__danmaku-item:hover { animation-play-state:paused; }',
    '.detail__danmaku-item--user { color:#fff !important; background:rgba(0,0,0,0.68) !important;',
    '  border-color:#e13a3f !important; font-weight:800 !important; }',
    '.detail__danmaku-item--own { border-style:dashed !important; border-color:#f0a028 !important;',
    '  background:rgba(30,20,5,0.72) !important; }',
    '.detail__danmaku-item--own::after { content:"· 我"; margin-left:6px; font-size:0.58rem;',
    '  color:#f0a028; opacity:0.8; }',
    '.danmaku-delete-hint { display:none; margin-right:4px; background:#e13a3f; color:#fff; border:none;',
    '  border-radius:999px; padding:1px 7px; font-size:0.55rem; font-weight:800; cursor:pointer;',
    '  white-space:nowrap; font-family:inherit; vertical-align:middle; line-height:1.5; }',
    '.detail__danmaku-item--own:hover .danmaku-delete-hint { display:inline; }',
  ].join('\n');
  document.head.appendChild(style);

  // ── Anonymous ID for ownership ──
  var ANON_KEY = 'paddock-anonymous-id';
  var anonymousId = null;
  try { anonymousId = localStorage.getItem(ANON_KEY); } catch (_) {}
  if (!anonymousId) {
    anonymousId = 'u-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
    try { localStorage.setItem(ANON_KEY, anonymousId); } catch (_) {}
  }

  // ── 检测页面类型 ──
  var pageType = null;

  // 车辆详情页：有 .detail__visual 且带 data-danmaku
  if (document.querySelector('.detail__visual[data-danmaku]')) {
    pageType = 'vehicle';
  }

  // 社区排行榜：有 #podium-danmaku
  if (document.getElementById('podium-danmaku')) {
    pageType = 'podium';
  }

  // 车手详情页：有 #driver-danmaku-container（优先级高于 podium，因为 driver.html 也有 podium）
  if (document.getElementById('driver-danmaku-container')) {
    pageType = 'driver';
  }

  // ── 始终创建浮动发送器（不管什么页面）──
  var POS_KEY = 'paddock-sender-pos';
  var savedPos = null;
  try { savedPos = JSON.parse(localStorage.getItem(POS_KEY)); } catch (_) {}

  var sender = document.createElement('div');
  sender.className = 'global-sender';
  sender.setAttribute('aria-label', '发送弹幕');

  var form = document.createElement('form');
  form.className = 'global-sender__form';
  form.action = '#';

  var input = document.createElement('input');
  input.className = 'global-sender__input';
  input.type = 'text';
  input.placeholder = pageType ? '输入弹幕…' : '暂无弹幕群';
  input.maxLength = 30;
  input.autocomplete = 'off';
  if (!pageType) input.disabled = true;

  var submit = document.createElement('button');
  submit.className = 'global-sender__submit';
  submit.type = 'submit';
  submit.textContent = '发送 · Send';
  if (!pageType) submit.disabled = true;

  var trigger = document.createElement('span');
  trigger.className = 'global-sender__trigger';
  trigger.setAttribute('aria-hidden', 'true');
  trigger.textContent = '弹';

  form.appendChild(input);
  form.appendChild(submit);
  form.appendChild(trigger);
  sender.appendChild(form);
  document.body.appendChild(sender);

  // ── 初始位置 ──
  sender.style.right = (savedPos && savedPos.right != null ? savedPos.right : 48) + 'px';
  sender.style.bottom = (savedPos && savedPos.bottom != null ? savedPos.bottom : 120) + 'px';

  // ── 拖拽 ──
  var dragging = false;
  var startX = 0, startY = 0;
  var startRight = 0, startBottom = 0;
  var DRAG_THRESHOLD = 4;

  function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }

  sender.addEventListener('pointerdown', function (e) {
    if (!trigger.contains(e.target)) return;
    if (document.activeElement === input) return;
    dragging = false;
    startX = e.clientX;
    startY = e.clientY;
    var cs = getComputedStyle(sender);
    startRight = parseFloat(cs.right) || 0;
    startBottom = parseFloat(cs.bottom) || 0;
    sender.setPointerCapture(e.pointerId);
  });

  sender.addEventListener('pointermove', function (e) {
    if (!sender.hasPointerCapture(e.pointerId)) return;
    var dx = e.clientX - startX;
    var dy = e.clientY - startY;
    if (!dragging && (Math.abs(dx) > DRAG_THRESHOLD || Math.abs(dy) > DRAG_THRESHOLD)) {
      dragging = true;
    }
    if (!dragging) return;
    e.preventDefault();
    var vw = window.innerWidth;
    var vh = window.innerHeight;
    var senderW = sender.offsetWidth || 44;
    var senderH = sender.offsetHeight || 44;
    sender.style.right = clamp(startRight - dx, 0, vw - senderW) + 'px';
    sender.style.bottom = clamp(startBottom - dy, 0, vh - senderH) + 'px';
  });

  sender.addEventListener('pointerup', function (e) {
    if (!sender.hasPointerCapture(e.pointerId)) return;
    sender.releasePointerCapture(e.pointerId);
    var cs = getComputedStyle(sender);
    try { localStorage.setItem(POS_KEY, JSON.stringify({ right: parseFloat(cs.right) || 0, bottom: parseFloat(cs.bottom) || 0 })); } catch (_) {}
    dragging = false;
  });

  sender.addEventListener('pointercancel', function (e) {
    if (sender.hasPointerCapture(e.pointerId)) sender.releasePointerCapture(e.pointerId);
    dragging = false;
  });

  // ── 如果不在弹幕支持的页面，只显示不发 ──
  if (!pageType) return;

  // ── 发送弹幕（需登录）──
  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var text = input.value.trim();
    if (!text) return;

    // Require login
    if (!window.PaddockAuth || !window.PaddockAuth.isLoggedIn()) {
      if (window.PaddockAuth) {
        window.PaddockAuth.requireLogin().then(function (user) {
          if (user) {
            // Retry after login
            input.value = text;
            form.dispatchEvent(new Event('submit'));
          }
        });
      }
      return;
    }

    if (pageType === 'vehicle') {
      fireDanmaku('.detail__danmaku', text);
    } else if (pageType === 'podium') {
      fireDanmaku('#podium-danmaku', text);
    } else if (pageType === 'driver') {
      fireDanmaku('#driver-danmaku-container', text);
      var params = new URLSearchParams(window.location.search);
      var driverId = params.get('id');
      if (driverId) {
        fetch(APP_ORIGIN + '/api/comments', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + (window.PaddockAuth ? window.PaddockAuth.getToken() : ''),
          },
          body: JSON.stringify({ driverId: driverId, text: text }),
        }).catch(function () {});
      }
    }

    input.value = '';
    input.blur();
  });

  function fireDanmaku(selector, text) {
    var container = document.querySelector(selector);
    if (!container) return;

    var el = document.createElement('span');
    el.className = 'detail__danmaku-item detail__danmaku-item--user detail__danmaku-item--own';
    el.textContent = text;
    el.style.top = (10 + Math.random() * 65) + '%';
    var duration = 5 + Math.random() * 4;
    el.style.setProperty('--danmaku-duration', duration + 's');
    el.style.animationDuration = duration + 's';
    el.style.animationName = 'danmaku-scroll';
    el.dataset.owner = anonymousId;

    // Delete button — inside the danmaku, left of text
    var delBtn = document.createElement('button');
    delBtn.className = 'danmaku-delete-hint';
    delBtn.textContent = '✕';
    delBtn.type = 'button';
    delBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      el.style.animationPlayState = 'paused';
      el.remove();
    });
    el.insertBefore(delBtn, el.firstChild);

    el.addEventListener('animationend', function () { el.remove(); });
    container.appendChild(el);

    var all = container.querySelectorAll('.detail__danmaku-item');
    while (all.length > 22) { all[0].remove(); all = container.querySelectorAll('.detail__danmaku-item'); }
  }
})();
