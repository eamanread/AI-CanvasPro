# 幻映工作台 · liblib（LibTV）对标实施方案

日期：2026-06-12
版本：v1.0
模式：实施方案文档，未改动实现代码。批准后按阶段执行。
前序：[04-interaction-design-spec.md](04-interaction-design-spec.md)（三步走已落地，本方案是其上的 [S4] 演进）
证据档案：本仓库 `tmp/liblib-*.png`、`tmp/crop-*.png`（liblib 全分辨率截图与关键区域裁剪），以及 2026-06-12 会话对 liblib.tv 画布的 DOM/计算样式一手采证。

---

## 0. 总纲

### 0.1 对标对象的技术画像（采证结论）

LibTV 画布 = React + React Flow + Tailwind v4 + Mantine。**节点为 DOM 元素，连线为 SVG path**——与幻映同类，视觉层可像素级对标。

### 0.2 五个已实证的同构点（本方案的地基）

| # | liblib | 幻映现状 | 实证方式 |
|---|---|---|---|
| 1 | 节点标题悬浮于卡片上方（13px 弱化标签） | `.node-label` 已是 `bottom: calc(100% + 8px)` 悬浮标签（21px） | bundle 规则 |
| 2 | 连线 2px + 20px 命中区 + 200ms 过渡 | `.connection-main`（2px + .2s 过渡）+ `.connection-bg`（20px 命中区）**完全同构** | bundle 规则 |
| 3 | 外壳为悬浮岛（无常驻侧栏） | `.header/.sidebar-floating/.canvas-controls-floating` 全部 fixed 纯 CSS 定位 | 8779 运行时注入 CSS 实测重排成功 |
| 4 | 加节点菜单：图标+标签+描述+徽章 | `#nodeMenu` 为 index.html 静态结构，可直接重写 | index.html |
| 5 | 提示面板选中才出现 | `.text-prompt-panel` 默认隐藏、selected/connecting 出现 | bundle 规则 |

### 0.3 机制铁律（沿用已验证的覆盖层）

- 所有 CSS 集中于 `styles/theme-upgrade.css` 新增 **[S4] liblib 对标** 分区（排在 [S1]–[S3] 之后，同特异性自然胜出）。
- index.html 仅允许**增量**修改（保留所有既有 id/class/data-type 绑定——空画布提示条已验证此模式安全）。
- 不碰混淆 JS、不碰 style.css bundle 行、不碰 styles/ 死副本。
- 开工前打 tag：`ui-liblib-baseline`（保存 S1–S3 完成态）；整体回滚 = 删除 [S4] 区块。

### 0.4 一个全局设计决策（需要确认或默认执行）

liblib 的选中/控制语言是**中性灰白**，彩色仅作信息强调。本方案默认采用：

- 选中环/手柄/工具条 → 中性灰白（`#a8a8a8` 线框语言）
- `--accent-primary: #5a96ff` **只保留给运行中（running/generating）状态与焦点环**——这恰好也是 liblib 蓝色（#1880ff）的用法，两边哲学统一
- S1 阶段的"accent 接管选中态"相应被 [S4] 覆盖

---

## 阶段 ①：表面体系对齐（纯 CSS，预计 0.5–1 天）

> 目标：从"深色玻璃拟态"切换到 liblib 的"实色四级灰、近零阴影"体系。必须整阶段一次落地，避免半透明与实色混搭的违和中间态。

### 1.1 四级灰令牌接管

```css
/* [S4.1] 表面体系: liblib 四级灰 (#141414 → #171717 → #262626 → #363636) */
:root {
  --bg: #141414;                                   /* 画布底（原 #080809） */
  --surface-node: #171717;                          /* 节点卡实色化（原 white 5%） */
  --bg-elevated: #1c1c1c;
  --surface-float: #262626;                         /* 浮层 */
  --surface-menu: #262626;
  --surface-glass: rgba(38, 38, 38, 0.92);
  --surface-banner: #262626;
  --surface-quote: #262626;
  --surface-save-dialog: #262626;
  --bg-panel: #262626;
  --bg-panel-solid: #262626;
  --bg-dropdown: #262626;
  --bg-context-menu: #262626;
  --about-dialog-bg: #262626;
  --stroke-default: #363636;                        /* 实色描边（原 white 8%） */
  --stroke-08: #2e2e2e;
  --stroke-10: #363636;
  --stroke-12: #3d3d3d;
  --border: #2e2e2e;
  --fill-hover: rgba(255, 255, 255, 0.06);
  --fill-hover-strong: #363636;                     /* hover 实色化 */
  --sidebar-pill-bg: #1c1c1e;                       /* 工具坞底（②阶段再调透明度） */
  --text-1: #f7f7f7;
  --text-primary: rgba(247, 247, 247, 0.95);
}
```

