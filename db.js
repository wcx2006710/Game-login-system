const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, 'data', 'users.db');
const db = new Database(dbPath);

// 初始化表
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    email TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

// 插入测试数据（如果不存在）
const insertUser = db.prepare(`
  INSERT OR IGNORE INTO users (username, password, email) VALUES (?, ?, ?)
`);

insertUser.run('wcx', 'dashuaige', 'wcx@example.com');
insertUser.run('admin', '123456', 'admin@example.com');
insertUser.run('test', 'test123', 'test@example.com');

module.exports = db;
