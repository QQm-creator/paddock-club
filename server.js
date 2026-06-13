/**
 * Paddock Club — Express backend
 * Serves static files + REST API for ratings & comments
 */

const express = require('express');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const helmet = require('helmet');
const { rateLimit } = require('express-rate-limit');

const app = express();
const PORT = process.env.PORT || 3000;
const TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;

// ── Middleware ──
app.disable('x-powered-by');
app.set('trust proxy', 1);
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      baseUri: ["'self'"],
      connectSrc: ["'self'"],
      fontSrc: ["'self'", 'data:'],
      formAction: ["'self'"],
      frameAncestors: ["'none'"],
      imgSrc: ["'self'", 'data:'],
      objectSrc: ["'none'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
    },
  },
  crossOriginEmbedderPolicy: false,
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
}));
app.use(express.json({ limit: '24kb' }));

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 300,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { error: '请求过于频繁，请稍后再试' },
});
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { error: '登录或注册尝试过多，请稍后再试' },
});
app.use('/api', apiLimiter);
app.use('/api', (_req, res, next) => {
  res.setHeader('Cache-Control', 'no-store');
  next();
});
app.use(['/api/login', '/api/register'], authLimiter);

// Never expose server code, dependencies, or persisted user data as static files.
app.use((req, res, next) => {
  const requestPath = req.path.toLowerCase();
  const privatePrefixes = ['/data', '/node_modules', '/.git', '/.claude'];
  const privateFiles = ['/server.js', '/package.json', '/package-lock.json', '/.ds_store'];
  if (privatePrefixes.some(prefix => requestPath === prefix || requestPath.startsWith(prefix + '/')) ||
      privateFiles.includes(requestPath)) {
    return res.status(404).type('text/plain').send('Not found');
  }
  next();
});
app.use(express.static(__dirname, {
  dotfiles: 'deny',
  setHeaders(res, filePath) {
    if (filePath.includes(`${path.sep}assets${path.sep}`)) {
      res.setHeader('Cache-Control', 'public, max-age=604800');
    } else if (filePath.endsWith('.html')) {
      res.setHeader('Cache-Control', 'no-cache');
    }
  },
}));

// ── Data paths ──
const DATA_DIR = path.join(__dirname, 'data');
const RATINGS_FILE = path.join(DATA_DIR, 'ratings.json');
const COMMENTS_FILE = path.join(DATA_DIR, 'comments.json');
const CIRCUIT_RATINGS_FILE = path.join(DATA_DIR, 'circuit-ratings.json');
const USERS_FILE = path.join(DATA_DIR, 'users.json');
const TOKENS_FILE = path.join(DATA_DIR, 'tokens.json');

// Ensure data directory and files exist
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
for (const filePath of [RATINGS_FILE, COMMENTS_FILE, CIRCUIT_RATINGS_FILE, USERS_FILE, TOKENS_FILE]) {
  if (!fs.existsSync(filePath)) fs.writeFileSync(filePath, '[]', { encoding: 'utf-8', mode: 0o600 });
}

// ── Helpers ──
function readJSON(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  } catch (_) {
    return [];
  }
}

function writeJSON(filePath, data) {
  const tempPath = `${filePath}.${process.pid}.${crypto.randomBytes(4).toString('hex')}.tmp`;
  fs.writeFileSync(tempPath, JSON.stringify(data, null, 2), { encoding: 'utf-8', mode: 0o600 });
  fs.renameSync(tempPath, filePath);
}

// Older local sessions stored raw tokens. Hash them without invalidating users' current sessions.
const storedTokens = readJSON(TOKENS_FILE);
if (storedTokens.some(entry => entry.token && !entry.tokenHash)) {
  const migratedTokens = storedTokens.map(entry => {
    if (!entry.token || entry.tokenHash) return entry;
    return {
      tokenHash: crypto.createHash('sha256').update(entry.token).digest('hex'),
      userId: entry.userId,
      createdAt: entry.createdAt,
    };
  });
  writeJSON(TOKENS_FILE, migratedTokens);
}

