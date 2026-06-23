# D4 · 运镜轨迹示意图生成器（Camera-Path Schematic）

> 编号 D4 ｜ 缺口类 D（覆盖与品味）｜ 优先级 P2 ｜ 状态 Draft v0.1 ｜ 落地可靠性自评 4/5

---

## 1. 问题陈述 Problem

**现状（引 director-suite 具体文件）：**

director-suite 目前的全部成员产物分两类，**都不产出"给客户/团队预审看的可视化分镜示意图"**：

- 文字镜头卡：`storyboard/output-contract.md`（v2.0，时长制 场景→镜头组→镜头）逐镜写满 `运镜：<手法>——<叙事意图>；<物理描述：起止位移/速度感>`（见该文件 §4 镜头字段、§2.2 运镜与情绪映射表，10 种运镜手法：推/拉/跟前/跟后/环绕/手持/斯坦尼康/升降上/升降下/固定）。这是**纯文字**，客户读不出"镜头怎么动、机位在哪、一组镜头节奏快慢"。
- 视觉成员：`character-board/`（角色三视图）、`color-palette/`（色板）、`keyframe/`（首/尾帧单帧静图）——它们各画"某一格画面长什么样"，**没有任何成员画"镜头如何运动 / 一组镜头的轨迹与节奏总览"**。
- 知识库里**已存在这个概念但无人生产**：`_shared/style-refs.md` 第 131 行风格参考表有一行「动作预演分镜 | stick-figure storyboard, 手绘粗粝 | 英文技术标注(PUSH IN/WIDE/POV) | 火柴人+轨迹虚线」——这是**一条风格知识（Bone 层数据）**，但 Skin 层没有成员把它实例化成"针对本片镜头组的运镜轨迹示意图"产物。

**痛点（为何是问题）：**

1. **预审断层**：客户/导演/剪辑在真机出片（付费、慢、单镜 4–15s）之前，无法用一张图快速对齐"这组镜头到底怎么动"。文字镜头卡需逐字读、不可一眼扫，评审会上无法投屏快速过稿。
2. **运镜语义流失**：`运镜` 字段里的"起止位移/速度感/环绕半径/升降方向"是空间信息，被压扁成一句话后，团队对"推多深、绕多大圈、跟在前还是后"理解不一致——这正是返工高发区。
3. **生态已证明此能力是标配、唯独本套件缺**：方向简报指出 AI 短剧 `media_generator` 段有"运镜轨迹示意图"的完整 ImageToImage 模板；本套件却把它停留在一行风格参考，没接成可执行产物。缺口类落在 **D（覆盖与品味）**：不是"没脑子"（已有运镜映射表）、不是"没秤"，而是**一个公认应有的下游可视化覆盖缺失**。

---

## 2. 证据与接地 Evidence

**哪些源 skill 有此能力（点名）：**

- **AI 短剧 `media_generator` 段**（方向简报直接证据）：有"运镜轨迹示意图"的完整 **ImageToImage 模板**——以一张参考图为底（机位俯视图/场景平面），叠加箭头与标注生成运镜示意图。这是本方向的母模板来源。
- **一图成片**的"视觉基因解构"、**拉片复刻**的"参考视频→镜头拆解 00:00–15s→换主体保剪辑点"：证明源生态把"镜头如何拆/如何运动"做成**可视化中间产物**而非只留文字，是行业既有实践。
- **Flova 平台流水线**（`planner→multimodal_analyze→storyboard_designer→media_generator→video_assembler`，带依赖 DAG + 强制暂停门）：证明"分镜→可视示意"是流水线里 `storyboard_designer` 与 `media_generator` 之间的标准一环，本套件正缺这一环。

**director-suite 盲点落在哪个文件/成员：**

- **盲点根源**：`_shared/style-refs.md:131`「动作预演分镜（火柴人+轨迹虚线+PUSH IN/WIDE/POV 标注）」**只是 Bone 层一条参考数据，没有对应 Skin 层成员**。
- **盲点表现**：`storyboard/output-contract.md` §2.2 的 10 种运镜手法 + §4 的 `运镜` 物理描述字段，是**唯一**结构化运镜数据源，但下游无任何成员消费它来画图。`keyframe/`（最接近的视觉成员）只画"某一瞬间的单帧"，明确声明"**不是**抽象故事板"（见 `keyframe/SKILL.md:17`），不承担"一组镜头的运动轨迹总览"。
- **结论**：需新增一个**下游视觉成员** `camera-path/`（Skin 层），消费 storyboard 的运镜数据，复用 keyframe 已验证的 ImageToImage 锚定范式，产出运镜轨迹示意图。

