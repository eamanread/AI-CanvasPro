# 幻映工作台 · 交互与 UI 升级开发文档（[S4] liblib 对标系列）

日期：2026-06-12
版本：v1.5（v1.4 实施完成后，按用户真机验收反馈调整四项，见 S4.8）
历史：v1.1 双视角对抗评审 20 项；v1.2 终审通读 4 项 + 双类/停靠态实证；v1.3 产品范围确认（排除商业模块、M5 候选、S4.7 入轮）

> **实施记录（2026-06-12）**：
> - 实施时新发现并修复：`#avatarMenu` ID 级规则（`.sidebar-floating #avatarMenu{bottom:0;left:calc(100%+4px)}`，竖栏向右弹出布局）压制类级翻转，已同级覆盖；令牌预检剔除 5 个零消费者死令牌（--bg-panel-solid/--bg-context-menu/--sidebar-pill-bg/--text-1/--text-disabled）。
> - 验证：探针法逐规则验证全绿（选中环/组环/关联高亮/连线三态/提示面板/工具条/菜单/键帽/助手外壳）；真实启动态截图确认（tmp/s4-02-menus.png、s4-03-shell-clean.png）；助手面板测试 131/131；全量 node --test 2292 过/48 败（47 项既有遗留 + huanyingTools.test.ts 2 项属用户未提交的 PI agent 改动，与 UI 无关，refThumbHoverPreview 1 项已自愈归零）。
> - 已知环境现象：8779 预览的 live-reload 文件监视与应用写 user/ 数据互相触发重载循环，启动态验证改经 CDP Chrome 通道完成；真实 8777 实例无此问题。
> - 人工目检遗留项（合成事件不可达，用户真机 1 分钟）：①逐类节点选中确认提示面板边框已中性化（R5 蓝环检查）②side-plus 桩 35%→hover 满显的手感 ③1280px 窄窗顶栏与工具坞间距。
性质：**可执行工程手册**。整合 [05 实施方案](05-liblib-alignment-plan.md)、[06 功能文档](06-liblib-feature-inventory.md)/[07 交互体验文档](07-liblib-interaction-experience.md) 的深挖修订，以及幻映侧代码实证。与 05 冲突处以本文档为准（修订项见 §2.4）。
代码事实来源：本仓库运行时实际加载的 `style.css`（291KB bundle）+ 5 个 feature CSS + `index.html`，全部选择器经枚举验证存在。

---

## 1. 工程边界与机制（铁律）

### 1.1 改动入口

| 改动类型 | 落点 | 说明 |
|---|---|---|
| 全部 CSS | `styles/theme-upgrade.css` 新增 `[S4.x]` 分区 | 已有 [S1]–[S3] 分区，机制已验证；本文件 link 于 style.css 之后，同特异性靠加载顺序取胜 |
| 静态结构 | `index.html` **仅增量**（保留全部既有 id/class/data-type） | 空画布提示条、卡片描述行等模式已验证安全 |
| 新 JS（如需） | `modules/` 新建可读模块（仿 `promptPanelDock.js` 先例） | 本期范围内无必须项 |

### 1.2 禁区（精确清单）

- `style.css` 第 1 行 bundle；`styles/` 死副本（layout/node-base/node-types/v2/settings/variables.css——运行时不加载）
- 混淆 JS：`main.js`、`components/` 全部节点类与 `nodeToolbar/*`（含 toolbarHtml 工厂）、`src/core/`、`modules/interaction/`、`modules/AssetManager.js`、`api/shortcutsApi.js`
- 可读 JS（确需时才动）：`modules/app/appTopbarAndConfig.js`、`modules/app/appAssistantPanel.js`、`modules/promptPanelDock.js`、`components/aigenImage/uiModule.js`

### 1.3 范围排除（2026-06-12 与产品确认）

- **不开发任何商业/账号模块**：liblib 顶栏的会员超市、促销 pill、积分、分享面板、头像账号面板，以及左上角 logo 项目菜单（回到主页/全部项目/创建/删除项目）均为竞品采证记录，幻映无对应概念。S4.2-A 仅重排幻映既有头部内容（logo + 项目名 + 画布标签页）。
- **资产功能对标不在本轮**：liblib 式图层列表/定位到节点为幻映不存在的新功能（见 §6 M5 候选项）；本轮仅对幻映既有资产面板做 S4.1 令牌换肤 + 回归。
- **助手（PI-agent）面板一致性在本轮**：见 S4.7。

### 1.4 流程

- 开工前：`git tag ui-liblib-baseline`
- 每个 [S4.x] 区块独立提交、独立验收（验收门见 §4）
- 回滚：单项 = 删对应区块；整体 = 删 theme-upgrade.css 中 [S4] 全部分区（[S1]–[S3] 不受影响）
- 预览：`.claude/launch.json` 的 `huanying-live-8779`（8777 是用户常驻实例）；应用冷加载 400+ 模块约 40–60s

## 2. 设计基准（最终值，liblib 实测 → 幻映落点）

### 2.1 表面四级灰