// ── Driver registry (seeded from the known 2026 grid) ──
const DRIVERS = [
  { id: 'kimi-antonelli',    name: 'Kimi Antonelli', nameCN: '基米·安东内利',    team: 'Mercedes',        points: 156, position: 1,  image: 'antonelli.webp' },
  { id: 'lewis-hamilton',    name: 'Lewis Hamilton', nameCN: '刘易斯·汉密尔顿',    team: 'Ferrari',          points: 90,  position: 2,  image: 'hamilton.webp' },
  { id: 'george-russell',    name: 'George Russell', nameCN: '乔治·拉塞尔',    team: 'Mercedes',        points: 88,  position: 3,  image: 'russell.webp' },
  { id: 'charles-leclerc',   name: 'Charles Leclerc', nameCN: '夏尔·勒克莱尔',   team: 'Ferrari',          points: 75,  position: 4,  image: 'leclerc.webp' },
  { id: 'oscar-piastri',     name: 'Oscar Piastri', nameCN: '奥斯卡·皮亚斯特里',     team: 'McLaren',          points: 60,  position: 5,  image: 'piastri.webp' },
  { id: 'lando-norris',      name: 'Lando Norris', nameCN: '兰多·诺里斯',      team: 'McLaren',          points: 58,  position: 6,  image: 'norris.webp' },
  { id: 'max-verstappen',    name: 'Max Verstappen', nameCN: '马克斯·维斯塔潘',    team: 'Red Bull Racing',  points: 43,  position: 7,  image: 'verstappen.webp' },
  { id: 'isack-hadjar',      name: 'Isack Hadjar', nameCN: '伊萨克·哈贾尔',      team: 'Red Bull Racing',  points: 29,  position: 8,  image: 'hadjar.webp' },
  { id: 'liam-lawson',       name: 'Liam Lawson', nameCN: '利亚姆·劳森',       team: 'Racing Bulls',     points: 26,  position: 9,  image: 'lawson.webp' },
  { id: 'pierre-gasly',      name: 'Pierre Gasly', nameCN: '皮埃尔·加斯利',      team: 'Alpine',           points: 26,  position: 10, image: 'gasly.webp' },
  { id: 'oliver-bearman',    name: 'Oliver Bearman', nameCN: '奥利弗·贝尔曼',    team: 'Haas F1 Team',     points: 18,  position: 11, image: 'bearman.webp' },
  { id: 'franco-colapinto',  name: 'Franco Colapinto', nameCN: '弗朗哥·科拉平托',  team: 'Alpine',           points: 15,  position: 12, image: 'colapinto.webp' },
  { id: 'arvid-lindblad',    name: 'Arvid Lindblad', nameCN: '阿维德·林德布拉德',    team: 'Racing Bulls',     points: 13,  position: 13, image: 'lindblad.webp' },
  { id: 'carlos-sainz',      name: 'Carlos Sainz', nameCN: '卡洛斯·赛恩斯',      team: 'Williams',         points: 6,   position: 14, image: 'sainz.webp' },
  { id: 'alexander-albon',   name: 'Alexander Albon', nameCN: '亚历山大·阿尔本',   team: 'Williams',         points: 5,   position: 15, image: 'albon.webp' },
  { id: 'esteban-ocon',      name: 'Esteban Ocon', nameCN: '埃斯特班·奥康',      team: 'Haas F1 Team',     points: 3,   position: 16, image: 'ocon.webp' },
  { id: 'gabriel-bortoleto', name: 'Gabriel Bortoleto', nameCN: '加布里埃尔·博尔托莱托', team: 'Audi',             points: 2,   position: 17, image: 'bortoleto.webp' },
  { id: 'fernando-alonso',   name: 'Fernando Alonso', nameCN: '费尔南多·阿隆索',   team: 'Aston Martin',     points: 1,   position: 18, image: 'alonso.webp' },
  { id: 'nico-hulkenberg',   name: 'Nico Hulkenberg', nameCN: '尼科·霍肯伯格',   team: 'Audi',             points: 0,   position: 19, image: 'hulkenberg.webp' },
  { id: 'valtteri-bottas',   name: 'Valtteri Bottas', nameCN: '瓦尔特利·博塔斯',   team: 'Cadillac',         points: 0,   position: 20, image: 'bottas.webp' },
  { id: 'sergio-perez',      name: 'Sergio Perez', nameCN: '塞尔吉奥·佩雷兹',      team: 'Cadillac',         points: 0,   position: 21, image: 'perez.webp' },
  { id: 'lance-stroll',      name: 'Lance Stroll', nameCN: '兰斯·斯特罗尔',      team: 'Aston Martin',     points: 0,   position: 22, image: 'stroll.webp' },
];