---

## 3. 目标与非目标 Goals / Non-Goals

**Goals：**

- G1：新增 Skin 层成员 `camera-path/`，输入 = storyboard 镜头组（或全片分镜表），输出 = **每镜头组一张"运镜轨迹示意图"提示词卡 + 可粘贴图像模型 ImageToImage 提示词**，使客户/团队不出真机片即可一眼读懂运镜与节奏。
- G2：定义固定的**视觉编码契约**：箭头图例（推进 red / 拉远 blue / 环绕 green / 升降 purple / 跟随 orange / 固定 cyan）+ 逐切中文标注 + 机位图标虚线轨迹 + 节奏总结框，并与 `storyboard/output-contract.md` §2.2 的 10 种运镜手法**一一映射**（含手持/斯坦尼康/跟前跟后的归并规则）。
- G3：示意图字段**纯派生**于 storyboard 镜头卡的 `运镜/景别/时长/切镜方式`，不引入新的创作自由度——保证"示意图忠实反映镜头卡"，而非自行编造运动。

**Non-Goals（明确边界）：**

- NG1（**不破引擎隐身**）：示意图是**预审/沟通用过程产物**，类同审计/自检——它**绝不可作为帧进入成片视频**，也不可把"轨迹箭头/机位图标/PUSH IN 标注"渲染进 Seedance 成片提示词。引擎隐身铁律（`storyboard/output-contract.md` §7.8）在此扩展为"**示意图层不可漏进成片层**"。
- NG2（**不破可移植性**）：成员只产出**图像模型无关**的"示意图提示词 + ImageToImage 套打说明"，默认目标图像模型与 keyframe 一致（GPT-Image-2 / Nano Banana Pro），**不绑定**任何宿主 App / 渲染引擎；不引入需安装的画图依赖（不写 Python/SVG 渲染脚本作为强依赖，渲染交给图像模型，与套件"纯提示词"形态一致）。
- NG3：不替代 keyframe（单帧）、不替代真机出片；不做"自动从视频反推轨迹"（那是拉片方向 D-series 另案）。
- NG4：不改 storyboard 契约的**任何**既有字段语义（只读消费，不回写）。

---

## 4. 需求 Requirements

### 4.1 功能需求 FR

**D4-FR-01 运镜→视觉编码映射表（颜色/图标/轨迹形）**
- 描述：新增一张固定映射表，把 `storyboard/output-contract.md` §2.2 的 10 种运镜手法映射到 6 类视觉编码：箭头**颜色**（推进 red `#E5484D` / 拉远 blue `#3B82F6` / 环绕 green `#22C55E` / 升降 purple `#A855F7` / 跟随 orange `#F59E0B` / 固定 cyan `#06B6D4`）+ 轨迹**形状**（直线/弧线/螺旋/垂直/平行跟线/定点叉号）+ 机位**图标**（摄影机俯视三角）。手持/斯坦尼康归并入"跟随 orange"并附抖动/平滑修饰符；跟前=orange 实线箭头朝向主体前方、跟后=orange 实线箭头位于主体后方。
- 可量化验收：①10 种手法 100% 各有唯一 (颜色, 轨迹形, 图标修饰) 三元组，无冲突、无遗漏（脚本断言 `len(unique_triples)==10`）；②6 种基色 HEX 与本契约表逐字一致；③对 `fewshot-翡翠楼夜宴-v2全片.md` 全片所有镜头组，每个 `运镜` 值都能命中表中一行，未命中数 = 0。

**D4-FR-02 镜头组→运镜轨迹示意图卡（派生、不创作）**
- 描述：对每个镜头组，从其镜头卡只读抽取 `景别 / 运镜手法 / 物理描述(起止位移·速度感·半径·方向) / 时长 / 切镜方式`，生成一张示意图卡，含 4 个固定视觉区块：(a) **机位图标 + 虚线轨迹**（按 FR-01 编码）；(b) **逐切中文标注**（每切：景别 + 运镜中文名 + 时长，如"中近景·缓推·5s"）；(c) **箭头图例框**（6 色对照）；(d) **节奏总结框**（镜数 / 总时长 / 切点密度 / 主导情绪强度 / 节奏标签 文戏·武戏·混合）。
- 可量化验收：①卡内 4 区块全部存在（缺一即不合格，schema 校验）；②(b) 逐切标注条数 == 该组镜头数（与 storyboard 镜头数一致，差值 = 0）；③(d) 节奏框"总时长"== Σ镜时长（容差 ±1s，复用 storyboard §5 校验口径）；④示意图卡**不含**任何成片字段（无台词/无 HEX 色卡/无音效）——这些属成片层，泄漏即不合格。

