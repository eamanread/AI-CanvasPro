# 幻映工作台 交互设计方案（覆盖层三步走）

日期：2026-06-11
版本：v1.1（2026-06-12 更新实施状态）

> **实施状态（2026-06-12）**：三步已全部落地于 `styles/theme-upgrade.css`（[S1]/[S2]/[S3] 分区）+ `index.html`（移除 Google Fonts、自托管字体预加载、空画布快捷键提示条）。字体文件位于 `assets/fonts/`（Geist VF 29KB + JetBrains Mono VF 40KB）。回滚基线 tag：`ui-upgrade-baseline`。
> 与原方案的偏差：① 初始加载器 gooey 双球与 SVG 渐变属计划外发现的紫色渐变源，已一并收编为 accent 同色相；② 3.1 助手卡片因渲染层已输出 `data-card-type`/`data-status` 钩子，降为纯 CSS 实现（零 JS 改动，121 项面板契约测试全绿）；③ 3.3 顶栏状态簇因保存态/队列信号位于混淆代码，本轮只落地断连告警 chip 化 + 头部层级打磨，完整状态簇记为已知边界。
> 测试基线：全量 2268 用例中 47 个失败均经 stash 基线对照确认为历史遗留（44+ 个在 output/upstream 快照、3 个为适配器/hover 预览逻辑断言），与本次改动无关。
模式：设计方案文档，未改动任何实现代码。
方法依据：taste-skill 合集之 `redesign-existing-projects`（审计框架与修复优先级）+ `high-end-visual-design`（高端视觉与动效编舞规格，Ethereal Glass 原型作高密度工具化适配）。
词汇依据：完全复用 [02-design-system.md](02-design-system.md) 的令牌命名与状态词汇，不另立体系。
代码依据：所有选择器、keyframes、时长数据均采集自运行时实际加载的 `style.css`（291KB bundle + 追加补丁行）、5 个独立链接的 feature CSS、`index.html`。

---

## 0. 设计定调与落地机制

### 0.1 设计方向

承接 02 号文档的「Dark Creative Workbench」人格：专业、冷静、技术感、媒体工作站。本方案在此之上明确视觉原型为 **Ethereal Glass 的工具化变体**——OLED 深黑底、白色发丝线（hairline）描边、玻璃材质仅用于固定浮层、弹性微动效——但剔除一切营销页手法（大留白、滚动入场、巨型字号均不适用于高密度创作工具）。

升级的本质是**提纯**而非换皮：现有深色玻璃拟态底子保留，杀掉「AI 通用脸」指纹（Inter、蓝紫渐变、瞬时跳变、零按压感），把已有但散乱的动效资产收敛成一套有纪律的系统。

### 0.2 覆盖层机制（铁律）

所有 CSS 改动集中在**一个新文件**：

```
styles/theme-upgrade.css
```

在 `index.html` 中 link 于 `style.css` **之后**（同特异性下 cascade 必胜）：

```html
<link rel="stylesheet" href="style.css">
<link rel="stylesheet" href="./styles/theme-upgrade.css">  <!-- 新增，置于最后 -->
```

**不可触碰区：**

| 目标 | 原因 |
|---|---|
| `style.css` 第 1 行（291KB bundle） | 不可读 diff，改坏无法回滚定位 |
| `main.js`、`components/*.js` 节点类、`src/core/`、`modules/interaction/` | 混淆代码 |
| `styles/layout.css`、`node-base.css`、`node-types.css`、`v2.css`、`settings.css`、`variables.css` | **死副本**——未被 index.html 引用，运行时不加载，已与 bundle 漂移；改了不生效 |

**命名规则：** 语义令牌沿用 02 号文档名称（`--accent-primary`、`--ease-standard`、`--z-popover`…）；新增工具类一律 `.hy-` 前缀（`.hy-skeleton`、`.hy-pop-in`…），避免与既有 2172 个选择器撞名。