const TEAMS = [
  { id: 'mercedes',       name: 'Mercedes',        points: 244, position: 1,  drivers: 'Antonelli / Russell',    image: 'mercedes.webp' },
  { id: 'ferrari',         name: 'Ferrari',          points: 165, position: 2,  drivers: 'Hamilton / Leclerc',      image: 'ferrari.webp' },
  { id: 'mclaren',         name: 'McLaren',          points: 118, position: 3,  drivers: 'Piastri / Norris',        image: 'mclaren.webp' },
  { id: 'red-bull',        name: 'Red Bull Racing',  points: 72,  position: 4,  drivers: 'Verstappen / Hadjar',     image: 'red-bull.webp' },
  { id: 'alpine',          name: 'Alpine',           points: 41,  position: 5,  drivers: 'Gasly / Colapinto',       image: 'alpine.webp' },
  { id: 'racing-bulls',    name: 'Racing Bulls',     points: 39,  position: 6,  drivers: 'Lawson / Lindblad',       image: 'racing-bulls.webp' },
  { id: 'haas',            name: 'Haas F1 Team',     points: 21,  position: 7,  drivers: 'Bearman / Ocon',          image: 'haas.webp' },
  { id: 'williams',        name: 'Williams',         points: 11,  position: 8,  drivers: 'Sainz / Albon',           image: 'williams.webp' },
  { id: 'audi',            name: 'Audi',             points: 2,   position: 9,  drivers: 'Bortoleto / Hulkenberg',  image: 'audi.webp' },
  { id: 'aston-martin',    name: 'Aston Martin',     points: 1,   position: 10, drivers: 'Alonso / Stroll',          image: 'aston-martin.webp' },
  { id: 'cadillac',        name: 'Cadillac',         points: 0,   position: 11, drivers: 'Bottas / Perez',           image: 'cadillac.webp' },
];

