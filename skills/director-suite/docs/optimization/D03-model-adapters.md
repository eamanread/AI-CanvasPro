# D3 · 多模型适配矩阵 + 模型无关能力抽象

> 编号 D3 ｜ 缺口类 B（单向单模单模型）｜ 优先级 P1 ｜ 状态 Draft v0.1 ｜ 落地可靠性自评 4/5

---

## 1. 问题陈述 Problem

**现状（引 director-suite 具体文件）。**

- 视频侧只有 **一个** 适配层 `_shared/seedance-2.0.md`。它把"皮③ 输出契约"产出的镜头卡翻译成 Seedance 2.0 专用语法（`{语言:台词}` / `<音效>` / `(BGM)` / `【标题】` / `<<<image_n>>>` / `no subtitles` / 节拍语序禁壁钟），并以"一个镜头组 = 一条 Seedance prompt"为生成单元。文件开头第 3 行只留了一句口头承诺：「其它模型（Kling/即梦/Veo/Sora）可另建适配层，本套件默认 Seedance 2.0」——**承诺存在，实现不存在**。
- 图像侧 **没有任何独立适配层**。`keyframe/output-contract.md` §7「图像模型成片提示词转换」和文首只在散文里点了 `GPT-Image-2 / Nano Banana Pro 等` 字样；`character-board/output-contract.md`、`color-palette/output-contract.md` 同样只有泛指。**没有一张表说明"哪个图像模型吃哪种语法、参考图怎么喂、哪种任务选哪个模型"**。
- 音色 / 音乐侧 **没有任何适配层**。`production-bible/SKILL.md` 第 33 行定义了 `[Voice_<Name>]` asset_id，`production-bible/examples/翡翠楼-全案demo.md` 第 106/141/176 行写了 `voice_reference：…（zh→doubao）`——`zh→doubao` 这条选型规则**埋在示例里，不在任何规范里**；ElevenLabs（英文）、Suno（BGM）连影子都没有。
- 模型常量 **散落且互相矛盾**。`continuity-quality.md` 二·1 写「图像元素 2K：Nano Banana 2 / Pro、GPT Image 2」「视频生成 720p→超分」，七·失败协议写「`Seedance 2.0 → Seedance 2.0 Fast`」「`GPT Image 2 → Nano Banana Pro` 兜底链」「`ImagesToVideo` 内换 Vidu Q3」——**这些是分散在连续性文档里的硬编码模型名，没有单一事实源（SoT）**，换一家模型要在 N 个文件里手改。

**痛点（为何是问题）。**

1. **可移植性是假的。** README「关键设定」与 DESIGN §6 都宣称"换 Kling/即梦/Veo/Sora 加 `_shared/<model>.md` 即可"，但真要换模型，作者得**手工重写**镜头组→prompt 的全部语法映射，因为这套语法目前是 Seedance 私有方言（`{}` `<>` `()` `【】` `<<<>>>`）。没有"模型无关中间层"，每加一个模型就是一次从零翻译，且与镜头卡契约耦合。
2. **图像产物质量靠运气。** Nano Banana Pro 强在 LOGO/文字与多图融合、Seedream 4.5 强在写实人像与一致性、GPT-Image-2 强在指令遵从——电商全案/角色板/关键帧用错模型，一致性审计（轮廓 ±5% / HSL ±15° / LOGO Δ0.05）直接崩。**没有分级选型规则 = 同一份卡喂错模型 = 系统性废稿**。
3. **音频是哑的。** 中文台词喂英文音色模型口音崩，BGM 用会唱名人名的模型有版权雷。`[Voice_*]` 有 ID 却无"ID→引擎"的解析规则，下游（真机生成 / ViMax provider）无法自动路由。
4. **失败兜底无契约。** `continuity-quality.md` 写了"同工具内降级 / 禁静默跨工具替代 / 兜底链"，但**降级目标、兜底链是哪条，硬编码在散文里**，没有结构化 fallback chain，自动化执行层读不到。

> 一句话：**适配是"单模单向"的——一个模型、一份私有语法、规则散落**。这正是缺口类 B。

---

## 2. 证据与接地 Evidence

**哪些源 skill 有此能力（点名）。**

