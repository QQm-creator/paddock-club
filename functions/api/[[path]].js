import { CIRCUITS, DRIVERS, TEAMS, findEntity } from '../_shared/data.js';

const TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;
// Pages Functions free-tier CPU is intentionally tight. Web Crypto still provides
// a salted 256-bit password hash while keeping registration within that budget.
const PBKDF2_ITERATIONS = 10000;

function json(data, status = 200) {
  return Response.json(data, {
    status,
    headers: {
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

function hex(bytes) {
  return Array.from(bytes, value => value.toString(16).padStart(2, '0')).join('');
}

function bytesToBase64(bytes) {
  let binary = '';
  bytes.forEach(value => { binary += String.fromCharCode(value); });
  return btoa(binary);
}

function base64ToBytes(value) {
  const binary = atob(value);
  return Uint8Array.from(binary, character => character.charCodeAt(0));
}

function secureEqual(left, right) {
  if (left.length !== right.length) return false;
  let mismatch = 0;
  for (let index = 0; index < left.length; index += 1) {
    mismatch |= left[index] ^ right[index];
  }
  return mismatch === 0;
}

async function sha256(value) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return hex(new Uint8Array(digest));
}

async function hashPassword(password, salt = crypto.getRandomValues(new Uint8Array(16))) {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveBits'],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations: PBKDF2_ITERATIONS },
    key,
    256,
  );
  return {
    hash: bytesToBase64(new Uint8Array(bits)),
    salt: bytesToBase64(salt),
  };
}

async function readBody(request) {
  const contentLength = Number(request.headers.get('content-length') || 0);
  if (contentLength > 24576) throw new Error('BODY_TOO_LARGE');
  try {
    return await request.json();
  } catch {
    throw new Error('INVALID_JSON');
  }
}

async function currentUser(request, db) {
  const authorization = request.headers.get('authorization') || '';
  const token = authorization.replace(/^Bearer\s+/i, '');
  if (!token) return null;

  const tokenHash = await sha256(token);
  const now = new Date().toISOString();
  const user = await db.prepare(`
    SELECT users.id, users.username
    FROM sessions
    JOIN users ON users.id = sessions.user_id
    WHERE sessions.token_hash = ? AND sessions.expires_at > ?
  `).bind(tokenHash, now).first();
  if (user) {
    await db.prepare(`
      INSERT INTO user_activity (user_id, last_seen_at)
      VALUES (?, ?)
      ON CONFLICT(user_id) DO UPDATE SET last_seen_at = excluded.last_seen_at
    `).bind(user.id, now).run();
  }
  return user;
}

function isAdmin(user, env) {
  if (!user || !env.ADMIN_USERNAME) return false;
  const allowed = String(env.ADMIN_USERNAME)
    .split(',')
    .map(value => value.trim().toLocaleLowerCase())
    .filter(Boolean);
  return allowed.includes(user.username.toLocaleLowerCase());
}

async function createSession(db, userId) {
  const tokenBytes = crypto.getRandomValues(new Uint8Array(32));
  const token = hex(tokenBytes);
  const tokenHash = await sha256(token);
  const createdAt = new Date();
  const expiresAt = new Date(createdAt.getTime() + TOKEN_TTL_MS);

  await db.batch([
    db.prepare('DELETE FROM sessions WHERE expires_at <= ?').bind(createdAt.toISOString()),
    db.prepare(`
      INSERT INTO sessions (token_hash, user_id, created_at, expires_at)
      VALUES (?, ?, ?, ?)
    `).bind(tokenHash, userId, createdAt.toISOString(), expiresAt.toISOString()),
  ]);
  return token;
}

async function commentsFor(db, entityId) {
  const result = await db.prepare(`
    SELECT id, entity_id AS driverId, user_id AS userId, username, text, created_at AS timestamp
    FROM comments
    WHERE entity_id = ?
    ORDER BY created_at DESC
    LIMIT 200
  `).bind(entityId).all();
  return result.results || [];
}

async function ratingSummary(db, entityId) {
  const row = await db.prepare(`
    SELECT COUNT(*) AS ratingCount, ROUND(AVG(stars), 1) AS avgRating
    FROM ratings
    WHERE entity_id = ?
  `).bind(entityId).first();
  return {
    ratingCount: Number(row?.ratingCount || 0),
    avgRating: Number(row?.avgRating || 0),
  };
}

async function circuitSummary(db, driverId) {
  const rows = await db.prepare(`
    SELECT circuit_id AS circuitId, COUNT(*) AS ratingCount,
           ROUND(AVG(score), 1) AS avgScore,
           ROUND(AVG(stars), 1) AS avgStars
    FROM circuit_ratings
    WHERE driver_id = ?
    GROUP BY circuit_id
  `).bind(driverId).all();

  const byCircuit = new Map((rows.results || []).map(row => [row.circuitId, row]));
  const circuits = CIRCUITS.map(circuit => {
    const aggregate = byCircuit.get(circuit.id);
    return {
      ...circuit,
      ratingCount: Number(aggregate?.ratingCount || 0),
      avgScore: Number(aggregate?.avgScore || 0),
      avgStars: Number(aggregate?.avgStars || 0),
    };
  });

  const overall = await db.prepare(`
    SELECT COUNT(*) AS ratingCount,
           COUNT(DISTINCT circuit_id) AS ratedCircuits,
           ROUND(AVG(score), 1) AS avgScore,
           ROUND(AVG(stars), 1) AS avgStars
    FROM circuit_ratings
    WHERE driver_id = ?
  `).bind(driverId).first();

  return {
    circuits,
    overall: {
      ratingCount: Number(overall?.ratingCount || 0),
      ratedCircuits: Number(overall?.ratedCircuits || 0),
      avgScore: Number(overall?.avgScore || 0),
      avgStars: Number(overall?.avgStars || 0),
    },
  };
}

async function handleRegister(request, db) {
  const { username, password } = await readBody(request);
  if (typeof username !== 'string' || typeof password !== 'string') {
    return json({ error: '用户名和密码不能为空' }, 400);
  }

  const name = username.trim().slice(0, 20);
  if (name.length < 2) return json({ error: '用户名至少2个字符' }, 400);
  if (/[\u0000-\u001f\u007f]/.test(name)) return json({ error: '用户名包含无效字符' }, 400);
  if (password.length < 8 || password.length > 72) {
    return json({ error: '密码长度需为8到72个字符' }, 400);
  }

  const existing = await db.prepare('SELECT id FROM users WHERE username = ? COLLATE NOCASE')
    .bind(name).first();
  if (existing) return json({ error: '用户名已被注册' }, 409);

  const user = {
    id: `u-${crypto.randomUUID()}`,
    username: name,
    createdAt: new Date().toISOString(),
  };
  const passwordData = await hashPassword(password);

  try {
    await db.prepare(`
      INSERT INTO users (id, username, password_hash, password_salt, created_at)
      VALUES (?, ?, ?, ?, ?)
    `).bind(user.id, user.username, passwordData.hash, passwordData.salt, user.createdAt).run();
  } catch (error) {
    if (String(error).toLowerCase().includes('unique')) {
      return json({ error: '用户名已被注册' }, 409);
    }
    throw error;
  }

  const token = await createSession(db, user.id);
  return json({ token, user: { id: user.id, username: user.username } });
}

async function handleLogin(request, db) {
  const { username, password } = await readBody(request);
  if (typeof username !== 'string' || typeof password !== 'string') {
    return json({ error: '请输入用户名和密码' }, 400);
  }

  const user = await db.prepare(`
    SELECT id, username, password_hash AS passwordHash, password_salt AS passwordSalt
    FROM users WHERE username = ? COLLATE NOCASE
  `).bind(username.trim()).first();

  if (!user) return json({ error: '用户名或密码错误' }, 401);
  const candidate = await hashPassword(password, base64ToBytes(user.passwordSalt));
  if (!secureEqual(base64ToBytes(candidate.hash), base64ToBytes(user.passwordHash))) {
    return json({ error: '用户名或密码错误' }, 401);
  }

  const token = await createSession(db, user.id);
  return json({ token, user: { id: user.id, username: user.username } });
}

async function handleLogout(request, db) {
  const token = (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  if (token) {
    await db.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(await sha256(token)).run();
  }
  return new Response(null, { status: 204, headers: { 'Cache-Control': 'no-store' } });
}

async function handleEntity(db, type, id) {
  const source = type === 'drivers' ? DRIVERS : TEAMS;
  const entity = source.find(item => item.id === id);
  if (!entity) return json({ error: type === 'drivers' ? 'Driver not found' : 'Team not found' }, 404);
  const [rating, comments] = await Promise.all([
    ratingSummary(db, id),
    commentsFor(db, id),
  ]);
  return json({ ...entity, ...rating, comments });
}

async function handleRating(request, db) {
  const user = await currentUser(request, db);
  if (!user) return json({ error: '请先登录后再评分' }, 401);
  const { driverId, stars } = await readBody(request);
  if (!findEntity(driverId) || !Number.isInteger(stars) || stars < 1 || stars > 5) {
    return json({ error: 'driverId 和 1 到 5 星评分为必填项' }, 400);
  }

  await db.prepare(`
    INSERT INTO ratings (user_id, entity_id, stars, updated_at)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(user_id, entity_id)
    DO UPDATE SET stars = excluded.stars, updated_at = excluded.updated_at
  `).bind(user.id, driverId, stars, new Date().toISOString()).run();

  return json({ success: true, ...(await ratingSummary(db, driverId)) });
}

async function handleCircuitRating(request, db) {
  const user = await currentUser(request, db);
  if (!user) return json({ error: '请先登录后再评分' }, 401);
  const body = await readBody(request);
  const driver = DRIVERS.find(item => item.id === body.driverId);
  const circuit = CIRCUITS.find(item => item.id === body.circuitId);
  const score = Number(body.score);
  const stars = Number(body.stars);

  if (!driver || !circuit || !Number.isFinite(score) || score < 1 || score > 10 ||
      !Number.isInteger(stars) || stars < 1 || stars > 5) {
    return json({ error: 'driverId、circuitId、1到10分评分和1到5星评价为必填项' }, 400);
  }
  if (new Date(`${circuit.date}T23:59:59Z`) > new Date()) {
    return json({ error: 'This Grand Prix has not finished yet.' }, 400);
  }

  await db.prepare(`
    INSERT INTO circuit_ratings (user_id, driver_id, circuit_id, score, stars, updated_at)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(user_id, driver_id, circuit_id)
    DO UPDATE SET score = excluded.score, stars = excluded.stars, updated_at = excluded.updated_at
  `).bind(
    user.id,
    driver.id,
    circuit.id,
    Math.round(score * 2) / 2,
    stars,
    new Date().toISOString(),
  ).run();

  const aggregate = await circuitSummary(db, driver.id);
  return json({
    success: true,
    circuit: aggregate.circuits.find(item => item.id === circuit.id),
    overall: aggregate.overall,
  });
}

async function handleComment(request, db) {
  const user = await currentUser(request, db);
  if (!user) return json({ error: '请先登录后再发送评论' }, 401);
  const { driverId, text } = await readBody(request);
  if (!findEntity(driverId) || typeof text !== 'string' || !text.trim()) {
    return json({ error: '评论对象和评论内容不能为空' }, 400);
  }

  const entry = {
    id: `c-${crypto.randomUUID()}`,
    driverId,
    userId: user.id,
    username: user.username,
    text: text.trim().slice(0, 500),
    timestamp: new Date().toISOString(),
  };
  await db.prepare(`
    INSERT INTO comments (id, entity_id, user_id, username, text, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).bind(entry.id, entry.driverId, entry.userId, entry.username, entry.text, entry.timestamp).run();

  await db.prepare(`
    DELETE FROM comments
    WHERE entity_id = ? AND id NOT IN (
      SELECT id FROM comments WHERE entity_id = ? ORDER BY created_at DESC LIMIT 200
    )
  `).bind(driverId, driverId).run();

  return json({ success: true, comment: entry });
}

async function handleLeaderboard(db) {
  const finishedCircuitIds = CIRCUITS
    .filter(circuit => new Date(`${circuit.date}T23:59:59Z`) <= new Date())
    .map(circuit => circuit.id);
  if (!finishedCircuitIds.length) return json([]);

  const placeholders = finishedCircuitIds.map(() => '?').join(',');
  const rows = await db.prepare(`
    SELECT driver_id AS driverId, circuit_id AS circuitId, AVG(score) AS avgScore
    FROM circuit_ratings
    WHERE circuit_id IN (${placeholders})
    GROUP BY driver_id, circuit_id
  `).bind(...finishedCircuitIds).all();

  const grouped = new Map();
  for (const row of rows.results || []) {
    if (!grouped.has(row.circuitId)) grouped.set(row.circuitId, []);
    grouped.get(row.circuitId).push(row);
  }

  const fuel = new Map();
  const points = [100, 80, 40, 20];
  for (const entries of grouped.values()) {
    entries.sort((left, right) => Number(right.avgScore) - Number(left.avgScore));
    entries.slice(0, 4).forEach((entry, index) => {
      fuel.set(entry.driverId, (fuel.get(entry.driverId) || 0) + points[index]);
    });
  }

  const result = Array.from(fuel, ([driverId, total]) => {
    const driver = DRIVERS.find(item => item.id === driverId);
    return {
      id: driverId,
      name: driver?.name || driverId,
      nameCN: driver?.nameCN || '',
      team: driver?.team || '',
      image: driver?.image || '',
      fuel: total,
    };
  }).sort((left, right) => right.fuel - left.fuel).slice(0, 4);

  return json(result);
}

async function handleTrackVisit(request, db) {
  const body = await readBody(request);
  const visitorId = typeof body.visitorId === 'string' ? body.visitorId.trim() : '';
  const path = typeof body.path === 'string' ? body.path.trim() : '';
  if (!/^[a-zA-Z0-9-]{12,80}$/.test(visitorId) || !path.startsWith('/') || path.length > 180) {
    return json({ error: '访问数据格式无效' }, 400);
  }

  const now = new Date().toISOString();
  const viewDate = now.slice(0, 10);
  await db.prepare(`
    INSERT INTO daily_page_views (view_date, visitor_id, path, view_count, last_viewed_at)
    VALUES (?, ?, ?, 1, ?)
    ON CONFLICT(view_date, visitor_id, path)
    DO UPDATE SET
      view_count = daily_page_views.view_count + 1,
      last_viewed_at = excluded.last_viewed_at
  `).bind(viewDate, visitorId, path, now).run();

  return new Response(null, {
    status: 204,
    headers: { 'Cache-Control': 'no-store' },
  });
}

async function handleAdminOverview(request, env) {
  const user = await currentUser(request, env.DB);
  if (!user) return json({ error: '请先登录管理员账号' }, 401);
  if (!isAdmin(user, env)) return json({ error: '当前账号没有管理员权限' }, 403);

  const now = new Date();
  const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const trendStart = new Date(now.getTime() - 13 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  const [
    registered,
    activeDay,
    activeWeek,
    visitTotals,
    trendResult,
    commentsResult,
    usersResult,
  ] = await Promise.all([
    env.DB.prepare('SELECT COUNT(*) AS total FROM users').first(),
    env.DB.prepare('SELECT COUNT(*) AS total FROM user_activity WHERE last_seen_at >= ?')
      .bind(oneDayAgo).first(),
    env.DB.prepare('SELECT COUNT(*) AS total FROM user_activity WHERE last_seen_at >= ?')
      .bind(sevenDaysAgo).first(),
    env.DB.prepare(`
      SELECT COALESCE(SUM(view_count), 0) AS views,
             COUNT(DISTINCT visitor_id) AS visitors
      FROM daily_page_views
      WHERE view_date >= ?
    `).bind(thirtyDaysAgo).first(),
    env.DB.prepare(`
      SELECT view_date AS date,
             SUM(view_count) AS views,
             COUNT(DISTINCT visitor_id) AS visitors
      FROM daily_page_views
      WHERE view_date >= ?
      GROUP BY view_date
      ORDER BY view_date ASC
    `).bind(trendStart).all(),
    env.DB.prepare(`
      SELECT id, entity_id AS entityId, username, text, created_at AS createdAt
      FROM comments
      ORDER BY created_at DESC
      LIMIT 50
    `).all(),
    env.DB.prepare(`
      SELECT users.id, users.username, users.created_at AS createdAt,
             user_activity.last_seen_at AS lastSeenAt
      FROM users
      LEFT JOIN user_activity ON user_activity.user_id = users.id
      ORDER BY users.created_at DESC
      LIMIT 30
    `).all(),
  ]);

  const trendByDate = new Map((trendResult.results || []).map(row => [row.date, row]));
  const trend = Array.from({ length: 14 }, (_, index) => {
    const date = new Date(now.getTime() - (13 - index) * 24 * 60 * 60 * 1000)
      .toISOString().slice(0, 10);
    const row = trendByDate.get(date);
    return {
      date,
      views: Number(row?.views || 0),
      visitors: Number(row?.visitors || 0),
    };
  });

  const comments = (commentsResult.results || []).map(comment => {
    const entity = findEntity(comment.entityId);
    return {
      ...comment,
      entityName: entity?.nameCN || entity?.name || comment.entityId,
      entityType: DRIVERS.some(driver => driver.id === comment.entityId) ? '车手' : '车队',
    };
  });

  return json({
    admin: { id: user.id, username: user.username },
    generatedAt: now.toISOString(),
    metrics: {
      registeredUsers: Number(registered?.total || 0),
      active24h: Number(activeDay?.total || 0),
      active7d: Number(activeWeek?.total || 0),
      views30d: Number(visitTotals?.views || 0),
      visitors30d: Number(visitTotals?.visitors || 0),
      comments: comments.length,
    },
    trend,
    comments,
    users: usersResult.results || [],
  });
}

export async function onRequest(context) {
  const { request, env, params } = context;
  if (!env.DB) return json({ error: 'D1 database binding DB is missing' }, 503);

  const pathValue = Array.isArray(params.path) ? params.path.join('/') : (params.path || '');
  const segments = String(pathValue).split('/').filter(Boolean);
  const method = request.method.toUpperCase();

  try {
    if (method === 'GET' && segments[0] === 'health' && segments.length === 1) {
      return json({ status: 'ok', runtime: 'cloudflare-pages' });
    }
    if (method === 'POST' && segments[0] === 'register' && segments.length === 1) {
      return handleRegister(request, env.DB);
    }
    if (method === 'POST' && segments[0] === 'login' && segments.length === 1) {
      return handleLogin(request, env.DB);
    }
    if (method === 'POST' && segments[0] === 'logout' && segments.length === 1) {
      return handleLogout(request, env.DB);
    }
    if (method === 'GET' && segments[0] === 'me' && segments.length === 1) {
      const user = await currentUser(request, env.DB);
      return user ? json({ ...user, isAdmin: isAdmin(user, env) }) : json({ error: '未登录' }, 401);
    }
    if (method === 'POST' && segments[0] === 'analytics' && segments[1] === 'visit' && segments.length === 2) {
      return handleTrackVisit(request, env.DB);
    }
    if (method === 'GET' && segments[0] === 'admin' && segments[1] === 'overview' && segments.length === 2) {
      return handleAdminOverview(request, env);
    }
    if (method === 'GET' && ['drivers', 'teams'].includes(segments[0]) && segments.length === 2) {
      return handleEntity(env.DB, segments[0], segments[1]);
    }
    if (method === 'GET' && segments[0] === 'drivers' && segments[2] === 'circuit-ratings' && segments.length === 3) {
      const driver = DRIVERS.find(item => item.id === segments[1]);
      if (!driver) return json({ error: 'Driver not found' }, 404);
      return json({ driverId: driver.id, ...(await circuitSummary(env.DB, driver.id)) });
    }
    if (method === 'POST' && segments[0] === 'ratings' && segments.length === 1) {
      return handleRating(request, env.DB);
    }
    if (method === 'POST' && segments[0] === 'circuit-ratings' && segments.length === 1) {
      return handleCircuitRating(request, env.DB);
    }
    if (method === 'POST' && segments[0] === 'comments' && segments.length === 1) {
      return handleComment(request, env.DB);
    }
    if (method === 'GET' && segments[0] === 'leaderboard' && segments.length === 1) {
      return handleLeaderboard(env.DB);
    }
    return json({ error: 'API endpoint not found' }, 404);
  } catch (error) {
    if (error.message === 'BODY_TOO_LARGE') return json({ error: '请求内容过大' }, 413);
    if (error.message === 'INVALID_JSON') return json({ error: '请求格式无效' }, 400);
    console.error(error);
    return json({ error: '服务器暂时不可用' }, 500);
  }
}
