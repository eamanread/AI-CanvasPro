# D7 · 静态全案成员（static-board · 电商/详情页静态图全案）

> 编号 D7 ｜ 缺口类 B（单向单模单模型）｜ 优先级 P2 ｜ 状态 Draft v0.1 ｜ 落地可靠性自评 4/5

---

## 1. 问题陈述 Problem

**现状（引 director-suite 具体文件）：**

整个套件是 **video-first（视频终态）单模流水线**——所有成员的终点都是"喂视频模型的成片"，没有任何成员产出"只要静态图全案"。逐文件核对：

- `storyboard/output-contract.md` v2.0 §0「时长制」+ §7.9 硬性要求"**每个镜头组恰有一段 Seedance 2.0 成片提示词**（不多不少）"；§5「双时长观」明确"一个镜头组 = 一条 Seedance prompt"。整张契约围绕"组 = 视频生成单元（4–15s）"组织，**没有"静态图序列 / 主图 / 详情页"这种产物形态**。
- `production-bible/SKILL.md`「输出形态」四表齐出（角色表+场景表+道具表+分镜表），第 74 行分镜表"每个镜头组可附**一条** Seedance 2.0 提示词"——全案的终态仍是分镜→视频，**不存在"产品视觉全案（主图+详情页）"这一终态**。
- 三个视觉成员都是"为视频服务的单帧/单板"，无一是"成套的电商静态全案"：
  - `keyframe/output-contract.md` §0「单帧、非序列」+ §1 五类帧（首/中/高潮/反应/尾帧）全部以"**服务的视频段总时长 + 本帧所在秒点**"定位（§1 表"时间轴位置"字段），明确是**视频首尾帧锚定**，不是"商品主图序列"。
  - `character-board/SKILL.md` 第 28 行：设定板服务的是"后续视频生成的面部一致性主参考"，是**人物身份钉子**，不是商品。
  - `color-palette/output-contract.md` §0：色卡是"纯平面色块参考卡"，是**辅助资产**，不是成品图。
- `_shared/style-refs.md:598`（dimensions.md）已有"**工业四风 / 极简纯白 / 暗金奢华**"等产品视觉语汇（Bone 层数据），`_shared/continuity-quality.md` 四·1 有"工业/产品 TVC""高奢/大牌 TVC"的禁词与连续性策略——**但这些都被"TVC（视频广告）"语境消费，没有任何 Skin 层成员把它实例化成"电商静态图全案"**。

**痛点（为何是问题）：**

1. **最高频电商诉求直接落空**：电商详情页/主图全案是"**只要一套静态图**"（主图序列 Hero + 详情页 Detail），根本不进视频。当前套件无对口成员，用户只能：(a) 误用 `keyframe`（但它强绑"视频时间轴秒点"、字段是"动作落点/运动模糊/承接关系"，对静态商品图是无效字段）；(b) 误用 `storyboard`（但它强制产出 Seedance 视频提示词、强制"时长制/运镜/切镜方式"，对静态图全是噪音）。**拿视频锤砸静态钉子，字段全错位**。
2. **电商视觉的硬核要素无处承载**：电商静态全案有自己的强约束——**焦点坐标 (X,Y)+Z/F 扫读路径**（视线引导）、**卖点潜台词→视觉转化**（把"防水"画成"水珠滚落"）、**9:1 色彩克制**（主色 90%+点缀 10%）、**量化一致性审计**（轮廓±5% / HSL色相±15° / LOGO Δ0.05 / 白底RGB≥245）。这些在套件里**没有任何契约字段承载**：`color-palette` 管色但不管"商品轮廓/LOGO/白底"一致性；`continuity-quality` 管"跨镜不穿帮"但口径是视频镜头，不是"主图与详情页跨图一致"。
3. **量化审计阈值已在套件里被引用，却无成员消费**：`D01-execution-contract.md` FR-05 的 `consistency_audit`（`silhouette_tol`/`hue_tol`/`logo_delta`/`white_bg_rgb_min`）、`D03-model-adapters.md` 的 image adapter 一致性门，都**已声明**电商量化审计阈值（轮廓±5%/HSL±15°/LOGO Δ0.05/白底RGB≥245），但它们只是"宿主生成后回检的字段/选型理由"，**没有一个成员把"产品基线档案 + 量化审计"组织成可交付的静态全案产物**。能力悬空、无人接地。
4. **缺口类 B 的典型症状**：套件对"产物模态"是**单模**（只产视频终态），对"电商静态"这一既有刚需是**单向**（只能前向出视频，不能出静态全案）。这正是 B 类（单向/单模/单模型）的标准画像，而非"没脑子"（A）或"没秤"（C）。

---

## 2. 证据与接地 Evidence

**哪些源 skill 有此能力（点名）：**

- **电商产品视觉全案生成 skill（直接母本）**：方向简报 + `D01/D03` 已多次点名其完整能力栈——
  - **量化一致性审计**：轮廓 ±5% / HSL 色相 ±15° / LOGO Δ0.05 / 白底 RGB≥245（`D01-execution-contract.md:35`、`D03-model-adapters.md:34`）。
  - **产品基线档案**：把商品的不可变视觉条件（轮廓/材质/LOGO/配色）冻结成基线，供全套图回检。
  - **图像模型分级**：Nano Banana Pro（LOGO/文字/多图融合最强）/ Seedream 4.5（写实人像一致性）/ NB2（快省），对应不同图位。
  这三件正是 static-board 的能力来源。
- **一图成片"视觉基因解构"**：证明"从一份视觉锚反推可复用要素 → 换内容重组成系列图"是成熟可执行流程（`D02` 已引）。static-board 把它从"一图"扩成"一套全案（主图序列 + 详情页 8 屏）"。
- **AI 短剧"内切镜时长经验表 / 失败-修复对照表"**：证明"把经验固化成查表 + 反向修复对照"是套件既有范式（`D02/D04` 已引）；static-board 的"卖点→视觉转化表""焦点扫读路径表"沿用同范式。
- **Flova 平台流水线**（`planner→storyboard_designer→media_generator→video_assembler`，带强制暂停门）：证明"全案 = 多产物按 DAG + 暂停门组织"是生产系统标准形态。static-board 的"产品基线锁→主图序列→详情页→审计门"沿用此编排骨架，但**终态停在静态图、不进 video_assembler**。

