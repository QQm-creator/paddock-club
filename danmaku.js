/**
 * F1 车辆详情页 — 顶部图片飘过弹幕
 * 自动生成 + 用户手动发送
 */

function initDanmaku() {
  const visual = document.querySelector('.detail__visual');
  if (!visual) return;

  // ── 1. 读取词库 ──
  const raw = visual.dataset.danmaku || '';
  const lines = raw
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);

  // ── 2. 创建弹幕容器 ──
  const container = document.createElement('div');
  container.className = 'detail__danmaku';
  container.setAttribute('aria-hidden', 'true');
  visual.appendChild(container);

  const itemPool = [];
  const MAX_ITEMS = 18;
  const MIN_GAP_MS = 900;
  const MAX_GAP_MS = 2800;
  const MIN_DURATION = 6;
  const MAX_DURATION = 14;

  function visibleHeight() {
    const rect = visual.getBoundingClientRect();
    return rect.height > 0 ? rect.height : visual.clientHeight;
  }

  function randomY() {
    const h = visibleHeight();
    const bands = 8;
    const bandH = h / bands;
    const band = Math.floor(Math.random() * bands);
    const jitter = (Math.random() - 0.5) * bandH * 0.6;
    return Math.max(10, Math.min(h - 40, band * bandH + bandH * 0.5 + jitter));
  }

  // ── 3. 创建弹幕元素的通用方法 ──
  function createItem(text, opts = {}) {
    const el = document.createElement('span');
    el.className = 'detail__danmaku-item';
    if (opts.isUser) el.classList.add('detail__danmaku-item--user');
    el.textContent = text;

    const duration = opts.duration || (MIN_DURATION + Math.random() * (MAX_DURATION - MIN_DURATION));
    const y = opts.y != null ? opts.y : randomY();

    el.style.top = y + 'px';
    el.style.setProperty('--danmaku-duration', duration + 's');
    el.style.animationDuration = duration + 's';

    el.addEventListener('animationend', () => {
      el.remove();
      const idx = itemPool.indexOf(el);
      if (idx !== -1) itemPool.splice(idx, 1);
    });

    container.appendChild(el);
    itemPool.push(el);

    while (itemPool.length > MAX_ITEMS) {
      const oldest = itemPool.shift();
      if (oldest) oldest.remove();
    }

    return el;
  }

  // ── 4. 自动弹幕循环 ──
  let autoRunning = lines.length > 0;

  function scheduleNext() {
    if (!autoRunning) return;
    const delay = MIN_GAP_MS + Math.random() * (MAX_GAP_MS - MIN_GAP_MS);
    setTimeout(() => {
      if (!document.contains(container)) return;
      const text = lines[Math.floor(Math.random() * lines.length)];
      createItem(text);
      scheduleNext();
    }, delay);
  }

  if (lines.length) {
    const initialBurst = 6;
    for (let i = 0; i < initialBurst; i++) {
      setTimeout(() => {
        const text = lines[Math.floor(Math.random() * lines.length)];
        createItem(text);
      }, i * 180);
    }
    setTimeout(scheduleNext, initialBurst * 180 + 200);
  }

  // ── 5. 用户发送弹幕 ──
  const sender = visual.querySelector('.danmaku-sender');
  const form = visual.querySelector('.danmaku-sender__form');
  const input = visual.querySelector('.danmaku-sender__input');

  if (form && input) {
    form.addEventListener('submit', e => {
      e.preventDefault();
      const text = input.value.trim();
      if (!text) return;

      const h = visibleHeight();
      const midBand = h * 0.25 + Math.random() * h * 0.5;
      createItem(text, {
        isUser: true,
        duration: 5 + Math.random() * 4,
        y: midBand
      });

      input.value = '';
      input.blur();
    });
  }

  // ── 6. 拖拽移动弹幕发送器 ──
  if (sender) {
    const trigger = sender.querySelector('.danmaku-sender__trigger');
    let dragging = false;
    let startX = 0;
    let startY = 0;
    let startLeft = 0;
    let startBottom = 0;
    const DRAG_THRESHOLD = 4;

    function clamp(val, min, max) {
      return Math.max(min, Math.min(max, val));
    }

    function getVisualBounds() {
      const rect = visual.getBoundingClientRect();
      const senderRect = sender.getBoundingClientRect();
      return {
        maxLeft: rect.width - senderRect.width,
        maxBottom: rect.height - senderRect.height
      };
    }

    function onPointerDown(e) {
      // 只在点击 trigger（"弹"圈）时启用拖拽，点击输入框/按钮时不拦截
      if (!trigger || !trigger.contains(e.target)) return;
      // 如果表单已展开（输入框有焦点），不拖拽
      if (document.activeElement === input) return;

      dragging = false;
      startX = e.clientX;
      startY = e.clientY;

      const cs = getComputedStyle(sender);
      startLeft = parseFloat(cs.left) || 0;
      startBottom = parseFloat(cs.bottom) || 0;

      sender.setPointerCapture(e.pointerId);
    }

    function onPointerMove(e) {
      if (!sender.hasPointerCapture(e.pointerId)) return;

      const dx = e.clientX - startX;
      const dy = e.clientY - startY;

      if (!dragging && (Math.abs(dx) > DRAG_THRESHOLD || Math.abs(dy) > DRAG_THRESHOLD)) {
        dragging = true;
        sender.classList.add('danmaku-sender--dragging');
      }

      if (!dragging) return;

      e.preventDefault(); // 只在真正拖拽时才阻止默认行为

      const bounds = getVisualBounds();
      const newLeft = clamp(startLeft + dx, 0, bounds.maxLeft);
      const newBottom = clamp(startBottom - dy, 0, bounds.maxBottom);

      sender.style.left = newLeft + 'px';
      sender.style.bottom = newBottom + 'px';
      // 拖拽后改用 left 定位，清除 right
      sender.style.right = 'auto';
    }

    function onPointerUp(e) {
      if (!sender.hasPointerCapture(e.pointerId)) return;

      sender.releasePointerCapture(e.pointerId);
      sender.classList.remove('danmaku-sender--dragging');
      dragging = false;
    }

    sender.addEventListener('pointerdown', onPointerDown);
    sender.addEventListener('pointermove', onPointerMove);
    sender.addEventListener('pointerup', onPointerUp);
    sender.addEventListener('pointercancel', onPointerUp);
  }
}

// 页面加载后启动
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initDanmaku);
} else {
  initDanmaku();
}
