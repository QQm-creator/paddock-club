/**
 * 社区排行榜 — 从 API 获取汽油排名并更新颁奖台
 * 规则：每站评分第1-4名分别获得100/80/40/20汽油
 */
(function () {
  var APP_ORIGIN = window.location.origin;

  var spotEls = {
    1: document.querySelector('.podium__spot--1'),
    2: document.querySelector('.podium__spot--2'),
    3: document.querySelector('.podium__spot--3'),
    4: document.querySelector('.podium__spot--4'),
  };

  // Check if any podium spot exists on this page
  var hasPodium = spotEls[1] || spotEls[2] || spotEls[3] || spotEls[4];
  if (!hasPodium) return;

  // ── Scroll-triggered animation ──
  var podiumSection = document.querySelector('.podium');
  var triggered = false;

  function triggerPodium() {
    if (triggered || !podiumSection) return;
    triggered = true;
    podiumSection.classList.add('podium--visible');
  }

  // Check if podium is already in viewport
  function isInView(el) {
    var rect = el.getBoundingClientRect();
    return rect.top < window.innerHeight && rect.bottom > 0;
  }

  if (podiumSection) {
    if (isInView(podiumSection)) {
      // Already visible (e.g. rankings.html where podium is at top)
      triggerPodium();
    } else {
      // Listen for scroll — fire when podium comes into view
      function onScroll() {
        if (isInView(podiumSection)) {
          triggerPodium();
          window.removeEventListener('scroll', onScroll);
        }
      }
      window.addEventListener('scroll', onScroll, { passive: true });

      // Safety fallback: trigger after 8s no matter what
      setTimeout(function () {
        if (!triggered) triggerPodium();
      }, 8000);
    }
  }

  function updateSpot(spotEl, driver) {
    if (!spotEl || !driver) { return; }

    // Make spot clickable → navigate to driver detail page
    spotEl.style.cursor = 'pointer';
    spotEl.title = (driver.nameCN || driver.name) + ' · 查看详情';
    spotEl.tabIndex = 0;
    spotEl.setAttribute('role', 'link');
    spotEl.setAttribute('aria-label', (driver.nameCN || driver.name) + ' · 查看详情');
    function openDetails() {
      window.location = 'driver.html?id=' + encodeURIComponent(driver.id);
    }
    spotEl.onclick = openDetails;
    spotEl.onkeydown = function (event) {
      if (event.key === 'Enter') openDetails();
    };

    var avatar = spotEl.querySelector('.podium__avatar');
    var placeholder = avatar ? avatar.querySelector('.podium__placeholder') : null;
    var name = spotEl.querySelector('.podium__name');
    var fuel = spotEl.querySelector('.podium__fuel');

    // Update avatar — show driver image or keep placeholder
    if (avatar && driver.image) {
      // Remove placeholder, add image
      if (placeholder) {
        placeholder.style.display = 'none';
      }
      var existingImg = avatar.querySelector('img');
      if (!existingImg) {
        existingImg = document.createElement('img');
        existingImg.style.width = '100%';
        existingImg.style.height = '100%';
        existingImg.style.objectFit = 'cover';
        avatar.appendChild(existingImg);
      }
      existingImg.src = './assets/standings/drivers/' + driver.image;
      existingImg.alt = driver.name;
      avatar.style.border = 'none';
      avatar.style.background = 'none';
    }

    if (name) {
      name.textContent = (driver.nameCN || '') + ' · ' + driver.name;
    }

    if (fuel) {
      fuel.innerHTML = driver.fuel + '<span class="podium__fuel-unit"> 汽油</span>';
    }
  }

  function clearSpots() {
    [1, 2, 3, 4].forEach(function (rank) {
      var spot = spotEls[rank];
      if (!spot) return;
      var name = spot.querySelector('.podium__name');
      var fuel = spot.querySelector('.podium__fuel');
      if (name) name.textContent = '虚位以待';
      if (fuel) fuel.innerHTML = '0<span class="podium__fuel-unit"> 汽油</span>';

      var avatar = spot.querySelector('.podium__avatar');
      if (avatar) {
        var img = avatar.querySelector('img');
        if (img) img.remove();
        var placeholder = avatar.querySelector('.podium__placeholder');
        if (placeholder) placeholder.style.display = '';
      }
    });
  }

  function loadLeaderboard() {
    fetch(APP_ORIGIN + '/api/leaderboard')
      .then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      })
      .then(function (drivers) {
        if (!drivers || !drivers.length) {
          clearSpots();
          return;
        }

        // drivers are already sorted by fuel descending
        // Map to podium spots: index 0→P1, 1→P2, 2→P3, 3→P4
        [1, 2, 3, 4].forEach(function (rank) {
          var driver = drivers[rank - 1] || null;
          updateSpot(spotEls[rank], driver);
        });
      })
      .catch(function (err) {
        console.error('Leaderboard load failed:', err);
        clearSpots();
      });
  }

  // Load on page start
  loadLeaderboard();

  // Reload every 30 seconds
  setInterval(loadLeaderboard, 30000);
})();