| 角色 | liblib 实测 | 幻映落点（接管语义令牌） |
|---|---|---|
| 画布底 | `#141414` | `--bg` |
| 一级表面（图片节点/顶栏钮） | `#171717` | `--surface-node` |
| 一级半表面（liblib 实测 #1c1c1c 系，07 §8） | `#1c1c1c` | `--bg-elevated` |
| 二级表面（浮层/文本节点/工具条） | `#262626` | `--surface-float/menu/banner/quote/save-dialog`、`--bg-panel*`、`--bg-dropdown`、`--bg-context-menu`、`--about-dialog-bg` |
| 描边与 hover 实色 | `#363636` | `--stroke-default/10`、`--fill-hover-strong` |

### 2.2 文字五级 / 品牌色 / 焦点

```
文字: #f7f7f7 主 / #a8a8a8 次 / #919191 弱 / #86909c subtle / #525252 禁用
品牌青(信息强调): #09caf5 (亮档 #5ddcff) —— 仅用于分类标题/NEW徽章类强调
危险: #ff6a6f      焦点(输入): #0690ae
幻映保留: --accent-primary #5a96ff 仅 running/生成中 + 键盘焦点环([S2.3] 不变)
```

### 2.3 关键交互规格（07 文档修订后）

| 项 | 规格 | 来源 |
|---|---|---|
| 节点选中环 | `0 0 0 2px #a8a8a8`，**瞬时无过渡**，无光晕 | liblib outline 2px offset −1，实测瞬时 |
| 连线三态 | 常态 `#86909c` 2px / hover `#c0c8d0` / 选中 `#e0e4e8` 3px，stroke .2s | 常态/选中实测；**hover 为令牌推导待前台复测**（06 §6） |
| 浮层阴影两档 | dropdown：`0 4px 10px rgba(0,0,0,.25), 0 2px 4px rgba(0,0,0,.3)`；menu/大浮层：`0 8px 32px rgba(0,0,0,.15), 0 2px 8px rgba(0,0,0,.1)` | 实测（修正 05 的"近零阴影"） |
| 状态色过渡 | 150ms cubic-bezier(.4,0,.2,1)（与已落地 [S2] 的 120–160ms 同量级，不返工） | CSS 声明值（动画时长观测在后台 tab 不可信，见 07 计时声明） |
| 圆角 | 节点 12 / 浮层 12–16 / 控件 8 / 键帽 8 | 实测 |
| 禁用态 | opacity .3 | 实测 |

### 2.4 对 05 方案的修订清单（对应 07 §10 五条）

1. 选中环 1px → **2px #a8a8a8 + 瞬时**（撤销过渡）（07 §10-1）；2. "去阴影化"→ **两档系统阴影**（07 §10-2）；3. 左下簇容器 transparent → **rgba(20,20,20,.7) 有底色** + 选中工具条阴影规格 + **资产/图层 280px 停靠抽屉为新对标面**（本期仅换肤，停靠形态评估后置）（07 §10-3）；4. 动效策略确认 + **"选中瞬时无过渡"原则**（07 §10-4）；5. 键位预设可直接按 06 §8 官方表编写（07 §10-5）。另：小地图对标源自 06 §4.3 功能采证（幻映已在左下，仅换肤缩尺寸）。

## 3. 工作分解（WBS）

> 每项给出：目标选择器（已验证存在）→ 代码 → 验收。代码均追加到 theme-upgrade.css 对应分区。

### S4.1 表面体系对齐（0.5–1 天 · 低风险 · 一次性整体落地）

**A. 四级灰 + 文字 + 阴影令牌块**

```css
/* ====================== [S4] liblib 对标 ====================== */
/* ---- [S4.1] 表面体系: 四级灰实色 + 两档阴影 + 中性选中 ---- */
:root {
  --bg: #141414;
  --surface-node: #171717;
  --bg-elevated: #1c1c1c;
  --surface-float: #262626; --surface-menu: #262626; --surface-banner: #262626;
  --surface-quote: #262626; --surface-save-dialog: #262626;
  --bg-panel: #262626; --bg-panel-solid: #262626; --bg-dropdown: #262626;
  --bg-context-menu: #262626; --about-dialog-bg: #262626;
  --sidebar-pill-bg: rgba(38, 38, 38, 0.8);
  --stroke-default: #363636; --stroke-08: #2e2e2e; --stroke-10: #363636;
  --stroke-12: #3d3d3d; --border: #2e2e2e;
  --fill-hover-strong: #363636;
  --text-1: #f7f7f7; --text-primary: rgba(247, 247, 247, 0.95);
  --text-secondary: #a8a8a8; --text-muted: #919191; --text-subtle: #86909c;
  --text-disabled: #525252;
  /* 两档系统阴影(修正 05) */
  --shadow-popover: 0 4px 10px rgba(0, 0, 0, 0.25), 0 2px 4px rgba(0, 0, 0, 0.3);
  --shadow-toolbar: 0 4px 10px rgba(0, 0, 0, 0.12), 0 2px 4px rgba(0, 0, 0, 0.2);
  --shadow-menu: 0 8px 32px rgba(0, 0, 0, 0.15), 0 2px 8px rgba(0, 0, 0, 0.1);
  --shadow-dialog: 0 8px 32px rgba(0, 0, 0, 0.15), 0 2px 8px rgba(0, 0, 0, 0.1);
  --shadow-surface: 0 2px 5px rgba(0, 0, 0, 0.15);
  --shadow-banner: 0 4px 10px rgba(0, 0, 0, 0.25);
  --shadow-save-dialog: 0 8px 32px rgba(0, 0, 0, 0.15), 0 2px 8px rgba(0, 0, 0, 0.1);
  --shadow-surface-strong: 0 8px 32px rgba(0, 0, 0, 0.2);
  --shadow-quote: 0 8px 32px rgba(0, 0, 0, 0.15);
  /* 连线常态(注: --conn-hover 经全仓核查为零消费者的死令牌, 不再定义,
     hover/高亮态在下方 B 块用显式规则落地) */
  --conn-color: #86909c;
}
/* 撤销 [S1.3] 双层 Bezel 内高光(liblib 无内高光) */
.save-dialog, .about-dialog, .dreamina-login-modal,
.canvas-proj-dropdown, .settings-modal, .shortcuts-modal-v2 {
  box-shadow: var(--shadow-menu);
}
```