**D4-FR-03 ImageToImage 套打提示词（可粘贴施工单）**
- 描述：每张卡后附一段可直接粘贴的图像模型提示词，采用 keyframe 已验证的 **ImageToImage** 范式（参考 `_shared/continuity-quality.md:25`「多状态参考用 ImageToImage」）：以"场景平面/机位俯视底图"为 `<<<image_1>>>` 参考（无底图时降级为 TextToImage 平面示意），叠加箭头/图标/标注。固定视觉风格 = `technical storyboard schematic, top-down camera blocking diagram, clean vector look, 火柴人/摄影机三角图标, dashed motion trajectories, labeled in 中文`，并**固定负向串**排除写实成片观感（`no photorealistic film still, no cinematic lighting, this is a schematic NOT a final frame`）。
- 可量化验收：①提示词含 `ImageToImage`（有底图）或显式 `TextToImage 平面示意`（无底图）路径声明，二选一必现；②负向串含"this is a schematic NOT a final frame"原句（防被误用为成片帧）；③6 类运镜颜色在提示词里以英文 + HEX 双写（如 `push-in = red #E5484D arrow`），逐条可 grep。

**D4-FR-04 成员落地（SKILL.md + output-contract.md + megaprompt + README 注册）**
- 描述：按套件既有"视觉成员"标准结构落地：新建 `camera-path/SKILL.md`（frontmatter 触发词 + 6 步管线，对齐 keyframe SKILL 形态）、`camera-path/output-contract.md`（字段契约 + FR-01 映射表 + 自检门）、`_megaprompts/camera-path.megaprompt.md`（自包含导出版），并在 `README.md` 家族成员表新增一行。
- 可量化验收：①4 个文件均存在（路径见 §5.1，文件存在性校验）；②`SKILL.md` frontmatter 含 `description` 且命中"运镜轨迹/示意图/分镜示意/camera path/运镜图"等触发词 ≥5 个；③`README.md` 单产物成员表新增"🎥 运镜轨迹示意图"一行且指向 `camera-path/`；④megaprompt 自包含（内联 FR-01 映射表，不靠相对路径 import），可独立粘贴运行。

### 4.2 非功能需求 NFR

**D4-NFR-01 引擎隐身 + 示意层不漏进成片（铁律）**
- 示意图卡与套打提示词里允许出现技术标注（PUSH IN/轨迹/机位图标）——这是本产物的**本体**；但生成 Seedance 成片时，storyboard/keyframe 的成片提示词**绝不可**引用本示意图作为参考帧、**绝不可**把箭头/图标/标注词混入成片提示词。同时，引擎术语（Polanyi/默会/支柱编号/方法论）仍零出现。验收：对成片提示词 grep `箭头|轨迹|机位图标|schematic|PUSH IN 标注` 命中 = 0；grep 引擎术语命中 = 0。

**D4-NFR-02 可移植性**
- 成员形态 = 纯 Markdown 提示词契约，零运行时依赖、零宿主绑定。图像模型默认与 keyframe 同档（GPT-Image-2 / Nano Banana Pro），换模型仅需改"套打提示词"的模型标记行。验收：成员目录内无 `.py/.js/.exe` 强依赖；提示词不出现 `127.0.0.1:8777` 等宿主 App 痕迹。

**D4-NFR-03 派生一致性（示意图 == 镜头卡）**
- 示意图字段必须 100% 可回溯到 storyboard 镜头卡，禁止"为图好看"新增镜头卡里没有的运动。验收：抽样 ≥3 个镜头组，逐项核对（运镜手法/景别/时长/切镜方式）与源镜头卡一致，差异项 = 0。

