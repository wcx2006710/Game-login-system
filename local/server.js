// 本地开发服务器；EdgeOne 部署只使用 public/ 和 edge-functions/。
const express = require('express');
const session = require('express-session');
const crypto = require('node:crypto');
const path = require('path');
const db = require('./db');
const { hashPassword, verifyPassword, MIGRATED_PASSWORD } = require('./auth');

const app = express();
const configuredPort = Number.parseInt(process.env.PORT ?? '', 10);
const PORT = Number.isInteger(configuredPort) && configuredPort >= 0
  ? configuredPort
  : 3000;
const SESSION_MAX_AGE = 60 * 60 * 1000;
const LOGIN_WINDOW = 15 * 60 * 1000;
const MAX_LOGIN_ATTEMPTS = 5;
const REGISTER_WINDOW = 60 * 60 * 1000;
const MAX_REGISTER_ATTEMPTS = 10;

// 注册与用户管理共用的校验规则
const USERNAME_PATTERN = /^[A-Za-z0-9_]{3,20}$/;
const MIN_PASSWORD_LENGTH = 6;
const MAX_PASSWORD_LENGTH = 128;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_EMAIL_LENGTH = 120;
const ROLES = new Set(['user', 'admin']);

function getSessionSecret() {
  if (process.env.SESSION_SECRET) return process.env.SESSION_SECRET;

  console.warn('未设置 SESSION_SECRET，本次启动将使用临时随机密钥。');
  return crypto.randomBytes(32).toString('hex');
}

function normalizeCredentials(body) {
  const username = typeof body?.username === 'string' ? body.username.trim() : '';
  const password = typeof body?.password === 'string' ? body.password : '';
  return { username, password };
}

function normalizeEmail(value) {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

function normalizeRole(value, fallback = 'user') {
  return typeof value === 'string' && ROLES.has(value) ? value : fallback;
}

// 校验通过返回 null，否则返回给前端的错误文案
function validateNewUser({ username, password, email }) {
  if (!USERNAME_PATTERN.test(username)) {
    return '用户名需为 3-20 位字母、数字或下划线';
  }
  if (password.length < MIN_PASSWORD_LENGTH || password.length > MAX_PASSWORD_LENGTH) {
    return `密码长度需为 ${MIN_PASSWORD_LENGTH}-${MAX_PASSWORD_LENGTH} 位`;
  }
  if (email && (email.length > MAX_EMAIL_LENGTH || !EMAIL_PATTERN.test(email))) {
    return '邮箱格式不正确';
  }
  return null;
}

function findUserByUsername(username) {
  return db.prepare('SELECT id, username FROM users WHERE username = ?').get(username);
}

function findUserByEmail(email) {
  if (!email) return null;
  return db.prepare("SELECT id, username FROM users WHERE email = ? AND email <> ''").get(email);
}

function publicUser(row) {
  return {
    id: row.id,
    username: row.username,
    email: row.email || '',
    role: normalizeRole(row.role),
    created_at: row.created_at || ''
  };
}

// 角色实时从数据库读取，避免会话里残留的旧角色继续生效
function loadSessionUser(req) {
  const sessionUserId = req.session?.user?.id;
  if (!sessionUserId) return null;

  return db
    .prepare('SELECT id, username, email, role, created_at FROM users WHERE id = ?')
    .get(sessionUserId) || null;
}

function requireLogin(req, res, next) {
  const user = loadSessionUser(req);
  if (!user) return res.status(401).json({ error: '未登录' });

  req.currentUser = user;
  return next();
}

function requireAdmin(req, res, next) {
  return requireLogin(req, res, () => {
    if (req.currentUser.role !== 'admin') {
      return res.status(403).json({ error: '需要管理员权限' });
    }
    return next();
  });
}

function parseUserId(value) {
  const id = Number.parseInt(value, 10);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function getAttemptKey(req, username) {
  return `${req.ip}:${username.toLowerCase()}`;
}

// 通用滑动窗口计数器：累计达到 max 次即封禁，窗口到期自动放行
function createRateLimiter({ windowMs, max }) {
  const entries = new Map();

  function getActive(key) {
    const entry = entries.get(key);
    if (!entry) return null;
    if (entry.expiresAt <= Date.now()) {
      entries.delete(key);
      return null;
    }
    return entry;
  }

  return {
    isBlocked(key) {
      const entry = getActive(key);
      return Boolean(entry && entry.count >= max);
    },
    record(key) {
      const entry = getActive(key);
      const count = (entry?.count || 0) + 1;
      entries.set(key, { count, expiresAt: Date.now() + windowMs });
      return count;
    },
    clear(key) {
      entries.delete(key);
    },
    sweep() {
      const now = Date.now();
      for (const [key, entry] of entries) {
        if (entry.expiresAt <= now) entries.delete(key);
      }
    }
  };
}

const loginLimiter = createRateLimiter({ windowMs: LOGIN_WINDOW, max: MAX_LOGIN_ATTEMPTS });
const registerLimiter = createRateLimiter({ windowMs: REGISTER_WINDOW, max: MAX_REGISTER_ATTEMPTS });

setInterval(() => {
  loginLimiter.sweep();
  registerLimiter.sweep();
}, LOGIN_WINDOW).unref();

// 中间件
app.disable('x-powered-by');
app.set('trust proxy', 1);
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'same-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  next();
});
app.use(express.urlencoded({ extended: false, limit: '16kb' }));
app.use(express.json({ limit: '16kb' }));
app.use(express.static(path.join(__dirname, '..', 'public'), {
  dotfiles: 'deny',
  index: 'index.html'
}));

