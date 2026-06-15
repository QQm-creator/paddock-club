(function () {
  var state = document.getElementById('admin-state');
  var dashboard = document.getElementById('admin-dashboard');
  var refreshButton = document.getElementById('admin-refresh');
  var syncStatus = document.getElementById('admin-sync-status');

  function escapeHtml(value) {
    return String(value || '').replace(/[&<>"']/g, function (character) {
      return {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;',
      }[character];
    });
  }

  function formatNumber(value) {
    return new Intl.NumberFormat('zh-CN').format(Number(value || 0));
  }

  function formatTime(value) {
    if (!value) return '尚未活跃';
    return new Intl.DateTimeFormat('zh-CN', {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(value));
  }

  function relativeActivity(value) {
    if (!value) return { text: '尚未活跃', active: false };
    var difference = Date.now() - new Date(value).getTime();
    if (difference < 10 * 60 * 1000) return { text: '刚刚在线', active: true };
    if (difference < 24 * 60 * 60 * 1000) {
      return { text: Math.max(1, Math.floor(difference / 3600000)) + ' 小时前', active: true };
    }
    return { text: Math.floor(difference / 86400000) + ' 天前', active: false };
  }

  function setState(title, detail, isError) {
    state.hidden = false;
    state.classList.toggle('is-error', Boolean(isError));
    state.querySelector('strong').textContent = title;
    state.querySelector('span').textContent = detail;
    dashboard.hidden = true;
  }

  function renderChart(points) {
    var container = document.getElementById('admin-chart');
    var width = 1120;
    var height = 280;
    var padding = { top: 18, right: 18, bottom: 38, left: 38 };
    var chartWidth = width - padding.left - padding.right;
    var chartHeight = height - padding.top - padding.bottom;
    var maximum = Math.max(1, points.reduce(function (max, point) {
      return Math.max(max, point.views, point.visitors);
    }, 0));
    var step = chartWidth / Math.max(1, points.length - 1);

    function x(index) { return padding.left + index * step; }
    function y(value) { return padding.top + chartHeight - (value / maximum) * chartHeight; }

    var grid = [0, 0.25, 0.5, 0.75, 1].map(function (ratio) {
      var gridY = padding.top + chartHeight * ratio;
      var label = Math.round(maximum * (1 - ratio));
      return '<line x1="' + padding.left + '" y1="' + gridY + '" x2="' + (width - padding.right) +
        '" y2="' + gridY + '" stroke="#242427" stroke-width="1"/>' +
        '<text x="4" y="' + (gridY + 4) + '">' + label + '</text>';
    }).join('');

    var bars = points.map(function (point, index) {
      var barWidth = Math.max(5, Math.min(18, step * 0.34));
      var barHeight = chartHeight - (y(point.visitors) - padding.top);
      return '<rect x="' + (x(index) - barWidth / 2) + '" y="' + y(point.visitors) +
        '" width="' + barWidth + '" height="' + barHeight +
        '" fill="#85858b" opacity="0.52"><title>' + point.date + ' 独立访客 ' +
        point.visitors + '</title></rect>';
    }).join('');

    var linePoints = points.map(function (point, index) {
      return x(index) + ',' + y(point.views);
    }).join(' ');

    var dots = points.map(function (point, index) {
      return '<circle cx="' + x(index) + '" cy="' + y(point.views) +
        '" r="3.5" fill="#e13a3f" stroke="#0e0e10" stroke-width="2"><title>' +
        point.date + ' 访问 ' + point.views + '</title></circle>';
    }).join('');

    var labels = points.map(function (point, index) {
      if (index % 2 !== 0 && points.length > 8) return '';
      return '<text x="' + x(index) + '" y="' + (height - 10) +
        '" text-anchor="middle">' + point.date.slice(5).replace('-', '/') + '</text>';
    }).join('');

    container.innerHTML = '<svg viewBox="0 0 ' + width + ' ' + height +
      '" preserveAspectRatio="none" aria-hidden="true">' + grid + bars +
      '<polyline points="' + linePoints +
      '" fill="none" stroke="#e13a3f" stroke-width="3" vector-effect="non-scaling-stroke"/>' +
      dots + labels + '</svg>';
  }

  function renderUsers(users) {
    var list = document.getElementById('admin-users');
    document.getElementById('users-count').textContent = users.length;
    if (!users.length) {
      list.innerHTML = '<div class="admin-list__empty">暂时没有注册用户</div>';
      return;
    }
    list.innerHTML = users.map(function (user) {
      var activity = relativeActivity(user.lastSeenAt);
      var initial = Array.from(user.username || '?')[0];
      return '<article class="admin-user">' +
        '<span class="admin-user__avatar">' + escapeHtml(initial) + '</span>' +
        '<div><strong>' + escapeHtml(user.username) + '</strong>' +
        '<small>注册于 ' + formatTime(user.createdAt) + '</small></div>' +
        '<span class="admin-user__activity' + (activity.active ? ' is-active' : '') + '">' +
        escapeHtml(activity.text) + '</span></article>';
    }).join('');
  }

  function renderComments(comments) {
    var list = document.getElementById('admin-comments');
    document.getElementById('comments-count').textContent = comments.length;
    if (!comments.length) {
      list.innerHTML = '<div class="admin-list__empty">还没有用户留言</div>';
      return;
    }
    list.innerHTML = comments.map(function (comment) {
      return '<article class="admin-comment"><div><strong>' +
        escapeHtml(comment.username) + '</strong><small>' +
        formatTime(comment.createdAt) + '</small><p>' +
        escapeHtml(comment.text) + '</p></div><span class="admin-comment__entity">' +
        escapeHtml(comment.entityType) + '<br>' + escapeHtml(comment.entityName) +
        '</span></article>';
    }).join('');
  }

  function render(data) {
    document.getElementById('metric-users').textContent = formatNumber(data.metrics.registeredUsers);
    document.getElementById('metric-active-day').textContent = formatNumber(data.metrics.active24h);
    document.getElementById('metric-active-week').textContent = formatNumber(data.metrics.active7d);
    document.getElementById('metric-views').textContent = formatNumber(data.metrics.views30d);
    document.getElementById('metric-visitors').textContent = formatNumber(data.metrics.visitors30d);
    renderChart(data.trend);
    renderUsers(data.users);
    renderComments(data.comments);
    state.hidden = true;
    dashboard.hidden = false;
    syncStatus.textContent = '更新于 ' + formatTime(data.generatedAt);
  }

  async function requestOverview() {
    syncStatus.textContent = '正在更新数据';
    refreshButton.disabled = true;
    try {
      var response = await fetch('/api/admin/overview');
      var body = await response.json();
      if (!response.ok) throw new Error(body.error || '后台数据加载失败');
      render(body);
    } catch (error) {
      setState('无法打开管理后台', error.message, true);
      syncStatus.textContent = '连接失败';
    } finally {
      refreshButton.disabled = false;
    }
  }

  refreshButton.addEventListener('click', requestOverview);
  requestOverview();
})();