**director-suite 盲点落在哪个文件/成员：**

| 盲点 | 精确落点 |
|---|---|
| 无"静态图全案"产物形态 | 缺**新成员** `static-board/`（与 `production-bible/` 平级的"全案级"成员，但终态是静态图） |
| 无"主图序列 Hero + 详情页 Detail"契约 | `keyframe/output-contract.md` 强绑视频时间轴秒点，不可复用；需新契约 |
| 无"焦点坐标 (X,Y)+Z/F 扫读"字段 | 套件零处定义视觉动线坐标（`continuity-quality.md` 六·"视线/重心动量"是**跨镜**口径，非"单图扫读路径"） |
| 无"卖点潜台词→视觉转化"机制 | `tacit-core.md` 的"潜台词"是**表演/情绪**语境（keyframe §3.3 潜台词一句），非"卖点→视觉证据"语境 |
| 量化审计无成员消费 | `D01`FR-05 / `D03` 的 `consistency_audit` 阈值悬空，需 static-board 把它落成"全案审计门" |
| 9:1 色彩克制无承载 | `color-palette` 管色但无"商品图 90/10 主色克制 + 白底纯净"专项 |

> **关于"复用 D5 量化审计"的接地澄清**：方向简报写"复用 D5 量化审计"，但本仓 `docs/optimization/` 当前只有 D01–D04，**没有 D05 文档**。经核对，简报所指"D5 量化审计"实为**电商全案 skill 的量化审计能力**，它当前已被 `D01-execution-contract.md`（FR-05 `consistency_audit`）与 `D03-model-adapters.md`（image adapter 一致性门）**引用并定义了阈值**（轮廓±5%/HSL±15°/LOGO Δ0.05/白底RGB≥245）。**D7 直接复用 D01/D03 已定义的这组阈值字段**，不依赖一个尚不存在的 D05；若未来 C 类"无秤无回归"方向独立立项审计执行器，D7 为其下游消费者（弱依赖、不阻塞，见 §8）。

---

## 3. 目标与非目标 Goals / Non-Goals

**Goals：**

- **G1**：新增"全案级"成员 `static-board/`，输入 = 商品信息（品名/卖点清单/基线视觉条件/可选参考图），输出 = **一套电商静态图全案**：① 主图序列 **Hero01–03**（景别序列：远→中→近，对应 全景商品场景 / 中景商品主体 / 近景细节）；② 详情页 **Detail01–08**（8 屏卖点叙事图）；③ 每图携带焦点坐标 (X,Y) + Z/F 扫读路径；④ 全案共享一份**产品基线档案**与**量化审计阈值**（复用 D01/D03）。
- **G2**：定义"卖点潜台词→视觉转化"机制：把每条卖点（如"防水 IPX8"）翻成"摄影机看得见的视觉证据"（水珠在表面滚落、不渗入），而**不在图里写文案/参数文字**（文字属电商排版层，不属生成层）。
- **G3**：定义视觉动线契约：每图标注**唯一主焦点坐标 (X,Y)**（画面归一化 0–1）+ **扫读路径**（Z 形 / F 形，对应详情页通读 vs 主图首屏），保证一套图的视线引导自洽。
- **G4**：复用而非新造一致性秤：全案审计门**直接调用 D01/D03 已定义的量化审计阈值**（轮廓±5% / HSL色相±15° / LOGO Δ0.05 / 白底RGB≥245），把"产品基线档案"作为回检锚。
- **G5**：复用 Bone 层既有产品视觉知识（`dimensions.md:598` 工业四风/极简纯白/暗金奢华、`continuity-quality.md` 四·产品/高奢 TVC 禁词），不重写。

**Non-Goals（明确边界）：**

- **NG1（不破引擎隐身 · 铁律）**：产品基线档案、量化审计阈值、扫读路径推理、卖点→视觉的"潜台词"中间产物、模型选型理由——**全部是过程产物，绝不可漏进任何成图提示词，更不可作为可见文字渲染进图**。引擎隐身（`production-bible/SKILL.md` 铁律③、`storyboard/output-contract.md` §7.8）在此扩展为"**审计层/动线推理层不漏进成图层**"。成图里**不出现** `(X,Y)`/`Z形`/`±5%`/`潜台词`/`基线`/`silhouette_tol` 等任何过程词。
- **NG2（不破可移植性）**：成员 = 纯 Markdown 契约（SKILL + output-contract + megaprompt 三态），零运行时依赖、零宿主绑定。图像模型默认走 D03 分级选型（电商白底/LOGO → Nano Banana Pro 首选），换模型仅改"可粘贴提示词"的模型标记行。量化审计的**执行**依赖宿主/审计脚本（与 D01 一致），**契约本身只声明阈值字段**，宿主无审计能力时优雅降级到"人眼对图核验"。
- **NG3（不抢现有成员的活）**：不替代 `keyframe`（视频首尾帧）、不替代 `storyboard/production-bible`（视频全案）、不替代 `color-palette`（它仍是 static-board 可调用的色卡子产物）。static-board 是**静态终态的全案成员**，与视频全案 `production-bible` 平级互补。
- **NG4（不产视频、不写运镜）**：static-board 终态是静态图，**绝不产出任何 Seedance 提示词、运镜、切镜方式、时长字段**——这些视频字段进静态全案即判废（与"keyframe 被误用"对称的反向铁律）。
- **NG5（不搬题材/不侵权）**：复用 `continuity-quality.md` 三·合规版权类（`no unauthorized logo, no real brands`）；商品 LOGO 仅在用户授权基线内复刻，不引入第三方品牌。
- **NG6（不做电商文案排版）**：成员只产"视觉生成提示词全案"，**不产卖点文案/价格/促销标的文字排版**（那属电商运营层，且文字烧录进生成图是反向锚定禁项）。

---

## 4. 需求 Requirements

### 4.1 功能需求 FR