// 2026 calendar after the official cancellation of Bahrain and Saudi Arabia.
// Paths are compact, stylised circuit outlines for the rating interface.
const CIRCUITS = [
  { id: 'australia', round: 1, name: 'Australian Grand Prix', nameCN: '澳大利亚大奖赛', city: 'Melbourne', date: '2026-03-08', path: 'M18 72 C28 68 26 48 42 43 L64 39 C78 36 88 23 105 25 C125 28 142 42 139 58 C136 72 119 82 103 78 L82 69 L62 75 L42 69 Z' },
  { id: 'china', round: 2, name: 'Chinese Grand Prix', nameCN: '中国大奖赛', city: 'Shanghai', date: '2026-03-15', path: 'M29 67 C17 54 20 30 39 22 C55 15 74 21 75 35 C76 48 60 53 52 45 C47 40 51 31 60 31 L96 31 C111 31 128 42 137 56 L122 74 L95 68 L78 81 L54 72 Z' },
  { id: 'japan', round: 3, name: 'Japanese Grand Prix', nameCN: '日本大奖赛', city: 'Suzuka', date: '2026-03-29', path: 'M20 62 L41 43 L63 54 L84 31 L108 23 L139 31 L129 48 L103 51 L88 72 L64 78 L47 67 L32 80 Z M58 54 L77 65' },
  { id: 'miami', round: 4, name: 'Miami Grand Prix', nameCN: '迈阿密大奖赛', city: 'Miami', date: '2026-05-03', path: 'M18 61 L42 61 L54 38 L79 33 L96 17 L137 23 L128 42 L105 42 L95 58 L119 72 L103 83 L76 69 L58 80 L34 74 Z' },
  { id: 'canada', round: 5, name: 'Canadian Grand Prix', nameCN: '加拿大大奖赛', city: 'Montreal', date: '2026-05-24', path: 'M22 70 L31 30 L47 22 L59 38 L85 35 L101 20 L137 25 L128 42 L102 48 L116 64 L99 81 L75 68 L54 76 L39 61 Z' },
  { id: 'monaco', round: 6, name: 'Monaco Grand Prix', nameCN: '摩纳哥大奖赛', city: 'Monte Carlo', date: '2026-06-07', path: 'M25 74 L35 54 L28 38 L43 22 L65 31 L82 21 L105 30 L112 46 L137 53 L123 72 L96 68 L83 82 L59 70 L42 80 Z' },
  { id: 'barcelona', round: 7, name: 'Barcelona-Catalunya Grand Prix', nameCN: '巴塞罗那-加泰罗尼亚大奖赛', city: 'Barcelona', date: '2026-06-14', path: 'M21 67 L26 38 L45 24 L73 23 L88 35 L112 28 L139 39 L129 58 L107 55 L96 75 L74 82 L53 68 L35 78 Z' },
  { id: 'austria', round: 8, name: 'Austrian Grand Prix', nameCN: '奥地利大奖赛', city: 'Spielberg', date: '2026-06-28', path: 'M24 71 L38 42 L72 22 L120 25 L139 42 L123 62 L91 56 L70 79 L42 80 Z' },
  { id: 'great-britain', round: 9, name: 'British Grand Prix', nameCN: '英国大奖赛', city: 'Silverstone', date: '2026-07-05', path: 'M18 59 L34 41 L28 26 L49 22 L67 38 L81 23 L103 35 L126 29 L141 48 L127 66 L105 61 L91 79 L67 69 L43 80 L31 65 Z' },
  { id: 'belgium', round: 10, name: 'Belgian Grand Prix', nameCN: '比利时大奖赛', city: 'Spa-Francorchamps', date: '2026-07-19', path: 'M20 67 L31 38 L52 23 L75 29 L92 17 L126 23 L139 42 L126 62 L104 58 L90 80 L62 74 L43 82 Z' },
  { id: 'hungary', round: 11, name: 'Hungarian Grand Prix', nameCN: '匈牙利大奖赛', city: 'Budapest', date: '2026-07-26', path: 'M23 68 C17 48 30 26 51 23 L76 28 L96 20 L125 31 L139 50 L126 70 L103 65 L85 80 L61 72 L43 81 Z' },
  { id: 'netherlands', round: 12, name: 'Dutch Grand Prix', nameCN: '荷兰大奖赛', city: 'Zandvoort', date: '2026-08-23', path: 'M27 75 C17 59 21 34 39 23 C55 14 73 22 77 39 C82 57 64 66 51 56 C43 49 46 37 57 34 L94 25 L132 34 L140 55 L124 72 L96 67 L76 82 L49 74 Z' },
  { id: 'italy', round: 13, name: 'Italian Grand Prix', nameCN: '意大利大奖赛', city: 'Monza', date: '2026-09-06', path: 'M23 72 L30 30 L47 18 L64 29 L61 55 L82 64 L103 27 L132 25 L140 45 L126 64 L101 59 L85 81 L56 72 L39 82 Z' },
  { id: 'madrid', round: 14, name: 'Spanish Grand Prix', nameCN: '西班牙大奖赛', city: 'Madrid', date: '2026-09-13', path: 'M19 65 L34 40 L29 24 L52 18 L71 32 L91 23 L119 30 L141 50 L127 70 L105 64 L91 81 L67 72 L45 81 L31 67 Z' },
  { id: 'azerbaijan', round: 15, name: 'Azerbaijan Grand Prix', nameCN: '阿塞拜疆大奖赛', city: 'Baku', date: '2026-09-26', path: 'M20 74 L26 26 L48 20 L55 48 L74 51 L83 29 L105 25 L113 50 L139 55 L128 76 L96 70 L78 82 L52 73 Z' },
  { id: 'singapore', round: 16, name: 'Singapore Grand Prix', nameCN: '新加坡大奖赛', city: 'Singapore', date: '2026-10-11', path: 'M18 70 L27 34 L44 22 L59 39 L76 20 L93 38 L112 25 L140 42 L132 66 L111 62 L98 80 L76 69 L57 82 L39 64 Z' },
  { id: 'united-states', round: 17, name: 'United States Grand Prix', nameCN: '美国大奖赛', city: 'Austin', date: '2026-10-25', path: 'M20 69 L29 34 L48 18 L67 34 L87 22 L112 31 L139 51 L124 70 L101 62 L86 81 L62 71 L43 82 Z' },
  { id: 'mexico', round: 18, name: 'Mexico City Grand Prix', nameCN: '墨西哥城大奖赛', city: 'Mexico City', date: '2026-11-01', path: 'M19 67 L27 27 L50 20 L59 43 L78 38 L94 19 L126 24 L140 43 L127 62 L106 56 L94 79 L67 73 L46 82 L34 62 Z' },
  { id: 'brazil', round: 19, name: 'São Paulo Grand Prix', nameCN: '圣保罗大奖赛', city: 'São Paulo', date: '2026-11-08', path: 'M24 70 C17 54 21 31 39 22 C56 14 73 24 78 41 L89 61 L113 56 L138 67 L126 82 L99 76 L77 83 L56 69 L40 79 Z' },
  { id: 'las-vegas', round: 20, name: 'Las Vegas Grand Prix', nameCN: '拉斯维加斯大奖赛', city: 'Las Vegas', date: '2026-11-21', path: 'M19 72 L27 25 L42 18 L49 65 L72 69 L84 21 L105 20 L112 62 L140 67 L130 81 L96 75 L69 82 L43 76 Z' },
  { id: 'qatar', round: 21, name: 'Qatar Grand Prix', nameCN: '卡塔爾大奖赛', city: 'Lusail', date: '2026-11-29', path: 'M23 70 C16 49 26 26 48 19 L75 22 L92 17 L122 27 L140 47 L130 69 L107 64 L91 81 L65 72 L43 82 Z' },
  { id: 'abu-dhabi', round: 22, name: 'Abu Dhabi Grand Prix', nameCN: '阿布扎比大奖赛', city: 'Yas Marina', date: '2026-12-06', path: 'M20 69 L27 34 L45 21 L61 38 L82 22 L102 34 L129 27 L141 48 L128 68 L106 61 L91 81 L67 71 L45 82 L34 64 Z' },
];