**D4-NFR-04 性能/成本**
- 单张示意图卡生成（纯文本，不含真机出图）应在一次模型回合内完成；ImageToImage 真机出图为**可选**末步、且 1 镜头组 1 张（不逐镜出图，避免碎贵）。验收：文本卡产出 0 次真机调用即可完成；真机出图张数 == 镜头组数（非镜头数）。

**D4-NFR-05 色彩可读性（一致性/无障碍）**
- 6 类箭头基色两两可区分（避免红绿对色盲不可读）：在 6 色中红/绿并存时，强制叠加**形状差异**（推=直箭、绕=弧/螺旋）而非仅靠颜色。验收：图例框每色同时标注"颜色 + 形状 + 中文名"三要素，缺一不合格。

---

## 5. 设计 Design

### 5.1 新增/改动文件精确路径清单

**新增（4 个）：**
```
skills/director-suite/camera-path/SKILL.md                       # 成员触发 + 6步管线（Skin）
skills/director-suite/camera-path/output-contract.md             # 字段契约 + FR-01映射表 + 自检门（Skin）
skills/director-suite/_megaprompts/camera-path.megaprompt.md     # 自包含导出版
skills/director-suite/docs/optimization/D04-camera-path-sheet.md # 本 PRD（已落盘）
```

**改动（2 个，均为追加/注册，不改既有语义）：**
```
skills/director-suite/README.md
  - 「家族成员 · 单产物成员」表新增一行：🎥 运镜轨迹示意图 → camera-path/
  - 「目录结构」树新增 camera-path/ 节点
skills/director-suite/_shared/style-refs.md
  - 第131行「动作预演分镜」一行追加交叉引用注脚：「→ 实例化产物见 camera-path 成员」
  （只加引用，不改该行既有内容）
```

**只读消费、不改：** `storyboard/output-contract.md`（运镜/景别/时长/切镜方式数据源）、`_shared/mapping-tables.md`（运镜×情绪表）、`_shared/continuity-quality.md`（ImageToImage 范式）。

### 5.2 挂进 Soul / Bone / Skin 哪层

- **Skin（皮 · 主要落点）**：`camera-path/` 整个成员 = 第三方下游视觉成员，与 `keyframe/`/`color-palette/`/`character-board/` 同级。它**只读** Bone 层的运镜映射、Soul 层的情绪强度结论，自身不新增默会推理。
- **Bone（骨 · 一处轻量增量）**：FR-01 的"运镜→视觉编码映射表"是新的查表数据，物理上写在 `camera-path/output-contract.md` 内（成员私有表，因为只有本成员消费），并在 `_shared/style-refs.md:131` 留一条交叉引用指针。
- **Soul（灵魂 · 零改动）**：不触碰 `tacit-core.md`；引擎隐身铁律被本成员继承并扩展为"示意层不漏成片"。

### 5.3 关键 schema / 契约字段 / 算法

**(A) 运镜→视觉编码映射表（FR-01，写入 output-contract.md）**

| storyboard 运镜手法 | 类别 | 箭头色 HEX | 轨迹形 | 机位图标修饰 |
|---|---|---|---|---|
| 推 Push In | 推进 | red `#E5484D` | 直线（朝主体，渐粗） | 三角向内 |
| 升降下 Crane Down | 推进/介入 | red `#E5484D`（垂直变体）| 垂直向下直线 | 三角下移 |
| 拉 Pull Out | 拉远 | blue `#3B82F6` | 直线（离主体，渐细） | 三角向外 |
| 升降上 Crane Up | 拉远/抽离 | blue `#3B82F6`（垂直变体）| 垂直向上直线 | 三角上移 |
| 环绕 Orbit | 环绕 | green `#22C55E` | 弧线/螺旋（标半径与圈向）| 三角沿弧 |
| 升降上/下（纯升降）| 升降 | purple `#A855F7` | 垂直双向 | 三角带↕ |
| 跟前 Lead | 跟随 | orange `#F59E0B` | 平行跟线（箭头在主体前）| 三角前置 |
| 跟后 Follow | 跟随 | orange `#F59E0B` | 平行跟线（箭头在主体后）| 三角后置 |
| 手持 Handheld | 跟随（抖动）| orange `#F59E0B` | 跟线 + 锯齿抖动修饰 | 三角带波纹 |
| 斯坦尼康 Steadicam | 跟随（平滑）| orange `#F59E0B` | 跟线 + smooth 修饰 | 三角带流线 |
| 固定 Static | 固定 | cyan `#06B6D4` | 定点叉号 ✕（无位移）| 三角钉死 |