| 源 skill / 全案 | 已证实的多模型能力 | 对应本方向哪个 adapter |
|---|---|---|
| **AI 短剧全案** | "音频模型分工 Suno5 / ElevenLabs / 豆包"；混音 dB 阶梯（BGM 低人声 8–12dB）；失败-修复对照表 | voice + music adapter；fallback chain |
| **电商全案** | "图像模型分级 Nano Banana Pro / Seedream 4.5 / NB2"；量化一致性审计（轮廓 ±5% / HSL 色相 ±15° / LOGO Δ0.05 / 白底 RGB≥245）；产品基线档案 | image adapter（含分级选型 + 一致性门） |
| **拉片复刻** | "参考视频→镜头拆解 00:00-15s→换主体保剪辑点"——依赖视频模型的 reference_video / 时长窗口能力 | capability-contract（参考 / 时长窗口字段） |
| **一图成片 / 执行导演** | "视觉基因解构"；planner→media_generator→video_assembler DAG | capability-contract（首尾帧 / 参考）；与 D（执行编排）协作 |
| **Flova 平台流水线** | media_generator 是统一生成节点，下游接多种模型 | 证明"模型无关中间层 + 末端适配"是源生态既有范式 |

**director-suite 盲点落在哪个文件 / 成员。**

| 盲点 | 命中文件 / 成员 | 缺什么 |
|---|---|---|
| 视频只有 Seedance | `_shared/seedance-2.0.md`（唯一） | 缺 kling3 / veo / sora / 即梦 adapter + 模型无关契约 |
| 图像无 adapter | `keyframe/output-contract.md` §7、`character-board/output-contract.md` §8、`color-palette/output-contract.md` | 缺 image adapter（nano-banana-pro / nano-banana-2 / gpt-image-2 / seedream-4.5 + 分级选型） |
| 音色 / 音乐无 adapter | `production-bible/SKILL.md` L33（`[Voice_*]` 定义处）、demo L106/141/176（`zh→doubao` 埋在示例） | 缺 voice adapter（豆包 zh / elevenlabs en）+ music adapter（suno5 禁名人名） |
| 模型常量散落矛盾 | `continuity-quality.md` 二·1 / 二·7（Nano Banana 2 / Pro、GPT Image 2、Seedance Fast、Vidu Q3、兜底链） | 缺单一事实源 model-registry + 结构化 fallback chain |
| 可移植性是口头承诺 | `seedance-2.0.md` L3、`README.md`「关键设定」、`DESIGN.md` §6 决策 2 | 缺 capability-contract（模型无关能力抽象）让"换模型"成真 |

---

## 3. 目标与非目标 Goals / Non-Goals

**目标。**

- G1：建立 **模型无关能力契约** `_shared/_model/capability-contract.md`——把"对白 / 音效 / BGM / 字卡 / 参考 / 时长窗口 / 首尾帧"等能力定义成**中性字段**，镜头卡只产中性字段，由 adapter 翻成各模型方言。
- G2：补齐 **四类 adapter 矩阵**：video（seedance / kling3 / veo / sora / 即梦）、image（nano-banana-pro / nano-banana-2 / gpt-image-2 / seedream-4.5）、voice（豆包 zh / elevenlabs en）、music（suno5），每个 adapter 含 capability 支持矩阵 + 语法映射 + 分级选型规则 + fallback。
- G3：建立 **单一事实源** `_shared/_model/model-registry.md`——所有模型常量（默认模型 / 画幅 / 分辨率 / 时长窗口 / 兜底链）集中一处，`continuity-quality.md` 等改为引用而非硬编码。
- G4：让"换模型"= **改一行默认值 + 已存在该 adapter**，而非重写语法。

**非目标。**

- 不接真机 API、不写调用代码（adapter 是**提示词语法规范文档**，不是 SDK）。真机路由是宿主 / ViMax provider 的事，本方向只产"该喂什么 prompt / 选哪个模型"的规范。
- 不改镜头卡契约的**对人字段结构**（storyboard / keyframe / character-board 的 output-contract 主结构不动），只在末端"成片提示词转换"段切换 adapter。
- **不破引擎隐身（铁律）**：capability-contract / model-registry / 分级选型逻辑 / 兜底链 / 一致性审计——**全部是过程产物，绝不可漏进成片**。adapter 输出的"可粘贴施工单"里只有目标模型方言，没有"我为什么选这个模型 / 我降级到了哪个模型"的任何痕迹。
- **不破可移植性**：capability-contract 必须保持模型无关；任何模型私有概念（Seedance 的 `<<<image_n>>>`、Suno 的段落标签）只能活在该模型的 adapter 里，不许回流到中性契约。
- 不做模型质量横评 / 跑分（那是缺口类 C 的事，D3 只做"覆盖与选型"）。

