# 设计规范系统 · Game Login System

> 版本 v1.0 · 暗色优先 · 令牌驱动 · 零外部依赖
>
> 可视化一览：**[`/design-system.html`](../public/design-system.html)**（页面内所有色值均从 `theme.css` 实时读取，与线上实现一致）

---

## 1. 设计原则

| # | 原则 | 具体含义 |
| :--- | :--- | :--- |
| 1 | **暗色优先，玻璃承载** | 深空渐变作底，毛玻璃卡片承载内容。层级靠透明度与模糊区分，不靠边框堆叠 |
| 2 | **令牌驱动，禁止裸值** | 颜色、间距、圆角、时长一律走 `var(--token)`；改一处，全站同步 |
| 3 | **状态可感知** | hover / active / focus / loading / disabled 五态齐全，键盘用户能看到焦点环 |
| 4 | **克制使用动效** | 动效只用于解释因果（反馈、转场），尊重 `prefers-reduced-motion` |

---

## 2. 令牌体系

令牌集中在 [`public/styles/theme.css`](../public/styles/theme.css) 的 `:root`，分 10 组。

### 2.1 色彩

收敛自改造前三套分裂的主色（`#667eea` / `#1890ff` / `#722ed1`）：`#667eea` 定为唯一主色，`#1890ff` 降为 info 语义色，`#722ed1` 保留为管理员角色色。

| 分组 | 令牌 | 值 | 用途 |
| :--- | :--- | :--- | :--- |
| 品牌主色 | `--c-primary` | `#667eea` | 按钮、聚焦态、链接 |
| | `--c-primary-600` | `#5568d3` | 按下态 |
| | `--c-primary-400` | `#8b9df5` | 暗底上的文字/链接 |
| | `--c-primary-soft` / `--c-primary-glow` | 16% / 45% 透明 | 淡底、辉光 |
| 角色色 | `--c-accent` | `#764ba2` | 渐变另一端 |
| | `--c-admin` | `#722ed1` | 管理员标识 |
| 语义色 | `--c-info` | `#1890ff` | 信息 |
| | `--c-success` | `#52c41a` | 成功 |
| | `--c-warning` | `#faad14` | 警告 |
| | `--c-danger` | `#ff4d4f` | 危险 / 爆炸 |
| 背景层 | `--bg-space` | 135° 三段渐变 | 页面底 |
| | `--bg-0` / `--bg-1` / `--bg-2` | `#0b0b1a` / `#141428` / `#1c1c38` | 递增的surface |
| 玻璃层 | `--glass-bg` | `rgba(255,255,255,.06)` | 卡片底 |
| | `--glass-bg-strong` | `.10` | 强调卡片 |
| | `--glass-border` / `--glass-border-strong` | `.12` / `.20` | 卡片描边 |
| | `--glass-blur` | `16px` | 模糊半径 |
| 文字 | `--fg` / `--fg-strong` | `#e8eaf2` / `#fff` | 正文 / 标题 |
| | `--fg-muted` / `--fg-dim` | 68% / 42% | 次要 / 弱化 |
| 描边与状态 | `--border-*` | `.06` / `.12` / `.20` | 分隔线 |
| | `--state-hover` / `--state-active` / `--state-selected` | `.05` / `.09` / 主色18% | 交互反馈 |

### 2.2 排版

字体栈含中文回退：`'Segoe UI', 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', sans-serif`

| 令牌 | 12px | 13 | 15 | 16 | 18 | 20 | 26 | 32 | 44 |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| | `--fs-xs` | `--fs-sm` | `--fs-base` | `--fs-md` | `--fs-lg` | `--fs-xl` | `--fs-2xl` | `--fs-3xl` | `--fs-4xl` |

- 行高：`--lh-tight 1.25`（标题）/ `--lh-base 1.6`（正文）/ `--lh-loose 1.8`（说明）
- 字重：400 / 500 / 600 / 700 / 800

### 2.3 间距、形状与控件

| 类别 | 令牌 |
| :--- | :--- |
| 间距（8px 基准） | `--sp-1` 8 · `--sp-2` 12 · `--sp-3` 16 · `--sp-4` 24 · `--sp-5` 40 · `--sp-6` 64 |
| 圆角 | `--r-sm` 8 · `--r-md` 12 · `--r-lg` 18 · `--r-xl` 24 · `--r-pill` 999 |
| 阴影 | `--sh-1` 近 · `--sh-2` 中 · `--sh-3` 远 · `--sh-glow` 辉光 · `--sh-inset` 内高光 |
| 控件高度 | `--ctrl-h-sm` 30 · `--ctrl-h-md` 38 · `--ctrl-h-lg` 46 |

