# 分镜脚本节点 · 产品架构 / 功能说明 / 内核-展现解耦可行性评估

> 基于源码逐文件核对（2026-06-14）。三路并行勘察 + 关键文件实读确认。状态结论以真实代码为准。

---

## Part A. 产品架构与详细功能说明

### A0. 一句话定位
`storyboard-script` 是画布上的一个**节点类型**，把"一段分镜计划"渲染成一张**可编辑的镜头表**（表格/卡片两种视图，图片/视频两种媒介模式）。它的数据由 ViMax「大脑」生成，经画布动作契约落到节点的 `data.storyboardScript`。

### A1. 三层数据流（端到端）

```
① 大脑/Planner (Python, 格式中立)              integrations/vimax/brain/{planner,prompts}.py
   LLM 输出 snake_case 镜头对象，schemaVersion = "vimax-shotplan/v1"
   { idx, is_last, cam_idx, visual_desc, audio_desc, ff_desc, lf_desc, motion_desc, variation_type ... }
            │
            ▼  ★唯一翻译边界★
② 画布动作映射 (干净源码)                       modules/assistant/vimaxCanvasActions.js  shotRow()
   snake_case → 中文列名的行对象：
   visual_desc→画面描述 / ff_desc→图片提示词 / motion_desc→视频提示词 / audio_desc→对白|音效
            │
            ▼
③ 动作契约 (Python，原样透传)                   services/claw_action_schema.py
   storyboard-script ∈ SAFE_NODE_TYPES；storyboardScript ∈ WORKFLOW_METADATA_FIELDS
   —— 不做任何 schema 归一，verbatim 透传
            │
            ▼
④ 节点工厂 + 渲染 (构建产物/已混淆)              src/core/storyboardScriptFactory.js + components/StoryboardScriptNode.js
   createDefaultStoryboardScriptState() 归一 → data.storyboardScript
   StoryboardScriptNode 按中文列键渲染表格/卡片
```

### A2. 数据模型 `data.storyboardScript`（确认）

```jsonc
{
  "version": 1,
  "viewMode": "list" | "card",        // 表格 / 卡片
  "mediaMode": "image" | "video",     // 决定可见列集合
  "rows": [                            // 核心：每行一个镜头，键为【中文列名】
    { "镜号":"1","时长":"0:05","景别":"全景","场景":"雨夜街道","画面描述":"...",
      "角色":"信使","角色描述":"...","角色动作":"奔跑","情绪":"紧张","角色图":"...",
      "参考":"...","图片提示词":"...","视频提示词":"...","对白":"...","音效":"..." }
  ],
  "rawJson": "...",                    // 原始输入留存（无损回环）
  "canonicalJson": "...",              // 规范化 JSON（schemaVersion: "storyboard-script.v1"）
  "title": "分镜脚本",
  "detectedIntent": { "shotCount": N, "totalDurationSeconds": S, ... },
  "selectedRowIndexes": [], "selectionMode": false,
  // 文本模型选择（生成用）
  "textModelSource": "local-registry", "selectedModelId": "...", "model": "...", "provider": "..."
}
```

**列集合（硬编码于工厂，15 列）**：镜号·时长·景别·场景·画面描述·角色·角色描述·角色动作·情绪·角色图·参考·图片提示词·视频提示词·对白·音效。
- **图片模式**隐藏 `视频提示词/对白/音效`；**视频模式**隐藏 `图片提示词`；`镜号`恒显；其余列**有值才显**（`getStoryboardScriptDisplayColumns`）。

### A3. 功能清单（确认）

| 面 | 功能 | 实现位置 | 说明 |
|---|---|---|---|
| 生成 | 大脑产出分镜 | planner/prompts.py | LLM 出 snake_case，非中文键 |
| 落盘 | 映射成镜头表 | vimaxCanvasActions.js `shotRow` | 一行/镜头，中文键，缺列渲染空 |
| 工厂 | 归一/规范化 | storyboardScriptFactory.js | 容器形状容忍（rows/shots/scenes/items）、`场景` 别名归一、canonicalJson/rawJson 回环、CSV 导出、列显隐 |
| 渲染 | 表格/卡片视图 | StoryboardScriptNode.js | 列密度分级、粘性表头/选择列、内联单元格编辑→`updateNodeData` |
| 视图 | list/card 切换、image/video 切换、行选择/选择模式 | StoryboardScriptNode.js | 写回 `viewMode/mediaMode/selectedRowIndexes` |
| 导出 | CSV（含 BOM） | `serializeStoryboardScriptRowsToCsv` | 列顺序=硬编码数组顺序 |
| 编辑（单镜） | 改 prep 节点提示词 → 渲染 | vimaxWriteback.js `collectVimaxEdits` | 镜头表更多是**计划展示**，渲染编辑走 prep（ai-image, vimaxRole=prep），按 `vimaxShotIdx` 寻址 |
| 契约 | 单镜编辑作用域 | claw_action_schema / canvas_agent_action_schema | `metadata.storyboardEditScope=single_shot`、`storyboardId`、`targetShotIndex/vimaxShotIdx` |