**B. 选中中性化（按枚举逐条覆盖，全部选择器已实证）**

```css
/* 主选中环: 2px 中性灰、无光晕、瞬时(transition:none 防 [S2] 过渡组波及) */
.v2-node:not(.node-group):not(.comment-note-node).selected,
.v2-node:not(.node-group):not(.comment-note-node).v2-selected {
  box-shadow: 0 0 0 2px #a8a8a8;
  border-radius: 12px;
  transition: none;
}
/* 组选中: 9px 彩色粗边 → 1px 中性线(对标 liblib resize 线语言)
   注: 原规则为 inset -10px + 9px border + radius 22 + opacity .8 + 靛蓝光晕,
   必须整组覆盖, 只改 border-width 会让细线悬空在组框外 9px */
.node-group.selected::after {
  top: -2px; left: -2px; right: -2px; bottom: -2px;
  border: 1px solid #a8a8a8;
  border-radius: 16px;
  box-shadow: none;
  opacity: 1;
}
/* 关联节点高亮: 三层白光晕 → 细线降级(评审第 11 条补充枚举) */
.v2-node.selection-related:not(.selected) {
  box-shadow: 0 0 0 1px #525252;
}
/* 分镜节点选中环(storyboard-script-node.css 内 2px white-40) */
.v2-node.selected .storyboard-script-node::after,
.v2-node.v2-selected .storyboard-script-node::after {
  box-shadow: inset 0 0 0 2px #a8a8a8;
}
/* 提示面板选中边: 类型彩色(蓝/紫/黄) → 统一中性
   已运行时实证: V2 节点元素同时携带两套类(class="v2-node node text-node"),
   故以下 .node 前缀选择器对 V2 有效命中, 非死代码 */
.node.image-node.selected .text-prompt-panel,
.node.video-node.selected .text-prompt-panel,
.node.audio-node.selected .text-prompt-panel,
.node.text-node.selected .text-prompt-panel {
  border-color: var(--stroke-10);
  box-shadow: var(--shadow-menu);
}
/* 停靠态补丁: 面板被 promptPanelDock 重挂到视口层(.viewport-fixed-prompt)后
   脱离节点 DOM, 上面四条够不着, 需独立中性化(运行时实证存在此形态) */
.text-prompt-panel.viewport-fixed-prompt {
  border-color: var(--stroke-10);
  box-shadow: var(--shadow-menu);
}
/* 全景视口选中: 蓝 → 中性 */
.v2-node.selected .panorama-scene-viewport {
  border-color: #a8a8a8;
  box-shadow: inset 0 0 0 1px rgba(168, 168, 168, 0.35);
}
/* 连线三态显式落地(基规则 stroke white-40; hover/高亮原为白 4px + 辉光,
   bundle 内 (0,3,0) 规则必须同特异性显式覆盖) */
.connection-main { stroke: var(--conn-color); }
.connection-group:hover .connection-main {
  stroke: #c0c8d0;
  stroke-width: 2px;
  filter: none;
}
.connection-group.connection-highlighted .connection-main {
  stroke: #e0e4e8;
  stroke-width: 3px;
  filter: none;
}
```

注：运行时实证 V2 节点双类并存（`.v2-node` 与 `.node.{type}-node` 同元素），因此 bundle 内 `.node.selected .node-card` 系蓝环规则**可能同样可达**——回归时逐类选中节点检查，发现蓝环即按同法补中性化覆盖（`.node.selected .node-card{border-color/box-shadow}` 一组即可）。

**C. 圆角（含子卡同步，评审第 9 条）**

`.v2-node` 是 overflow:visible 透明壳，可见圆角在子卡片上；环改 12px 必须同步子卡，否则四角豁口：

```css
:root { --node-r: 12px; }
.v2-node {
  border-radius: 12px;             /* 原 16px */
  --hover-br: 16px;                /* conn-hoverTarget::after 用 节点r+4, 原 20 */
}
.v2-crop-container { border-radius: 12px; }
.img-bottom-block { border-radius: 12px; }
.node-ref-bar { border-radius: 12px 12px 0 0; }
```

**验收**：四级灰肉眼比照 `tmp/crop-*.png`；选中任一节点 → 灰环瞬时出现无光晕；组选中 → 1px 细线；**逐类选中文本/图像/视频/音频节点，确认提示面板选中边已中性化**（若仍彩色 = V1 选择器未命中 V2，按 DevTools 实测补写）；运行态仍 accent 蓝；`node --test` 对照遗留基线（upstream 44 + 适配器 2 + hover 预览 1）。