**D7-FR-01 · 产品基线档案（product baseline · 全案唯一锚）**
- 描述：static-board 第一步必须先把商品"不可变视觉条件"冻结成一份**产品基线档案**（全案级、唯一），逐项写明：商品 `asset_id`（沿用 `[Element_<Product>]` 焊点，见 `asset-id-convention.md`）、轮廓/比例（含关键尺寸比）、主材质（金属/塑料/布料/玻璃…+ 反光特性）、LOGO（位置/比例/颜色，或"无 LOGO"）、商品主色 HEX、白底规格（默认纯白 RGB≥245）。基线携带**量化审计阈值**字段（复用 D01/D03）：`silhouette_tol=0.05`（轮廓±5%）/ `hue_tol=15`（HSL色相±15°）/ `logo_delta=0.05` / `white_bg_rgb_min=245`。基线档案是**过程产物**（NG1），全案所有图回检它，但**不渲染进任何成图**。
- 可量化验收：①基线档案字段齐全（商品 asset_id / 轮廓比 / 材质 / LOGO / 主色 HEX / 白底规格 / 4 项审计阈值），缺一即不合格（schema 校验）；②4 项审计阈值数值与 D01/D03 逐字一致（`0.05/15/0.05/245`）；③对成图提示词 grep 基线过程词（`silhouette_tol`/`±5%`/`基线`/`hue_tol`/`baseline`），命中 = 0（NG1 闸）。

**D7-FR-02 · 主图序列 Hero01–03（景别序列 · 远中近）**
- 描述：产出 3 张主图，构成固定**景别序列**，对齐 storyboard §2.1 景别语义但用于静态商品：
  - **Hero01 = 全景/环境主图**（商品在使用/场景语境中，建立世界观与尺度，对应电商首图首屏）；
  - **Hero02 = 中景/主体主图**（商品居中、白底或弱场景、完整呈现廓形与主色，对应"标准商品图"）；
  - **Hero03 = 近景/细节主图**（材质/工艺/LOGO 局部特写，对应"细节卖点首图"）。
  每张 Hero 卡含字段：图位类型 / 景别 / 焦点坐标 (X,Y) / 扫读路径 / 引用基线 asset_id / 主色克制比（见 FR-05）/ 成图提示词。三张 Hero **共享同一产品基线**（FR-01），轮廓/材质/LOGO/主色跨图一致。
- 可量化验收：①恰 3 张 Hero，景别为"全景→中景→近景"严格递进（无重复景别）；②3 张均显式引用同一商品 asset_id（引用闭合，与基线一致）；③每张含焦点坐标 (X,Y)∈[0,1]² 与扫读路径标记；④Hero02（主体图）白底默认 RGB≥245（除非用户指定场景底），成图提示词含 `pure white background, RGB ≥ 245`（或等效 `seamless white studio background`）。

**D7-FR-03 · 详情页 Detail01–08（卖点叙事 8 屏）**
- 描述：产出 8 张详情页图，每屏承载**一条核心卖点**，按"先总后分、先场景后细节"的电商详情页通用叙事弧组织（默认槽位：01 主视觉/场景钩子 → 02 核心卖点A → 03 卖点B → 04 卖点C → 05 材质/工艺细节 → 06 使用场景/对比 → 07 规格可视化 → 08 信任背书/收束）。槽位可按卖点数增减但**总数固定 8 屏**（卖点不足 8 条时合并/留场景图补足，卖点超 8 条时取最高优先级 8 条并在过程层留痕）。每屏卡含：屏序 / 承载卖点 / **卖点→视觉转化**（FR-04）/ 焦点坐标 (X,Y) / 扫读路径（详情页默认 F 形通读）/ 引用基线 / 成图提示词。
- 可量化验收：①恰 8 屏，屏序 01–08 连续无缺；②每屏恰承载 1 条主卖点（主卖点字段非空、唯一）；③8 屏引用的商品 asset_id 全等于基线 asset_id（跨图一致，引用闭合）；④每屏含焦点坐标与扫读路径；⑤成图提示词内**无任何文案文字**（卖点以视觉证据呈现，非文字烧录）——grep 提示词中 `text reads`/`文字`/引号包裹文案，仅允许出现在 LOGO 复刻（基线内）场景，其余命中 = 0。

**D7-FR-04 · 卖点潜台词→视觉转化表（subtext → visual evidence）**
- 描述：新增一张固定映射机制：每条卖点先抽"**潜台词**"（这条卖点要让买家**信什么**），再翻成"**摄影机看得见的视觉证据**"（不写字，靠画面证明）。固定三段式：`卖点（功能词）→ 潜台词（买家信念）→ 视觉证据（可成像的物理画面）`。例：`防水IPX8 → "下雨/泼溅都不怕" → 水珠在商品表面聚成珠滚落、机身内部干燥可见、无渗水痕`；`轻量化 → "久戴无负担" → 商品悬于单指/羽毛同框对比、受力侧无形变`。视觉证据须落到**物理可见之物**（沿用 keyframe §0"摄影机看得见的物理可见之物"铁律），禁抽象形容词（"高端感"不可成像 → 须翻成"哑光金属漫反射 + 45°硬光高光线"）。
- 可量化验收：①每条进入详情页的卖点都有完整三段（功能词/潜台词/视觉证据），缺段即不合格；②"视觉证据"段为**具象名词+物理动作**（脚本/人审检：不得只含抽象审美词，抽样 ≥5 条，抽象词单独成句数 = 0）；③"潜台词"段是**过程产物**，不渲染进成图（grep 成图提示词 `潜台词`/`subtext`，命中 = 0，NG1 闸）。

**D7-FR-05 · 9:1 色彩克制 + 焦点扫读契约（视觉纪律）**
- 描述：(a) **色彩克制 9:1**：每张图遵"主色域 ≈90% + 点缀/强调色 ≈10%"，商品主色与白底/中性背景占据画面 90%，仅用 ≤10% 面积的高饱和点缀引导视线到焦点（沿用 `color-palette` 母色统辖 + `dimensions.md` 极简纯白/工业四风）。(b) **焦点坐标 (X,Y)**：每图唯一主焦点用归一化坐标 (X,Y)∈[0,1]²（左上=(0,0)，右下=(1,1)）标注，焦点处放置最高对比/最饱和/最锐元素。(c) **扫读路径**：标记 `Z形`（首屏/主图，左上→右上→左下→右下）或 `F形`（详情页长图通读，左上起逐行向右下）；路径上的视觉权重须递减，终点落在 CTA 意图位（商品主体或关键细节）。三者均为**对内动线设计**，落成提示词时翻成"构图/对比/景深/留白"的视觉语言，**坐标与路径名本身不进成图**。
- 可量化验收：①每图标注主色克制比（主色域%/点缀%，主色域 ≥85%、点缀 ≤15% 视为合格区间）+ 焦点坐标 (X,Y)∈[0,1]² + 扫读路径∈{Z形,F形}；②成图提示词把焦点翻成视觉手法（"焦点处最高对比/浅景深锁定/留白引导"），且 grep 提示词 `(X,Y)`/`Z形`/`F形`/坐标数字对，命中 = 0（NG1 闸）；③抽样 ≥3 图，人评"视线是否被引导到标注焦点"一致通过（≥3 人）。