---

## 4. 需求 Requirements

### 4.1 功能需求 FR

**D3-FR-01 模型无关能力契约（capability-contract）。**
新建 `_shared/_model/capability-contract.md`，定义一组**中性能力字段**及其取值域：`dialogue`（对白：文本 + 语言 + voice_id）、`sfx`（音效）、`bgm`（背景音乐）、`title_card`（字卡）、`reference`（参考：image/video/audio + 角色/场景/道具/色卡绑定）、`duration_window`（时长窗口：min/max/recommended，单位 s）、`keyframe`（首尾帧：start_frame / end_frame / reference_video）。每个字段给出"含义 + 中性写法 + 哪些 adapter 必须实现"。
- **验收标准**：(a) 字段集覆盖 `seedance-2.0.md` 现有全部语法元素（对白/音效/BGM/字卡/参考/时长/首尾帧 7 类）100%——逐项可在 capability-contract 找到对应中性字段；(b) capability-contract 全文**零模型私有 token**（grep `<<<` / `{语言` / `【` / Suno 段落标签均 0 命中）；(c) 至少 1 个 video + 1 个 image + 1 个 voice adapter 各自声明"我实现了哪些中性字段、不支持哪些"的支持矩阵表。

**D3-FR-02 视频 adapter 矩阵（≥2 新增 + 现存 Seedance 纳管）。**
在 `_shared/_model/video/` 下，把现有 `seedance-2.0.md` 迁入并新增 ≥2 个：`kling3.md`、`veo.md`（`sora.md` / `jimeng.md` 可标 stub）。每个 adapter 含：① capability 支持矩阵（对照 FR-01 七字段，标 ✅/⚠️降级/❌不支持 + 降级写法）；② 中性字段 → 该模型语法的**逐字段映射表**；③ 时长窗口 / 画幅 / 首尾帧机制差异；④ 该模型专属负面约束。
- **验收标准**：(a) 至少 3 个 video adapter（seedance + kling3 + veo）齐备且每个都有完整七字段支持矩阵；(b) 取 1 个真实镜头组中性字段，分别经 seedance / kling3 两个 adapter 翻译，产出 2 段**语法不同但语义等价**的可粘贴 prompt（差异仅在方言 token，叙事内容逐句对齐）；(c) 每个 adapter 显式声明其 `duration_window`（如 seedance 4–15s）与首尾帧支持机制。

**D3-FR-03 图像 adapter + 分级选型（含一致性门）。**
新建 `_shared/_model/image/` 下 4 个 adapter：`nano-banana-pro.md`、`nano-banana-2.md`、`gpt-image-2.md`、`seedream-4.5.md`。每个含语法 / 参考图喂法 / 分辨率上限 / 一致性能力。并在 `image/_routing.md`（或 capability-contract 附表）给出**分级选型决策表**：按任务类型（角色板多视图 / 关键帧 / 色卡 / 电商白底 / 含 LOGO 文字）× 一致性要求 → 推荐模型 + 兜底。
- **验收标准**：(a) 4 个 image adapter 齐备；(b) 分级选型表覆盖 director-suite 现有 3 个图像成员任务（character-board / keyframe / color-palette）+ 电商白底/LOGO 场景，每行给"首选 + 兜底 + 选型理由（1 句，对内）"；(c) 选型表的一致性阈值与电商全案证据对齐（轮廓 ±5% / HSL ±15° / LOGO Δ0.05 / 白底 RGB≥245）——这些阈值进**选型理由 / 审计门**，**不进成片**。

**D3-FR-04 音色 + 音乐 adapter（含合规禁项）。**
新建 `_shared/_model/voice/`（`doubao-zh.md` / `elevenlabs-en.md`）与 `_shared/_model/music/`（`suno5.md`）。voice adapter 定义 `[Voice_*]` → 引擎的**语言路由规则**（zh→豆包、en→ElevenLabs）+ voice_reference 喂法 + 与镜头卡台词三参数（音色/语速/情感）的对接。music adapter 定义 BGM 描述写法 + 混音 dB 阶梯（BGM 低人声 8–12dB）+ **合规硬禁：禁名人名 / 禁真实艺人名 / 禁版权曲名**。
- **验收标准**：(a) voice adapter 给出确定的 `语言 → 引擎` 路由表，把现散落在 demo 里的 `zh→doubao` 升级为规范条款；(b) music adapter 的禁项清单含"禁名人名/艺人名/版权曲名"且给出 ≥5 个被禁示例类别 + 合规替代写法；(c) 取 demo 中 3 个 `[Voice_*]`（LinChen/ZhaoShanhe/WangKai）按规则路由，全部解析到正确引擎且无歧义。