注意：`--white-NN`/`--black-NN` 原语令牌**不动**（引用面太广），只接管语义层。

### 1.2 去阴影化

```css
/* [S4.1] 近零阴影: liblib 全站仅一档极轻阴影 */
:root {
  --shadow-dialog: 0 4px 10px rgba(0, 0, 0, 0.08);
  --shadow-menu: 0 4px 10px rgba(0, 0, 0, 0.08);
  --shadow-toolbar: 0 4px 10px rgba(0, 0, 0, 0.08);
  --shadow-popover: 0 4px 10px rgba(0, 0, 0, 0.08);
  --shadow-surface: 0 4px 10px rgba(0, 0, 0, 0.08);
  --shadow-surface-strong: 0 6px 16px rgba(0, 0, 0, 0.12);
  --shadow-banner: 0 4px 10px rgba(0, 0, 0, 0.08);
  --shadow-save-dialog: 0 4px 10px rgba(0, 0, 0, 0.08);
  --shadow-quote: 0 4px 10px rgba(0, 0, 0, 0.08);
}
```

同时撤销 [S1.3] 的双层 Bezel 内高光（liblib 无内高光）：对五个模态选择器补 `box-shadow: 0 4px 10px rgba(0,0,0,.08)` 平覆盖。

### 1.3 选中与连线的中性化

```css
/* [S4.1] 中性选中语言 + 连线灰蓝 */
:root {
  --conn-color: #86909C;                            /* 常态连线（原 white 50%） */
  --conn-hover: #b8c0cc;                            /* hover 提亮而非变蓝 */
  --stroke-multi-select-box: rgba(168, 168, 168, 0.9);
}
.connection-main { stroke: #86909C; }
/* 选中环: 实施时枚举 bundle 内全部 .selected 相关 inset box-shadow 规则逐条覆盖, 已知首批: */
.v2-node.selected .storyboard-script-node::after,
.v2-node.v2-selected .storyboard-script-node::after {
  box-shadow: inset 0 0 0 1px rgba(168, 168, 168, 0.9);
}
```

accent 收口：`--state-running`、`--border-focus`、进度扫光保持 `#5a96ff` 系不变；S1 中重定向到 accent 的 `--blue` 保持（蓝色信息语义仍存在，如快捷键分类标题）。

### 1.4 圆角对标

```css
:root { --node-r: 12px; --radius-lg: 16px; }
.v2-node { border-radius: 12px; }                  /* 原 16px */
```

浮层统一 16px（加节点菜单/右键菜单/下拉），小控件 8–10px 不变。

### 1.5 验收

- [ ] 截图对比 `tmp/crop-*.png`：画布底/节点卡/浮层/描边四级灰肉眼一致
- [ ] 选中节点 → 灰白线框环；运行态 → 仍是 accent 蓝
- [ ] 连线常态 `#86909C`、hover 提亮过渡 200ms
- [ ] `node --test` 全绿（对照已知遗留失败清单）

---

## 阶段 ②：外壳三岛重排（CSS 为主，预计 1 天含回归）

> 目标：左侧竖栏 → 底部中央工具坞；全宽顶栏 → 悬浮胶囊；缩放/小地图 → 左下低调簇。骨架 CSS 已在 8779 实测可行，本阶段的工作量在**细节与回归**。

### 2.1 顶栏 → 悬浮胶囊（对标 crop-topnav.png）

```css
/* [S4.2] 顶栏: 悬浮胶囊, 距顶 10px, 高 44 */
.header {
  top: 10px; left: 50%; right: auto;
  transform: translateX(-50%);
  width: max-content; max-width: calc(100vw - 32px);
  height: 44px; padding: 0 8px 0 14px; gap: 16px;
  background: rgba(23, 23, 23, 0.85);
  border: 1px solid #363636; border-radius: 999px;
  backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px);
}
.logo-title { font-size: 14px; font-weight: 600; }
.project-name { background: #171717; border: 1px solid #2e2e2e; border-radius: 999px; padding: 4px 12px; }
.canvas-tab-* { /* 胶囊化, 实施时按运行时类名细调 */ }
```

注意 `.header` 原为 `left:0;right:0` 撑满 + `--header-left-coverage:90%`——胶囊化后顶栏不再承担全宽点击屏障，需真机确认无依赖（header 是 `pointer-events` 分区的，运行时验证）。

### 2.2 侧栏 → 底部中央工具坞（对标 crop-dock.png）