> 升降语义在 storyboard 里随情绪可归"推进/拉远"或独立"升降"，本表用 purple 作**纯升降**通道、red/blue 作**带推拉意图的升降**变体，由镜头卡 `物理描述` 的位移方向裁决（向心=推进色、离心=拉远色、纯垂直无远近=purple）。

**(B) 运镜轨迹示意图卡 schema（FR-02，伪结构）**
```
=== [图像模型] CameraPath - [项目/集数/镜头组N] 运镜轨迹示意图 ===

【用途】预审/团队沟通用 · 非成片帧 · 忠实派生自 镜头组N 镜头卡（不创作运动）

[底图锚定]
  reference: <<<image_1>>> = 场景平面/机位俯视底图（无则降级 TextToImage 平面示意，标注"无底图"）
  inherit: 仅继承空间布局/主体站位/朝向；不继承光影色彩（示意图不上成片色）

[轨迹层 TRAJECTORY]   # 按 §5.3(A) 编码
  镜1: {景别, 运镜=推 Push In, 色=red#E5484D, 形=直线渐粗, 起止位移=约12cm, 速度=匀速, t=5s}
  镜2: {...}
  ...（条数 == 镜头组镜数）

[图例 LEGEND]  推进red / 拉远blue / 环绕green / 升降purple / 跟随orange / 固定cyan（色+形+中文名 三要素）

[逐切标注 CALLOUTS]   # 每切一条中文短标，叠在轨迹旁
  "中近景·缓推·5s" / "全景·固定·5s" / ...

[节奏总结框 RHYTHM]
  镜数=N ｜ 总时长=Σs（==组时长±1s）｜ 切点密度=N/总时长 ｜ 主导情绪强度=k(0–5) ｜ 节奏=文戏/武戏/混合

[示意图风格锁定 + 负向]  technical schematic, NOT a final film frame（见 FR-03）
```

**(C) 派生算法（伪代码，强调"只读不创作"）**
```
for group in storyboard.shot_groups:
    callouts, trajectories = [], []
    for shot in group.shots:                       # 只读 storyboard 镜头
        m = shot.运镜.手法                          # 命中 §5.3(A) 表
        code = CAMERA_CODE_TABLE[m]                 # (color, shape, icon) 三元组；未命中→报错(FR-01)
        trajectories.append({景别, m, code, shot.物理描述, shot.时长})
        callouts.append(f"{shot.景别}·{中文名(m)}·{shot.时长}")
    assert len(callouts) == len(group.shots)        # FR-02②
    rhythm = {镜数, Σ时长, 切点密度, group.情绪强度, group.节奏}
    assert abs(rhythm.Σ时长 - group.组时长) <= 1    # FR-02③ 复用 storyboard §5
    emit_card(group, trajectories, callouts, LEGEND, rhythm)   # 4 区块齐全→否则不合格
    # 注意：emit 的卡内禁出现 台词/HEX色卡/音效（成片字段）→ NFR-01
```

### 5.4 数据流（ASCII）

```
storyboard 镜头卡(运镜/景别/时长/切镜方式)         _shared/style-refs.md:131(火柴人轨迹参考)
            │  (只读)                                        │ (风格锚)
            ▼                                                ▼
   ┌──────────────────────── camera-path 成员 (Skin) ───────────────────────┐
   │  §5.3(A)运镜→视觉编码映射  →  §5.3(C)派生算法(只读不创作)               │
   │              │                                                          │
   │              ▼                                                          │
   │      运镜轨迹示意图卡(4区块: 轨迹/图例/逐切标注/节奏框)                 │
   │              │                                                          │
   │              ▼                                                          │
   │   ImageToImage 套打提示词(<<<image_1>>>底图 + 箭头/图标/标注 + 负向串) │
   └──────────────┬──────────────────────────────────────────────┬─────────┘
                  │                                               │
                  ▼                                               ✗ 引擎隐身闸(NFR-01)
        客户/团队 预审示意图(过程产物)              ┄┄┄┄ 绝不可作为参考帧进入 ┄┄┄┄►  Seedance 成片
                                                          (示意层 ≠ 成片层)
```

---

## 6. 验收标准 Acceptance Criteria (DoD)