**回滚：** 整体回滚 = 删除一行 link；单项回滚 = 删除 theme-upgrade.css 内对应注释区块。每步开工前打 git tag（本仓库 git 历史有损坏迹象，多一道保险）。

---

## 第 1 步 · 风格跃迁（纯 CSS）

> redesign skill 修复优先级 #1 字体、#2 色彩——最大视觉收益、最低风险。

### 1.1 字体系统

**现状证据：** `body{font-family:Inter,-apple-system,...}`，全库 49 处 `font-family` 中仅 7 处显式声明 Inter，其余 `inherit`——替换成本极低。Inter 经 Google Fonts 远程加载，本地工具断网即回退。

**目标令牌：**

```css
:root {
  --font-ui: "Geist", "MiSans", "HarmonyOS Sans SC", "PingFang SC",
             "Microsoft YaHei UI", "Segoe UI", sans-serif;
  --font-mono: "JetBrains Mono", "IBM Plex Mono", Consolas, monospace;
}
```

**中文适配（两个 taste skill 都未覆盖的本地化关键点）：** Geist 只覆盖拉丁字符，幻映是 zh-CN 界面，中文字形由栈中 CJK 字体接管。分两期：

- **一期（零体积）：** 中文走系统栈 `"Microsoft YaHei UI"`（Win11 渲染品质可接受），仅自托管 Geist Variable（约 60KB woff2）+ JetBrains Mono（约 90KB，仅 Regular/Medium 两轴）。
- **二期（可选）：** 自托管 MiSans VF（免费商用授权），用 `pyftsubset` 按界面实际用字裁剪，控制在 1–2MB 内。

**落地写法（theme-upgrade.css）：**

```css
@font-face {
  font-family: "Geist";
  src: url("../assets/fonts/GeistVF.woff2") format("woff2");
  font-weight: 100 900;
  font-display: swap;
}
@font-face {
  font-family: "JetBrains Mono";
  src: url("../assets/fonts/JetBrainsMono.woff2") format("woff2");
  font-weight: 400 600;
  font-display: swap;
}
body { font-family: var(--font-ui); }
/* 覆盖 bundle 内 6 处显式 Inter 声明：实施时按实际选择器逐条复写 */
```

**index.html 改动：** 删除 Google Fonts 的 `preconnect` + `css2` 两行 link，新增字体 `<link rel="preload" as="font">`。

**数字规格：** 所有计数、百分比、时长、任务 ID 用 `--font-mono` + `font-variant-numeric: tabular-nums`。已有正确先例 `.storyboard-script-selection-count`，推广到：缩放百分比（`.zoom-*` 控件）、生成队列计数、分镜时长列、设置页快捷键标签。

**字重纪律：** 现状大量 `font-weight: 700/800`（粗体当层级用）。新规：正文 400、强调 500、控件标签与面板标题 600、`800` 仅保留给 Beta 徽标等极小场景。覆盖层对主要标题类逐条降重。

### 1.2 色彩收敛

**主 accent 接管。** 02 号文档已锁定 `#5a96ff`。建立语义层并接管交互色：

```css
:root {
  --accent-primary: #5a96ff;
  --accent-primary-soft: rgba(90, 150, 255, 0.14);
  --accent-primary-border: rgba(90, 150, 255, 0.36);
  --border-focus: rgba(90, 150, 255, 0.78);
  /* 旧令牌重定向：选择/聚焦/运行态全部归一 */
  --blue: var(--accent-primary);
  --blue-border-focus: var(--border-focus);
  --conn-hover: rgba(90, 150, 255, 0.9);
}
```

**渐变处死清单**（redesign skill 点名的「AI 指纹」）：

| 现值 | 处置 |
|---|---|
| `--brand-gradient: linear-gradient(135deg, var(--blue), var(--purple))` | → 纯色 `var(--accent-primary)` |
| `--indigo-gradient: linear-gradient(135deg, var(--indigo), var(--purple))` | → 纯色 `var(--accent-primary)` |
| `--green-btn: linear-gradient(135deg, #059669, #10b981)` | → 纯色 `var(--state-success)` |