**D3-FR-05 单一事实源 model-registry + 结构化 fallback chain。**
新建 `_shared/_model/model-registry.md`，集中：默认模型（video/image/voice/music 各一）、默认画幅 / 分辨率 / 帧率、各模型时长窗口、**结构化兜底链**（如 `seedance-2.0 → seedance-2.0-fast`、`gpt-image-2 → nano-banana-pro`、`imagestovideo: → vidu-q3`）。把 `continuity-quality.md` 二·1 / 二·7 中硬编码的模型常量改为"见 model-registry"。
- **验收标准**：(a) `continuity-quality.md` 中所有具体模型名（Nano Banana 2/Pro、GPT Image 2、Seedance Fast、Vidu Q3）要么删除要么标注"权威值见 model-registry"，全仓库"默认视频模型"只有 1 处定义点；(b) fallback chain 为结构化可解析格式（每条 `from → to`，含触发条件"同工具内降级"标记），机器可读；(c) 改默认视频模型为 kling3 时，只需改 registry 1 行，无需动任何镜头卡 / 契约文件（用一次 diff 证明改动面 = 1 行）。

### 4.2 非功能需求 NFR

**D3-NFR-01 引擎隐身（铁律 · 一票否决）。** capability-contract / 选型理由 / 一致性阈值 / fallback chain / 审计门 全属过程产物。adapter 产出的"可粘贴施工单"**只含目标模型方言**，不得出现：模型选型理由、"降级到 X"、审计阈值（±5%/±15°/Δ0.05）、capability 字段名（`duration_window` 等）。
- 验收：对任意 adapter 产出的成片 prompt 做 grep，模型选型/审计/降级/中性字段名 token 命中 = 0。

**D3-NFR-02 可移植性 / 模型无关。** capability-contract 全文不得含任何模型私有概念；新增一个模型 = 新增 1 个 adapter 文件 + registry 1 行，**零改动**镜头卡契约主结构与其它 adapter。
- 验收：新增 1 个 stub adapter（如 `sora.md`）后，全仓库除 registry 外 0 处文件需改（git diff 证明）。

**D3-NFR-03 一致性可量化。** 图像分级选型表必须把"为什么选这个模型"落到可量化一致性指标（轮廓 ±5% / HSL ±15° / LOGO Δ0.05 / 白底 RGB≥245），而非"质量更好"这类空话。
- 验收：选型表每行"选型理由"含 ≥1 个数值化一致性依据或明确能力差异（如"多图融合"），无纯形容词理由。

**D3-NFR-04 向后兼容。** 现有 `seedance-2.0.md` 的语法/铁律语义不被破坏；现有镜头卡 examples（`storyboard/examples/fewshot-翡翠楼夜宴-v2全片.md`、production-bible demo）经迁移后仍能产出**逐字等价**的 Seedance prompt。
- 验收：迁移前后，同一镜头组经 seedance adapter 产出的 prompt 做 diff，语义差异 = 0（仅允许文件路径引用变化）。

**D3-NFR-05 渐进式披露 / 上下文成本。** 默认只加载 capability-contract + registry（轻）；具体 adapter 仅在确定目标模型后**按需 Read**。新增 _model/ 目录不得让 SKILL.md 主文件或 megaprompt 体积显著膨胀。
- 验收：各成员 SKILL.md 路由表新增"定模型→读对应 adapter"一行即可，主文件正文增量 ≤ 5 行；adapter 不被默认全量内联。

---

## 5. 设计 Design

### ① 新增 / 改动文件精确路径清单