function aggregateCircuitRatings(driverId) {
  const entries = readJSON(CIRCUIT_RATINGS_FILE).filter(r => r.driverId === driverId);
  const byCircuit = CIRCUITS.map(circuit => {
    const ratings = entries.filter(r => r.circuitId === circuit.id);
    const count = ratings.length;
    return {
      ...circuit,
      ratingCount: count,
      avgScore: count ? Math.round((ratings.reduce((sum, r) => sum + r.score, 0) / count) * 10) / 10 : 0,
      avgStars: count ? Math.round((ratings.reduce((sum, r) => sum + r.stars, 0) / count) * 10) / 10 : 0,
    };
  });

  return {
    circuits: byCircuit,
    overall: {
      ratingCount: entries.length,
      ratedCircuits: new Set(entries.map(r => r.circuitId)).size,
      avgScore: entries.length ? Math.round((entries.reduce((sum, r) => sum + r.score, 0) / entries.length) * 10) / 10 : 0,
      avgStars: entries.length ? Math.round((entries.reduce((sum, r) => sum + r.stars, 0) / entries.length) * 10) / 10 : 0,
    },
  };
}

// ── Auth helpers ──
function authUser(req) {
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!token) return null;
  const tokens = readJSON(TOKENS_FILE);
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  const entry = tokens.find(t => t.tokenHash === tokenHash || t.token === token);
  if (!entry) return null;
  const createdAt = new Date(entry.createdAt).getTime();
  if (!Number.isFinite(createdAt) || Date.now() - createdAt > TOKEN_TTL_MS) return null;
  const users = readJSON(USERS_FILE);
  return users.find(u => u.id === entry.userId) || null;
}

function createSession(userId) {
  const token = crypto.randomBytes(32).toString('hex');
  const cutoff = Date.now() - TOKEN_TTL_MS;
  const tokens = readJSON(TOKENS_FILE).filter(entry => {
    const createdAt = new Date(entry.createdAt).getTime();
    return Number.isFinite(createdAt) && createdAt >= cutoff;
  });
  tokens.push({
    tokenHash: crypto.createHash('sha256').update(token).digest('hex'),
    userId,
    createdAt: new Date().toISOString(),
  });
  writeJSON(TOKENS_FILE, tokens);
  return token;
}