**语义色统一**（02 §3.2）：`--state-success: #22c98b`、`--state-warning: #f4b740`、`--state-danger: #f05b5b`，重定向旧 `--red/--gold/--green` 引用面。

**节点类型色降饱和**（02 §10.2，类型色是功能编码、保留但减音量）：

| 节点 | 现值 | 新值（降饱和参考，实施时可微调） |
|---|---|---|
| 文本 | `--blue #3b82f6` | 跟随 `--accent-primary` |
| 图像 | `--cyan #06b6d4` | `#4cc3dd` |
| 视频 | `--indigo #6366f1` | `#7d8cf0`（与主 accent 拉开明度差） |
| 音频 | `--green #10b981` | `#3fbf9f` |
| 分镜 | `--gold #f59e0b` | `#d9a23f` |
| 全景 | — | 中性 `--group-slate` 系 |
| 紫/品红 | `--purple/--fuchsia` | 仅向后兼容保留，新代码禁用 |

类型色**永不覆盖** selected / focus / error / running 语义。

### 1.3 表面与材质

**双层 Bezel（high-end skill §4.A，仅用于浮层，不上节点）。** 模态框做「玻璃板嵌铝盘」式双层结构——外层薄底+发丝边+内层独立底色+顶部内高光：

```css
.save-dialog, .about-dialog, .dreamina-login-modal {
  background: var(--surface-popover);
  border: 1px solid var(--border-subtle);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.06),   /* 顶部内高光，模拟边缘折射 */
    0 24px 80px rgba(8, 12, 24, 0.6);           /* 染色外阴影 */
}
```

应用面：`.save-dialog`、`.about-dialog`、`.dreamina-login-modal`、设置浮层、`.canvas-proj-dropdown`。**禁止**应用于 `.v2-node`（数量级 ×N 的渲染成本，02 §16 红线）。

**同心圆角公式：** 嵌套容器内层半径 = 外层半径 − 内边距（`border-radius: calc(var(--radius-16) - var(--space-6))`），消除「内方外圆」的廉价感。

**阴影染色：** 全部纯黑阴影 `rgba(0,0,0,*)` 染为蓝黑 `rgba(8, 12, 24, *)`，与 `--bg: #080809` 同族。重定向 `--shadow-dialog`、`--shadow-menu`、`--shadow-toolbar`、`--shadow-popover`、`--shadow-surface` 五个令牌即可全局生效。

**玻璃纪律：** `backdrop-filter` 仅允许出现在 fixed/绝对定位浮层（模态、菜单、全屏面板）；任何随画布缩放/滚动的容器禁用（现有 `--blur-*` 令牌用量审计后保留合规项）。

**噪点（可选项）：** 仅在模态面板伪元素上叠加 `opacity: 0.02` 的噪点纹理打破数字平面感；**不上画布、不上全屏**（02 §16 禁区）。

### 1.4 z-index 治理

落地 02 §7.2 梯度（`--z-canvas: 0` → `--z-critical-alert: 1100`）。策略：**新代码一律用变量；旧 999/9999 不做批量替换**（行为风险大于收益），仅在出现层级冲突时逐处治理并记录。

### 1.5 圆角制度

沿用 02 §6：输入与小按钮 8–10px、工具栏按钮 10–12px、节点 14–16px、面板与模态 18–22px、胶囊 999px 仅限状态 chip 与头像。现有 `--radius-*` 梯度已够用，不新增值，只在覆盖层修正违例（如模态内按钮用了 999px 胶囊的场景）。

### 1.6 第 1 步验收