- DoD-1（FR-01）：`camera-path/output-contract.md` 含运镜→视觉编码映射表，10 种手法各有唯一 (色HEX, 轨迹形, 图标修饰) 三元组；对 `storyboard/examples/fewshot-翡翠楼夜宴-v2全片.md` 全片镜头组逐 `运镜` 命中，**未命中 = 0**。
- DoD-2（FR-02）：随机抽 3 个镜头组，各生成示意图卡，逐项核验：4 区块齐全；逐切标注条数 == 源镜头数（差 0）；节奏框总时长 == Σ镜时长（±1s）；卡内**无**台词/HEX/音效 成片字段。
- DoD-3（FR-03）：每张卡附套打提示词，含 ImageToImage 或 TextToImage 路径声明；含原句 `this is a schematic NOT a final frame`；6 色英文+HEX 双写齐全。
- DoD-4（NFR-01 铁律）：对同一镜头组的 **storyboard/keyframe 成片提示词** grep `箭头|轨迹|机位图标|schematic|PUSH IN`，命中 **= 0**；grep 引擎术语（Polanyi/默会/支柱/方法论），命中 **= 0**。
- DoD-5（FR-04）：4 个新文件存在；`README.md` 成员表/目录树已注册 `camera-path/`；`style-refs.md:131` 已加交叉引用；megaprompt 自包含可独立运行。
- DoD-6（NFR-02）：成员目录无运行时强依赖文件；提示词无宿主 App 痕迹。
- DoD-7（NFR-05）：图例框每色三要素（颜色+形状+中文名）齐全，红/绿靠形状可区分。
- DoD-8（对图核验，真机可选）：用 1 个镜头组真机 ImageToImage 出 1 张示意图，人眼核验"箭头颜色/轨迹方向/逐切标注/节奏框"与镜头卡语义一致（≥3 名评审一致通过）。

---

## 7. 验证方案 Verification Plan

**验证手段：**

1. **审计脚本（结构闸，自动）**：`verify_camera_path.py`（或等价 PowerShell/node）——解析示意图卡，断言 FR-01 三元组唯一性、FR-02 4 区块 + 标注条数 + 时长容差、FR-03 必现句与双写、NFR-01 成片提示词零泄漏。这是**冷启动可重跑的回归门**。
2. **回归 diff（基线）**：以 `storyboard/examples/fewshot-翡翠楼夜宴-v2全片.md` 全片为**固定基线**，对每个镜头组跑映射表，输出"运镜命中表"。基线断言：未命中 = 0；命中分布与人工标注一致。改成员后重跑 diff，无新增未命中即通过。
3. **真机出片 A/B（对图核验）**：取 1–2 个镜头组真机 ImageToImage 出示意图（付费步，由用户亲点），人评 A/B：A=纯文字镜头卡、B=镜头卡+示意图，量"团队 60s 内能否正确复述运镜与节奏"的命中率，B 应显著高于 A。
4. **引擎隐身专项 grep（铁律闸）**：对该镜头组的 storyboard+keyframe 成片提示词跑 NFR-01 grep，命中必须为 0。

**测试用例 / 基线：**
- 基线：`fewshot-翡翠楼夜宴-v2全片.md`（已存在的全片，含全部 10 类运镜的真实分布）。
- 用例 T1：单镜头组（5 镜，含推+固定+切镜方式）→ 卡 4 区块 + 5 条标注 + 时长闭合。
- 用例 T2：含环绕 Orbit 的组 → 轨迹形为弧/螺旋且标半径方向。
- 用例 T3：含手持/斯坦尼康的组 → 归并 orange + 抖动/平滑修饰正确。
- 反例 T4：故意把"音效/台词"塞进示意图卡 → 审计脚本必须报不合格（验证 NFR-01 闸有效）。

**为何这样能证明"真的有效"：**
- 结构闸（脚本）+ 基线 diff 证明"示意图忠实派生、字段不缺、不泄漏成片"——这些是可量化、可重跑的硬断言，非主观"质量提升"。
- A/B 人评证明"对预审沟通确有增益"（命中率数值），把"给客户看的图"这一价值落到可测指标。
- 反例 T4 证明引擎隐身闸是**真闸**（能拦截泄漏），而非摆设。

