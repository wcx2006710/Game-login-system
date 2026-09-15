# 项目上下文文档（给 AI 助手看）

## 项目概述
**Game Login System** — 一个带游戏化交互的登录系统网页。
核心玩法：登录页有 Canvas 炸弹互动背景，登录失败会连环爆炸显示"你被炸死了"；登录成功后可玩扫雷游戏、查看用户表格。

## 技术架构（双模式）

### 本地模式（开发用）
- 后端：Node.js + Express 5（`local/server.js`）
- 数据库：SQLite（`local/db.js`，better-sqlite3，文件存 `data/users.db`）
- 会话：express-session（内存存储）
- 密码：PBKDF2-SHA256 + 随机盐（`local/auth.js`，旧明文账号登录时自动迁移）
- 启动：`cd local && npm start` → http://127.0.0.1:3000

### 云端模式（EdgeOne Pages 部署）
- 静态资源：`public/` 目录（edgeone.json 配置 outputDirectory: ./public）
- API：EdgeOne Edge Functions（`edge-functions/` 目录，文件即路由）
- 数据存储：EdgeOne KV（绑定变量名必须是 `my_kv`）
- 会话：Cookie `session_id` + KV 存储
- 密码：SHA-256 哈希存储（默认演示账号）
- 会话有效期：1 小时，KV 记录 `expiresAt`，过期后自动清理
- KV 绑定：在 EdgeOne Makers 控制台中，项目详情左侧进入 `KV 存储`，点击 `绑定命名空间`，选择命名空间后把变量名设置为 `my_kv`

> 前端页面零改动，两套后端接口路径完全一致（/login、/logout、/api/current-user、/api/users）

## 目录结构
```
login-system/
├── local/                     # 仅本地开发使用，EdgeOne 部署不依赖
│   ├── auth.js                # 密码哈希与校验
│   ├── server.js              # Express 后端
│   ├── db.js                  # SQLite 初始化（含默认账号）
│   ├── package.json           # 本地依赖与测试脚本
│   └── package-lock.json
├── edgeone.json               # EdgeOne 配置
├── edge-functions/            # 云端 Edge Functions
│   ├── login.js               # POST /login
│   ├── logout.js              # POST /logout
│   └── api/
│       ├── health.js          # GET /api/health
│       ├── current-user.js    # GET /api/current-user
│       └── users.js           # GET /api/users
├── public/                    # 静态页面（云端输出目录）
│   ├── index.html             # 网站首页（落地页）
│   ├── login.html             # 登录页（炸弹互动背景）
│   ├── success.html           # 登录成功页（用户表格 + 扫雷入口）
│   ├── favicon.svg            # 网站图标
│   └── minesweeper.html       # 扫雷游戏
├── test-local.mjs             # 本地接口集成测试
├── test-edge-functions.mjs    # 云端函数逻辑测试（mock KV）
└── README.md                  # 给人看的完整说明
```

## API 接口
| 方法 | 路径 | 说明 | 返回 |
|------|------|------|------|
| POST | /login | 登录 | {success, redirect}；参数错误 400，失败 401，限流 429 |
| POST | /logout | 登出 | {success} |
| GET | /api/current-user | 当前用户 | {loggedIn, user} |
| GET | /api/users | 用户列表（需登录） | [{id, username, email, created_at}] |
| GET | /api/health | 云端 KV 诊断 | {ok, kv}；未绑定返回 503 |

云端 KV 未绑定时，`/login`、`/api/current-user`、`/api/users` 会统一返回 `503 KV_UNAVAILABLE`，不再用静默未登录或 `545` 掩盖配置问题。

## 测试账号
| 用户名 | 密码 |
|--------|------|
| wcx | dashuaige |
| admin | 123456 |
| test | test123 |

云端 KV 首次调用 /login 时自动懒初始化账号。

## 云端部署状态
- GitHub 仓库：https://github.com/wcx2006710/Game-login-system（main 分支自动部署）
- EdgeOne 项目：已创建，域名 `gam-login-system-dplxblqktqtz.edgeone.cool`
- **已知问题**：项目加速区域曾是"Global (MLC excluded)"，中国大陆访问返回 401。用户已尝试改区域，需确认是否生效。
- **待确认**：KV 命名空间是否已绑定到项目（变量名 my_kv）。未绑定则登录接口会 500。

## 关键实现细节
- 登录页炸弹：Canvas 粒子系统，点击爆炸；登录失败触发连环爆炸 + 屏幕震动 + deathOverlay
- 扫雷：9×9，10雷，左键翻开右键插旗，首次点击保证不踩雷
- 本地登录：同一 IP + 用户名 15 分钟内连续失败 5 次后返回 429
- 本地会话：Cookie 使用 `local.sid`，开启 HttpOnly、SameSite=Lax，生产环境启用 Secure
- 用户表格：前端使用 `textContent` 渲染，不把接口数据拼进 `innerHTML`
- 云端函数用 ES Module（export async function onRequestPost），不能用 CommonJS
- Edge Functions 限制：单函数 5MB，CPU 200ms，body 1MB
- .gitignore 排除：node_modules/、data/*.db、*.log、.vscode/

## 修改时注意
1. 改前端页面：public/ 下文件，本地和云端共用
2. 改后端逻辑：local/server.js（本地）和 edge-functions/（云端）要同步改
3. 改账号密码：local/db.js（本地初始化）+ edge-functions/login.js 和 users.js（云端哈希，需重新算 SHA-256）
4. 全部测试：`cd local && npm test`
5. 仅云端测试：`cd local && npm run test:edge`
6. 本地数据库里的旧明文密码会在登录成功时自动迁移，通常无需删除 `data/users.db`