```
新增（核心抽象层）
skills/director-suite/_shared/_model/
├── capability-contract.md          # 【新】模型无关能力契约（7 中性字段 + 支持矩阵规范）   ← FR-01
├── model-registry.md               # 【新】单一事实源：默认模型/画幅/分辨率/时长/fallback chain ← FR-05
├── video/
│   ├── seedance-2.0.md             # 【迁移】由 _shared/seedance-2.0.md 迁入并补支持矩阵      ← FR-02
│   ├── kling3.md                   # 【新】
│   ├── veo.md                      # 【新】
│   ├── sora.md                     # 【新·stub】
│   └── jimeng.md                   # 【新·stub 即梦】
├── image/
│   ├── _routing.md                 # 【新】图像分级选型决策表（任务×一致性→模型+兜底）       ← FR-03
│   ├── nano-banana-pro.md          # 【新】
│   ├── nano-banana-2.md            # 【新】
│   ├── gpt-image-2.md              # 【新】
│   └── seedream-4.5.md             # 【新】
├── voice/
│   ├── doubao-zh.md                # 【新】中文音色                                          ← FR-04
│   └── elevenlabs-en.md            # 【新】英文音色
└── music/
    └── suno5.md                    # 【新】BGM（禁名人名）                                   ← FR-04

改动（去硬编码 + 路由指向新层）
skills/director-suite/_shared/continuity-quality.md   # 二·1/二·7 模型常量改"见 model-registry"  ← FR-05/NFR-04
skills/director-suite/_shared/seedance-2.0.md          # 改为薄重定向占位（指向 video/seedance-2.0.md）或删除，保兼容
skills/director-suite/keyframe/output-contract.md      # §7 改"经 image adapter 转换"，移除散落模型名
skills/director-suite/character-board/output-contract.md
skills/director-suite/color-palette/output-contract.md
skills/director-suite/storyboard/output-contract.md    # §附 成片提示词段落指向 video adapter（默认 seedance）
skills/director-suite/production-bible/SKILL.md         # [Voice_*] 定义处补"引擎路由见 voice adapter"
skills/director-suite/README.md / DESIGN.md            # 「关键设定」「决策2」由口头承诺改为指向 _model/ 矩阵
各成员 SKILL.md 路由表                                  # 新增"定模型→读 _model/<类>/<model>.md"一行  ← NFR-05
```

### ② 挂进 Soul / Bone / Skin 哪层

- **皮③（Skin）为主**：adapter = "怎么说模型才听得懂的语法"，本就是皮层职责（DESIGN §2 把 seedance-2.0 归在皮③）。`_model/` 全套属皮③。
- **骨②（Bone）小幅**：`model-registry.md` 的"画幅/分辨率/时长/兜底链"是规格知识，性质近 `continuity-quality.md`，作为骨②与皮③之间的**规格 SoT**；逻辑上"骨产中性字段 → 皮经 adapter 翻译"。
- **灵魂①（Soul）零接触**：tacit-core 不感知模型；选型理由可量化但**不外显**——这正是引擎隐身在适配层的体现。

数据流接口不变：灵魂→骨传"体感意图 + 强度 0–5"，骨→皮传"参数 + **中性能力字段**"，皮经 adapter 出"目标模型方言"。新增的只是皮层内部"中性字段 → 方言"这一段。

### ③ 关键 schema / 契约字段 / 算法

**capability-contract 中性字段 schema（YAML 形态，仅示意结构，实际为 md 表 + 中性写法）：**

```yaml
shot_group_unit:                 # 镜头组 = 一个生成单元（沿用 seedance §0）
  duration_window: { min: 4, max: 15, recommended: [10, 15], unit: s }
  dialogue:                      # 对白（中性，不写 {语言:})
    - { text: "这一次，没有退路。", lang: zh, voice_id: "[Voice_LinChen]" }
  sfx:    ["金属管坠地，低频撞击"]   # 中性，不写 <>
  bgm:    { desc: "单钢琴，极简，留白", none: false }   # none=true → 渲染层加 no music
  title_card: ["三年后"]          # 中性，不写 【】
  reference:                     # 中性参考绑定（不写 <<<image_n>>>）
    - { id: img_1, kind: image, bind: "[Element_LinChen]", role: 主角 }
    - { id: img_2, kind: image, bind: "[Scene_JadeTower]", role: 场景 }
  keyframe:                      # 首尾帧（中性）
    start_frame: "<prev_group.end_frame>"
    end_frame:   null
    reference_video: null        # 默认不加（沿用 continuity 门槛原则）
  hard_negative: [no_subtitles, no_text_overlay, no_watermark]  # 中性枚举
```

**adapter 支持矩阵表（每个 adapter 必含，以 seedance 为例）：**

