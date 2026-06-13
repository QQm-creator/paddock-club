/**
 * Driver / Team detail page — fetch from API, render rating & comments
 */

(function () {
  var APP_ORIGIN = window.location.origin;

  // ── Anonymous user identity (persisted in localStorage, never cleared) ──
  var ANON_KEY = 'paddock-anonymous-id';
  var anonymousId = null;
  try { anonymousId = localStorage.getItem(ANON_KEY); } catch (_) {}
  if (!anonymousId) {
    anonymousId = 'u-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
    try { localStorage.setItem(ANON_KEY, anonymousId); } catch (_) {}
  }

  var params = new URLSearchParams(window.location.search);
  var slug = params.get('id');
  if (!slug) {
    document.getElementById('driver-page').innerHTML =
      '<p style="text-align:center;padding:120px 20px;color:rgba(255,255,255,0.4);">未指定车手或车队。</p>';
    return;
  }

  var isTeam = slug === 'mercedes' || slug === 'ferrari' || slug === 'mclaren' ||
      slug === 'red-bull' || slug === 'alpine' || slug === 'racing-bulls' ||
      slug === 'haas' || slug === 'williams' || slug === 'audi' ||
      slug === 'aston-martin' || slug === 'cadillac';

  var apiUrl = APP_ORIGIN + (isTeam ? '/api/teams/' + slug : '/api/drivers/' + slug);

  // ── DOM refs ──
  var imageEl = document.getElementById('driver-image');
  var teamEl = document.getElementById('driver-team');
  var nameEl = document.getElementById('driver-name');
  var positionEl = document.getElementById('driver-position');
  var pointsEl = document.getElementById('driver-points');
  var starsDisplay = document.getElementById('driver-stars-display');
  var ratingText = document.getElementById('driver-rating-text');
  var interactiveStars = document.getElementById('driver-interactive-stars');
  var circuitSection = document.getElementById('circuit-ratings');
  var circuitGrid = document.getElementById('circuit-grid');
  var seasonScoreValue = document.getElementById('season-score-value');
  var seasonStarsDisplay = document.getElementById('season-stars-display');
  var seasonScoreMeta = document.getElementById('season-score-meta');

  // ── Render stars (read-only aggregate display) ──
  function renderAggregateStars(avg) {
    var html = '';
    for (var i = 1; i <= 5; i++) {
      html += i <= Math.round(avg) ? '★' : '☆';
    }
    starsDisplay.textContent = html;
  }

  // ── Render interactive stars (user can click) ──
  function renderInteractiveStars(currentAvg, driverId) {
    interactiveStars.innerHTML = '';
    var rounded = Math.round(currentAvg);
    for (var i = 1; i <= 5; i++) {
      var btn = document.createElement('button');
      btn.className = 'ranking-row__star' + (i <= rounded ? ' is-lit' : '');
      btn.textContent = i <= rounded ? '★' : '☆'; // ★ or ☆
      btn.type = 'button';
      btn.addEventListener('click', (function (stars) {
        return function () {
          function submitRating() {
            fetch(APP_ORIGIN + '/api/ratings', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + window.PaddockAuth.getToken(),
              },
              body: JSON.stringify({ anonymousId: anonymousId, driverId: driverId, stars: stars }),
            })
              .then(function (r) {
                return r.json().then(function (body) {
                  if (!r.ok) throw new Error(body.error || '评分提交失败');
                  return body;
                });
              })
              .then(function (resp) {
                renderAggregateStars(resp.avgRating);
                renderInteractiveStars(resp.avgRating, driverId);
                ratingText.textContent = resp.avgRating + ' 分 · ' + resp.ratingCount + ' 人评分';
              })
              .catch(function (err) { console.error(err); });
          }

          if (!window.PaddockAuth || !window.PaddockAuth.isLoggedIn()) {
            if (window.PaddockAuth) {
              window.PaddockAuth.requireLogin().then(function (user) {
                if (user) submitRating();
              });
            }
            return;
          }
          submitRating();
        };
      })(i));
      interactiveStars.appendChild(btn);
    }
  }

  function starText(value) {
    var rounded = Math.round(value || 0);
    var result = '';
    for (var i = 1; i <= 5; i++) result += i <= rounded ? '★' : '☆';
    return result;
  }

  function renderSeasonOverall(overall) {
    var score = Number(overall.avgScore || 0);
    var stars = Number(overall.avgStars || 0);
    seasonScoreValue.textContent = score.toFixed(1);
    seasonStarsDisplay.textContent = starText(stars) + (stars ? '  ' + stars.toFixed(1) : '');
    seasonStarsDisplay.setAttribute('aria-label', '综合星级 ' + stars.toFixed(1) + '，满分 5 星');
    seasonScoreMeta.textContent = overall.ratingCount
      ? overall.ratedCircuits + ' 条赛道 · ' + overall.ratingCount + ' 次社区评分'
      : '暂无逐站评分';

    renderAggregateStars(stars);
    ratingText.textContent = score.toFixed(1) + ' / 10 · ' + stars.toFixed(1) + ' 星 · ' + overall.ratingCount + ' 次逐站评分';
  }

  function createCircuitMap(circuit) {
    var wrapper = document.createElement('div');
    wrapper.className = 'circuit-card__map';
    wrapper.setAttribute('aria-label', circuit.city + ' 赛道简图');
    var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 160 100');
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-hidden', 'true');
    var path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', circuit.path);
    svg.appendChild(path);
    wrapper.appendChild(svg);
    return wrapper;
  }

  function createCircuitCard(circuit, driverId) {
    var raceFinished = new Date(circuit.date + 'T23:59:59') <= new Date();
    var storageKey = 'paddock-circuit-rating:' + driverId + ':' + circuit.id;
    var saved = null;
    try {
      saved = JSON.parse(localStorage.getItem(storageKey));
    } catch (_) {
      saved = null;
    }

    var selectedScore = saved && saved.score ? Number(saved.score) : 7.5;
    var selectedStars = saved && saved.stars ? Number(saved.stars) : 0;
    var card = document.createElement('article');
    card.className = 'circuit-card' + (raceFinished ? '' : ' is-locked');
    card.dataset.circuitId = circuit.id;

    var header = document.createElement('header');
    header.className = 'circuit-card__header';
    var round = document.createElement('span');
    round.className = 'circuit-card__round';
    round.textContent = String(circuit.round).padStart(2, '0');
    var name = document.createElement('div');
    name.className = 'circuit-card__name';
    var title = document.createElement('strong');
    title.textContent = (circuit.nameCN || circuit.name) + ' · ' + circuit.name;
    var city = document.createElement('span');
    city.textContent = circuit.city + ' · ' + circuit.date;
    name.appendChild(title);
    name.appendChild(city);
    var status = document.createElement('span');
    status.className = 'circuit-card__status';
    status.textContent = raceFinished ? '立即评分 · Rate now' : '待开赛 · Upcoming';
    header.appendChild(round);
    header.appendChild(name);
    header.appendChild(status);

    var controls = document.createElement('div');
    controls.className = 'circuit-card__controls';
    var aggregate = document.createElement('div');
    aggregate.className = 'circuit-card__aggregate';
    var aggregateScore = document.createElement('strong');
    aggregateScore.textContent = circuit.ratingCount ? circuit.avgScore.toFixed(1) : '–';
    var aggregateStars = document.createElement('span');
    aggregateStars.className = 'circuit-card__aggregate-stars';
    aggregateStars.textContent = circuit.ratingCount ? starText(circuit.avgStars) : '☆☆☆☆☆';
    var aggregateCount = document.createElement('span');
    aggregateCount.textContent = circuit.ratingCount ? circuit.ratingCount + ' 票 · votes' : '暂无评分 · No ratings yet';
    aggregate.appendChild(aggregateScore);
    aggregate.appendChild(aggregateStars);
    aggregate.appendChild(aggregateCount);

    var scoreRow = document.createElement('label');
    scoreRow.className = 'circuit-card__score';
    var scoreLabel = document.createElement('span');
    scoreLabel.className = 'circuit-card__label';
    scoreLabel.textContent = '评分 · Score';
    var slider = document.createElement('input');
    slider.className = 'circuit-card__slider';
    slider.type = 'range';
    slider.min = '1';
    slider.max = '10';
    slider.step = '0.5';
    slider.value = String(selectedScore);
    slider.disabled = !raceFinished;
    slider.setAttribute('aria-label', circuit.name + ' 10 分制评分');
    var output = document.createElement('output');
    output.className = 'circuit-card__score-output';
    output.textContent = selectedScore.toFixed(1);
    slider.addEventListener('input', function () {
      selectedScore = Number(slider.value);
      output.textContent = selectedScore.toFixed(1);
    });
    scoreRow.appendChild(scoreLabel);
    scoreRow.appendChild(slider);
    scoreRow.appendChild(output);

    var ratingRow = document.createElement('div');
    ratingRow.className = 'circuit-card__rating-row';
    var stars = document.createElement('span');
    stars.className = 'circuit-card__stars';
    stars.setAttribute('role', 'group');
    stars.setAttribute('aria-label', circuit.name + ' 星级评分');

    function paintSelectedStars() {
      Array.prototype.forEach.call(stars.children, function (button, index) {
        var lit = index < selectedStars;
        button.classList.toggle('is-lit', lit);
        button.textContent = lit ? '★' : '☆';
        button.setAttribute('aria-pressed', String(lit));
      });
    }

    for (var i = 1; i <= 5; i++) {
      var starButton = document.createElement('button');
      starButton.type = 'button';
      starButton.className = 'circuit-card__star';
      starButton.disabled = !raceFinished;
      starButton.setAttribute('aria-label', i + ' 星');
      starButton.addEventListener('click', (function (value) {
        return function () {
          selectedStars = value;
          paintSelectedStars();
          submit.disabled = false;
        };
      })(i));
      stars.appendChild(starButton);
    }

    var submit = document.createElement('button');
    submit.type = 'button';
    submit.className = 'circuit-card__submit';
    submit.textContent = raceFinished ? '提交评分 · Submit' : '尚未开放 · Locked';
    submit.disabled = !raceFinished || !selectedStars;

    var message = document.createElement('p');
    message.className = 'circuit-card__message';
    message.textContent = raceFinished ? (saved ? '已保存你的上次选择 · Saved' : '选择分数与星级后提交 · Choose score & stars') : '比赛结束后开放评分 · Opens after race';

    submit.addEventListener('click', function () {
      if (!window.PaddockAuth || !window.PaddockAuth.isLoggedIn()) {
        if (window.PaddockAuth) {
          window.PaddockAuth.requireLogin().then(function (user) {
            if (user) submit.click();
          });
        }
        return;
      }
      submit.disabled = true;
      submit.textContent = '提交中';
      message.className = 'circuit-card__message';
      message.textContent = '';
      fetch(APP_ORIGIN + '/api/circuit-ratings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + window.PaddockAuth.getToken(),
        },
        body: JSON.stringify({
          anonymousId: anonymousId,
          driverId: driverId,
          circuitId: circuit.id,
          score: selectedScore,
          stars: selectedStars,
        }),
      })
        .then(function (response) {
          return response.json().then(function (body) {
            if (!response.ok) throw new Error(body.error || '评分提交失败');
            return body;
          });
        })
        .then(function (response) {
          localStorage.setItem(storageKey, JSON.stringify({ score: selectedScore, stars: selectedStars }));
          aggregateScore.textContent = response.circuit.avgScore.toFixed(1);
          aggregateStars.textContent = starText(response.circuit.avgStars);
          aggregateCount.textContent = response.circuit.ratingCount + ' 票';
          renderSeasonOverall(response.overall);
          message.className = 'circuit-card__message is-success';
          message.textContent = '评分已计入车手总评';
          submit.textContent = '更新评分 · Update';
          submit.disabled = false;
        })
        .catch(function (error) {
          message.className = 'circuit-card__message is-error';
          message.textContent = error.message;
          submit.textContent = '重新提交 · Retry';
          submit.disabled = false;
        });
    });

    paintSelectedStars();
    ratingRow.appendChild(stars);
    ratingRow.appendChild(submit);
    controls.appendChild(aggregate);
    controls.appendChild(scoreRow);
    controls.appendChild(ratingRow);
    controls.appendChild(message);

    card.appendChild(header);
    card.appendChild(createCircuitMap(circuit));
    card.appendChild(controls);
    return card;
  }

  function loadCircuitRatings(driverId) {
    fetch(APP_ORIGIN + '/api/drivers/' + driverId + '/circuit-ratings')
      .then(function (response) {
        if (!response.ok) throw new Error('Unable to load circuit ratings');
        return response.json();
      })
      .then(function (data) {
        circuitGrid.innerHTML = '';
        data.circuits.forEach(function (circuit) {
          circuitGrid.appendChild(createCircuitCard(circuit, driverId));
        });
        renderSeasonOverall(data.overall);
        circuitSection.hidden = false;
      })
      .catch(function (error) {
        console.error(error);
      });
  }

  // ── Danmaku system ──
  var danmakuContainer = document.getElementById('driver-danmaku-container');
  var danmakuSender = document.getElementById('driver-danmaku-sender');
  var danmakuPool = [];
  var DANMAKU_MAX = 20;
  var DANMAKU_MIN_DURATION = 6;
  var DANMAKU_MAX_DURATION = 14;

  function danmakuRandomY() {
    var hero = document.getElementById('driver-hero-section');
    var h = hero ? hero.getBoundingClientRect().height : 300;
    var bands = 6;
    var bandH = h / bands;
    var band = Math.floor(Math.random() * bands);
    var jitter = (Math.random() - 0.5) * bandH * 0.5;
    return Math.max(10, Math.min(h - 40, band * bandH + bandH * 0.4 + jitter));
  }

  function createDanmakuItem(text, opts) {
    opts = opts || {};
    var el = document.createElement('span');
    el.className = 'detail__danmaku-item';
    if (opts.isUser) el.classList.add('detail__danmaku-item--user');
    el.textContent = text;

    var duration = opts.duration || (DANMAKU_MIN_DURATION + Math.random() * (DANMAKU_MAX_DURATION - DANMAKU_MIN_DURATION));
    var y = opts.y != null ? opts.y : danmakuRandomY();

    el.style.top = y + 'px';
    el.style.setProperty('--danmaku-duration', duration + 's');
    el.style.animationDuration = duration + 's';
    el.style.animationName = 'danmaku-scroll';

    el.addEventListener('animationend', function () {
      el.remove();
      var idx = danmakuPool.indexOf(el);
      if (idx !== -1) danmakuPool.splice(idx, 1);
    });

    danmakuContainer.appendChild(el);
    danmakuPool.push(el);

    while (danmakuPool.length > DANMAKU_MAX) {
      var oldest = danmakuPool.shift();
      if (oldest) oldest.remove();
    }

    return el;
  }

  function loadDanmakuFromComments(comments) {
    if (!comments || !comments.length) return;
    var texts = comments.map(function (c) { return c.text; });
    // Initial burst
    var burst = Math.min(8, texts.length);
    for (var i = 0; i < burst; i++) {
      setTimeout((function (t) { return function () { createDanmakuItem(t); }; })(texts[i]), i * 200);
    }
    // Continue cycling
    if (texts.length > 1) {
      var idx = burst;
      function scheduleNext() {
        var delay = 1200 + Math.random() * 2600;
        setTimeout(function () {
          if (!document.contains(danmakuContainer)) return;
          createDanmakuItem(texts[idx % texts.length]);
          idx++;
          scheduleNext();
        }, delay);
      }
      setTimeout(scheduleNext, burst * 200 + 800);
    }
  }

  // ── Fetch & render ──
  fetch(apiUrl)
    .then(function (r) {
      if (!r.ok) throw new Error('Not found');
      return r.json();
    })
    .then(function (data) {
      document.title = data.name + ' — Paddock Club';

      // Image
      var imgFolder = isTeam ? 'teams' : 'drivers';
      imageEl.src = './assets/standings/' + imgFolder + '/' + data.image;
      imageEl.alt = data.name;

      // Info
      teamEl.textContent = isTeam ? ('Drivers: ' + data.drivers) : data.team;
      nameEl.textContent = (data.nameCN || '') + ' · ' + data.name;
      positionEl.textContent = 'P' + data.position;
      pointsEl.textContent = data.points + ' pts (official)';

      // Rating
      if (isTeam) {
        renderAggregateStars(data.avgRating || 0);
        ratingText.textContent = (data.avgRating || 0) + ' 分 · ' + (data.ratingCount || 0) + ' 人评分';
        renderInteractiveStars(data.avgRating || 0, data.id);
      } else {
        document.getElementById('driver-user-stars').hidden = true;
        ratingText.textContent = '正在汇总逐站评分';
        loadCircuitRatings(data.id);
      }

      // Danmaku from comments
      loadDanmakuFromComments(data.comments || []);
    })
    .catch(function (err) {
      console.error(err);
      document.getElementById('driver-page').innerHTML =
        '<p style="text-align:center;padding:120px 20px;color:rgba(255,255,255,0.4);">未找到该车手或车队信息。请确认后端服务已启动。</p>';
    });

  // ── Danmaku sender ──
  var danmakuForm = danmakuSender ? danmakuSender.querySelector('.danmaku-sender__form') : null;
  var danmakuInput = danmakuSender ? danmakuSender.querySelector('.danmaku-sender__input') : null;

  if (danmakuForm && danmakuInput) {
    danmakuForm.addEventListener('submit', function (e) {
      e.preventDefault();
      var text = danmakuInput.value.trim();
      if (!text) return;

      // Save comment to server
      if (!window.PaddockAuth || !window.PaddockAuth.isLoggedIn()) {
        if (window.PaddockAuth) {
          window.PaddockAuth.requireLogin().then(function (user) {
            if (user) danmakuForm.dispatchEvent(new Event('submit'));
          });
        }
        return;
      }

      fetch(APP_ORIGIN + '/api/comments', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + window.PaddockAuth.getToken(),
        },
        body: JSON.stringify({ driverId: slug, text: text }),
      })
        .then(function (r) {
          return r.json().then(function (body) {
            if (!r.ok) throw new Error(body.error || '发送失败');
            return body;
          });
        })
        .then(function () {
          var heroH = document.getElementById('driver-hero-section');
          var h = heroH ? heroH.getBoundingClientRect().height : 300;
          createDanmakuItem(text, {
            isUser: true,
            duration: 5 + Math.random() * 4,
            y: h * 0.25 + Math.random() * h * 0.5,
          });
          danmakuInput.value = '';
          danmakuInput.blur();
        })
        .catch(function (error) {
          console.error('Comment failed:', error);
        });
    });
  }
})();
