# 旧版界面存档（Legacy UI）

本目录保存**改造前的原始界面**，用于与新版设计做对比，不参与日常使用。

| 旧版入口 | 新版入口 | 说明 |
| --- | --- | --- |
| `/legacy/index.html` | `/index.html` | 落地页 |
| `/legacy/login.html` | `/login.html` | 登录页 |
| `/legacy/register.html` | `/register.html` | 注册页 |
| `/legacy/success.html` | `/success.html` | 登录成功 / 用户列表 |
| `/legacy/profile.html` | `/profile.html` | 个人中心 |
| `/legacy/admin.html` | `/admin.html` | 用户管理后台 |
| `/legacy/minesweeper.html` | `/minesweeper.html` | 扫雷游戏 |

## 两版差异

| 维度 | 旧版 | 新版 |
| --- | --- | --- |
| 样式组织 | 每页一份内联 `<style>`，硬编码色值 | 统一 `styles/theme.css` 设计令牌 |
| 主色 | 三套并存（`#667eea` / `#1890ff` / `#722ed1`） | 统一 `--c-primary`，其余降为语义色 |
| 主题 | 亮色为主，深浅混杂 | 科技感暗色玻璃拟态 |
| 图标 | 全部用 emoji | Lucide 线性 SVG 图标（内联，离线可用） |
| 背景 | 静态渐变 / 纯色 | tsParticles 粒子背景（首页、注册页） |
| 提示方式 | 区块内 `.message` | Toast 通知 |
| 加载态 | 按钮文案替换 | 按钮 spinner + 表格骨架屏 |
| 密码输入 | 无反馈 | 实时强度条 + 显示/隐藏切换 |
| 管理后台 | 纯表格 | 统计卡片 + Chart.js 角色分布 / 增长趋势 |
| 响应式 | 仅首页有断点 | 全站断点 |

## 说明

- 旧版页面的站内链接已改为相对路径，点击后仍在旧版内跳转。
- **登录成功后服务端返回的跳转地址指向新版 `/success.html`**，属于后端行为，旧版未做改写。
- 旧版不复刻新增的交互组件（Toast / 骨架屏 / 图表），保留其原始实现以便对照。