| 中性字段 | seedance-2.0 支持 | 该模型语法映射 | 降级写法（不支持时） |
|---|---|---|---|
| dialogue | ✅ | `{lang:text}` | — |
| sfx | ✅ | `<text>` | — |
| bgm | ✅ | `(text)` / none→`no music` | — |
| title_card | ✅ | `【text】` | — |
| reference | ✅ | `<<<image_n>>>=bind` | — |
| duration_window | ✅ 4–15s | 节拍语序 | 超窗拆组 |
| keyframe | ✅ | start_frame/reference_video | ⚠️ 仅末帧续首帧 |

**fallback chain schema（model-registry，机器可读）：**

```yaml
fallback:
  video:
    - { from: seedance-2.0, to: seedance-2.0-fast, trigger: same_tool_degrade }
    - { from: imagestovideo, to: vidu-q3,          trigger: same_tool_degrade }
  image:
    - { from: gpt-image-2, to: nano-banana-pro,    trigger: same_tool_degrade }
  policy: no_silent_cross_tool   # 跨工具/全失败 → 停下问用户（沿用 continuity 七·失败协议）
```

**图像分级选型决策算法（_routing.md，对内）：**

```
输入：task_type, consistency_need, has_logo_or_text, need_realistic_face
路由：
  if task_type == character_board(多视图一致性) → seedream-4.5  (兜底 nano-banana-pro)   # 一致性最强
  elif has_logo_or_text or 电商白底             → nano-banana-pro (兜底 gpt-image-2)      # LOGO/文字/多图融合
  elif task_type == keyframe(指令遵从+动作落点)  → gpt-image-2    (兜底 nano-banana-pro)    # 指令遵从
  elif task_type == color-palette(色卡/概念)     → nano-banana-2  (兜底 gpt-image-2)        # 快/省
理由字段（对内·不进成片）：附一致性阈值依据（轮廓±5%/HSL±15°/LOGO Δ0.05/白底RGB≥245）
```

### ④ 数据流（ASCII）

```
镜头卡(对人字段·不变)
        │  骨→皮：参数 + 中性能力字段
        ▼
┌─────────────────────────────────────────────┐
│  _model/capability-contract.md  (模型无关中间层) │   ← 7 中性字段
└───────────────┬─────────────────────────────┘
                │ 读 model-registry 取「默认模型 / 时长窗 / fallback」
                ▼
        ┌───────────────┐   选型(对内,不外显)
        │ model-registry │──────────────┐
        └───────┬────────┘              │ 图像走 _routing 决策
                ▼                        ▼
   ┌────────────┬─────────────┬──────────────┬─────────┐
   │ video/<m>  │ image/<m>    │ voice/<m>    │ music/  │  ← 各 adapter：中性→方言
   │ seedance.. │ seedream..   │ doubao/11labs│ suno5   │
   └─────┬──────┴──────┬───────┴──────┬───────┴────┬────┘
         ▼             ▼              ▼            ▼
   可粘贴施工单（仅目标模型方言，零选型/审计/降级痕迹）  ← 引擎隐身在此落实
```

---

## 6. 验收标准 Acceptance Criteria (DoD)

逐条可验证：

1. **能力契约覆盖率 = 100%**：`capability-contract.md` 的中性字段逐项映射 `seedance-2.0.md` 现有 7 类语法元素，无遗漏（产物存在 + 逐项对照表无空行）。
2. **video adapter ≥ 3 个齐备**（seedance + kling3 + veo），每个含完整七字段支持矩阵 + duration_window 声明；sora/jimeng 至少 stub。
3. **跨模型等价性**：同一镜头组中性字段经 seedance 与 kling3 两 adapter 翻译，产出 2 段方言不同的 prompt，逐句叙事内容对齐（人工 diff：叙事差异 = 0，仅 token 语法不同）。
4. **image adapter 4 个齐备 + 分级选型表覆盖** character-board / keyframe / color-palette / 电商白底·LOGO，每行有"首选+兜底+量化理由"。
5. **voice 路由确定**：demo 三个 `[Voice_*]` 全部解析到正确引擎（zh→豆包）无歧义；music adapter 禁名人名清单 ≥5 类 + 合规替代。
6. **去硬编码**：`continuity-quality.md` 内所有具体模型名改为引用 registry；"默认视频模型"全仓库仅 1 处定义点（grep 验证）。
7. **fallback 可解析**：registry 的 fallback chain 为结构化 `from→to+trigger` 格式，含 `no_silent_cross_tool` 策略。
8. **换模型 = 1 行 diff**：把默认视频模型从 seedance 改为 kling3，`git diff` 改动面 = registry 1 行，0 处镜头卡/契约文件被动。
9. **引擎隐身核验（一票否决）**：对所有 adapter 产出的成片 prompt 做 grep，`<选型理由>`/`降级`/`±5%`/`duration_window`/capability 字段名 命中 = 0。
10. **向后兼容**：迁移前后同一镜头组经 seedance adapter 产出 prompt 语义 diff = 0。
11. **真机抽检（与宿主协作，1 例）**：取 1 个真实镜头组，按 image `_routing` 选定模型出 1 张图，对一致性审计 4 项（轮廓 ±5% / HSL ±15° / LOGO Δ0.05 / 白底 RGB≥245）无 ⚠️。

