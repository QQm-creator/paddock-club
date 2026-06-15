(function () {
  if (location.hostname === 'localhost' || location.hostname === '127.0.0.1') return;

  var key = 'paddock-visitor-id';
  var visitorId = '';
  try {
    visitorId = localStorage.getItem(key) || '';
    if (!visitorId) {
      visitorId = typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : 'visitor-' + Date.now().toString(36) + Math.random().toString(36).slice(2);
      localStorage.setItem(key, visitorId);
    }
  } catch (_) {
    visitorId = 'visitor-' + Date.now().toString(36) + Math.random().toString(36).slice(2);
  }

  var path = location.pathname.replace(/\/+$/, '') || '/';
  fetch('/api/analytics/visit', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ visitorId: visitorId, path: path }),
    keepalive: true,
  }).catch(function () {});
})();
