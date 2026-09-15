// 本地开发服务器；EdgeOne 部署只使用 public/ 和 edge-functions/。
const express = require('express');
const session = require('express-session');
const crypto = require('node:crypto');
const path = require('path');
const db = require('./db');
const { hashPassword, verifyPassword } = require('./auth');

const app = express();
const configuredPort = Number.parseInt(process.env.PORT ?? '', 10);
const PORT = Number.isInteger(configuredPort) && configuredPort >= 0
  ? configuredPort
  : 3000;
const SESSION_MAX_AGE = 60 * 60 * 1000;
const LOGIN_WINDOW = 15 * 60 * 1000;
const MAX_LOGIN_ATTEMPTS = 5;
const loginAttempts = new Map();

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

function getAttemptKey(req, username) {
  return `${req.ip}:${username.toLowerCase()}`;
}

function getActiveAttempt(key) {
  const attempt = loginAttempts.get(key);
  if (!attempt) return null;
  if (attempt.expiresAt <= Date.now()) {
    loginAttempts.delete(key);
    return null;
  }
  return attempt;
}

function recordFailedLogin(key) {
  const current = getActiveAttempt(key);
  const count = (current?.count || 0) + 1;
  loginAttempts.set(key, { count, expiresAt: Date.now() + LOGIN_WINDOW });
  return count;
}

function clearLoginAttempts(key) {
  loginAttempts.delete(key);
}

setInterval(() => {
  const now = Date.now();
  for (const [key, attempt] of loginAttempts) {
    if (attempt.expiresAt <= now) loginAttempts.delete(key);
  }
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
  const activeAttempt = getActiveAttempt(attemptKey);
  if (activeAttempt?.count >= MAX_LOGIN_ATTEMPTS) {
    return res.status(429).json({
      success: false,
      error: '登录尝试过于频繁，请稍后再试'
    });
  }

  const user = db
    .prepare('SELECT id, username, email, password, password_hash FROM users WHERE username = ?')
    .get(username);

  if (!user || !verifyPassword(password, user.password_hash, user.password)) {
    recordFailedLogin(attemptKey);
    return res.status(401).json({
      success: false,
      error: '用户名或密码错误'
    });
  }

  if (!user.password_hash) {
    db.prepare('UPDATE users SET password = ?, password_hash = ? WHERE id = ?')
      .run('[migrated]', hashPassword(password), user.id);
  }

  clearLoginAttempts(attemptKey);
  req.session.regenerate((error) => {
    if (error) {
      console.error('创建会话失败:', error);
      return res.status(500).json({ success: false, error: '登录失败，请稍后重试' });
    }

    req.session.user = { id: user.id, username: user.username, email: user.email };
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
  if (req.session.user) {
    res.json({ loggedIn: true, user: req.session.user });
  } else {
    res.json({ loggedIn: false });
  }
});

// 获取所有用户（表格数据，需登录）
app.get('/api/users', (req, res) => {
  if (!req.session.user) {
    return res.status(401).json({ error: '未登录' });
  }
  const users = db.prepare('SELECT id, username, email, created_at FROM users').all();
  return res.json(users);
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