---

## 7. 验证方案 Verification Plan

**验证手段。**

- **结构静态核验（脚本）**：写一个小核验脚本（python，本机用 `python` 非 `python3`）遍历 `_model/`，断言：(a) 每个 video/image/voice adapter 都含"支持矩阵"段与 capability 七字段对照；(b) capability-contract 与各 adapter 成片样例段做 grep，确认私有 token 只在 adapter、中性字段名/审计阈值不在成片样例。→ 证 FR-01/02/03/04、NFR-01/02。
- **跨模型等价回归（diff）**：固定 1 个基线镜头组（取自 `storyboard/examples/fewshot-翡翠楼夜宴-v2全片.md` 的某组中性字段），分别经 seedance / kling3 adapter 生成 prompt，人工逐句对账"叙事单元一一对应"。→ 证 FR-02 等价性。
- **换模型 1 行 diff（git）**：改 registry 默认视频模型一行，`git diff --stat` 证改动面=1 文件 1 行。→ 证 NFR-02、DoD-8。
- **去硬编码 grep**：`Grep "Nano Banana|GPT Image 2|Seedance.*Fast|Vidu Q3"` 在 `continuity-quality.md` 命中 = 0（或仅"见 registry"指引）。→ 证 FR-05、DoD-6。
- **引擎隐身 grep（一票否决门）**：对所有 adapter 的"可粘贴施工单"样例 grep 选型/审计/降级/中性字段 token，命中=0。→ 证 NFR-01、DoD-9。
- **真机出片 A 例（与用户协作，付费按钮由用户点）**：取 1 镜头组按 image `_routing` 路由出图，跑电商一致性审计 4 项。这是唯一"真的有效"的终极证据——选型规则若错，审计必有 ⚠️。→ 证 FR-03、DoD-11。
- **人评 A-B（可选，1 对）**：同一中性字段，用"分级选型推荐模型"vs"随手选另一模型"各出 1 图，盲评一致性更优者命中推荐。

**测试用例 / 基线。**

- 基线 BL-1：`fewshot-翡翠楼夜宴-v2全片.md` 抽 1 个镜头组 → 中性字段。
- 基线 BL-2：production-bible demo 的 3 个 `[Voice_*]`（LinChen/ZhaoShanhe/WangKai）→ 路由期望 = 全部豆包 zh。
- 基线 BL-3：电商白底+LOGO 任务（合成 1 例）→ 路由期望 = nano-banana-pro。

**为何这样能证明"真的有效"。**

- "覆盖率/等价性/隐身"是**结构性质**，脚本+grep+diff 给确定性证明，不靠主观。
- "选型规则有效"靠**真机出片 + 量化审计**：若选型错（如多视图一致性任务误选 nano-banana-2），审计 4 项必触 ⚠️——审计是客观秤。
- "可移植性"靠 **git diff 数字**（1 行）兜底，把"口头承诺"变成可测量的改动面。

**落地可靠性理由（4/5）。**

- 正向：本方向主要是**文档/规范工程**，无新引擎逻辑、无 API 耦合；现有 `seedance-2.0.md` 已是高质量蓝本，照其结构复制即可；模型语法差异有公开证据（源 skill 已点名分工）。验收手段大部分是脚本/grep/diff，确定性高。
- 扣 1 分：(a) kling3/veo/sora 各自精确语法需作者按真实文档校准，存在"写得不够准"的风险（stub 可缓释）；(b) 真机审计需用户配合点付费按钮，e2e 闭环依赖外部协作；(c) `continuity-quality.md` 去硬编码涉及多处引用改写，回归面略大（NFR-04 兜底）。