// Session 配置
app.use(session({
  name: 'local.sid',
  secret: getSessionSecret(),
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: SESSION_MAX_AGE
  }
}));

// 注册接口
app.post('/register', (req, res) => {
  const body = req.body ?? {};
  const username = typeof body.username === 'string' ? body.username.trim() : '';
  const password = typeof body.password === 'string' ? body.password : '';
  const email = normalizeEmail(body.email);

  // 先做格式校验：无效请求不消耗注册配额
  const invalidReason = validateNewUser({ username, password, email });
  if (invalidReason) {
    return res.status(400).json({ success: false, error: invalidReason });
  }

  const registerKey = `register:${req.ip}`;
  if (registerLimiter.isBlocked(registerKey)) {
    return res.status(429).json({
      success: false,
      error: '注册过于频繁，请稍后再试'
    });
  }

  if (findUserByUsername(username)) {
    registerLimiter.record(registerKey);
    return res.status(409).json({ success: false, error: '该用户名已被注册' });
  }

  if (findUserByEmail(email)) {
    registerLimiter.record(registerKey);
    return res.status(409).json({ success: false, error: '该邮箱已被使用' });
  }

  const info = db
    .prepare('INSERT INTO users (username, password, password_hash, email, role) VALUES (?, ?, ?, ?, ?)')
    .run(username, MIGRATED_PASSWORD, hashPassword(password), email, 'user');

  registerLimiter.record(registerKey);

  return res.status(201).json({
    success: true,
    message: '注册成功，请使用新账号登录',
    redirect: '/login.html',
    user: {
      id: Number(info.lastInsertRowid),
      username,
      email,
      role: 'user'
    }
  });
});

// 登录接口
app.post('/login', (req, res) => {
  const { username, password } = normalizeCredentials(req.body);

  if (!username || !password) {
    return res.status(400).json({
      success: false,
      error: '请输入用户名和密码'
    });
  }

  const attemptKey = getAttemptKey(req, username);
  if (loginLimiter.isBlocked(attemptKey)) {
    return res.status(429).json({
      success: false,
      error: '登录尝试过于频繁，请稍后再试'
    });
  }

  const user = db
    .prepare('SELECT id, username, email, role, password, password_hash FROM users WHERE username = ?')
    .get(username);

  if (!user || !verifyPassword(password, user.password_hash, user.password)) {
    loginLimiter.record(attemptKey);
    return res.status(401).json({
      success: false,
      error: '用户名或密码错误'
    });
  }

  if (!user.password_hash) {
    db.prepare('UPDATE users SET password = ?, password_hash = ? WHERE id = ?')
      .run('[migrated]', hashPassword(password), user.id);
  }

  loginLimiter.clear(attemptKey);
  req.session.regenerate((error) => {
    if (error) {
      console.error('创建会话失败:', error);
      return res.status(500).json({ success: false, error: '登录失败，请稍后重试' });
    }

    req.session.user = {
      id: user.id,
      username: user.username,
      email: user.email,
      role: normalizeRole(user.role)
    };
    return res.json({ success: true, redirect: '/success.html' });
  });
});