**D7-FR-06 · 成员落地（SKILL.md + output-contract.md + megaprompt + README 注册）**
- 描述：按套件既有成员标准结构落地：新建 `static-board/SKILL.md`（frontmatter 触发词 + 6 步管线，对齐 production-bible/keyframe 形态）、`static-board/output-contract.md`（字段契约 + FR-01~05 表 + 自检门）、`_megaprompts/static-board.megaprompt.md`（自包含导出版），并在 `README.md` 家族成员表新增一行；在 `dimensions.md:598`/`continuity-quality.md` 四·产品行留交叉引用注脚（只加引用、不改既有内容）。
- 可量化验收：①4 个文件均存在（路径见 §5.1，文件存在性校验）；②`SKILL.md` frontmatter `description` 命中"电商/详情页/主图/产品视觉全案/静态全案/static board/详情页/卖点图"等触发词 ≥6 个，且显式声明"只要单张商品图改走 character-board/color-palette、要视频改走 storyboard/production-bible"的路由分流（防误触发）；③`README.md` 成员表新增"🛒 静态全案（电商）→ static-board/"一行 + 目录树新增节点；④megaprompt 自包含（内联 FR-01~05 全部表，不靠相对路径 import），可独立粘贴运行。

### 4.2 非功能需求 NFR

**D7-NFR-01 · 引擎隐身 + 审计/动线层不漏进成图（铁律 · 一票否决）**
产品基线阈值（±5%/±15°/Δ0.05/245）、焦点坐标 (X,Y)、扫读路径名（Z形/F形）、卖点潜台词、模型选型理由、量化审计中间结论——**全属过程产物，绝不出现在任何成图提示词里，更不可作为可见文字渲染进图**。引擎术语（Polanyi/默会/支柱编号/方法论/格式塔/寓居）仍零出现。验收：对全案所有成图提示词 grep `±5%|silhouette_tol|hue_tol|baseline|基线|潜台词|subtext|\(X,Y\)|Z形|F形|选型|降级|Polanyi|默会|支柱|方法论`，命中 = 0。

**D7-NFR-02 · 可移植性**
成员形态 = 纯 Markdown 契约，三态（Skill / output-contract / megaprompt）可用，零运行时依赖、零宿主绑定。图像模型默认走 D03 分级选型（电商白底/LOGO → Nano Banana Pro，兜底 GPT-Image-2），换模型仅改"可粘贴提示词"的模型标记行。量化审计**执行**依赖宿主/审计脚本（与 D01 一致），宿主无能力时降级到"人眼对图核验"，契约不变。验收：成员目录内无 `.py/.js/.exe` 强依赖；提示词无 `127.0.0.1:8777` 等宿主 App 痕迹。

**D7-NFR-03 · 跨图一致性（全案 == 同一商品）**
一套全案（3 Hero + 8 Detail = 11 图）必须是"同一个商品"：轮廓/材质/LOGO/主色跨 11 图守 D01/D03 阈值（轮廓±5% / HSL色相±15° / LOGO Δ0.05 / 白底RGB≥245）。一致性靠**产品基线 asset_id 全程绑定 + ImageToImage 复用**（沿用 `continuity-quality.md` 一·1「多状态参考用 ImageToImage」），而非"描述得更详细"。验收：11 图全部引用同一商品 asset_id（引用闭合）；真机出图时对一致性审计 4 项无 ⚠️（NFR 真机门，见 §7）。

**D7-NFR-04 · 性能 / 成本**
全案文本卡（11 图的提示词全案）应在文本阶段产出、0 次真机调用即可完成；真机出图为**可选末步、用户亲点付费**（沿用 CLAUDE.md「付费按钮用户亲点」），且默认 ImageToImage 以 Hero02（标准主体图）为锚串联其余图，避免 11 张各自 TextToImage 重画导致碎贵 + 一致性崩。验收：文本全案 0 真机调用完成；真机阶段以 1 张基准图锚定其余（ImageToImage 链），非 11 张独立生成。

**D7-NFR-05 · 复用而非新造（DRY · 不重写 Bone）**
产品视觉语汇（工业四风/极简纯白/暗金奢华）复用 `dimensions.md:598`；产品/高奢 TVC 禁词复用 `continuity-quality.md` 四；色彩纪律复用 `color-palette` 母色统辖；量化审计阈值复用 D01/D03。static-board **只新增"静态电商全案"特有的编排 + 4 张专属表（基线/Hero序列/Detail叙事/卖点转化）**，不重写已有知识。验收：static-board 文档中产品风格/禁词/审计阈值均以交叉引用形式指向既有文件，未整段复制（megaprompt 导出版除外，导出版允许内联以保自包含）。

---

## 5. 设计 Design

### 5.1 新增 / 改动文件精确路径清单

**新增（4 个）：**
```
skills/director-suite/static-board/SKILL.md                       # 成员入口：电商静态全案 6 步管线（Skin/编排）
skills/director-suite/static-board/output-contract.md             # 字段契约 + FR-01~05 四表 + 自检门（Skin/契约）
skills/director-suite/_megaprompts/static-board.megaprompt.md     # 自包含导出版（内联全部表）
skills/director-suite/docs/optimization/D07-static-batch.md       # 本 PRD（已落盘）
```

**新增（可选，1 个，全案 few-shot 黄金基线）：**
```
skills/director-suite/static-board/examples/fewshot-电商静态全案-demo.md
  一件脱敏原创商品（无真实品牌）→ 基线 + 3 Hero + 8 Detail 的全案 few-shot（验证回归基线）
```