function entityExists(id) {
  return DRIVERS.some(driver => driver.id === id) || TEAMS.some(team => team.id === id);
}

// ── Auth Routes ──

// POST /api/register
app.post('/api/register', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password || typeof username !== 'string' || typeof password !== 'string') {
    return res.status(400).json({ error: '用户名和密码不能为空' });
  }
  const name = username.trim().slice(0, 20);
  if (name.length < 2) return res.status(400).json({ error: '用户名至少2个字符' });
  if (/[\u0000-\u001f\u007f]/.test(name)) return res.status(400).json({ error: '用户名包含无效字符' });
  if (password.length < 8 || password.length > 72) {
    return res.status(400).json({ error: '密码长度需为8到72个字符' });
  }

  const users = readJSON(USERS_FILE);
  if (users.find(u => u.username.toLowerCase() === name.toLowerCase())) {
    return res.status(409).json({ error: '用户名已被注册' });
  }

  const salt = bcrypt.genSaltSync(10);
  const hash = bcrypt.hashSync(password, salt);
  const user = {
    id: 'u-' + crypto.randomBytes(10).toString('hex'),
    username: name,
    password: hash,
    createdAt: new Date().toISOString(),
  };
  users.push(user);
  writeJSON(USERS_FILE, users);

  // Auto-login: create token
  const token = createSession(user.id);

  res.json({ token, user: { id: user.id, username: user.username } });
});

// POST /api/login
app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: '请输入用户名和密码' });

  const users = readJSON(USERS_FILE);
  const user = users.find(u => u.username.toLowerCase() === username.trim().toLowerCase());
  if (!user || !bcrypt.compareSync(password, user.password)) {
    return res.status(401).json({ error: '用户名或密码错误' });
  }

  const token = createSession(user.id);

  res.json({ token, user: { id: user.id, username: user.username } });
});

// GET /api/me — check current auth
app.get('/api/me', (req, res) => {
  const user = authUser(req);
  if (!user) return res.status(401).json({ error: '未登录' });
  res.json({ id: user.id, username: user.username });
});

app.post('/api/logout', (req, res) => {
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (token) {
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const tokens = readJSON(TOKENS_FILE).filter(entry => entry.tokenHash !== tokenHash && entry.token !== token);
    writeJSON(TOKENS_FILE, tokens);
  }
  res.status(204).end();
});

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok' });
});

// ── API Routes ──

// GET /api/drivers/:id — driver detail with aggregate rating & comments
app.get('/api/drivers/:id', (req, res) => {
  const driver = DRIVERS.find(d => d.id === req.params.id);
  if (!driver) return res.status(404).json({ error: 'Driver not found' });

  const allRatings = readJSON(RATINGS_FILE).filter(r => r.driverId === driver.id);
  const allComments = readJSON(COMMENTS_FILE).filter(c => c.driverId === driver.id);

  const ratingCount = allRatings.length;
  const avgRating = ratingCount > 0
    ? Math.round((allRatings.reduce((sum, r) => sum + r.stars, 0) / ratingCount) * 10) / 10
    : 0;

  res.json({
    ...driver,
    avgRating,
    ratingCount,
    comments: allComments.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp)),
  });
});

// GET /api/teams/:id — team detail with aggregate rating & comments
app.get('/api/teams/:id', (req, res) => {
  const team = TEAMS.find(t => t.id === req.params.id);
  if (!team) return res.status(404).json({ error: 'Team not found' });

  const allRatings = readJSON(RATINGS_FILE).filter(r => r.driverId === team.id);
  const allComments = readJSON(COMMENTS_FILE).filter(c => c.driverId === team.id);

  const ratingCount = allRatings.length;
  const avgRating = ratingCount > 0
    ? Math.round((allRatings.reduce((sum, r) => sum + r.stars, 0) / ratingCount) * 10) / 10
    : 0;

  res.json({
    ...team,
    avgRating,
    ratingCount,
    comments: allComments.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp)),
  });
});