- [ ] 断网启动应用，字体正常渲染（无 Google Fonts 请求）
- [ ] 全界面无蓝紫渐变残留（DevTools 搜索 `linear-gradient(135deg` 验证三个令牌）
- [ ] 选中、聚焦、运行三态颜色一致为 `--accent-primary`
- [ ] 10 个基准面截图对比（见「验证与发布」），节点功能区无布局破坏
- [ ] `node --test` 全绿（或失败项与改动无关并记录）

---

## 第 2 步 · 交互手感（纯 CSS）

> 针对体检发现的核心病灶：全库 `:active` 仅 12 处、`:focus-visible` 仅 8 处、2172 个选择器只有 162 处 transition——「交互差点意思」的直接来源。

### 2.1 动效令牌

```css
:root {
  --ease-standard: cubic-bezier(0.16, 1, 0.3, 1);   /* 02 §8.1，出场快收尾柔 */
  --ease-exit: cubic-bezier(0.7, 0, 0.84, 0);
  --ease-spring: cubic-bezier(0.34, 1.56, 0.64, 1); /* 既有资产，27 处在用，保留为弹性曲线 */
  --duration-hover: 120ms;
  --duration-control: 160ms;
  --duration-popover: 180ms;
  --duration-panel: 240ms;
}
```

现状主流时长 .15s/.2s 与令牌档位天然对齐，覆盖成本低。**新代码禁用 `linear` 与 `ease-in-out`**（high-end skill 禁令；现存 `cubic-bezier(.45,.05,.55,.95)` 即 ease-in-out 同款，逐步替换）。

### 2.2 按压反馈（最高优先）

全局按压规格——`scale(0.97)` 模拟物理下压，110ms 快速响应：

```css
:where(.ftb-btn, .side-plus-btn, .prompt-attachment-btn, .img-gen-btn,
       .prompt-submit, .v2-expand-toolbar-btn, .sidebar-btn-v3, .sidebar-btn,
       .sidebar-canvas-btn, .zoom-btn, .pill-btn, .img-pill-btn, .fab-btn,
       .cc-btn, .ai-start-btn, .settings-save-btn, .save-dialog-confirm,
       .save-dialog-cancel, .cpd-new-btn, .add-btn-v3, .update-banner-btn,
       .storyboard-script-view-btn, .storyboard-script-queue-btn,
       .cursor-size-btn, .v2-align-center-btn):active:not(:disabled,[disabled]) {
  transform: scale(0.97);
  transition-duration: 80ms;
}
```

选择器清单采集自 bundle 实际类名（`.ftb-btn` 62 处引用居首）。`:where()` 保持零特异性，不与既有规则打架；个别按钮已有自身 `:active` transform 的（如 `.img-gen-btn`）以既有为准、不重复叠加。**例外：** 画布节点本体、连接桩不加按压缩放（与拖拽手势冲突）。

### 2.3 焦点系统

```css
:where(button, [role="button"], input, select, textarea, [tabindex]):focus-visible {
  outline: 2px solid var(--border-focus);
  outline-offset: 2px;
  border-radius: inherit;
}
```

要点：用 `:focus-visible` 而非 `:focus`——鼠标点击不出环、键盘导航必出环，兼顾画布工具的视觉洁净与可达性。现存大量 `outline: 0` 的高特异性规则若压制此环，逐处以更具体选择器补写，不用 `!important` 开先例。

### 2.4 过渡标准化

**属性白名单：** `background-color / color / border-color / box-shadow / transform / opacity`。禁止 transition `all`（新代码）与任何布局属性（`top/left/width/height`）。

分组覆盖（不做 `* { transition }` 这种危险全局）：

```css
:where(/* 2.2 节按钮清单 */) {
  transition: background-color var(--duration-hover) var(--ease-standard),
              color var(--duration-hover) var(--ease-standard),
              border-color var(--duration-hover) var(--ease-standard),
              transform var(--duration-control) var(--ease-standard);
}
```