### 2.4 动效

| 令牌 | 值 | 场景 |
| :--- | :--- | :--- |
| `--t-xs` | 0.1s | 颜色微变 |
| `--t-fast` | 0.15s | hover |
| `--t-base` | 0.25s | 默认过渡 |
| `--t-slow` | 0.4s | 入场动画 |
| `--t-slower` | 0.6s | 位移演示 |

缓动：`--ease`（标准）· `--ease-out`（出场减速）· `--ease-in`（入场加速）· `--ease-spring`（回弹）

### 2.5 层级（z-index）

| 令牌 | 值 | 用途 |
| :--- | :--- | :--- |
| `--z-bg` | -1 | 粒子背景 |
| `--z-canvas` | 1 | 登录页炸弹画布 |
| `--z-content` | 10 | 页面主体 |
| `--z-sticky` | 50 | 吸顶导航 |
| `--z-toast` | 1000 | Toast |
| `--z-overlay` | 1100 | 全屏覆盖层 |

### 2.6 栅格与断点

容器 `--container-max: 1100px`，内边距 `--container-pad: 24px`，栅格间距 `--gutter: 16px`。

| 断点 | 值 | 处理 |
| :--- | :--- | :--- |
| sm | 480px | 棋盘缩放、单列 |
| md | 768px | 主断点：图表/统计单列、导航精简 |
| lg | 1024px | 侧栏布局生效 |
| xl | 1280px | 容器留白加大 |

> 断点值以变量形式记录仅供文档参考，CSS 媒体查询仍需写字面量（CSS 变量不能用于 media query）。

---

## 3. 组件规范

组件样式在 `theme.css`（基础件）与 `components.css`（交互件），脚本在 `js/ui.js`。

### 3.1 按钮 `.btn`

| 变体 | 类名 | 用途 |
| :--- | :--- | :--- |
| 主要 | `.btn-primary` | 每页唯一的主行动 |
| 次要 | `.btn`（默认） | 并列操作 |
| 幽灵 | `.btn-ghost` | 弱化的取消/返回 |
| 危险 | `.btn-danger` | 删除、退出登录 |
| 尺寸 | `.btn-sm` / `.btn-block` | 紧凑 / 通栏 |

**五态**：默认 → hover（提亮 + 上移 1px）→ active（复位）→ disabled（透明度 0.55、禁用指针）→ loading（`.spinner` 替换文案）。

### 3.2 表单

- `.field` 容器 + `.input` 输入框；聚焦时边框转主色并加 3px 焦点环
- `.float-label` 浮动标签：聚焦或有内容时标签上浮缩小，靠 `:placeholder-shown` 判定，需 `placeholder=" "`
- 密码强度条 `.strength[data-score="0-4"]`：0 未输入 / 1 弱 / 2 中 / 3 较强 / 4 强

### 3.3 反馈类

| 组件 | 类名 | 说明 |
| :--- | :--- | :--- |
| Toast | `.toast.toast--{success\|error\|warning\|info}` | 右上角堆叠，点击即关，默认 3s |
| Spinner | `.spinner` | 按钮内联加载环 |
| 骨架屏 | `.skeleton` / `.skeleton-row` | 表格加载占位，带 shimmer |
| 徽章 | `.badge.badge-{user\|admin\|success\|danger}` | 角色与状态 |

### 3.4 容器与数据

- `.glass-card`：毛玻璃卡片，`::before` 顶部高光描边；`.glass-card--lift` 悬停上浮
- `.table-wrap` + `.table`：表头半透明底、行悬停高亮、圆角裁切
- `.stat-grid` + `.stat-card`：统计卡片（标签/数值/说明）
- `.chart-grid` + `.chart-box`：图表容器，≤768px 单列

---

## 4. 图标规范