**落地可靠性理由（4/5）：**
- 上调因素：①复用 keyframe 已验证的 ImageToImage 锚定范式与成员目录结构，无新架构风险；②数据源（storyboard 运镜字段）已结构化、已有全片基线；③成员纯 Markdown、零依赖、可移植。
- 扣 1 分因素：图像模型对"top-down 机位俯视 + 精确箭头/中文标注"的**渲染保真度**有不确定性（可能箭头方向/中文标注糊），需 ImageToImage 底图 + 多轮微调兜底，故不给满分。

---

## 8. 依赖与顺序 Dependencies

- **依赖 storyboard 契约稳定**：本成员只读 `storyboard/output-contract.md` §2.2/§4 的运镜与字段；若 storyboard 字段语义变更，需同步 FR-01 映射表。**前置**：storyboard v2.0 契约（已就绪）。
- **依赖 ImageToImage 范式**：`_shared/continuity-quality.md:25` 的 ImageToImage 约定（已就绪）。
- **可选依赖宿主能力**：真机出图依赖宿主图像模型通道（GPT-Image-2 / Nano Banana Pro / grsai），与 keyframe 同；文本卡产出不依赖宿主。
- **与其它 DNN 的关系**：与"拉片反向/POV/一镜到底"等方向**正交**，互不阻塞；若未来有"运镜参数标准化"方向，本成员是其下游消费者（弱依赖，非阻塞）。

---

## 9. 风险与缓解 Risks & Mitigations

| 风险 | 影响 | 缓解 |
|---|---|---|
| R1 图像模型渲染中文标注/精确箭头方向失真 | 示意图不可读 | ImageToImage 底图打底 + 卡内**文字版逐切标注**作权威源（图糊时以文字卡为准）；负向串锁 schematic 观感 |
| R2 示意图被误当成片参考帧喂 Seedance（引擎泄漏） | 破成片、破隐身铁律 | NFR-01 硬闸 + DoD-4 grep + 反例 T4；卡头【用途】首行即写"非成片帧"；负向串含 `NOT a final frame` |
| R3 升降镜归"推拉色"还是"purple"判定歧义 | 颜色不一致 | §5.3(A) 明确裁决规则（向心/离心→推拉色；纯垂直→purple），由镜头卡物理描述位移方向定 |
| R4 红/绿箭头对色盲不可读 | 可读性差 | NFR-05：红绿强制叠加形状差异（直 vs 弧/螺旋），图例三要素并存 |
| R5 成员与 keyframe 职责混淆（都"画一格"）| 概念重叠 | 文档明确：keyframe=某一瞬间单帧成片锚；camera-path=一组镜头运动轨迹总览预审图，非成片 |
| R6 逐镜真机出图导致碎贵 | 成本失控 | NFR-04：1 组 1 图，不逐镜出；文本卡免真机 |

---

## 10. 工作量与里程碑 Effort & Milestones

**粗估总量：约 2.0–2.5 人周。**

- **M1 契约与映射表（约 0.8 周）**：写 `camera-path/output-contract.md`——FR-01 运镜→视觉编码映射表（10 手法×三元组）、FR-02 卡 schema 4 区块、FR-03 套打提示词模板与负向串、自检门。产出物：可评审的契约草案。
- **M2 成员与导出（约 0.5 周）**：写 `camera-path/SKILL.md`（frontmatter 触发词 + 6 步管线，对齐 keyframe 形态）、`_megaprompts/camera-path.megaprompt.md`（自包含）、`README.md` + `style-refs.md:131` 注册。产出物：可触发的成员。
- **M3 审计脚本与基线 diff（约 0.5 周）**：`verify_camera_path.py` + 对 `fewshot-翡翠楼夜宴-v2全片.md` 跑命中基线；接 DoD-1/2/3/4 断言。产出物：可重跑回归门。
- **M4 真机出片与 A/B 人评（约 0.4 周，付费步由用户亲点）**：1–2 组 ImageToImage 出图，对图核验 + A/B 命中率。产出物：DoD-8 证据 + 调参结论。

**关键路径**：M1 → M2 → M3（M4 可与 M3 部分并行）。M3 的审计脚本是"可验证"的核心交付，优先于 M4 真机。

---

**契约版本**：D4 PRD Draft v0.1 ｜ 缺口类 D ｜ 优先级 P2 ｜ 落地可靠性 4/5 ｜ 新增成员 `camera-path/`（Skin 层，只读 storyboard 运镜数据，复用 keyframe ImageToImage 范式，引擎隐身铁律扩展为"示意层不漏成片"）。