### A4. 版本与容错现状（确认）
- 存在版本号字符串：`vimax-shotplan/v1`（大脑）、`storyboard-script.v1`（节点 canonical），但**没有迁移/协商逻辑**。`mapVimaxShotplanToCanvasActions` 对版本不符**硬抛错**。
- 容错只有两处：**容器形状**（rows/shots/scenes/items 都能取到行）+ **`场景`列别名**（scene/场景标签/sceneTags/location→场景）。**没有列名级别的多版本兼容**。
- 一条回归测试**锁死中文行形状**（`{"镜号":"0","图片提示词":"rainy street"}`）——既是护栏也是改造时要迁移的对象。

---

## Part B. 内核 ↔ 展现 解耦可行性评估

### B1. 核心判断：**内核其实已经存在，只是被一处翻译边界"中文化"后固化了**
- 大脑产出的 `vimax-shotplan/v1`（snake_case、语言中立）**就是天然的内核**。
- "展现格式耦合"是在**唯一一处**（`vimaxCanvasActions.js shotRow`）把内核翻译成中文键，然后被**工厂的中文列常量**和**节点按中文键渲染**两处固化、被**测试锁死**。
- 也就是说：**耦合是局部的、有明确接缝的**，不是散落全身。这让解耦在概念上是**高可行**的。

### B2. 五点耦合（改一列今天要动 5 处）
1. 大脑字段名（snake_case，但需新增字段时要改 prompt）
2. `shotRow` 映射（中文键，**唯一翻译边界**）
3. 工厂列常量 `STORYBOARD_SCRIPT_COLUMN_LABELS` + 图/视频模式列集（中文）
4. 节点渲染按中文键取值 + 列密度分组（中文）
5. 测试断言中文行形状

### B3. 真正的落地约束（决定"怎么做"而非"能不能做"）
| 约束 | 实测 | 影响 |
|---|---|---|
| **构建产物已混淆** | `storyboardScriptFactory.js`=单行 16.5k 字符；`StoryboardScriptNode.js`=含 123k 字符巨行；`storyboardScriptAction.js` 同 | **工厂与节点不是可手改源码**。干净改造需要它们的**上游源码**（本仓没有），否则只能在干净接缝改 + 覆盖层 |
| 干净接缝 | `vimaxCanvasActions.js`（166 行、可读）是干净源码 | 生产侧改造可直接落 |
| 持久化数据 | 已存画布里的节点 = 中文键行 | 必须**读时迁移**（中文键→稳定 fieldId），幂等无损 |
| 契约透传 | claw 原样透传 storyboardScript | **后端不会阻挠** schema 演进（利好） |
| 镜头身份基于下标 | `vimaxShotIdx` 是数组下标 | 重排/插删会错位，单镜编辑寻址脆 |

### B4. 结论
- **可行性：高（概念）/ 中（落地）**。值得做。
- **最大变量是"源码可改性"**：工厂+节点是混淆产物。两条路——
  - **(甲) 上游路**：拿到 factory/node 的原始源码，在源码层做干净解耦（最干净，但依赖能否拿到上游仓）。
  - **(乙) 接缝+覆盖路**：在干净的生产侧（vimaxCanvasActions）+ 新建一个干净的"内核/适配器"模块产出数据；渲染侧若动不了混淆节点，就用**覆盖层渲染**（团队在导演台已验证过这套 overlay 打法）。
- 后端契约原样透传 + 数据是每节点自包含 JSON → **演进 schema 不会和后端打架**，这是关键利好。

---

## Part C. 「哇塞」设计方案（强架构师视角，且能落地）

### C1. 核心思想：**自描述的分镜文档模型（SDM, Storyboard Document Model）+ 端口适配器（Hexagonal）**
不要"重命名键"那种小修。一个有水平的人会让**数据自己携带它的 schema**，把"格式"降级成内核之上的一层可插拔适配器。

```
                    ┌───────────────── 入站适配器 (Inbound Ports) ─────────────────┐
  vimax-shotplan/v1 ─┤                                                            │
  旧·中文键行        ─┤→  toSDM(source) ──►   ★ Storyboard Document Model (内核) ★  │
  CSV/竞品/其他LLM   ─┤                       自描述、版本化、语言中立              │
                    └────────────────────────────────┬───────────────────────────┘
                                                      │
                    ┌───────────── 出站适配器 (Outbound Ports / 渲染&序列化) ──────┐
                    │  SDM →  表格视图 / 卡片视图 / CSV / Markdown / JSON /         │
                    │         生成用提示词 / 竞品导出格式 ...                       │
                    └──────────────────────────────────────────────────────────────┘
```