**画布性能红线（02 §16 + high-end skill §6）：**
- `.v2-node` 禁止新增 `box-shadow` / `filter` / `backdrop-filter` 动画；
- `body.is-panning`、`body.is-zooming`（及现有 zoom-low 降级态）期间通过覆盖层关停节点阴影过渡；
- 动画属性只允许 `transform` + `opacity`；
- `will-change` 仅限正在动画的浮层元素，禁止常驻。

### 2.5 弹层编舞

现状 45 个 keyframes 中入场动画七零八落（`menuPop`、`v2MenuPop`、`menuSlideUp`、`menuFloatUp`、`aboutSlideIn`、`slideInModal`…）。收敛为一套规格：

```css
@keyframes hy-pop-in {
  from { opacity: 0; transform: scale(0.96) translateY(4px); }
  to   { opacity: 1; transform: scale(1) translateY(0); }
}
.hy-pop-in { animation: hy-pop-in var(--duration-popover) var(--ease-standard); }
```

- **入场** 180ms `--ease-standard`；**退场** 120ms `--ease-exit`（出比进快，是「手感」的关键细节）；
- `transform-origin` 按出现方位设置（自按钮下方弹出则 `top left`），动效从触发点生长而非凭空出现；
- **应用面**（bundle 实际类名）：`.add-menu`、`.node-add-menu`、`.floating-menu`、`.avatar-menu`、`.canvas-proj-dropdown`、`.at-mention-menu`、`.batch-menu`、`.gt-color-menu`、`.panorama-capture-menu`、右键上下文菜单（实施时以 DevTools 确认运行时类名）、设置浮层、`.save-dialog`、`.about-dialog`；
- **模态双段**：overlay 背板 fade 160ms，面板 `hy-pop-in` 延迟 40ms 跟进，产生纵深；
- **菜单项级联**（可选增强，high-end skill §5.A 的 stagger 收敛版）：`:nth-child(1..8)` each +14ms 入场延迟，超过 8 项不再递增（避免长菜单等待感）。

### 2.6 加载与骨架

现有优质资产直接推广：`storyboard-script-loading-sweep`（扫光进度带）与 `placeholderShimmer` 升级为通用类：

```css
.hy-skeleton {
  position: relative; overflow: hidden;
  background: var(--white-04); border-radius: var(--radius-8);
}
.hy-skeleton::after {
  content: ""; position: absolute; inset: 0; transform: translateX(-100%);
  background: linear-gradient(90deg, transparent, var(--white-06), transparent);
  animation: hy-shimmer 1.2s var(--ease-standard) infinite;
}
@keyframes hy-shimmer { to { transform: translateX(100%); } }
```

- 生成中的结果区：形状匹配的骨架（图像区 = 图像比例块、文本区 = 行条），替换纯转圈（02 §18 禁「spinner-only」）；
- 提交按钮 running 态：保留现有 `prompt-submit-spin`，新增 stopping 态视觉（降饱和 + 脉冲减速）；
- spinner 仅保留给时长不可知的小型内联场景。

### 2.7 Toast 与 Tooltip

- Toast：对齐 `v2ToastIn/Out` 到动效令牌（入场 240ms `--ease-spring` 弹入 + translateY(8px)，退场 160ms `--ease-exit`）；错误 toast 文案规范遵循 02 §14（直接、给下一步动作、无「Oops」无感叹号）。
- Tooltip：120ms 入场 fade + 4px 位移；同组连续 hover 不重复播放延迟（CSS 层面以短 `transition-delay` 近似）。

### 2.8 滚动条、选区与插入符

```css
::-webkit-scrollbar { width: 10px; height: 10px; }
::-webkit-scrollbar-thumb {
  background: var(--white-10); border: 3px solid transparent;
  background-clip: content-box; border-radius: 999px;
}
::-webkit-scrollbar-thumb:hover { background-color: var(--white-20); }
::selection { background: var(--accent-primary-soft); }
input, textarea, [contenteditable] { caret-color: var(--accent-primary); }
```

