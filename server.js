const express = require('express');
const session = require('express-session');
const path = require('path');
const db = require('./db');

const app = express();
const PORT = 3000;

// 中间件
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Session 配置
app.use(session({
  secret: 'login-system-secret-key',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 60 * 60 * 1000 } // 1小时
}));

// 根路径重定向到登录页
app.get('/', (req, res) => {
  res.redirect('/login.html');
});

// 登录接口
app.post('/login', (req, res) => {
  const { username, password } = req.body;

  const user = db.prepare('SELECT * FROM users WHERE username = ? AND password = ?').get(username, password);

  if (user) {
    req.session.user = { id: user.id, username: user.username, email: user.email };
    res.json({ success: true, redirect: '/success.html' });
  } else {
    res.json({ success: false, redirect: '/fail.html' });
  }
});

// 登出接口
app.post('/logout', (req, res) => {
  req.session.destroy();
  res.json({ success: true });
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
  res.json(users);
});

app.listen(PORT, '127.0.0.1', () => {
  console.log(`服务器运行在 http://127.0.0.1:${PORT}`);
  console.log('测试账号: admin / 123456, test / test123, alice / alice888');
});