**内核 SDM 形状（自描述是关键）**：
```jsonc
{
  "schemaVersion": "sdm/2",
  "columns": [                          // ★ 列定义随数据走 → 任何版本都能渲染，无需改代码
    { "id": "shot_no",  "type": "shot-number", "role": "index",  "labels": {"zh":"镜号","en":"Shot #"}, "media": ["image","video"], "width": "narrow" },
    { "id": "duration", "type": "duration",                       "labels": {"zh":"时长"},               "media": ["image","video"] },
    { "id": "img_prompt","type": "prompt",     "role": "gen-image","labels": {"zh":"图片提示词"},          "media": ["image"] }
    /* ... */
  ],
  "shots": [                            // ★ 行按稳定 fieldId 键 + 稳定 shotId（非下标）
    { "shotId": "s-7f3a", "shot_no": 1, "duration": 5, "img_prompt": "...", "_unknown": { /* 透传未知列 */ } }
  ],
  "meta": { "title": "...", "detectedIntent": {...}, "sourceSchema": "vimax-shotplan/v1", "warnings": [] }
}
```

### C2. 五个"哇塞但可落地"的设计支点
1. **自描述文档**：列定义（id/type/语义角色/各语言标签/媒介可见性/宽度）随数据一起存。→ **新增一列/支持一个新版本 = 加一条列定义，零渲染代码改动**。这正面命中"兼容多版本产出"。
2. **端口适配器**：把"格式"从内核里赶出去。入站把任意来源 → SDM；出站把 SDM → 任意展现（表格/卡片/CSV/Markdown/提示词/竞品格式）。展现格式从此是**纯函数适配器**，可单测、可热插拔。
3. **类型化字段 + 格式器注册表**：`duration` 存秒（数值），展示时按 type 格式化（`0:05`）；`prompt`/`image-ref`/`enum` 各有 parser/formatter。**数据不再持有展示字符串**（中文标签移到列定义/i18n）。
4. **版本迁移链 + 向前兼容**：每个 SDM 带 `schemaVersion`，读时 `v1→v2` 升级；未知版本走**尽力适配 + warnings**；未知列**原样透传**（`_unknown` + rawJson 无损回环）。→ 旧画布、未来版本、第三方导入都不炸。
5. **稳定镜头身份**：`shotId`（非数组下标）做主键。单镜编辑、重排、跨节点引用都靠它，告别 `vimaxShotIdx` 下标错位。

### C3. 落地路线（绞杀者模式，每步可单独发布 + 测试绿）
> 关键：**不做大爆炸重写**。每一步行为不变或仅扩展，测试始终绿。

- **Phase 0 · 列注册表（纯重构，零行为变化）**
  在干净源码新建 `storyboardColumns.js`：`{ fieldId ↔ {labels,type,media,width} }` 作单一真相源。先令 `fieldId === 现中文键`（行为完全不变）。生产侧 `shotRow` 改为"按列注册表生成行"。→ 五点耦合先收敛成"一处注册表"。
- **Phase 1 · 引入 SDM + 入站适配器**
  新建干净的 `storyboardDocModel.js`：`shotplanToSDM()`（替代手写中文映射）+ `legacyRowsToSDM()`（旧中文键行→SDM，幂等无损，读时迁移）。生产侧产出 SDM；契约原样透传（后端无需动）。
- **Phase 2 · 出站适配器（展现解耦）**
  `sdmToTableRows() / sdmToCards() / sdmToCsv() / sdmToMarkdown() / sdmToGenPrompt()` 纯函数。渲染侧消费 SDM——**若节点是混淆产物动不了，就走覆盖层渲染**（导演台 overlay 同款打法），或在拿到上游源码后替换渲染读取。
- **Phase 3 · 版本/迁移/多格式入站**
  迁移链 + warnings + 稳定 shotId + 多入站（CSV 导入、竞品格式、其他 LLM schema）。至此**真正多版本兼容**。

### C4. 风险登记 & 缓解
| 风险 | 缓解 |
|---|---|
| 工厂/节点是混淆产物，渲染侧难直接改 | 优先拿上游源码做 Phase 2；拿不到则用覆盖层渲染（已验证打法）。**先做 Phase 0/1（全在干净源码）即已拿走大部分价值** |
| 已存画布是中文键行 | `legacyRowsToSDM` 读时迁移，幂等 + rawJson 无损回环 + golden 测试 |
| 测试锁死中文行形状 | 有意迁移该测试：断言 SDM（fieldId 键）+ 新增"旧中文行往返"适配器测试 |
| 版本不符硬抛错 | 放宽为协商/尽力适配 + warnings，不再炸 |
| 下标身份脆 | 谨慎引入 shotId，旧数据迁移时按序生成稳定 id |

### C5. 一句话验收
> 「**加一种新的分镜产出版本 / 新增一列 / 换一种导出格式，都只改'数据或适配器'，不碰渲染与内核。**」——做到这句，就是解耦成了。

---

## 附：单一真相 & 待办
- 干净可改：`modules/assistant/vimaxCanvasActions.js`（生产侧接缝，先动这里）。
- 混淆产物（需上游源码或覆盖层）：`src/core/storyboardScriptFactory.js`、`components/StoryboardScriptNode.js`、`components/nodeToolbar/storyboardScriptAction.js`。
- 后端契约：`services/claw_action_schema.py` 原样透传 storyboardScript（演进无阻）。
- 下一步建议先做 **Phase 0 列注册表**（纯重构、全在干净源码、可单测、零行为变化），用最小代价验证方向。