// 登出接口
app.post('/logout', (req, res) => {
  if (!req.session) return res.json({ success: true });

  req.session.destroy((error) => {
    if (error) {
      console.error('销毁会话失败:', error);
      return res.status(500).json({ success: false, error: '退出登录失败' });
    }

    res.clearCookie('local.sid');
    return res.json({ success: true });
  });
});

// 获取当前登录用户
app.get('/api/current-user', (req, res) => {
  const user = loadSessionUser(req);
  if (!user) return res.json({ loggedIn: false });

  return res.json({ loggedIn: true, user: publicUser(user) });
});

// 用户列表（登录即可查看，不返回密码相关字段）
app.get('/api/users', requireLogin, (req, res) => {
  const users = db
    .prepare('SELECT id, username, email, role, created_at FROM users ORDER BY id')
    .all();

  return res.json(users.map(publicUser));
});

// 管理员新增用户
app.post('/api/users', requireAdmin, (req, res) => {
  const body = req.body ?? {};
  const username = typeof body.username === 'string' ? body.username.trim() : '';
  const password = typeof body.password === 'string' ? body.password : '';
  const email = normalizeEmail(body.email);
  const requestedRole = typeof body.role === 'string' && body.role ? body.role : 'user';

  const invalidReason = validateNewUser({ username, password, email });
  if (invalidReason) {
    return res.status(400).json({ error: invalidReason });
  }

  if (!ROLES.has(requestedRole)) {
    return res.status(400).json({ error: '角色只能是 user 或 admin' });
  }

  if (findUserByUsername(username)) {
    return res.status(409).json({ error: '该用户名已存在' });
  }

  if (findUserByEmail(email)) {
    return res.status(409).json({ error: '该邮箱已被使用' });
  }

  const info = db
    .prepare('INSERT INTO users (username, password, password_hash, email, role) VALUES (?, ?, ?, ?, ?)')
    .run(username, MIGRATED_PASSWORD, hashPassword(password), email, requestedRole);

  const created = db
    .prepare('SELECT id, username, email, role, created_at FROM users WHERE id = ?')
    .get(info.lastInsertRowid);

  return res.status(201).json(publicUser(created));
});

// 管理员修改用户：邮箱、角色、密码（可只传其中一部分）
app.put('/api/users/:id', requireAdmin, (req, res) => {
  const userId = parseUserId(req.params.id);
  if (!userId) return res.status(400).json({ error: '用户 ID 不合法' });

  const target = db.prepare('SELECT id FROM users WHERE id = ?').get(userId);
  if (!target) return res.status(404).json({ error: '用户不存在' });

  const body = req.body ?? {};
  const updates = [];

  if (Object.hasOwn(body, 'email')) {
    const email = normalizeEmail(body.email);
    if (email && (email.length > MAX_EMAIL_LENGTH || !EMAIL_PATTERN.test(email))) {
      return res.status(400).json({ error: '邮箱格式不正确' });
    }

    const emailOwner = findUserByEmail(email);
    if (emailOwner && emailOwner.id !== userId) {
      return res.status(409).json({ error: '该邮箱已被使用' });
    }

    updates.push({ column: 'email', value: email });
  }

  if (Object.hasOwn(body, 'role')) {
    if (!ROLES.has(body.role)) {
      return res.status(400).json({ error: '角色只能是 user 或 admin' });
    }
    if (userId === req.currentUser.id && body.role !== 'admin') {
      return res.status(400).json({ error: '不能取消自己的管理员权限' });
    }

    updates.push({ column: 'role', value: body.role });
  }

  if (Object.hasOwn(body, 'password')) {
    const password = typeof body.password === 'string' ? body.password : '';
    if (password.length < MIN_PASSWORD_LENGTH || password.length > MAX_PASSWORD_LENGTH) {
      return res.status(400).json({
        error: `密码长度需为 ${MIN_PASSWORD_LENGTH}-${MAX_PASSWORD_LENGTH} 位`
      });
    }

    updates.push({ column: 'password', value: MIGRATED_PASSWORD });
    updates.push({ column: 'password_hash', value: hashPassword(password) });
  }

  if (updates.length === 0) {
    return res.status(400).json({ error: '没有需要更新的字段' });
  }

  // column 全部来自上面的固定白名单，不存在拼接注入
  const assignments = updates.map((update) => `${update.column} = ?`).join(', ');
  db.prepare(`UPDATE users SET ${assignments} WHERE id = ?`)
    .run(...updates.map((update) => update.value), userId);

  const updated = db
    .prepare('SELECT id, username, email, role, created_at FROM users WHERE id = ?')
    .get(userId);

  return res.json(publicUser(updated));
});