### S4.2 外壳三岛重排（1 天 · 中风险 · 含真机回归）

> **v1.5 验收状态**：A 顶栏胶囊保留但改为**左上角定位**（left:16px，用户反馈）；**B 工具坞整体撤回**——侧栏恢复原左侧竖排，下拉翻转与 add-btn 调整一并移除（R1/R2 随之关闭）；C 左下簇与小地图保留。

**A. 顶栏 → 悬浮胶囊**（`.header` 为 fixed 全宽，纯 CSS 重排已在 8779 实测通过）

```css
/* ---- [S4.2] 外壳三岛 ---- */
.header {
  top: 10px; left: 50%; right: auto;
  transform: translateX(-50%);
  width: max-content; max-width: calc(100vw - 32px);
  height: 40px;                      /* liblib 实测胶囊高 40(06 §2.1) */
  padding: 0 10px 0 14px; gap: 14px;
  background: rgba(23, 23, 23, 0.85);
  border: 1px solid #363636; border-radius: 999px;
  backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px);
  pointer-events: auto;              /* 原 none(全宽穿透), 胶囊化后必须可点 */
}
/* ⚠ --header-h:52px 令牌刻意不动: 画布/面板的顶部偏移消费它,
   胶囊实高 40 + top 10 = 50 < 52, 不会遮挡; 改令牌反而牵动布局 */
/* 原 .header-left{width:90%}: 胶囊 max-content 下百分比按 auto 算再被压回,
   左簇会被截断, 必须解除 */
.header-left { width: auto; max-width: none; }
.logo-title { font-size: 14px; font-weight: 600; }
.project-name {
  background: #171717; border: 1px solid #2e2e2e;
  border-radius: 999px; padding: 4px 12px; font-size: 13px;
}
.canvas-tab { font-size: 13px; border-radius: 999px; padding: 4px 12px; }
```

**B. 侧栏 → 底部中央工具坞**（`.sidebar-floating` 纯 CSS 定位，几何已实测）

```css
.sidebar-floating {
  left: 50%; top: auto; bottom: 12px;
  transform: translateX(-50%);
  flex-direction: row; align-items: center;
  padding: 5px 8px; gap: 4px;
  background: rgba(38, 38, 38, 0.8);
  border: 1px solid #363636; border-radius: 12px;
}
.sidebar-floating .sidebar-flex-spacer { display: none; }
.sidebar-floating .sidebar-sep-v3 { width: 1px; height: 24px; margin: 0 4px; }
/* "+" 唯一白底主入口: 原规则已是白底(.sidebar-floating .add-btn-v3{background:#fff}),
   仅调透明度与圆角; 选择器必须 (0,2,0) 才压得过原规则(评审第 6 条) */
.sidebar-floating .add-btn-v3 {
  background: rgba(255, 255, 255, 0.9);
  border-radius: 10px;
}
/* 内嵌下拉开向翻转(核心风险点, 见风险 R1)
   - avatar-menu 原规则是 .sidebar-floating .avatar-menu{top:calc(100%+8px)} (0,2,0),
     必须同特异性且 top:auto 解除双约束(评审第 2 条)
   - canvas-proj-dropdown 是 position:fixed, 其锚定依赖 .sidebar-floating 的
     transform 形成包含块——transform 是承重墙, S4.2-B 保留 translateX 即可 */
.sidebar-floating .avatar-menu { top: auto; bottom: calc(100% + 10px); }
/* 实施时发现: bundle 另有 ID 级规则 .sidebar-floating #avatarMenu
   {bottom:0;left:calc(100%+4px)}(竖栏"向右弹出"布局, (1,1,0)), 必须同级覆盖 */
.sidebar-floating #avatarMenu {
  top: auto; bottom: calc(100% + 10px);
  left: auto; right: 0;
}
.canvas-proj-dropdown { top: auto; bottom: calc(100% + 10px); }
```

**C. 左下簇 + 小地图换肤**

```css
.canvas-controls-floating {
  left: 16px; right: auto; bottom: 12px;   /* liblib 实测 left16/bottom12 */
  background: rgba(20, 20, 20, 0.7);       /* 修正 05: 有底色 */
  border: 0; border-radius: 12px; padding: 6px; gap: 4px;
  box-shadow: none;
}
.cc-btn { width: 28px; height: 28px; border-radius: 8px; background: transparent; }
.cc-btn:hover { background: rgba(255, 255, 255, 0.1); }
/* zoom-controls 自带卡片皮必须清掉, 否则工具坞里"卡中卡"(评审第 10 条) */
.zoom-controls {
  gap: 8px; padding: 0 0 0 4px;
  background: transparent; border: 0; box-shadow: none;
}
.zoom-slider { display: none; }          /* liblib 仅百分比文字; 风险 R2 */
.zoom-percent { font-size: 13px; color: #f7f7f7; }
/* 小地图: 200×140 → 150×110, 贴左下簇上方 */
.minimap-wrapper {
  width: 150px; height: 110px;
  left: 16px; bottom: 60px;
  background: rgba(31, 31, 31, 0.9);
  border: 1px solid #363636; border-radius: 12px;
}
```

