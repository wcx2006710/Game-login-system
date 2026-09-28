const Database = require('better-sqlite3');
const fs = require('node:fs');
const path = require('path');
const { hashPassword, MIGRATED_PASSWORD } = require('./auth');

const dbPath = process.env.DB_PATH || path.join(__dirname, '..', 'data', 'users.db');
fs.mkdirSync(path.dirname(dbPath), { recursive: true });

const db = new Database(dbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// 初始化表
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    password_hash TEXT,
    email TEXT,
    role TEXT NOT NULL DEFAULT 'user',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

// 旧库补列：每次重新读取 PRAGMA，避免用到过期快照
function ensureColumn(name, definition) {
  const columns = db.prepare('PRAGMA table_info(users)').all();
  if (columns.some((column) => column.name === name)) return;
  db.exec(`ALTER TABLE users ADD COLUMN ${definition}`);
}

ensureColumn('password_hash', 'password_hash TEXT');
ensureColumn('role', "role TEXT NOT NULL DEFAULT 'user'");

// 插入测试数据（如果不存在）
const insertUser = db.prepare(`
  INSERT OR IGNORE INTO users (username, password, password_hash, email, role) VALUES (?, ?, ?, ?, ?)
`);
const updatePassword = db.prepare(`
  UPDATE users SET password = ?, password_hash = ? WHERE id = ?
`);
const findUser = db.prepare(`
  SELECT id, password, password_hash FROM users WHERE username = ?
`);

const defaultUsers = [
  { username: 'wcx', password: 'dashuaige', email: 'wcx@example.com', role: 'user' },
  { username: 'admin', password: '123456', email: 'admin@example.com', role: 'admin' },
  { username: 'test', password: 'test123', email: 'test@example.com', role: 'user' }
];

for (const user of defaultUsers) {
  insertUser.run(user.username, MIGRATED_PASSWORD, hashPassword(user.password), user.email, user.role);

  const existing = findUser.get(user.username);
  if (existing && !existing.password_hash && existing.password === user.password) {
    updatePassword.run(MIGRATED_PASSWORD, hashPassword(user.password), existing.id);
  }
}

// 旧库中的 admin 账号可能还是 user 角色，这里纠正为管理员
db.prepare(`
  UPDATE users SET role = 'admin' WHERE username = 'admin' AND role <> 'admin'
`).run();

module.exports = db;