**改动（3 个，均为追加/注册/交叉引用，不改既有语义）：**
```
skills/director-suite/README.md
  - 「家族成员」新增一个分组或在「单产物成员」上方加一行：🛒 静态全案（电商）→ static-board/
    （定位说明：与 production-bible 平级的"全案级"成员，但终态是静态图、不进视频）
  - 「目录结构」树新增 static-board/ 节点
skills/director-suite/_shared/dimensions.md
  - 第 598 行「工业四风/极简纯白/暗金奢华」一行追加交叉引用注脚：「→ 电商静态全案实例化见 static-board 成员」
    （只加引用，不改既有内容）
skills/director-suite/_shared/continuity-quality.md
  - 四·1「工业/产品 TVC」「高奢/大牌 TVC」行追加注脚：「→ 静态电商全案的禁词复用见 static-board」
```

**只读复用、不改：** `asset-id-convention.md`（`[Element_<Product>]` 焊点 + ImageToImage 复用）、`color-palette/output-contract.md`（母色统辖/9:1 克制可调用）、`docs/optimization/D01-execution-contract.md`（`consistency_audit` 阈值字段）、`docs/optimization/D03-model-adapters.md`（image 分级选型 + 一致性门）。

### 5.2 挂进 Soul / Bone / Skin 哪层

| 文件 | 层 | 理由 |
|---|---|---|
| `static-board/SKILL.md` | **Skin（入口/编排）** | 成员入口 + 6 步编排，复用 Soul 引擎、查 Bone 知识、产 Skin 契约，与 `production-bible/SKILL.md` 同为"编排层"，但终态静态 |
| `static-board/output-contract.md`（FR-01~05 四表 + 自检门） | **Skin（契约）** | 锁"电商静态全案"专属字段格式（基线/Hero/Detail/卖点转化/动线） |
| 卖点→视觉转化的"潜台词→可成像物理证据"推理 | **复用 Soul** `tacit-core.md` | **不新增 Soul 文件**——"潜台词"理解仍走默会引擎，D7 只是把它的输出语境从"表演情绪"扩到"卖点信念→视觉证据" |
| 产品视觉语汇 / 产品禁词 | **复用 Bone** `dimensions.md:598`、`continuity-quality.md` 四 | 既有知识，只交叉引用 |
| 量化审计阈值 | **复用** D01/D03 已定义字段 | 不在 Soul/Bone 新增，直接引用阈值 |

> **关键：Soul 一行不改**。商品"潜台词→视觉证据"的理解仍走 `tacit-core.md`，D7 只把输入从"剧本"扩成"商品+卖点清单"、把终态从"视频镜头卡"扩成"静态图全案卡"。这是不破引擎隐身的结构性保证。

### 5.3 关键 schema / 契约字段 / 算法

**(A) 产品基线档案 schema（FR-01 · 全案唯一锚 · 过程产物，绝不入成图）**
```yaml
product_baseline:                      # 全案唯一，所有图回检它（NG1：不渲染进成图）
  asset_id: "[Element_<Product>]"      # 沿用 asset-id-convention 焊点
  silhouette:                          # 轮廓/比例（不可变）
    desc: "<廓形描述>"
    key_ratio: "<关键尺寸比，如 高:宽=2.3:1>"
  material: "<主材质 + 反光特性，如 哑光阳极氧化铝 + 漫反射>"
  logo:                                # 无则写 none
    present: true | false
    position: "<位置>"; scale: "<比例>"; color: "#RRGGBB"
  main_color_hex: "#RRGGBB"            # 商品主色
  white_bg: "pure white, RGB ≥ 245"    # 白底规格（默认）
  _audit_thresholds:                   # 复用 D01/D03，下划线前缀=禁出成图（NG1）
    silhouette_tol: 0.05               # 轮廓 ±5%
    hue_tol: 15                        # HSL 色相 ±15°
    logo_delta: 0.05                   # LOGO Δ0.05
    white_bg_rgb_min: 245              # 白底 RGB≥245
```

**(B) 单图卡 schema（Hero / Detail 共用 · FR-02/03/04/05）**
```
=== [图像模型] StaticBoard - [商品/图位] ===
[图位] Hero01 全景 | Hero02 中景 | Hero03 近景 | Detail01..08
[引用基线] @[Element_<Product>]  继承[轮廓/材质/LOGO/主色] 不可改[硬锚点]   # 引用闭合
[承载卖点] <一条卖点功能词>（Detail 必填；Hero 可空）
[卖点转化]  功能词 → _潜台词(过程,不入成图) → 视觉证据(具象名词+物理动作)   # FR-04
[焦点]  (X,Y)=(0.x, 0.y)   扫读路径= Z形 | F形   主色克制= 主色域≈90% / 点缀≈10%  # FR-05，全过程
[成图提示词]  ← 这里只剩"摄影机看得见的画面"：景别/构图(焦点翻成最高对比/浅景深/留白)/
              光位/材质质感/白底规格/LOGO复刻(基线内) + 负向串
              （禁出：坐标/路径名/潜台词/阈值/选型理由——NG1）
[负向串]  no text overlay, no watermark, no readable price/copy, no unauthorized logo,
          no distorted product silhouette, no color shift beyond palette, this is a product
          image NOT a render mockup（防文案烧录/防轮廓畸变/防偏色）
```

**(C) 卖点潜台词→视觉转化表（FR-04 · 三段式，写入 output-contract.md）**

| 卖点功能词（输入） | 潜台词（买家信念 · 过程，禁入成图） | 视觉证据（可成像物理画面 · 进成图） |
|---|---|---|
| 防水 IPX8 | "下雨/泼溅都不怕" | 水珠在机身表面聚成珠状滚落、接缝无渗水、内部干燥可见 |
| 轻量化 | "久戴/久持无负担" | 商品悬于单指尖 / 与羽毛同框对比、受力侧零形变 |
| 长续航 | "一天不用充" | 电量满格指示 + 日出到夜景同一商品的时间跨度视觉暗示（非文字） |
| 高端材质 | "值这个价" | 哑光金属漫反射 + 45° 硬光高光线 + 毛孔级材质特写 |
| 大容量 | "装得多" | 商品内部填满典型物品的整齐排布、撑满但不变形 |