**验收（回归清单）**：项目下拉/头像菜单（设置/教程/关于）/添加菜单（`.add-menu` 有 `scale(1.5)` 缩放补偿，确认定位）全部完整可见可点；断连 chip、保存对话框、设置浮层与新顶栏无层叠冲突；1280px 窄窗顶栏与工具坞不重叠；满载画布 pan/zoom 帧率无回退。

### S4.3 节点极简化（0.5 天 · 低–中风险）

```css
/* ---- [S4.3] 节点极简: 内容即卡片 ---- */
/* 悬浮标题: 21px → 13px 弱化(liblib node-floating-ui 同构) */
.node-label {
  font-size: 13px; font-weight: 500;
  color: rgba(255, 255, 255, 0.55);
  padding: 2px 6px;
}
.v2-node.selected .node-label { color: #f7f7f7; text-shadow: none; }
/* 连接桩渐进披露: 渐进档(默认 35%, hover 满显; 一周后评估全隐)
   评审第 1 条修正: side-plus 不是 .v2-node 后代, 实际挂在画布级容器
   #v2-side-plus-holder 内(显隐由混淆 renderer 管理, opacity 调光与其正交);
   transition 必须列全原有属性(transform/background), 否则 hover 放大变瞬跳 */
#v2-side-plus-holder .side-plus-btn {
  opacity: 0.35;
  transition: opacity 160ms var(--ease-standard),
              transform 0.2s cubic-bezier(0.34, 1.56, 0.64, 1),
              background 0.2s;
}
#v2-side-plus-holder .side-plus-btn:hover { opacity: 1; }
/* 节点工具条换肤(node-floating-toolbar 基规则已证: 上方居中 + zoom-inv) */
.node-floating-toolbar {
  background: #262626;
  border: 1px solid #363636;
  border-radius: 12px;
  box-shadow: var(--shadow-toolbar);
}
.node-floating-toolbar .ftb-btn { border-radius: 8px; }
.node-floating-toolbar .ftb-btn:hover { background: rgba(255, 255, 255, 0.1); }
```

**验收**：常态画布只见内容卡 + 弱化标题 + 灰蓝连线（与 `tmp/liblib-deep/node-00-initial-overview.png` 并排比对）；hover 节点桩满显无跳动；生成中节点进度态（accent 蓝）清晰。

### S4.4 加节点菜单重写 + 浮层细节（0.5 天 · 低风险）

**A. `#nodeMenu` 结构增量**（index.html；保留全部 `data-type`/`.nam-item`/`.nam-icon`/`.nam-badge`）

每个 `.nam-item` 在末尾追加 `<span class="nam-desc">…</span>`，文案按幻映实际能力：

| data-type | 描述 |
|---|---|
| text | 剧本、广告词、品牌文案 |
| image | 海报、分镜、角色设计 |
| video | 创意广告、动画、电影感片段 |
| test-video | 低成本试跑视频参数 |
| audio | 音效、配音、音乐 |
| panorama-scene | 搭建3D场景，截图作为构图参考 |
| panorama-360 | 全景图生成与查看 |
| storyboard-script | 创意脚本、生成故事板 |
| resource(上传) | 可上传图片、视频、音频文件 |

**B. 菜单样式**（对标 06 §3.1：240px、行 52px、描述 hover 淡入）

```css
/* ---- [S4.4] 加节点菜单 + 浮层细节 ---- */
.node-add-menu {
  width: 240px; border-radius: 16px;
  background: #262626; border: 1px solid #363636;
  box-shadow: var(--shadow-menu); padding: 8px;
  backdrop-filter: blur(32px);              /* liblib 实测; 固定浮层, 性能白名单内 */
  -webkit-backdrop-filter: blur(32px);
}
.node-add-menu .nam-grid { display: flex; flex-direction: column; gap: 2px; }
.node-add-menu .nam-item {
  display: grid; grid-template-columns: 34px 1fr auto;
  align-items: center; column-gap: 10px;
  min-height: 52px; padding: 8px; border-radius: 10px; text-align: left;
}
.node-add-menu .nam-item:hover { background: rgba(255, 255, 255, 0.1); }
/* 图标盒中性化: bundle 内有 .nam-item[data-type=x] .nam-icon 类型彩底 (0,3,0),
   必须同特异性压制(评审第 8 条); 如决定保留类型彩底则删除 background 行 */
.node-add-menu .nam-item[data-type] .nam-icon {
  width: 34px; height: 34px; border-radius: 8px;
  background: rgba(255, 255, 255, 0.1);
}
.node-add-menu .nam-item > span:not(.nam-badge):not(.nam-desc) { font-size: 14px; font-weight: 500; }
.node-add-menu .nam-desc {
  grid-column: 2 / -1; font-size: 12px; line-height: 16px;
  color: rgba(255, 255, 255, 0.4);
  opacity: 0; transition: opacity 200ms var(--ease-standard);
}
.node-add-menu .nam-item:hover .nam-desc { opacity: 1; }
/* 徽章: 原为 absolute 钉在行右上(不入 grid 流), 必须 static 化才能进第三列;
   现行 DOM 徽章类为 gemini/banana/beta 三种(评审第 7 条) */
.node-add-menu .nam-badge {
  position: static;
  font-size: 10px; border-radius: 4px; padding: 2px 6px;
}
.node-add-menu .nam-badge.beta { background: rgba(255, 255, 255, 0.15); color: #fff; }
.node-add-menu .nam-badge.gemini,
.node-add-menu .nam-badge.banana { background: rgba(60, 181, 204, 0.25); color: #5ddcff; }
.node-add-menu .nam-section-title { font-size: 12px; color: rgba(255, 255, 255, 0.45); }
/* 溢出保护: 视口矮于菜单时内部滚动 */
.node-add-menu { max-height: calc(100vh - 120px); overflow-y: auto; }
```

