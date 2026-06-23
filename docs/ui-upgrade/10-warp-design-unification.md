# 幻映工作台 · Warp DESIGN.md 全局统一记录（[S5]/[S6]）

> **[S6] 中性 re-base（2026-06-12 用户真机反馈）**：暖炭色相在用户屏幕上读作紫/褐，按用户参考图将全局表面**整族 re-base 为中性灰系**（canvas `#141414`、surface `#1b1b1b/#262626`、hairline `#2e2e2e/#333`、文字 `#f5f5f5/#c4c4c4/#a8a8a8`），**保留 S5 的全部结构统一**（圆角 3/4/6 制度、禁影、按钮 primary/ghost 制度、Inter+DM Mono+衬线、原语令牌整族接管）。另落地：画布常显淡白点阵（24px 网格，rgba(255,255,255,.05)，has-grid-dots 增强档）+ 中央光晕层移除；**白昼模式**激活（既有 `theme-light` 钩子 → 纯白底 + 淡黑点阵）；`--purple/--fuchsia` 残余整族清除；节点输入框改浅灰场域（rgba(255,255,255,.07) + 3px）；**PI 面板全面入系统**（外壳/头部/绿头像中性化/输入场域/按钮交互制度，[class] 抬特异性压注入层）。六组探针 + 132 项门测试全绿。

日期：2026-06-12
基准：`tmp/warp-DESIGN.md`（getdesign.md/warp，源取自 VoltAgent/awesome-design-md 仓库原文）
性质：实施记录。本轮以 Warp 设计文档为**唯一基准**对全前端做统一，前序 liblib 对标值（04–09 文档）凡与本基准冲突处一律以本文档为准。

---

## 一、五条铁律（来自 DESIGN.md Do/Don't）

> ⚠️ **历史值注记**：本节为 **[S5] 暖色历史值**（canvas `#2b2622` 等）；现行以顶部 **[S6] 中性灰**（canvas `#141414`、surface `#1b1b1b/#262626`、hairline `#2e2e2e/#333`、文字 `#f5f5f5/#c4c4c4/#a8a8a8`）为准。下游 13/14 导演台设计 token 一律取中性灰，**不得引用本节的暖色值**。

1. **暖炭画布**——canvas `#2b2622`（禁纯黑/中性灰，暖意即品牌）
2. **唯一主色 = 暖白 `#f7f5f0`**——同时是默认文字色与 primary 按钮填充；**禁止彩色 accent**
3. **圆角极紧**——按钮 3px / 卡片 4px / 大卡 6px；胶囊（pill）只许图标容器与状态丸
4. **禁投影**——层级 = 表面对比（canvas → canvas-soft `#383330`）+ 发丝线 `#3f3a36`
5. **Inter 400/500 工作对 + DM Mono + Instrument Serif 偶发斜体点缀**；负字距进显示层级

## 二、实施机制（三段式）

### 1. 机械化暖系变换（theme-upgrade.css 全文件）

有序色彩映射 35 组（冷灰/蓝系 → 暖系），关键对照：

```
#141414→#2b2622   #171717/#1b1b1b/#1c1c1c→#322d29   #262626→#383330
#2e2e2e/#363636→#3f3a36   #4a4a4a→#4d463f   #525252→#5a534b
#86909c→#8a8278   #c0c8d0→#c9c0ad   #e0e4e8→#dad2c1
#a8a8a8/#919191→#aea69c   #f7f7f7→#f7f5f0   #5a96ff(原accent)→#f7f5f0
rgba(255,255,255,x)→rgba(247,245,240,x)   蓝/靛全族→暖米族
语义色(danger/success/warning)按 DESIGN.md"产品内语义另行存续"条款保留
```

圆角紧缩（border-radius 声明行，豁免 50%/999px/滚动条/进度条）：20/16/14→6，12→4，10/8/7/6→3。

### 2. [S5] 总控块（文件末尾，对前序分区终裁）

- **原语整族接管**：`--white-02..90` → 暖白 alpha；`--black-10..95` → 暖黑 alpha——全应用每一处 hover/填充/描边一次性翻暖
- **漏网令牌补全**：`--bg-2/banner/context-menu/input/loader/modal/panel-dark/panel-solid`、`--surface-glass/icon-badge/video-*`、`--stroke-05..15/multi-select`、`--overlay-dim/preview` 全部入暖
- **圆角制度令牌化**：bundle `--radius-4..40` 整档重映射至 3/4/6
- **禁投影**：全部 `--shadow-*` → none；浮层改"软表面+发丝线"制度（15 类浮层统一列名覆盖）
- **按钮制度**：primary（确认/保存/激活类）= 暖白填充 + 暖黑字 + 3px；ghost（取消类）= 透明 + ink + 发丝边
- **字体**：`--font-ui` Inter 主导（本地未装落 system，CJK 链保留）；`--font-mono` DM Mono 主导（JetBrains 兜底）；`--font-serif` Instrument Serif
- **字重**：600 → 500（400/500 工作对）
- **衬线点缀**：空画布副标题 = Instrument Serif italic（DESIGN.md 的 editorial 时刻）
- **顶栏**：左上胶囊 → **全宽安静画布带**（canvas 底 + 发丝下边线，无圆角无阴影，nav-link 3px hover）

### 3. 注入层终裁（两个 !important 补丁）

助手 FAB 的绿色辐射底+辉光来自 `appAssistantPanel.js` 运行时注入样式（自带 !important 且后载）——以 `[class]` 抬到 (0,3,0) + !important 终裁为暖白辐射 + 禁影；助手收起钮蓝紫渐变一并入暖。

## 三、验证（8777 真机）

| 探针 | 结果 |
|---|---|
| `--bg` / `--white-10` / `--accent-primary` | `#2b2622` / `rgba(247,245,240,.10)` / `#f7f5f0` ✓ |
| `--radius-12` / 节点圆角 / 菜单圆角 / 按钮圆角 | 4px / 6px / 6px / 3px ✓ |
| `--shadow-menu` / 菜单实测 / FAB 实测 | none / none / none ✓ |
| 顶栏 | 全宽 1920×44 @0,0、r=0、发丝下边线 ✓ |
| primary 按钮 | 暖白填充 + #2b2622 字 + 3px ✓ |
| 衬线副标题 | Instrument Serif italic ✓ |
| 门测试 | indexEncoding + bootWiring + 助手面板 135/135 ✓ |

整体截图：`tmp/s5-warm-shell.png`。

## 四、保留与例外（依据 DESIGN.md 原文条款）

- 语义色（danger/success/warning）保留——"in-product semantic colors live in the application proper"
- 圆形保留面：连接桩/提交钮/FAB/头像（图标容器，`rounded.full` 条款）；滚动条与进度条（状态丸）
- [S2] 动效系统保留（DESIGN.md 无动效章节；既有节奏与"安静"气质一致）
- 选中环/编辑环类 box-shadow 保留（属发丝线的等价物，非投影）

## 五、回滚

单轮回滚 = 删除 [S5] 区块 + 还原色彩映射（git diff 可逆）；建议直接 `git checkout` 本文件至上一提交点。