// POST /api/ratings — submit a rating (one vote per authenticated account)
app.post('/api/ratings', (req, res) => {
  const user = authUser(req);
  if (!user) return res.status(401).json({ error: '请先登录后再评分' });

  const { driverId, stars } = req.body;
  if (!entityExists(driverId) || typeof stars !== 'number' || !Number.isInteger(stars) || stars < 1 || stars > 5 ||
      typeof driverId !== 'string') {
    return res.status(400).json({ error: 'driverId 和 1 到 5 星评分为必填项' });
  }

  const voterId = `user:${user.id}`;
  const allRatings = readJSON(RATINGS_FILE);

  // Deduplicate: update existing rating from same user for same driver
  const existingIdx = allRatings.findIndex(r => r.anonymousId === voterId && r.driverId === driverId);
  if (existingIdx !== -1) {
    allRatings[existingIdx].stars = stars;
    allRatings[existingIdx].timestamp = new Date().toISOString();
  } else {
    allRatings.push({
      anonymousId: voterId,
      driverId,
      stars,
      timestamp: new Date().toISOString(),
    });
  }
  writeJSON(RATINGS_FILE, allRatings);

  const driverRatings = allRatings.filter(r => r.driverId === driverId);
  const count = driverRatings.length;
  const avg = Math.round((driverRatings.reduce((s, r) => s + r.stars, 0) / count) * 10) / 10;

  res.json({ success: true, avgRating: avg, ratingCount: count });
});

// GET /api/drivers/:id/circuit-ratings — all 2026 rounds and aggregate ratings
app.get('/api/drivers/:id/circuit-ratings', (req, res) => {
  const driver = DRIVERS.find(d => d.id === req.params.id);
  if (!driver) return res.status(404).json({ error: 'Driver not found' });
  res.json({ driverId: driver.id, ...aggregateCircuitRatings(driver.id) });
});

// POST /api/circuit-ratings — score a driver's performance at one circuit
// Each authenticated account can contribute one rating per driver and circuit.
app.post('/api/circuit-ratings', (req, res) => {
  const user = authUser(req);
  if (!user) return res.status(401).json({ error: '请先登录后再评分' });

  const { driverId, circuitId, score, stars } = req.body;
  const numericScore = Number(score);
  const numericStars = Number(stars);
  const driverExists = DRIVERS.some(d => d.id === driverId);
  const circuit = CIRCUITS.find(c => c.id === circuitId);

  if (!driverExists || !circuit || !Number.isFinite(numericScore) || numericScore < 1 || numericScore > 10 ||
      !Number.isInteger(numericStars) || numericStars < 1 || numericStars > 5) {
    return res.status(400).json({ error: 'driverId、circuitId、1到10分评分和1到5星评价为必填项' });
  }

  if (new Date(`${circuit.date}T23:59:59`) > new Date()) {
    return res.status(400).json({ error: 'This Grand Prix has not finished yet.' });
  }

  const voterId = `user:${user.id}`;
  const allRatings = readJSON(CIRCUIT_RATINGS_FILE);

  // Find an existing rating from this account for this driver and circuit.
  const existingIdx = allRatings.findIndex(
    r => r.anonymousId === voterId && r.driverId === driverId && r.circuitId === circuitId
  );

  if (existingIdx !== -1) {
    // Update existing rating — no new entry, no score inflation
    allRatings[existingIdx].score = Math.round(numericScore * 2) / 2;
    allRatings[existingIdx].stars = numericStars;
    allRatings[existingIdx].timestamp = new Date().toISOString();
  } else {
    // New rating
    allRatings.push({
      anonymousId: voterId,
      driverId,
      circuitId,
      score: Math.round(numericScore * 2) / 2,
      stars: numericStars,
      timestamp: new Date().toISOString(),
    });
  }

  writeJSON(CIRCUIT_RATINGS_FILE, allRatings);

  const aggregate = aggregateCircuitRatings(driverId);
  res.json({
    success: true,
    circuit: aggregate.circuits.find(item => item.id === circuitId),
    overall: aggregate.overall,
  });
});