### 2.9 reduced-motion

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
  /* 豁免：表意性进度动画降速保留，不消失 */
  .hy-skeleton::after, .storyboard-script-loading-bar-fill {
    animation-duration: 2.4s !important;
    animation-iteration-count: infinite !important;
  }
}
```

### 2.10 第 2 步验收

- [ ] 键盘 Tab 走查：顶栏 → 侧栏 → 画布控件 → 设置 → 模态，焦点环全程可见
- [ ] 所有 2.2 清单按钮有按压反馈；禁用态无反馈
- [ ] 所有 2.5 清单弹层入场/退场符合规格，origin 正确
- [ ] 500 节点画布 pan/zoom 帧率与基线无回退（DevTools Performance 抽查）
- [ ] 系统开启「减少动态效果」后界面可用、进度仍可感知
- [ ] `node --test` + Playwright 截图对比通过

---

## 第 3 步 · 可读 JS 小改（每项独立评审、独立提交）

**前置——可改文件白名单（逐个实测可读）：** `modules/app/appTopbarAndConfig.js`、`modules/app/appAssistantPanel.js`、`modules/promptPanelDock.js`、`components/aigenImage/uiModule.js`、`index.html` 静态结构。
**禁区（实测混淆）：** `modules/interaction/DragController.js`、`ZoomController.js`、`components/sharedPromptPanel.js`、`shared/nodeModelMenu.js`、`nodeToolbar/buttonFactory.js`、`AssetManager.js` 及全部节点组件类。

### 3.1 助手面板卡片分型

**文件：** [appAssistantPanel.js](../../modules/app/appAssistantPanel.js)（3864 行，可读，自带 `appAssistantPanel.p1Ui.test.js` 测试）
**规格（02 §13 七类卡）：** message / action-preview / confirmation / execution / trace / result / error。视觉编码：

- 容器 `.hy-card .hy-card--<type>`，左侧 2px 类型色条（preview = accent、confirmation = warning、error = danger、result = success、trace = 中性）；
- 卡头：类型图标 + 标题（600 字重）+ 时间戳（`--font-mono`）；
- trace 卡默认折叠，展开走 `grid-template-rows: 0fr → 1fr` 过渡（不动 height）；
- error 卡必带动作行：重试 / 复制详情 / 检查；
- **建议与已执行动作必须可视区分**（preview 卡虚线边框 vs execution 卡实线 + 进度带）。

**红线：** 只改渲染层 class 与模板字符串，**不碰动作执行语义**；改动以 `p1Ui.test.js` 全绿为门。

### 3.2 空画布起步态

**文件：** `index.html` 静态结构（`.empty-hint` / `.empty-hint-main`）+ theme-upgrade.css
**规格（02 §14 + redesign skill「打破居中对称」）：** 从装饰性欢迎语升级为功能起步面板——左对齐标题区 + 五个起步动作（建文本节点 / 建图像节点 / 建视频节点 / 导入资产 / 打开助手），动作按钮带键盘快捷键提示（`--font-mono` 小标签）。基调冷静、功能性，不做插画堆砌。
**风险：** 低——空态按钮的点击行为已存在（绑定在既有 id 上），只动结构与样式，不动事件。

### 3.3 顶栏状态层级

**文件：** [appTopbarAndConfig.js](../../modules/app/appTopbarAndConfig.js)（可读）
**规格：** 把分散的全局状态收为顶栏右侧状态簇：保存态（已保存 / 未保存圆点）、本地服务连接态（沿用现有断连告警，常态化为静默 chip）、生成队列计数（`--font-mono`）。chip 统一 28px 高、`--radius-8`、`--surface-node` 底。
**风险：** 中——需理清该文件现有 DOM 注入点；先做只读 spike 确认结构再动手。

### 3.4 弹层 origin 增强（可选）

**文件：** 新建 `modules/uiPolish.js`（仿 `promptPanelDock.js` 的可读新模块先例，main.js 首行 import 即此模式）
**规格：** 为 2.5 节的弹层按触发位置写入 `transform-origin` 内联变量；为模态补焦点返还（关闭后焦点回触发按钮，02 §9.4）。仅加 listener、不改既有事件流。
**风险：** 中——任何新 JS 都要避开画布 pointer 事件链；只挂在浮层生命周期上。

---

## 验证与发布

**每步固定流程：** `启动项目.bat`（端口 8777）→ Playwright 截取 10 个基准面（空画布 / 项目下拉 / 加节点菜单 / 设置浮层 / 图像节点 / 文本节点 / 视频节点 / 助手面板 / 带引用的提示面板 / 断连态）→ 与上一基线对比 → `node --test` → pan/zoom 性能抽查。基线截图存 `docs/ui-upgrade/baseline-screens/`。

**性能预算：** 画布 pan/zoom 不低于改动前帧率；`.v2-node` 上零新增 blur/阴影动画；theme-upgrade.css 体积 < 40KB；自托管字体一期 < 200KB。

**与 03 号实施计划的关系：** 本方案 = [03-implementation-plan.md](03-implementation-plan.md) 的可行性修正版——Phase 2/3 的 CSS 子集（第 1、2 步覆盖）+ Phase 6 卡片化（第 3.1 节），**替代** Phase 4/5/7 中触碰混淆文件的部分（经逐文件实测，那些 likely-files 大半不可改，相应目标降级为本方案的 CSS-only 实现）。

**体量预估：** 第 1 步约 1 个工作日；第 2 步约 1–2 个工作日；第 3 步每项 0.5–1 个工作日，按需启动。

---

## 附录 A · 落地映射总表

| 改动点 | 目标选择器 / 令牌 | 步骤 |
|---|---|---|
| 字体替换 | `body` + 6 处显式 Inter 声明 | 1.1 |
| 数字等宽 | `.zoom-*`、队列计数、`.storyboard-script-duration`、快捷键标签 | 1.1 |
| accent 接管 | `--blue`、`--blue-border-focus`、`--conn-hover` 重定向 | 1.2 |
| 渐变处死 | `--brand-gradient`、`--indigo-gradient`、`--green-btn` | 1.2 |
| 阴影染色 | `--shadow-dialog/menu/toolbar/popover/surface` | 1.3 |
| 双层 Bezel | `.save-dialog`、`.about-dialog`、`.dreamina-login-modal`、设置浮层、`.canvas-proj-dropdown` | 1.3 |
| 按压反馈 | 2.2 节 25 类按钮清单 | 2.2 |
| 焦点环 | 全局 `:focus-visible` | 2.3 |
| 弹层编舞 | 2.5 节 13 个浮层面 | 2.5 |
| 骨架加载 | `.hy-skeleton` 推广至各节点结果区 | 2.6 |
| 助手卡片 | `appAssistantPanel.js` 渲染层 | 3.1 |
| 空画布 | `.empty-hint` 结构 | 3.2 |
| 顶栏状态簇 | `appTopbarAndConfig.js` | 3.3 |

## 附录 B · 禁用清单（合并自两个 taste skill + 02 §18）

- Inter / Roboto / Arial 字体（已替换后不得回流）
- 蓝紫「AI 渐变」作默认装饰
- `linear` / `ease-in-out` 缓动（新代码）
- 无过渡的瞬时状态切换
- `.v2-node` 上的 blur / 重阴影 / 无限循环动画
- 动画 `top/left/width/height` 布局属性
- 纯黑 `rgba(0,0,0,*)` 新阴影（一律染蓝黑）
- spinner-only 的生成任务加载态
- `outline: 0` 且无替代焦点指示
- 任意 `z-index: 9999` 递增
- 「Oops」式文案、成功提示感叹号
- 直接修改 `style.css` 第 1 行 bundle 或 `styles/` 死副本
