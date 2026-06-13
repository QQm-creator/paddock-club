/**
 * 官方排行榜 — 打星 + 点击跳转车手详情页
 * 数据通过 REST API 持久化
 */

(function () {
  var APP_ORIGIN = window.location.origin;
  var API_BASE = APP_ORIGIN;

  // ── Anonymous user identity (persisted in localStorage) ──
  var ANON_KEY = 'paddock-anonymous-id';
  var anonymousId = null;
  try { anonymousId = localStorage.getItem(ANON_KEY); } catch (_) {}
  if (!anonymousId) {
    anonymousId = 'u-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
    try { localStorage.setItem(ANON_KEY, anonymousId); } catch (_) {}
  }

  // ── API helpers ──
  function getJSON(url) {
    return fetch(API_BASE + url).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    });
  }

  function postJSON(url, data) {
    var token = window.PaddockAuth ? window.PaddockAuth.getToken() : '';
    return fetch(API_BASE + url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + token,
      },
      body: JSON.stringify(data),
    }).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    });
  }

  // ── Build star rating UI ──
  function buildStars(container, currentAvg, driverId) {
    container.innerHTML = '';
    var rounded = Math.round(currentAvg); // 0–5
    for (var i = 1; i <= 5; i++) {
      var btn = document.createElement('button');
      btn.className = 'ranking-row__star' + (i <= rounded ? ' is-lit' : '');
      btn.textContent = i <= rounded ? '★' : '☆'; // ★ or ☆
      btn.setAttribute('aria-label', i + ' star');
      btn.type = 'button';
      btn.addEventListener('click', (function (stars) {
        return function (e) {
          e.stopPropagation(); // don't navigate when clicking stars
          var clickedButton = e.currentTarget;
          if (!window.PaddockAuth || !window.PaddockAuth.isLoggedIn()) {
            if (window.PaddockAuth) {
              window.PaddockAuth.requireLogin().then(function (user) {
                if (user) clickedButton.click();
              });
            }
            return;
          }
          postJSON('/api/ratings', { anonymousId: anonymousId, driverId: driverId, stars: stars })
            .then(function (resp) {
              buildStars(container, resp.avgRating, driverId);
            })
            .catch(function (err) {
              console.error('Rating failed:', err);
            });
        };
      })(i));
      container.appendChild(btn);
    }
  }

  // ── Enhance a single row ──
  function enhanceRow(row) {
    var slug = row.getAttribute('data-driver-slug') || row.getAttribute('data-team-slug');
    if (!slug) return;

    var isTeam = row.hasAttribute('data-team-slug');
    var apiUrl = isTeam ? '/api/teams/' + slug : '/api/drivers/' + slug;

    // Create actions container
    var actions = document.createElement('div');
    actions.className = 'ranking-row__actions';

    // Stars container
    var starsContainer = document.createElement('span');
    starsContainer.className = 'ranking-row__stars';
    actions.appendChild(starsContainer);

    row.appendChild(actions);

    // Fetch current rating from API
    getJSON(apiUrl)
      .then(function (data) {
        buildStars(starsContainer, data.avgRating || 0, slug);
      })
      .catch(function () {
        // API not available — show empty stars
        buildStars(starsContainer, 0, slug);
      });

    // Click row → navigate to driver/team detail page
    row.style.cursor = 'pointer';
    row.tabIndex = 0;
    row.setAttribute('role', 'link');
    row.setAttribute('aria-label', '查看 ' + slug + ' 详情');
    function openDetails() {
      window.location.href = APP_ORIGIN + '/driver.html?id=' + encodeURIComponent(slug);
    }
    row.addEventListener('click', function (e) {
      // Don't navigate if user clicked a star
      if (e.target.closest('.ranking-row__star') || e.target.closest('.ranking-row__actions')) {
        return;
      }
      openDetails();
    });
    row.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') openDetails();
    });
  }

  // Enhance all rows
  document.querySelectorAll('.ranking-row').forEach(enhanceRow);
})();