// POST /api/comments — submit a comment (auth required)
app.post('/api/comments', (req, res) => {
  const user = authUser(req);
  if (!user) return res.status(401).json({ error: '请先登录后再发送评论' });

  const { driverId, text } = req.body;
  if (!entityExists(driverId) || !text || typeof text !== 'string' || text.trim().length === 0) {
    return res.status(400).json({ error: 'Invalid comment. driverId (string) and text (non-empty) required.' });
  }

  const trimmed = text.trim().slice(0, 500); // max 500 chars
  const allComments = readJSON(COMMENTS_FILE);
  const entry = {
    id: 'c-' + crypto.randomBytes(10).toString('hex'),
    driverId,
    userId: user.id,
    username: user.username,
    text: trimmed,
    timestamp: new Date().toISOString(),
  };
  allComments.push(entry);

  // keep only latest 200 per driverId
  const forDriver = allComments.filter(c => c.driverId === driverId);
  if (forDriver.length > 200) {
    const toRemove = forDriver.slice(0, forDriver.length - 200);
    toRemove.forEach(r => {
      const idx = allComments.indexOf(r);
      if (idx !== -1) allComments.splice(idx, 1);
    });
  }

  writeJSON(COMMENTS_FILE, allComments);

  res.json({ success: true, comment: entry });
});

// GET /api/leaderboard — top 4 drivers by 汽油 (per-circuit ranking points)
// Each circuit: 1st=100, 2nd=80, 3rd=40, 4th=20 汽油
app.get('/api/leaderboard', (_req, res) => {
  const allRatings = readJSON(CIRCUIT_RATINGS_FILE);
  if (!allRatings.length) {
    return res.json([]);
  }

  var FUEL_POINTS = [0, 100, 80, 40, 20]; // index 1-4

  // Step 1: For each circuit, compute avgScore per driver
  var finishedCircuits = CIRCUITS.filter(function (c) {
    return new Date(c.date + 'T23:59:59') <= new Date();
  });

  var driverFuel = {}; // driverId → totalFuel

  finishedCircuits.forEach(function (circuit) {
    // Group ratings for this circuit by driverId
    var circuitRatings = allRatings.filter(function (r) { return r.circuitId === circuit.id; });
    if (!circuitRatings.length) return;

    var driverScores = {};
    circuitRatings.forEach(function (r) {
      if (!driverScores[r.driverId]) driverScores[r.driverId] = { sum: 0, count: 0 };
      driverScores[r.driverId].sum += r.score;
      driverScores[r.driverId].count += 1;
    });

    // Compute avgScore per driver for this circuit
    var ranked = Object.keys(driverScores).map(function (driverId) {
      return {
        driverId: driverId,
        avgScore: driverScores[driverId].sum / driverScores[driverId].count,
      };
    });

    // Sort by avgScore descending
    ranked.sort(function (a, b) { return b.avgScore - a.avgScore; });

    // Award 汽油 to top 4
    for (var i = 0; i < Math.min(4, ranked.length); i++) {
      var dId = ranked[i].driverId;
      if (!driverFuel[dId]) driverFuel[dId] = 0;
      driverFuel[dId] += FUEL_POINTS[i + 1];
    }
  });

  // Step 2: Build result with driver info
  var scored = Object.keys(driverFuel).map(function (driverId) {
    var driver = DRIVERS.find(function (d) { return d.id === driverId; });
    return {
      id: driverId,
      name: driver ? driver.name : driverId,
      nameCN: driver ? driver.nameCN : '',
      team: driver ? driver.team : '',
      image: driver ? driver.image : '',
      fuel: driverFuel[driverId],
    };
  });

  // Sort by fuel descending, take top 4
  scored.sort(function (a, b) { return b.fuel - a.fuel; });
  res.json(scored.slice(0, 4));
});

app.use('/api', (_req, res) => {
  res.status(404).json({ error: 'API endpoint not found' });
});

app.use((err, _req, res, _next) => {
  console.error(err);
  if (err && err.type === 'entity.too.large') {
    return res.status(413).json({ error: '请求内容过大' });
  }
  res.status(500).json({ error: '服务器暂时不可用' });
});

// ── Start server ──
app.listen(PORT, () => {
  console.log(`Paddock Club server running at http://localhost:${PORT}`);
});
