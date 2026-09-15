# 💣 Game Login System

基于 Node.js 的交互式游戏登录系统，内置扫雷游戏与 Canvas 炸弹互动背景。支持本地运行和腾讯云 EdgeOne Pages 云部署（Edge Functions + KV 存储）。

## ✨ 功能特性

- **用户登录认证**：登录/登出全流程，本地密码 PBKDF2-SHA256 哈希存储
- **炸弹互动背景**：Canvas 粒子爆炸效果，点击炸弹可引爆
- **失败死亡界面**：登录失败触发连环爆炸 + 屏幕震动 +「你被炸死了」
- **扫雷游戏**：登录成功后可玩 9×9 经典扫雷，支持插旗、计时、胜负判定
- **用户数据表格**：展示用户列表（ID、用户名、邮箱、注册时间）
- **网站首页**：响应式落地页，功能介绍与导航

## 🛠️ 技术栈

| 层级 | 技术 |
|------|------|
| 本地后端 | Node.js + Express 5 + SQLite（better-sqlite3） |
| 云后端 | 腾讯云 EdgeOne Pages Edge Functions + KV 存储 |
| 会话 | express-session（本地）/ Cookie + KV（云端） |
| 前端 | HTML5 Canvas + CSS3 + 原生 JavaScript |

## 📦 本地安装运行

```bash
# 进入本地开发目录
cd local

# 安装依赖
npm install

# 启动服务
npm start

# 开发模式（文件变化后自动重启）
npm run dev

# 运行本地与云端函数测试
npm test
```

浏览器访问：http://127.0.0.1:3000

## ☁️ EdgeOne Pages 云部署（方案 B）

### 架构

```
客户端 → EdgeOne Pages 静态资源（public/）
       → Edge Functions（edge-functions/）处理 API
       → KV 存储（用户数据 + 会话）
```

### 部署步骤

1. **推送代码**：把项目推送到 GitHub 仓库（已配置 edgeone.json，输出目录 `./public`）

2. **创建 EdgeOne Pages 项目**
   - 打开 https://console.cloud.tencent.com/edgeone/pages
   - 「创建项目」→ 绑定 GitHub 仓库（Game-login-system）
   - 构建配置：无构建命令，输出目录 `./public`（edgeone.json 已自动配置）
   - 部署分支：`main`

3. **开通 KV 存储并绑定**
   - 控制台「KV 存储」→ 申请开通 → 创建命名空间（如 `game-login-kv`）
   - 进入项目设置 → 绑定命名空间，**变量名必须为 `my_kv`**（函数代码中的固定变量名）
   - 注意：KV 开通目前需申请，审核通过后可用

4. **部署**
   - 绑定完成后，推送代码到 main 分支会自动触发构建部署
   - 部署成功后访问生成的 Pages 域名即可

> **说明**：首次调用登录接口时，KV 会自动初始化默认账号（懒初始化），无需手动添加键值。

### 云部署 API 路由

| 文件 | 路由 | 说明 |
|------|------|------|
| `edge-functions/login.js` | POST /login | 登录认证 |
| `edge-functions/logout.js` | POST /logout | 退出登录 |
| `edge-functions/api/health.js` | GET /api/health | 云端 KV 健康检查 |
| `edge-functions/api/current-user.js` | GET /api/current-user | 获取当前登录用户 |
| `edge-functions/api/users.js` | GET /api/users | 获取用户列表（需登录） |

## 👤 测试账号

| 用户名 | 密码 |
|--------|------|
| wcx | dashuaige |
| admin | 123456 |
| test | test123 |

## 📁 项目结构

```
login-system/
├── local/                     # 本地开发模式，不属于 EdgeOne 输出
│   ├── auth.js                # 本地密码哈希与校验
│   ├── server.js              # 本地后端服务入口
│   ├── db.js                  # 本地 SQLite 数据库初始化
│   ├── package.json           # 本地开发依赖与脚本
│   └── package-lock.json
├── edgeone.json               # EdgeOne Pages 配置
├── edge-functions/            # EdgeOne Edge Functions（云 API）
│   ├── login.js
│   ├── logout.js
│   └── api/
│       ├── current-user.js
│       └── users.js
├── data/                      # 本地 SQLite 数据库（自动生成）
├── test-local.mjs             # 本地接口集成测试
├── test-edge-functions.mjs    # 云端函数逻辑测试
└── public/                    # 静态资源（云端输出目录）
    ├── index.html             # 网站首页
    ├── login.html             # 登录页（炸弹互动背景）
    ├── success.html           # 登录成功页（用户表格）
    ├── favicon.svg            # 网站图标
    └── minesweeper.html       # 扫雷游戏页
```

## 📡 API 接口

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | /login | 登录认证 |
| POST | /logout | 退出登录 |
| GET | /api/current-user | 获取当前登录用户 |
| GET | /api/users | 获取用户列表（需登录） |