- 来源：[Lucide](https://github.com/lucide-icons/lucide) `0.469.0`，ISC 许可
- 交付方式：32 个 SVG 内联进 `public/js/icons.js`（16 KB），**不下载 358 KB 的 UMD 包**
- 用法：`<i class="icon" data-icon="lock"></i>`，页面加载后自动渲染；动态插入需手动 `Icons.render(el)`
- 规则：尺寸 `1em` 跟随父级 `font-size`，颜色继承 `currentColor`，线宽统一 2px
- 装饰性图标容器加 `aria-hidden`；仅有图标的按钮必须带 `aria-label`

---

## 5. 无障碍规范

### 5.1 对比度（背景取 `--bg-0 #0b0b1a`）

| 前景 | 实测对比度 | 正文 ≥4.5 | 大字/图形 ≥3 |
| :--- | :--- | :--- | :--- |
| `--fg-strong` `#ffffff` | 19.50 : 1 | ✅ | ✅ |
| `--fg` `#e8eaf2` | 16.23 : 1 | ✅ | ✅ |
| `--c-warning` `#faad14` | 10.26 : 1 | ✅ | ✅ |
| `--c-success` `#52c41a` | 8.61 : 1 | ✅ | ✅ |
| `--c-primary-400` `#8b9df5` | 7.65 : 1 | ✅ | ✅ |
| `--fg-muted` | 7.74 : 1 | ✅ | ✅ |
| `--c-info` `#1890ff` | 6.01 : 1 | ✅ | ✅ |
| `--c-danger` `#ff4d4f` | 5.97 : 1 | ✅ | ✅ |
| `--c-primary` `#667eea` | 5.33 : 1 | ✅ | ✅ |
| `--fg-dim` | **3.57 : 1** | ⚠️ 不达标 | ✅ |
| `--c-admin` `#722ed1` | **2.81 : 1** | ⚠️ 不达标 | ⚠️ |

**两个已知限制（有意保留，非疏漏）**：

- `--fg-dim`（3.57:1）低于正文标准，因此**只用于非关键说明文字**（时间戳、辅助提示），不承载任何必须读取的信息。
- `--c-admin`（2.81:1）作为**文字色**不达标，因此管理员的角色徽章文字实际使用 `#c9a7f5`（浅紫，≈9:1），`--c-admin` 仅用于背景填充与描边。

> 数值由 `/design-system.html` 用 WCAG 2.1 公式实时计算（含半透明前景的 alpha 合成），可自行复核。

### 5.2 清单

- 所有交互元素可键盘聚焦，焦点环用 `--focus-ring-strong`（不直接删 `outline` 而不补偿）
- 表单控件与 `label` 通过 `for`/`id` 关联
- 状态不只靠颜色传达（徽章同时带文字与边框）
- `--fg-dim` 仅用于非关键说明文字，不承载必须读取的信息
- 文字色不得使用 `--c-admin`（对比度不足），管理员标识统一用浅紫 `#c9a7f5`
- 尊重 `prefers-reduced-motion`：开启后动效时长归零
- 表格用语义化 `thead`/`tbody`，扫雷格子带 `role="button"` 与 `aria-label`

---

## 6. 使用方式

```html
<link rel="stylesheet" href="/styles/theme.css">
<link rel="stylesheet" href="/styles/components.css">
<script src="/js/icons.js"></script>
<script src="/js/ui.js"></script>
```

`theme.css` 放在页面内联 `<style>` **之前**，页面内联样式优先，可按需覆盖。

| 文件 | 职责 |
| :--- | :--- |
| `public/styles/theme.css` | 设计令牌 + 基础组件（按钮/徽章/表单/表格/卡片） |
| `public/styles/components.css` | 交互组件（Toast/Spinner/骨架屏/强度条/浮动标签/统计卡/图表容器） |
| `public/js/icons.js` | Lucide 图标子集 |
| `public/js/ui.js` | `toast` / `withSpinner` / `renderSkeleton` / `scorePassword` / `formatDate` |
| `public/design-system.html` | 可视化规范一览 |
| `docs/DESIGN-SYSTEM.md` | 本文档 |

---

## 7. 约束与例外

- **离线优先**：所有第三方库内置在 `public/vendor/`，断网可用
- **无构建工具**：直接 `<script src>` / `<link>`，不使用打包器
- **扫雷棋盘已套暗色**：底盘 `#23263a`、格底 `#2e3250`，保留经典数字色相（蓝 1 / 绿 2 / 红 3 的通用约定），仅整体提亮一档 —— 统一与可玩性兼顾
- **UI.toast 一律用 textContent**：用户可控内容禁止 `innerHTML`，避免 XSS

---

## 8. 质感层与特效规范

### 8.1 质感三件套

| 手法 | 实现 | 位置 |
| :--- | :--- | :--- |
| 颗粒噪点 | 内联 SVG `feTurbulence` data-uri，`opacity: .035` + `mix-blend-mode: overlay`，消除大面积渐变的色带 | `body::before` |
| 漂移光斑 | 两个大半径 `radial-gradient` + `drift 40s` 缓动漂移 | `body::after` |
| 边缘光 | `.glass-card::after` 渐变描边，`mask-composite: exclude` 裁出 1px 环；高光跟随鼠标（`--mx/--my`） | `theme.css` |

阴影分层：`--sh-*` 由单层纯黑改为「环境黑 + 接触阴影 + 主色染色」三层；`--sh-inset` 改双边（顶边高光 + 底边暗部）制造玻璃厚度。

### 8.2 微交互

| 名称 | API | 说明 |
| :--- | :--- | :--- |
| 高光跟随 | `UI.pointerGlow('.glass-card')` | 写入 `--mx/--my`，仅 `(hover:hover)` 启用，rAF 节流 |
| 磁性按钮 | `UI.magneticButtons(sel, max)` | 指针位移映射为按钮位移，上限默认 8px，离开复位 |
| 错峰入场 | `UI.revealOnScroll('.reveal')` | IntersectionObserver + `--d` 索引，`transition-delay: calc(var(--d)*70ms)` |

> 入场动画用**独立的 `translate` 属性**而非 `transform`，避免与 hover 上浮的 `transform: translateY(-4px)` 互相覆盖。

### 8.3 爆炸特效：赛博能量爆

登录页 `public/login.html`，**纯自研 Canvas 2D，零外部依赖**。

| 要素 | 参数 |
| :--- | :--- |
| 双画布 | `#bgCanvas`（静态背景，仅 resize 重绘）+ `#gameCanvas`（特效层，每帧拖尾擦除） |
| 拖尾 | `destination-out` + `rgba(0,0,0,.22)` 覆盖，不碰背景层 |
| DPR | `min(devicePixelRatio, 2)` + `setTransform(dpr,…)`，高分屏不发虚 |
| deltaTime | `min(dt/16.667, 3)`，60Hz 与 144Hz 表现一致 |
| 粒子三层 | core 18 / shell 54 / spark 24，速度·阻尼·重力各不相同 |
| 色温演化 | 青 185° → 蓝紫 250° → 品红 310°，亮度 74% → 32%（余烬） |
| 辉光 | 预烘 24 张径向渐变 sprite + `globalCompositeOperation='lighter'`，**全程零 `shadowBlur`** |
| 流星 | 速度 > 6 的粒子改画短线拉伸 |
| 电弧 | 每次爆炸 2–4 条，6–9 段随机折线，存活 120–260ms |
| 冲击波 | 3 环（max 90 / 155 / 230），径向渐变 + 线宽随生命周期收细 |
| 色差 | 离屏拷贝 + `source-in` 染青/品红 + 左右错位叠加，`aberration` 指数衰减 |
| 过曝 | `#flash`（`pointer-events:none`）先过曝后回落；死亡层是「过曝 → 余烬 → 压暗」，而非直接压黑 |
| 震动 | JS 随机衰减 `amp *= 0.86^dt`，**只 transform `.login-wrapper`，不动 body**（body 有 transform 会让 `backdrop-filter` 每帧重算，是掉帧主因） |
| 降级 | `MAX_PARTICLES` 900（低端 400）；`LOW`（reduced-motion 或 ≤4 核）关拖尾、砍 spark、不震动；`prefers-reduced-motion` 直接不启动 rAF |
| 时序 | 炸弹按 x 从左到右依次引爆（`160 + rand(0,90)`ms 间隔）制造连锁感，再中心三连爆，最后弹死亡层 |

### 8.4 动效可访问性

新增 JS 动画**必须主动读 `prefers-reduced-motion`**。CSS 全局压制只对 CSS 动画生效，对 `requestAnimationFrame` 驱动的动画完全无效。

---

## 9. 变更记录

| 版本 | 变更 |
| :--- | :--- |
| v1.0 | 建立令牌体系、组件规范、图标规范、无障碍规范与可视化展示页 |
| v1.1 | 质感层（噪点 / 漂移光斑 / 边缘光 / 分层染色阴影）、微交互三件套、爆炸特效重写为赛博能量爆、扫雷棋盘套暗色、字号阶梯调至 1.25 倍率 |