```css
/* [S4.2] 工具坞: 底部中央横排, "+" 主入口强调 */
.sidebar-floating {
  left: 50%; top: auto; bottom: 14px;
  transform: translateX(-50%);
  flex-direction: row; align-items: center;
  padding: 5px 8px; gap: 4px;
  background: rgba(38, 38, 38, 0.8);
  border: 1px solid #363636; border-radius: 12px;
}
.sidebar-floating .sidebar-flex-spacer { display: none; }
.sidebar-floating .sidebar-sep-v3 { width: 1px; height: 24px; margin: 0 4px; }
.add-btn-v3 {                                       /* 对标 liblib "+" 白描边主入口 */
  border: 1.5px solid rgba(255, 255, 255, 0.85);
  border-radius: 10px;
}
```

**内嵌下拉开向翻转**（本阶段核心风险点）：

```css
/* 项目下拉与头像菜单原向下/向右开, 坞在底部后必须向上开 */
.canvas-proj-dropdown { top: auto; bottom: calc(100% + 10px); }
.avatar-menu { top: auto; bottom: calc(100% + 10px); }
```

风险：若混淆 JS 以 JS 计算这两个菜单位置（而非纯 CSS anchor），翻转规则可能被内联样式压制。**回退预案 A**：对菜单加 `!important` 翻转；**回退预案 B**：若 JS 定位不可压制，侧栏保持左侧仅换肤（放弃本小节，其余照旧）。

### 2.3 左下控件簇（对标 crop-bottomleft.png）

```css
/* [S4.2] 左下簇: 无底色低调控件 */
.canvas-controls-floating {
  left: 16px; right: auto; bottom: 14px;
  background: transparent; border: 0; box-shadow: none;
}
.cc-btn { background: transparent; }
.cc-btn:hover { background: rgba(255, 255, 255, 0.08); }
.zoom-slider { display: none; }                     /* liblib 仅显示百分比文字 */
.zoom-percent { font-size: 13px; }
#minimapWrapper { /* 移至左下簇上方, 实施时定位 */ }
```

注：隐藏 `.zoom-slider` 前需真机确认无 JS 依赖其可见性（只隐藏不移除，保留事件绑定）。

### 2.4 回归清单（本阶段验收门）

- [ ] 项目下拉、头像菜单（设置/教程/关于）、添加菜单全部可打开、完整可见、可点击
- [ ] 添加菜单 `.add-menu`（`transform: scale(1.5)` 缩放补偿）位置正常
- [ ] 断连告警 chip、保存对话框、设置浮层与新顶栏无层叠冲突
- [ ] 画布满载 pan/zoom 帧率无回退
- [ ] 窄窗口（1280px）下顶栏胶囊不与工具坞重叠

---

## 阶段 ③：节点极简化（纯 CSS，预计 0.5 天）

> 目标：节点呈现"内容即卡片"，chrome 默认退场、hover/选中再现身。

### 3.1 悬浮标题对标（liblib：13px 弱化、节点上方 8px）

```css
/* [S4.3] 节点标题: 21px → 13px, 弱化色, hover 提亮保留 */
.node-label {
  font-size: 13px; font-weight: 500;
  color: rgba(255, 255, 255, 0.55);
  padding: 2px 6px;
}
.v2-node.selected .node-label { color: rgba(247, 247, 247, 0.95); text-shadow: none; }
```

### 3.2 连接桩隐藏-现身（对标 liblib handles）

```css
/* [S4.3] side-plus 默认退场, hover/选中现身 */
.side-plus-btn { opacity: 0; transition: opacity 160ms var(--ease-standard); }
.v2-node:hover .side-plus-btn,
.v2-node.selected .side-plus-btn,
.v2-node.v2-selected .side-plus-btn { opacity: 1; }
```

风险：side-plus 是幻映核心的"向旁生长"入口，隐藏影响可发现性。**采用渐进档**：先上"半隐"版（默认 `opacity: .35`，hover 满显），体验一周再决定是否全隐。

### 3.3 节点卡面

```css
/* [S4.3] 实色卡 + 1px 描边（①阶段令牌已接管底色, 此处补边） */
.v2-node-component, .v2-node > [class*="-node"] { border-color: #363636; }
```

实施时以 DevTools 对照真实节点 DOM 逐类补（图像/视频/音频/文本/分镜各有外框规则）。

### 3.4 验收

- [ ] 常态画布只见：内容卡 + 弱化标题 + 灰蓝连线（与 liblib-01 截图并排对比）
- [ ] hover 节点 → 桩与工具条现身流畅，无布局跳动
- [ ] 生成中节点的进度态仍清晰可辨（accent 蓝）

---

## 阶段 ④：加节点菜单重写（index.html 增量 + CSS，预计 0.5 天）