> 表为**可扩展范式**（非穷举）；新卖点按"功能词→潜台词→具象物理证据"三段自填。**铁律**：视觉证据必须是 keyframe §0「摄影机看得见的物理可见之物」，禁抽象审美词单独成立。

**(D) 全案生成算法（伪代码 · 强调"基线锁 + 引用闭合 + 隐身剥离"）**
```
def static_board(product, selling_points, refs):
    base = lock_baseline(product, refs)          # FR-01：冻结基线 + 审计阈值(复用D01/D03)
    heros = []
    for size in [全景, 中景, 近景]:               # FR-02：Hero01-03 景别序列
        card = make_card(图位=Hero(size), 引用基线=base.asset_id)
        card.焦点, card.扫读 = design_path(size)   # FR-05：(X,Y)+Z/F（过程）
        heros.append(card)
    details = []
    pts = pick_top(selling_points, 8)             # FR-03：固定 8 屏（不足补场景，超取top8留痕）
    for i, pt in enumerate(pts, 1):
        sub, evid = subtext_to_visual(pt)          # FR-04：功能词→潜台词→视觉证据
        card = make_card(图位=Detail(i), 引用基线=base.asset_id, 承载卖点=pt)
        card.视觉证据 = evid                        # 进成图
        card.焦点, card.扫读 = design_path(Detail)  # 详情页默认 F 形
        details.append(card)
    cards = heros + details                        # 11 图
    assert all(c.引用基线 == base.asset_id for c in cards)   # NFR-03 引用闭合
    for c in cards:
        c.prompt = render_prompt(c, base)           # 焦点→对比/景深/留白；色彩 9:1
        strip_process_fields(c.prompt)              # NG1：剥离 坐标/路径/潜台词/阈值/选型
        assert leak_scan(c.prompt) == 0             # NFR-01 隐身闸
        assert no_video_field(c.prompt)             # NG4：无运镜/时长/Seedance
    emit_album(base, cards)                          # 全案输出（基线对内、11 图卡对外）
```

### 5.4 数据流（ASCII）

```
商品信息(品名/卖点清单/基线视觉条件/可选参考图)
        │
        ▼
┌──────────────────────── static-board 成员 (Skin/编排) ─────────────────────────┐
│  Step1 锁产品基线档案 (FR-01, 过程产物 + 审计阈值复用 D01/D03)                  │
│        │ (基线 asset_id 全程绑定)                                              │
│        ├──────────────► [FR-02 主图序列 Hero01-03 全景→中景→近景]              │
│        │                                                                       │
│        ├──────────────► [FR-04 卖点潜台词→视觉证据] ─► [FR-03 详情页 Detail01-08]│
│        │                                                                       │
│        └──────────────► [FR-05 焦点(X,Y)+Z/F 扫读 + 9:1 色彩克制]（对内动线）   │
│                                       │                                        │
│                                       ▼                                        │
│        11 图卡(成图提示词: 焦点翻成对比/景深/留白; 白底RGB≥245; LOGO基线内)     │
│                                       │                                        │
│            ┌──────── NG1 引擎隐身闸 ───┴──── NG4 无视频字段闸 ────────┐         │
│            ✗ 坐标/路径/潜台词/阈值/选型/降级 绝不入成图                 ✗ 运镜/时长/Seedance 绝不入│
└──────────────┬──────────────────────────────────────────────┬─────────────────┘
               │ (文本全案, 0 真机调用)                          │ (可选末步, 用户亲点付费)
               ▼                                                ▼
       电商静态图全案(交付)                       真机出图(ImageToImage 以 Hero02 为锚串联)
                                                        │
                                                        ▼
                                   一致性审计 4 项(轮廓±5%/HSL±15°/LOGO Δ0.05/白底245) 回检基线
```

---

## 6. 验收标准 Acceptance Criteria (DoD)

- **DoD-1（FR-01）**：`static-board/output-contract.md` 含产品基线 schema，字段齐全；4 项审计阈值数值 == D01/D03（`0.05/15/0.05/245`）；对成图提示词 grep 基线过程词命中 = 0。
- **DoD-2（FR-02）**：全案恰 3 张 Hero，景别"全景→中景→近景"严格递进、无重复；3 张引用同一商品 asset_id；每张含 (X,Y)+扫读路径；Hero02 成图提示词含白底 RGB≥245 表述。
- **DoD-3（FR-03）**：全案恰 8 屏 Detail，屏序 01–08 连续；每屏恰 1 条主卖点；8 屏引用 asset_id 全等基线；每屏含焦点+路径；成图提示词无文案文字（仅 LOGO 复刻例外）。
- **DoD-4（FR-04）**：每条进入 Detail 的卖点三段齐全（功能词/潜台词/视觉证据）；抽样 ≥5 条，"视觉证据"为具象名词+物理动作、抽象词单独成句数 = 0；成图提示词 grep `潜台词/subtext` 命中 = 0。
- **DoD-5（FR-05）**：每图标注主色克制比（主色域 ≥85% / 点缀 ≤15%）+ (X,Y)∈[0,1]² + 路径∈{Z形,F形}；成图提示词把焦点翻成视觉手法且 grep 坐标/路径名命中 = 0；抽样 ≥3 图人评"视线落到焦点"≥3 人一致通过。
- **DoD-6（NFR-01 铁律 · 一票否决）**：对全案 11 图成图提示词跑 leak_scan，禁词表（`±5%`/`silhouette_tol`/`hue_tol`/`baseline`/`基线`/`潜台词`/`subtext`/`(X,Y)`/`Z形`/`F形`/`选型`/`降级`/`Polanyi`/`默会`/`支柱`/`方法论`）命中 = 0。
- **DoD-7（NG4 反向铁律）**：全案任何卡与提示词 grep 视频字段（`运镜`/`Push In`/`切镜`/`时长：`/`Seedance`/`start_frame`），命中 = 0（静态全案不得混入视频字段）。
- **DoD-8（FR-06）**：4 个新文件存在；`README.md` 成员表/目录树已注册 `static-board/`；`dimensions.md:598`/`continuity-quality.md` 四 已加交叉引用；megaprompt 自包含可独立运行；SKILL frontmatter 含路由分流声明（防误触发）。
- **DoD-9（NFR-03 跨图一致）**：11 图全部引用同一商品 asset_id（引用闭合）；真机出图（可选）对一致性审计 4 项无 ⚠️。
- **DoD-10（NFR-02 可移植）**：成员目录无运行时强依赖文件；提示词无宿主 App 痕迹。
- **DoD-11（对图核验 · 真机可选 · 付费用户亲点）**：1 件商品真机 ImageToImage 出全案（或抽 Hero02+2 张 Detail），人眼 + 审计脚本核验：轮廓±5% / HSL色相±15° / LOGO Δ0.05 / 白底RGB≥245 四项**无 ⚠️**；视线引导与焦点标注一致（≥3 名评审通过）。