注：描述行 hover 淡入会让行高从 52px 内部重排吗？——不会：`.nam-desc` 常驻占位（仅 opacity 变化），与 liblib 同法。

**C. 右键菜单/上下文浮层换肤**（内容在混淆区，仅换肤）

```css
.v2-canvas-ctx-menu, .v2-node-picker, .v2-quote-menu, .floating-menu {
  background: #262626; border: 1px solid #363636;
  border-radius: 16px; box-shadow: var(--shadow-menu);
}
```

**D. 键帽（kbd）组件**（[S3.2] 快捷键提示条升级 + 复用面）

```css
/* liblib 键帽实测 28px 高 / 1px #363636 / 8px 圆角("透明底"为推断);
   此处 24px 为幻映密度适配决策(空画布提示条/设置页空间更紧), 非照抄 */
.empty-hint-shortcuts kbd, .settings-shortcuts-kbd, .settings-align-shortcut-key {
  height: 24px; min-width: 24px; display: inline-flex;
  align-items: center; justify-content: center;
  padding: 0 6px; background: transparent;
  border: 1px solid #363636; border-bottom-width: 1px;
  border-radius: 8px; font-family: var(--font-mono); font-size: 12px;
}
```

**验收**：菜单 240px 纵向、hover 出描述；既有 `data-type` 点击建节点全部正常（双击画布 + 侧栏两个入口都验）；855px 视口不溢出。

### S4.5 微交互移植包（0.5 天 · 低风险 · 可与 S4.4 合并提交）

从 07 §9 清单中筛选 CSS 可达项：

```css
/* ---- [S4.5] 微交互移植 ---- */
/* 1. 工具流卡片式 hover(资产/工作流面板缩略图, 实施时按运行时类名锚定):
      图 scale 1.05 (200ms) + 黑 65% 遮罩淡入 (150ms) — 选择器待运行时确认后补 */
/* 2. 排序/开关类按钮的激活态: 白 15% 底(对标 --canvas-controls-active) */
.cc-btn.active, .cursor-size-btn.active { background: rgba(255, 255, 255, 0.15); }
/* 3. 设置面板焦点输入框: liblib focus #0690ae 不引入(保持 accent 一致性), 仅记录 */
/* 4. 禁用态统一 opacity .3 */
:where(.ftb-btn, .nam-item, .pill-btn, .cc-btn):disabled,
:where(.ftb-btn, .nam-item, .pill-btn, .cc-btn)[disabled] { opacity: 0.3; }
```

**不移植**（理由）：菜单项级联入场已有（[S2.5]）；选中连线"流光"需 JS 驱动渐变（混淆区边界；连线 hover/高亮的静态三态已由 [S4.1-B] 显式规则落地）；"批量操作顶栏替换"模式需要业务 JS。

### S4.7 助手（PI-agent）面板一致性（0.5 天 · 低风险 · 与 S4.4/4.5 合并提交）

**现状**：[S3.1] 已收编七类卡片；但面板外壳的注入样式仍是体系外颜色——文字 `#eef1f5`/`#cfd5dc`、`rgba(247,244,236,.08)` 暖白底、头像与 FAB 为绿色辐射渐变。

**机制提醒**：面板样式由 `appAssistantPanel.js` 运行时注入 `<style>`（晚于覆盖层加载），同特异性必输——沿用 [S3.1] 验证过的抬升模式，外壳类用 `[class]` 抬到 (0,2,0)：

```css
/* ---- [S4.7] 助手面板外壳入系统(卡片已在 [S3.1]) ---- */
.hy-canvas-agent-panel[class] {
  background: #171717;
  border-left: 1px solid #2e2e2e;
}
.hy-canvas-agent-head[class] { border-bottom: 1px solid #2e2e2e; }
.hy-canvas-agent-messages[class] { color: #a8a8a8; }
.hy-canvas-agent-input[class] { color: #f7f7f7; }
.hy-canvas-agent-head-actions[class] button:hover { background: rgba(255, 255, 255, 0.1); }
/* 绿色吉祥物头像/FAB(产品个性)默认保留;
   如决定收敛, 启用以下降饱和可选块:
.hy-canvas-agent-head-avatar[class], .fab-btn { filter: saturate(0.65); }
*/
```

**验收**：面板打开后外壳四级灰与画布一致、卡片色条语义不变；`node --test modules/app/appAssistantPanel.p1Ui.test.js` 121 项全绿；助手执行一次只读对话确认流式渲染无样式破损。

### S4.8 用户验收调整（2026-06-12 真机反馈，已实施）