---

## 8. 依赖与顺序 Dependencies

- **被依赖 / 先行**：本方向是其它方向的**模型基础设施**。建议**先于** D（评测审计 / 执行编排门）落地——评测要跨模型对比，必须先有 adapter 矩阵；执行编排（媒体生成节点）要按 registry 路由，必须先有 registry + fallback。
- **依赖现有**：`_shared/seedance-2.0.md`（迁移源）、`_shared/continuity-quality.md`（去硬编码改造对象）、`production-bible` 的 `[Voice_*]` asset_id 体系（voice adapter 的输入）、`asset-id-convention.md`（参考绑定语义）。
- **宿主能力**：真机出片 + 一致性审计需宿主 / ViMax provider 提供真实生成通道与审计脚本（DoD-11 的 e2e 依赖此）。本方向只产规范，不产调用代码。
- **与音频混音方向协作**：music adapter 的 dB 阶梯（BGM 低人声 8–12dB）若另有专门的音频方向，需对齐归属，避免双写。

---

## 9. 风险与缓解 Risks & Mitigations

| 风险 | 影响 | 缓解 |
|---|---|---|
| 各模型私有语法写不准（kling3/veo/sora） | adapter 产出 prompt 喂模型无效 | 先交 seedance（已验证）+ kling3 + veo 三个，sora/jimeng 标 stub 占位；每 adapter 顶部标"语法版本/校准来源"，待真机校准 |
| 中性契约被模型私有概念污染（可移植性破功） | 退回单模耦合 | NFR-02 grep 门把关：capability-contract 出现任何模型私有 token 即 fail；私有概念只许活在 adapter |
| 引擎隐身泄漏（选型/审计/降级混进成片） | 违反铁律一票否决 | NFR-01 grep 门 + DoD-9；adapter 模板把"对内理由"与"可粘贴施工单"物理分段，施工单段禁含理由 |
| `continuity-quality.md` 去硬编码引入回归 | 现有连续性语义被改坏 | NFR-04 向后兼容 diff 门；改造只把"模型名"替为"见 registry"，不动连续性逻辑文字 |
| 图像分级选型规则与真实模型能力错配 | 选错模型→审计 ⚠️ | DoD-11 真机抽检兜底；选型理由必须挂量化一致性依据（NFR-03），可证伪 |
| music 合规漏网（名人名/版权曲） | 版权雷 | suno5 adapter 硬禁清单 + 合规替代写法；进 hard_negative 中性枚举，跨 adapter 强制 |
| _model/ 目录使上下文膨胀 | 加载成本上升 | NFR-05 渐进式披露：默认只载 contract+registry，adapter 按需 Read |

---

## 10. 工作量与里程碑 Effort & Milestones

**粗估：3–4 人周。**

| 里程碑 | 内容 | 交付 | 人周 |
|---|---|---|---|
| **M1 抽象层** | capability-contract（7 中性字段+支持矩阵规范）+ model-registry（默认值+fallback schema）+ seedance 迁移并补支持矩阵 | FR-01、FR-05 主体；DoD-1/6/7/10 | 1.0 |
| **M2 video 矩阵** | kling3 + veo adapter（含支持矩阵+映射表+负面约束）；sora/jimeng stub | FR-02；DoD-2/3 | 0.75 |
| **M3 image 矩阵 + 分级** | 4 个 image adapter + `_routing.md` 决策表（含量化理由） | FR-03；DoD-4 | 0.75 |
| **M4 voice + music** | doubao-zh / elevenlabs-en / suno5 adapter（路由表+合规禁项+dB 阶梯） | FR-04；DoD-5 | 0.5 |
| **M5 去硬编码 + 隐身门 + 验证** | continuity-quality / 各 output-contract / SKILL 路由表改写引用；核验脚本；引擎隐身 grep 门；换模型 1 行 diff；真机抽检 1 例 | NFR-01~05；DoD-6/8/9/11 | 0.75 |

**关键路径**：M1 是地基（contract + registry），M2–M4 可并行，M5 收口（去硬编码 + 验证门 + 真机）。M1 完成即可单独证明"可移植性"（换模型 1 行 diff），是最小可验证里程碑。