---

## 7. 验证方案 Verification Plan

**验证手段：**

1. **审计脚本（结构闸，自动 · 冷启动可重跑）**：`static-board/verify_static_board.py`（或等价 PowerShell/node）解析全案卡，断言：
   - FR-01 基线字段齐全 + 4 阈值数值 == D01/D03；
   - FR-02 恰 3 Hero + 景别递进 + asset_id 一致；FR-03 恰 8 Detail + 屏序连续 + 每屏 1 卖点 + asset_id 一致；
   - FR-04 三段齐全 + 视觉证据具象性；FR-05 克制比 + 坐标域 + 路径枚举；
   - **NFR-01 leak_scan**（DoD-6 禁词表命中 = 0）+ **NG4 视频字段扫描**（DoD-7 命中 = 0）。
   这是**回归基线门**。
2. **回归 diff（基线）**：以 `static-board/examples/fewshot-电商静态全案-demo.md`（1 件脱敏原创商品全案）为**固定黄金基线**，冻结其 11 图结构。改契约/megaprompt 后重跑脚本，结构断言全绿、leak_scan = 0 即通过；基线漂移须有理由。
3. **真机出片 + 量化审计（对图核验 · 唯一"真有效"终极证据 · 付费用户亲点）**：取 1 件真实商品（或脱敏原创品），按 D03 分级选型（白底/LOGO → Nano Banana Pro）真机 ImageToImage 出全案（以 Hero02 为锚串联），对一致性审计 4 项（轮廓±5%/HSL色相±15°/LOGO Δ0.05/白底RGB≥245）逐项核验。**这是把"一致性"落到客观秤的关键**：基线若没锁住，审计必有 ⚠️。
4. **A/B 人评（软指标，佐证价值）**：把"static-board 全案"vs"用户拿 keyframe/storyboard 硬凑的静态图"双盲给 ≥3 人评"哪套更像可上架的电商全案 / 视线引导更顺"，static-board 胜出率作软指标（非阻塞门）。

**测试用例 / 基线：**
- 基线 B0：1 件脱敏原创商品（无真实品牌 LOGO，5–8 条卖点，含"防水/轻量/材质"等可视化卖点），人工标注基线视觉条件作 ground truth。
- 用例 T1：标准商品（白底）→ 3 Hero 景别递进 + 8 Detail 屏序闭合 + 引用闭合。
- 用例 T2：含 LOGO 商品 → LOGO 复刻在基线内，审计 LOGO Δ0.05 通过；非授权品牌词被负向串拦截。
- 用例 T3：卖点含"防水/轻量"→ 卖点转化产出"水珠滚落/单指悬持"视觉证据，无文案文字。
- 反例 NB1：故意把焦点坐标 `(0.5,0.3)`/扫读路径 `Z形`/审计阈值 `±5%`/卖点文案文字塞进成图提示词 → 审计脚本 leak_scan **必须报不合格**（验证 NFR-01 闸有效）。
- 反例 NB2：故意混入 `运镜/时长：5s/Seedance` 视频字段 → 视频字段扫描 **必须报不合格**（验证 NG4 反向铁律闸有效）。

**为何这样能证明"真的有效"：**
- 结构闸（脚本）+ 基线 diff 证明"全案产物形态正确、跨图引用闭合、过程产物不泄漏"——可量化、可重跑硬断言，非"提升质量"空话。
- 真机量化审计把"一套图是不是同一个商品"落到**客观秤**（轮廓±5%/HSL±15°/LOGO Δ0.05/白底245 四项无 ⚠️）——基线锁失效则审计必触 ⚠️，秤会说话。
- 反例 NB1/NB2 证明两条铁律闸（引擎隐身漏成图、视频字段混入）是**真闸**（能拦截），非摆设。

**落地可靠性理由（自评 4/5）：**
- 上调因素：①复用 keyframe/character-board 已验证的"图像模型 + ImageToImage 锚定 + 成员目录结构"，无新架构风险；②量化审计阈值与产品视觉知识**已在套件内被 D01/D03/dimensions 定义**，D7 是接地消费方、非空想；③成员纯 Markdown、零依赖、可移植；④电商静态全案是**字段比视频更收敛**的产物（无时间轴/运镜/音画同步），结构断言更易写、回归更稳。
- 扣 1 分因素：**真机一致性审计的执行依赖宿主/审计脚本的真实强度**（能否稳定测轮廓 IoU / HSL 色相差 / LOGO 差异 / 白底 RGB）——这与 D01/D03 共享同一不确定性；宿主审计弱时降级为人眼核验，量化精度打折，故不给满分。

---

## 8. 依赖与顺序 Dependencies

**依赖的其它 DNN / 现状件：**
- **复用 D01-execution-contract.md FR-05 `consistency_audit` 阈值字段**（`silhouette_tol/hue_tol/logo_delta/white_bg_rgb_min`）——D7 的基线档案直接引用这组阈值；**弱依赖**（阈值已定义，D7 拷字段值即可，不阻塞）。
- **复用 D03-model-adapters.md image 分级选型 + 一致性门**（电商白底/LOGO → Nano Banana Pro 首选）——D7 真机出图走此路由；若 D03 未落地，D7 可临时硬写"默认 Nano Banana Pro / 兜底 GPT-Image-2"，**不阻塞**。
- **复用（不改）**：`_shared/tacit-core.md`（潜台词理解）、`_shared/asset-id-convention.md`（`[Element_<Product>]` 焊点 + ImageToImage 复用）、`_shared/dimensions.md:598`（产品视觉语汇）、`_shared/continuity-quality.md` 四（产品/高奢禁词）、`color-palette/output-contract.md`（母色统辖 / 9:1 克制）。
- **与 C 类"无秤无回归 / 审计执行器"方向的关系**：D7 只**声明并消费**量化审计阈值（阈值字段 + 真机核验），**不实现审计执行器**；若未来 C 类方向提供自带审计脚本（自动测轮廓/HSL/LOGO/白底），D7 的"宿主回检"可升级为"套件自带审计"——**弱依赖、不阻塞**（与 D01 §结论一致）。