1. **顶栏胶囊移左上角**（left:16/top:10，替代居中）。
2. **工具坞撤回**：侧栏恢复原左侧竖排（S4.2-B 全部移除）。
3. **隐藏画布吉祥物**：`#mascotWrap{display:none !important}`（压制 MascotManager 内联显隐）。
4. **文本输入聚焦"默认无效果"**（全链路去蓝）：
   - `--blue-border-focus` 重定向为默认描边色 `--stroke-10`（令牌级根治）；
   - 六组输入框焦点规则逐条中性化（annotate prompt / ai-input-box(PI面板) / asset 三件 / workflow 三件 / panorama stepper），焦点光晕清除；
   - `.storyboard-script-editable.is-editing` outline 移除；
   - [S2.3] 全局焦点环把 input/textarea/contenteditable 移出清单（Chrome 对文本框点击也判 :focus-visible）+ [S4.8] 三重伪类兜底；
   - [S2.8] accent 蓝 caret 撤回（光标恢复默认色）。
   - 按钮类键盘焦点环（a11y）保留不变。

### S4.9 画布切换器下拉化（2026-06-12 用户追加，已实施并真机验证）

把顶栏横排画布标签改为 liblib 式下拉切换器：chip 显示当前画布名 + 折角符（开启态高亮底 + 折角翻转），点开 214px 面板——"画布"弱化标头 + 右侧 ⊕ 新建按钮 + 画布行列表（激活行 ✓，删除钮 hover 浮现）。

- **实现**：新建可读模块 [modules/canvasTabsDropdownUi.autoload.js](../../modules/canvasTabsDropdownUi.autoload.js)（约 50 行：开合状态、当前名同步 MutationObserver、外点/Esc 关闭）+ theme-upgrade.css [S4.9] 区块 + index.html 一个 script 标签。**切换/改名/删除画布逻辑零接触**（仍由混淆的 CanvasTabManager 处理，模块只做类切换）。
- **交互细节**：点非激活画布 = 既有处理器切换后收起面板；点激活画布保持展开（保留双击改名入口）；chip 文案经 `data-current` 属性 + CSS `attr()` 渲染，画布改名/切换实时同步。
- **回退**：删模块文件 + index.html script 标签 + [S4.9] 区块 = 恢复原横排标签（CSS 门控在 JS 添加的 .hy-tabs-dd 上，模块缺席自动回退）。
- **验证**（8777 真机）：chip 显名 ✓ 点击展开 ✓ 面板规格 ✓ 标头与 ⊕ ✓ 激活行 ✓ ✓ 外点关闭 ✓（截图 tmp/s4-05-dropdown-open.png）。

### S4.6 键位预设 spike（0.5 天 · 可选）

1. 检查 `user/` 目录快捷键配置 JSON schema（用户层数据，非混淆）。
2. 可注入 → 新增"画布流"预设：对齐 06 §8 中幻映已有语义的键位（缩放 Ctrl+±/Ctrl+0、撤销重做、网格吸附 L、适应画布 F→保留幻映既有）。
3. 不可注入 → 降级为帮助文档，不动代码。
4. **不伪造**幻映不存在的语义（Tab 建节点 / Alt 拖复制 / Ctrl+L 连线 / Alt+Shift+F 整理画布）。

> **Spike 结论（2026-06-12 实施时）**：存储路径已确认——`server.py` 注册 `user/shortcuts.json` 路由，属用户层数据；但该文件在用户首次录制前不存在，schema 由混淆的 `modules/shortcuts.js` 定义，盲写有破坏快捷键 UI 的风险。按规则 3 降级处理；**半自动路径**：用户在设置→键盘快捷键里录制任意一个键位生成文件后，即可按实际 schema 安全补全整套预设。

## 4. 测试与验收体系

- **每阶段固定门**：8779 预览截图（与 `tmp/crop-*.png`、`tmp/liblib-deep/*.png` 并排）→ 阶段回归清单 → `node --test`（遗留失败基线：output/upstream 44 + RunningHubAdapter 2 + refThumbHoverPreview 1，已 stash 对照确证为历史问题）
- **关键交互回归**（每阶段必跑）：双击建节点 → 选中 → 打开提示面板 → 模型菜单 → 关闭；打开设置/保存对话框/关于；项目下拉与头像菜单（S4.2 后重点）
- **性能预算**：`.v2-node` 零新增 blur/阴影动画；`body.is-zooming/.is-zoom-low` 降级链路不破坏（[S2.4] 已有）；pan/zoom 帧率无回退
- **像素对照法**：preview_inspect 计算样式数值比对优先于截图目测（颜色/字号/圆角逐项对 §2 基准表）

## 5. 风险登记册