> 目标：`#nodeMenu` 对标 liblib 240px"图标 + 标签 + 描述 + 徽章"结构（crop-addmenu.png）。

### 4.1 结构改造（仅增不删）

每个 `.nam-item` **保留 data-type 与既有 svg/span**，在标签 span 后增加描述行：

```html
<button type="button" class="nam-item" data-type="text">
  <div class="nam-icon">…既有 svg…</div>
  <span>文本</span> <span class="nam-badge gemini">Gemini3</span>
  <span class="nam-desc">剧本、广告词、品牌文案</span>   <!-- 新增 -->
</button>
```

描述文案（按幻映实际能力写，不抄 liblib）：

| 节点 | 描述 |
|---|---|
| 文本 | 剧本、广告词、品牌文案 |
| 图像 | 海报、分镜、角色设计 |
| 视频 | 创意广告、动画、电影感片段 |
| 测试视频 | 低成本试跑视频参数 |
| 音频 | 音效、配音、音乐 |
| 3D导演台 | 搭建3D场景，截图作为构图参考 |
| 360全景图 | 全景图生成与查看 |
| 分镜脚本 | 创意脚本、生成故事板 |
| 上传 | 可上传图片、视频、音频文件 |

### 4.2 菜单样式

```css
/* [S4.4] 加节点菜单: 240px 纵向列表, 行高 44, 描述 11px 弱化 */
.node-add-menu { width: 240px; border-radius: 16px; background: #262626; border: 1px solid #363636; }
.nam-grid { display: flex; flex-direction: column; gap: 2px; }   /* 原 grid → 纵向 */
.nam-item { display: grid; grid-template-columns: 32px 1fr auto; align-items: center; min-height: 44px; border-radius: 10px; text-align: left; }
.nam-item:hover { background: #363636; }
.nam-desc { grid-column: 2 / -1; font-size: 11px; color: rgba(255,255,255,.4); }
.nam-section-title { font-size: 12px; color: rgba(255,255,255,.45); }
```

风险极低（已验证静态结构可增量改；`data-type` 绑定保留）。但 `.nam-grid` 从网格改纵向后菜单变高，需确认在 855px 视口内不溢出（必要时 `max-height + overflow:auto`）。

### 4.3 其他浮层换肤（顺带）

右键菜单、`.floating-menu`、设置浮层按 ① 的令牌自动获得 #262626/16px 体系，本阶段只做逐面目检 + 个别补丁。

---

## 阶段 ⑤：liblib 键位预设（可选，需先 spike，预计 0.5 天）

幻映已有快捷键预设系统（设置 → 键盘快捷键 → 预设方案 + 录制）。实施法：

1. **Spike**：查 `user/` 目录下快捷键配置 JSON 的 schema（用户层数据，非混淆）；确认预设是否可由配置文件注入。
2. 可注入 → 手工编写"画布流（liblib 风）"预设：缩放 Ctrl+±/Ctrl+0、适应画布、撤销重做对齐；**无法新增幻映不存在的语义**（Tab 建节点、Alt 拖复制等不做）。
3. 不可注入 → 本阶段降级为文档（在帮助里说明等价键位），不动代码。

---

## 不做清单（边界重申）

- 节点内部 DOM 重构、节点工具条按钮集变更（toolbarHtml 工厂混淆）
- 右键菜单/选中工具条的**内容**变更（仅换肤）
- 拖拽物理、连线吸附、自动整理画布算法
- React Flow 式角手柄通用化（仅媒体节点已有缩放手柄维持现状）

## 执行与验证总则

- 顺序：① → ② → ③ → ④ →（⑤），每阶段独立提交粒度、独立验收，互不阻塞回滚
- 每阶段固定流程：8779 预览截图（与 `tmp/crop-*.png` 并排对照）→ 阶段回归清单 → `node --test`（对照遗留失败基线：upstream 44 + 适配器 2 + hover 预览 1）
- 性能预算照旧：`.v2-node` 零新增 blur/阴影动画；pan/zoom 帧率不回退
- 风险总表：内嵌下拉翻转（②，有回退预案）＞ zoom-slider 隐藏依赖（②）＞ side-plus 可发现性（③，渐进档）＞ 菜单溢出（④）＞ 其余低

## 工期汇总

| 阶段 | 预计 | 风险 |
|---|---|---|
| ① 表面体系 | 0.5–1 天 | 低 |
| ② 外壳三岛 | 1 天（含回归） | 中 |
| ③ 节点极简 | 0.5 天 | 低–中 |
| ④ 菜单重写 | 0.5 天 | 低 |
| ⑤ 键位预设 | 0.5 天（可选） | 低（spike 定生死） |