**依赖的宿主能力：**
- **图像模型通道**（Nano Banana Pro / Seedream 4.5 / GPT-Image-2，真机出图用，可选末步）——与 keyframe/character-board 同。
- **量化审计能力**（测轮廓 IoU / HSL 色相差 / LOGO 差异 / 白底 RGB，真机核验用）——宿主无则降级人眼核验，契约不变。
- 文本全案产出**不依赖任何宿主能力**（纯提示词）。

**顺序：**
1. 落 `static-board/output-contract.md`（FR-01~05 四表 + 自检门）→ 2. 落 `static-board/SKILL.md`（6 步管线 + 路由分流）→ 3. 落 `_megaprompts/static-board.megaprompt.md`（自包含）+ README/dimensions/continuity 注册 → 4. 写 `verify_static_board.py` + 黄金 few-shot B0 → 5. 真机出全案 + 量化审计（付费用户亲点，可后置）。

---

## 9. 风险与缓解 Risks & Mitigations

| 风险 | 影响 | 缓解 |
|---|---|---|
| **R1 与 keyframe/character-board 职责混淆**（都"画一张图"） | 误触发、概念重叠 | SKILL frontmatter 显式路由分流：单张商品图→character-board/color-palette；视频→storyboard/production-bible；**成套电商静态全案**才走 static-board。README 定位为"全案级·静态终态" |
| **R2 过程产物漏进成图**（引擎隐身破口：坐标/阈值/潜台词/选型） | 破铁律，成图出现 `(X,Y)`/`±5%`/卖点文案文字 | NFR-01 硬闸 + DoD-6 leak_scan + 反例 NB1；schema 用 `_` 前缀标记禁出字段；卡内动线/阈值全标"过程产物" |
| **R3 视频字段混入静态全案**（NG4 反向破口） | 静态全案出现运镜/时长/Seedance | DoD-7 视频字段扫描 + 反例 NB2；算法 `no_video_field` 断言 |
| **R4 跨图商品不一致**（11 图像 11 个商品） | 全案不可上架 | NFR-03 产品基线 asset_id 全程绑定 + ImageToImage 以 Hero02 为锚串联 + 真机审计 4 项门 |
| **R5 卖点转化退化成抽象审美词**（"高端感"不可成像） | 详情页无视觉证据、空洞 | FR-04 三段式强制"视觉证据=具象名词+物理动作"（沿用 keyframe §0 物理可见铁律）+ DoD-4 抽象词扫描 |
| **R6 真机审计能力弱/不稳**（测不准轮廓/HSL/LOGO） | 一致性门名存实亡 | 与 D01/D03 共享降级路径：宿主弱时降人眼核验；契约只声明阈值、不绑执行器 |
| **R7 LOGO/文字渲染失真**（图像模型画 LOGO 糊/偏） | LOGO Δ 超阈 | D03 分级选型把 LOGO/文字图位路由到 Nano Banana Pro（强项）；LOGO 走基线 ImageToImage 复刻、不 TextToImage 重画 |
| **R8 8 屏槽位对卖点数不匹配**（卖点 3 条或 20 条） | 详情页结构散 | FR-03 固定 8 屏：不足补场景/材质图，超出取 top8 并过程留痕；屏序闭合校验兜底 |

---

## 10. 工作量与里程碑 Effort & Milestones

**粗估总量：约 2.0–2.5 人周。**

| 里程碑 | 交付 | 估时 |
|---|---|---|
| **M1 · 契约与四表** | `static-board/output-contract.md`——FR-01 基线 schema（含复用 D01/D03 阈值）、FR-02 Hero 序列、FR-03 Detail 8 屏、FR-04 卖点转化表、FR-05 焦点+9:1 动线、自检门（含 NG1/NG4 双闸）。产出物：可评审契约草案 | 0.8 人周 |
| **M2 · 成员与导出** | `static-board/SKILL.md`（6 步管线 + 路由分流 frontmatter）、`_megaprompts/static-board.megaprompt.md`（自包含内联四表）、README + dimensions:598 + continuity 四 注册/交叉引用。产出物：可触发的成员 | 0.5 人周 |
| **M3 · 审计脚本与黄金基线** | `verify_static_board.py`（结构断言 + leak_scan + 视频字段扫描 + 反例 NB1/NB2）+ `examples/fewshot-电商静态全案-demo.md` 黄金基线 B0；接 DoD-1~8 断言。产出物：可重跑回归门 | 0.5 人周 |
| **M4 · 真机出片与量化审计** | 1 件商品真机 ImageToImage 出全案（用户亲点付费），对一致性审计 4 项核验 + A/B 人评。产出物：DoD-9/11 证据 + 调参结论 | 0.4 人周 |

**关键路径**：M1 → M2 → M3（M4 可与 M3 部分并行）。M3 的审计脚本（含两条铁律闸）是"可验证"的核心交付，优先于 M4 真机。
**MVP 切线**：M1+M2+M3 即交付"商品→静态全案（基线+3 Hero+8 Detail）+ 可重跑回归门"主链（FR-01~06 + 核心 NFR）；M4 真机量化审计与 A/B 人评可作第二批。

---

**契约版本**：D7 PRD Draft v0.1 ｜ 缺口类 B ｜ 优先级 P2 ｜ 落地可靠性 4/5 ｜ 新增成员 `static-board/`（全案级·静态终态，与 `production-bible/` 平级互补；复用 D01/D03 量化审计阈值 + dimensions/continuity 产品知识 + keyframe ImageToImage 范式；引擎隐身铁律扩展为"审计/动线层不漏进成图"，并新增 NG4"视频字段不混入静态全案"反向铁律）。