| # | 风险 | 等级 | 缓解/回退 |
|---|---|---|---|
| R1 | 工具坞下拉翻转被混淆 JS 内联定位压制 | 中 | `.canvas-proj-dropdown` 是 fixed、锚定依赖 `.sidebar-floating` 的 transform 包含块（承重墙，S4.2-B 保留 translateX）。预案 A：`!important` 翻转**且确认包含块仍在**（若 JS 内联写 top/left 则 A 无效甚至出屏）；预案 B：侧栏留左侧仅换肤（放弃位移，保留皮肤） |
| R2 | `.zoom-slider` 隐藏影响 JS 读值 | 低 | 只 display:none 不移除 DOM；异常即恢复显示 |
| R3 | 选中环 `transition:none` 与 [S2] 过渡组冲突 | 低 | 本区块排在 [S2] 后自然覆盖；验收专项检查 |
| R4 | `.nam-grid` 改纵向后菜单超出视口 | 低 | 已加 max-height + 滚动 |
| R5 | V1 旧节点系（`.node.selected`）仍可达且保持蓝环 | 低 | 回归时如出现，补一组中性化覆盖（选择器已在 §S4.1-B 注中枚举） |
| R6 | 用户习惯：选中色从白光晕/蓝改为中性灰 | 产品决策 | §2.3 已定调（accent 仅 running）；如需保留旧观感，仅回滚 S4.1-B 区块即可 |
| R7 | 实色化后与未覆盖的半透明残留混搭违和 | 中 | S4.1 一次性整体落地 + 全面目检，不允许半成品态过夜 |
| R8 | side-plus 显隐由混淆 renderer 管理，opacity 调光与其叠加后表现异常 | 低 | opacity 与 JS display 控制正交；异常即删除 [S4.3] 调光块（独立可回滚） |
| R9 | 圆角 12px 子卡同步清单不全（仍有 16px 残留子元素） | 低 | 验收时四类节点逐一目检转角；发现残留按同法补一条 |
| R10 | 助手面板注入样式后续版本变更导致 [S4.7] 失配 | 低 | `[class]` 抬升只依赖类名稳定；121 项面板测试做门，失配即回滚该区块 |

## 6. 里程碑

| 阶段 | 内容 | 工期 | 依赖 |
|---|---|---|---|
| M1 | S4.1 表面体系 | 0.5–1 天 | 无 |
| M2 | S4.2 外壳三岛 | 1 天 | M1（颜色先行避免二次目检） |
| M3 | S4.3 节点极简 + S4.4 菜单 + S4.5 微交互 + S4.7 助手面板（S4.5/4.7 与 S4.4 合并提交） | 1.5 天 | M1 |
| M4 | S4.6 键位 spike + 全量回归 + 文档收尾 | 0.5 天 | M1–M3 |
| M5（候选，默认不做） | liblib 式图层列表/定位到节点：新建可读模块（import graphStore/viewportFocus 渲染独立面板，不触碰混淆代码） | 2–3 天（评估值） | 产品拍板后另立文档 |

总计 3.5–4 天（不含 M5）。M2 与 M3 可并行（不同选择器面，无冲突）。

## 附录 A：本文档引用的幻映选择器资产（全部已实证存在）

`.header` `.logo-title` `.project-name` `.canvas-tab` `.canvas-tabs` / `.sidebar-floating` `.sidebar-flex-spacer` `.sidebar-sep-v3` `.add-btn-v3` `.canvas-proj-dropdown` `.avatar-menu` / `.canvas-controls-floating` `.cc-btn` `.zoom-controls` `.zoom-slider` `.zoom-percent` `.minimap-wrapper` `.minimap` / `.v2-node` `.node-label` `#v2-side-plus-holder` `.side-plus-btn` `.node-floating-toolbar` `.ftb-btn` `.node-group.selected::after` `.v2-node.selection-related` `.storyboard-script-node` `.text-prompt-panel` `.panorama-scene-viewport` `.connection-main` `.connection-bg` `.connection-group` `.connection-highlighted` `.v2-crop-container` `.img-bottom-block` `.node-ref-bar` `--hover-br` / `.header-left` / `.node.image-node` `.node.video-node` `.node.audio-node` `.node.text-node`（与 `.v2-node` 双类并存，运行时已实证） `.viewport-fixed-prompt` / `#nodeMenu` `.node-add-menu` `.nam-grid` `.nam-item` `.nam-icon` `.nam-badge` `.nam-section-title` / `.v2-canvas-ctx-menu` `.v2-node-picker` `.v2-quote-menu` `.floating-menu` / `.save-dialog` `.about-dialog` `.dreamina-login-modal` `.settings-modal` `.shortcuts-modal-v2` `.cursor-size-btn` `.empty-hint-shortcuts` `.settings-shortcuts-kbd` `.settings-align-shortcut-key` `.pill-btn`

助手面板（S4.7，类名取自 appAssistantPanel.js 注入样式）：`.hy-canvas-agent-panel` `.hy-canvas-agent-head` `.hy-canvas-agent-head-avatar` `.hy-canvas-agent-head-actions` `.hy-canvas-agent-messages` `.hy-canvas-agent-input`

新增类（本期引入）：`.nam-desc`

## 附录 B：明确不可达清单（混淆区，换肤可、改逻辑不可）

节点工具条按钮集与触发逻辑（toolbarHtml 工厂）/ 右键菜单内容项 / 拖拽与连线吸附物理 / Tab 建节点等新交互语义 / 选中连线流光（JS 渐变驱动）/ 节点内部 DOM 结构精简

## 附录 C：证据索引

liblib 采证：`docs/ui-upgrade/06-*.md`、`07-*.md`、`tmp/liblib-deep/`（80+ 截图与令牌 JSON）；幻映实证：本会话 bundle 枚举（选中环 18 条规则、外壳基规则、连线基规则）；既有落地：theme-upgrade.css [S1]–[S3]。