// 管理员删除用户
app.delete('/api/users/:id', requireAdmin, (req, res) => {
  const userId = parseUserId(req.params.id);
  if (!userId) return res.status(400).json({ error: '用户 ID 不合法' });

  const target = db.prepare('SELECT id, username FROM users WHERE id = ?').get(userId);
  if (!target) return res.status(404).json({ error: '用户不存在' });

  if (userId === req.currentUser.id) {
    return res.status(400).json({ error: '不能删除当前登录的账号' });
  }

  if (target.username === 'admin') {
    return res.status(400).json({ error: '默认管理员账号不可删除' });
  }

  db.prepare('DELETE FROM users WHERE id = ?').run(userId);
  return res.json({ success: true, deletedId: userId });
});

// 个人中心：修改自己的邮箱
app.put('/api/profile', requireLogin, (req, res) => {
  const body = req.body ?? {};
  if (!Object.hasOwn(body, 'email')) {
    return res.status(400).json({ error: '没有需要更新的字段' });
  }

  const email = normalizeEmail(body.email);
  if (email && (email.length > MAX_EMAIL_LENGTH || !EMAIL_PATTERN.test(email))) {
    return res.status(400).json({ error: '邮箱格式不正确' });
  }

  const emailOwner = findUserByEmail(email);
  if (emailOwner && emailOwner.id !== req.currentUser.id) {
    return res.status(409).json({ error: '该邮箱已被使用' });
  }

  db.prepare('UPDATE users SET email = ? WHERE id = ?').run(email, req.currentUser.id);

  const updated = db
    .prepare('SELECT id, username, email, role, created_at FROM users WHERE id = ?')
    .get(req.currentUser.id);

  return res.json({ success: true, user: publicUser(updated) });
});

// 个人中心：修改自己的密码（需验证当前密码）
app.post('/api/change-password', requireLogin, (req, res) => {
  const body = req.body ?? {};
  const currentPassword = typeof body.currentPassword === 'string' ? body.currentPassword : '';
  const newPassword = typeof body.newPassword === 'string' ? body.newPassword : '';

  if (!currentPassword || !newPassword) {
    return res.status(400).json({ error: '请填写当前密码和新密码' });
  }

  if (newPassword.length < MIN_PASSWORD_LENGTH || newPassword.length > MAX_PASSWORD_LENGTH) {
    return res.status(400).json({
      error: `新密码长度需为 ${MIN_PASSWORD_LENGTH}-${MAX_PASSWORD_LENGTH} 位`
    });
  }

  if (newPassword === currentPassword) {
    return res.status(400).json({ error: '新密码不能与当前密码相同' });
  }

  const row = db
    .prepare('SELECT id, password, password_hash FROM users WHERE id = ?')
    .get(req.currentUser.id);

  if (!row || !verifyPassword(currentPassword, row.password_hash, row.password)) {
    return res.status(400).json({ error: '当前密码不正确' });
  }

  db.prepare('UPDATE users SET password = ?, password_hash = ? WHERE id = ?')
    .run(MIGRATED_PASSWORD, hashPassword(newPassword), req.currentUser.id);

  return res.json({ success: true, message: '密码已更新，请使用新密码重新登录' });
});

app.use((error, req, res, next) => {
  if (res.headersSent) return next(error);
  console.error('请求处理失败:', error);

  if (error?.type === 'entity.too.large') {
    return res.status(413).json({ error: '请求内容过大' });
  }

  return res.status(500).json({ error: '服务器内部错误' });
});

const server = app.listen(PORT, '127.0.0.1', () => {
  const address = server.address();
  const actualPort = typeof address === 'object' && address ? address.port : PORT;
  console.log(`服务器运行在 http://127.0.0.1:${actualPort}`);
  console.log('测试账号: wcx / dashuaige, admin / 123456, test / test123');
});
