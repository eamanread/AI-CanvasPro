# D1 · 大脑↔宿主 执行编排契约（Execution Contract）

> 编号 D1 ｜ 缺口类 A有脑无手 ｜ 优先级 P1 ｜ 状态 Draft v0.1 ｜ 落地可靠性自评 4/5

---

## 1. 问题陈述 Problem

**现状（引 director-suite 具体文件）：**

director-suite 的整条管线终点是"产出可粘贴的文本提示词"，**到此即停**：

- `storyboard/SKILL.md` 的 6 步管线，**Step 6「输出」= 镜头卡（给人看）+ 每个镜头组一段 Seedance 提示词**（`storyboard/SKILL.md:31`、`:54`）。管线没有 Step 7「驱动生成」「合成」「导出」。
- `_shared/seedance-2.0.md:48-50` 明确把产物定位成"蓝图 + 施工单"二元：「镜头卡是『蓝图』，每组一条 Seedance prompt 是『施工单』」——但**谁来照施工单施工、按什么顺序施工、施工到哪一步停下等人验收，全都没有定义**。施工单是给人类手动复制粘贴到对话框的。
- `production-bible` 已经有一张 **内容生成 DAG**（`DESIGN-production-bible.md:27` §② 三表并行→分镜 join），但那是"四张表怎么互锁产出"的 DAG，**不是"四张表/分镜产出后，怎么驱动 media_generator→video_assembler 跑到成片"的执行 DAG**。
- `_shared/continuity-quality.md` 里散落着大量本应由"执行编排"消费的硬约束——**强制暂停门**（`:134-138` §8 列了 5 个典型门位）、**失败处理协议**（`:126-132` §7 同工具降级/禁静默跨工具）、**首尾帧承接三方案**（`:41-48`）、**参考图/参考视频门槛**（`:50-56`）、**Final_Video_Spec 单一事实源**（`:78-80`）——但这些都是**写给人读的散文规则**，没有结构化成机器可消费的 schema，宿主（ViMax/幻映）无法直接 parse 后驱动。

**痛点（为何是问题）：**

1. **有脑无手（缺口类 A 的典型形态）。** 套件把"20 年导演手感"翻译成了精确到焦段/色温/dBFS 的镜头卡，却在最后一公里掉链子：人类必须肉眼读镜头卡、手动逐组复制 Seedance prompt、手动决定先生角色图还是先生场景图、手动判断"这镜跟前镜是不是强连续要不要喂 reference_video"、手动在每个暂停门停下来看相似度。**导演的判断被结构化了，但执行的判断没有**，全靠操作员的肉身经验，规模化即崩。
2. **宿主已有原生链却接不上。** 幻映/ViMax 已有 `plan+render+portraits` 原生生成链（见仓库 MEMORY「ViMax 解耦接入 α′」：plan+render+portraits 全原生、ledger 计费、判官重摇）。宿主有"手"，套件有"脑"，**但两者之间没有契约**——套件吐的是非结构化中文+英文混排文本，宿主要驱动生成必须先靠正则/LLM 二次解析，脆弱且有损。
3. **暂停门是散文，不是门。** `continuity-quality.md:134` 写着"禁一键跑到底""换脸/数字人/POV 类出图后必须暂停"，但这只是**对人的劝告**。没有机器可识别的门点位（gate id + 触发条件 + 放行条件），宿主无法在 DAG 里真正"卡住"等用户确认——结果要么人忘了停（质量塌方），要么宿主一律停（效率塌方）。
4. **引擎隐身铁律有被执行层击穿的风险。** 一旦要做"执行编排"，就天然要产生审计记录、依赖图、门点状态、失败重试日志——这些**过程产物若漏进成片就是引擎泄漏**（`storyboard/output-contract.md:170-172` §7.6/§7.8 反复强调"自检/审计绝不写进镜头卡"）。没有一个明确的契约层把"喂给宿主的执行 JSON"和"喂给视频模型的成片 prompt"在结构上隔开，泄漏迟早发生。

---

## 2. 证据与接地 Evidence

**哪些源 skill 有此能力（点名）：**

- **Flova 平台 skill = 完整可执行流水线**（本方向的头号接地证据）：`planner → multimodal_analyze_tool → storyboard_designer → media_generator → video_assembler`，**带依赖 DAG（节点2依赖1；节点3依赖2）+ 强制暂停门 + 跑到时间线合成导出**。这正是"分镜文本之后"的那段 director-suite 完全没有的东西。
- **AI 短剧 skill**：有"**运镜轨迹示意图 + 内切镜时长经验表 + 混音 dB 阶梯（BGM 低于人声 8–12dB）+ 失败-修复对照表 + 音频模型分工（Suno5 配乐 / ElevenLabs 配音 / 豆包）**"——证明执行层需要 audio_layer 的结构化分工与混音参数，不是一句"配点 BGM"。
- **一图成片 skill**：有"**视觉基因解构**"，且其执行导演角色明确串起"解构→生成→合成"。
- **拉片复刻 skill**：有"**参考视频→镜头拆解 00:00-15s→换主体保剪辑点**"——证明执行契约需要承载"剪辑点 / 时间线锚"作为 shot 间的硬约束。
- **电商全案 skill**：有"**量化一致性审计（轮廓±5% / HSL 色相±15° / LOGO Δ0.05 / 白底 RGB≥245）+ 产品基线档案 + 图像模型分级（Nano Banana Pro / Seedream4.5 / NB2）**"——证明 key_element 节点需携带"生成模型选择 + 一致性审计阈值"字段，供宿主在生成后回检。

**director-suite 盲点落在哪个文件/成员：**

| 盲点 | 现落在哪 | 缺什么 |
|---|---|---|
| 分镜→可执行单元的结构化 | `storyboard/output-contract.md`（人读散文卡）、`seedance-2.0.md`（人读 prompt 模板） | 缺机器可消费的 `key_element / shot / audio_layer` schema |
| 执行依赖关系 | `DESIGN-production-bible.md:27` 只有"内容生成 DAG" | 缺"生成→合成→导出"的**执行 DAG** |
| 暂停门 | `continuity-quality.md:134-138`（散文劝告） | 缺机器可识别的 `pause_gate`（id/触发/放行） |
| 失败重试 | `continuity-quality.md:126-132`（散文协议） | 缺结构化 `failure_policy`（降级链/停报阈值） |
| 模型/审计阈值 | `seedance-2.0.md`（只 Seedance 一个适配层） | 缺 key_element 上的 `model` / `consistency_audit` 字段 |
| 宿主对接 | **完全没有文件** | 缺 `production-bible/execution-contract.md`（本方向新增） |

**结论：** director-suite 的 Skin 层只有 `seedance-2.0.md` 一个"模型适配层"（把卡翻成 prompt），但**没有"宿主适配层"**（把卡翻成宿主能驱动的执行图）。本方向就是补这一层。

---

## 3. 目标与非目标 Goals / Non-Goals

**Goals：**

- **G1** 定义一份机器可消费的**执行契约 schema**：把已有的"四表 + 分镜镜头卡"**无损映射**成 `key_element[] / shot[] / audio_layer[]` 三类结构化节点 + 节点间**执行依赖 DAG** + **强制暂停门点位**。
- **G2** 让宿主（ViMax/幻映 plan+render+portraits 原生链）**能直接 parse 这份契约并驱动** 生成→合成→导出，无需对中文散文 prompt 做二次 LLM 解析。
- **G3** 把 `continuity-quality.md` 里散落的"暂停门 / 失败协议 / 首尾帧承接 / 参考门槛 / Final_Video_Spec"**结构化收口**到契约字段里（散文规则 → 机器字段），做到"规则即数据"。
- **G4** 新增 `production-bible/execution-contract.md` 作为该 schema 的**单一权威定义**（schema spec + 字段表 + 从镜头卡到契约的映射规则 + 自检）。

**Non-Goals（明确边界）：**

- **N1 不写编排"手"本身。** 不在套件里实现 media_generator/video_assembler/调度器/重试器/时间线合成器。**"手"留在宿主**（幻映/ViMax 已有原生链），套件只产**契约**。这是"不破可移植性"的底线：契约是纯数据（JSON/YAML），可被任何宿主消费，不绑定幻映的具体 API。
- **N2 不破引擎隐身（铁律）。** 执行契约是**过程产物**，与"成片"严格物理隔离。契约 JSON 里允许出现 gate/audit/dependency/retry 等执行字段；但**这些字段绝不可出现在喂给视频模型的 `final_prompt` 字符串里**，也绝不可出现在给人看的成片中。契约携带的 prompt 字段 = 已经过引擎隐身自检的纯创作语言（沿用 `output-contract.md:170` §7.6）。
- **N3 不替宿主选模型默认值。** 契约的 `model` 字段是**声明位**（可空，可由宿主默认填充），套件给推荐值（Seedance 2.0 为主），但不强制；换 Kling/Veo/Sora 时宿主自填，契约结构不变。
- **N4 不引入新的画质/连续性规则。** 本方向**只搬运结构化**已有规则（`continuity-quality.md`），不发明新阈值。新阈值属于其它方向（如 C 类"无秤无回归"）。

---

## 4. 需求 Requirements

### 4.1 功能需求 FR

> 每条带可量化验收标准；FR 共 7 条。

**D1-FR-01 ｜ 三类执行节点 schema（key_element / shot / audio_layer）**
把四表 + 分镜镜头卡映射成三类机器可消费节点：`key_element`（角色/场景/道具 = 四表里的 asset_id 实体）、`shot`（= 镜头组，对齐 `output-contract.md:23` 的"生成单元 10–15s"）、`audio_layer`（对白/音效/BGM 三类音轨）。
*验收标准：* 给定 `storyboard/examples/fewshot-翡翠楼夜宴-v2全片.md` 的成片镜头卡，能产出一份合法 JSON，其中 (a) 每个 `[Element_*]/[Prop_*]/[Voice_*]` asset_id **恰好**生成一个 `key_element` 节点（数量 1:1，无遗漏无重复）；(b) 每个"镜头组"**恰好**生成一个 `shot` 节点（对齐 §0 生成单元，**不是**每个镜内分切各生成一个，复核 `seedance-2.0.md:18`）；(c) 每个 `shot` 的对白/音效/BGM 拆成独立 `audio_layer` 节点。JSON 通过随附 JSON Schema 校验（`ajv` 0 error）。

**D1-FR-02 ｜ 执行依赖 DAG（key_element → shot → assemble → export）**
契约须显式声明节点间执行依赖边，且为有向无环：`key_element`（角色/场景/道具图先生成）→ 该 shot 引用的全部 key_element 就位后才可生成该 shot 视频 → 全部 shot 就位后才可 `assemble`（时间线合成）→ `export`。承接强连续的 shot 间追加 `start_frame`/`reference_video` 依赖边（对齐 `continuity-quality.md:41-56`）。
*验收标准：* (a) 输出的 `dependencies[]` 经拓扑排序**无环**（脚本检测 `is_dag()==true`）；(b) 任一 `shot` 节点的入边**必然包含**它在 `refs[]` 里引用的所有 `key_element`（即"先绑后生""三表 join 后才出分镜"在 DAG 上成立，对齐 `DESIGN-production-bible.md:77`）；(c) `assemble` 节点入边 = 全部 `shot`；`export` 入边 = `assemble`。三条结构约束写成断言脚本，对基线全片 0 违例。

**D1-FR-03 ｜ 强制暂停门点位（pause_gate）**
把 `continuity-quality.md:134-138` §8 的 5 个典型门位结构化成 `pause_gate` 节点，每个含 `gate_id` / `after`（挂在哪个节点之后）/ `trigger`（什么条件下必停）/ `release`（用户确认什么才放行）。其中**换脸/数字人/POV 类 key_element 出图后的相似度门为强制门**（`mandatory:true`，宿主不可跳过）。
*验收标准：* (a) 契约至少落地这 5 个门位：`intent_spec`（意图/规格确认）、`storyboard_review`（故事板审核）、`element_render`（元素/角色图渲染后确认相似度）、`keyframe_confirm`（全景/关键帧确认）、`final_cut`（剪辑后成片检查）；(b) 当任一 key_element 标 `category∈{faceswap,digital_human,pov}` 时，其 `element_render` 门 `mandatory` 字段自动置 `true`（脚本断言）；(c) 每个 gate 的 `release` 条件非空且可机读（枚举值，非自由文本）。

**D1-FR-04 ｜ 失败处理策略结构化（failure_policy）**
把 `continuity-quality.md:126-132` §7 的失败协议落成每个生成节点（key_element/shot）上的 `failure_policy` 字段：`retry_within_tool`（同工具内重试次数）/ `degrade_chain`（同工具降级链，如 `Seedance 2.0 → Seedance 2.0 Fast`）/ `escalate`（全失败后是 `stop_and_ask` 还是按预设兜底链）。**铁律：禁静默跨工具替代**——`degrade_chain` 只允许同模型族内降级，跨族必须走 `escalate:stop_and_ask`。
*验收标准：* (a) 每个生成节点都有非空 `failure_policy`；(b) 校验脚本断言所有 `degrade_chain` 成员同属一个模型族（对照 `seedance-2.0.md` 的 Seedance 族），跨族降级链 0 个；(c) `escalate` 取值 ∈ `{stop_and_ask, fallback_chain}`，且 faceswap/digital_human 类节点的 `escalate` **强制** `stop_and_ask`（对齐 §7"部分模型失败须问用户"）。

**D1-FR-05 ｜ key_element 携带模型选择与一致性审计阈值**
每个 `key_element` 节点携带 `model`（生成模型声明，可空待宿主默认）+ `consistency_audit`（一致性审计阈值，接地电商全案 skill 的量化审计）：如 `silhouette_tol`（轮廓 ±%）/ `hue_tol`（HSL 色相 ±°）/ `logo_delta` / `white_bg_rgb_min`。审计阈值仅用于**宿主生成后回检**，不进 prompt。
*验收标准：* (a) 每个 key_element 有 `consistency_audit` 对象（角色类至少含 `silhouette_tol`+`hue_tol`，产品/LOGO 类含 `logo_delta`+`white_bg_rgb_min`）；(b) 阈值为数值（非形容词），脚本断言全部可解析为 number；(c) `model` 字段缺省时校验**不报错**（声明位允许空），但若填写须 ∈ 宿主已知模型枚举。

**D1-FR-06 ｜ 引擎隐身物理隔离（contract ⟂ final_prompt）**
契约的执行字段（gate/audit/dependency/retry/failure 等）与喂视频模型的 `final_prompt` 字符串**物理隔离**：`final_prompt` 是契约里的一个**叶子字符串字段**，其内容 = 已过 `output-contract.md:170` §7.6 引擎隐身自检的纯成片 prompt；执行元数据全部在 `final_prompt` **之外**的兄弟字段里。
*验收标准：* 对基线全片契约跑泄漏扫描脚本——遍历所有 `shot[].final_prompt` 字符串，断言其中**0 次**出现执行/过程词表（`gate|pause|dependency|DAG|audit|retry|degrade|escalate|failure_policy|consistency_audit|默会|Polanyi|支柱|方法论|自检|Σ镜时长`）。出现任一即判失败。

**D1-FR-07 ｜ 时间线锚与剪辑点（接拉片复刻）**
`shot` 节点携带 `timeline`（在成片时间线上的相对锚：`order` 序号 + `est_duration` 估时区间）+ `cut_to_next`（切到下一 shot 的方式，沿用 `output-contract.md:140` §4.6 枚举），供宿主 `assemble` 节点据此排时间线、保剪辑点（接地拉片复刻"换主体保剪辑点"）。**仍遵时长制：不写绝对时间码**（`output-contract.md:11`），`est_duration` 是区间估值带 `≈` 语义。
*验收标准：* (a) 每个 shot 有 `timeline.order`（连续整数无跳号）+ `est_duration`（`[min,max]` 区间，单位 s，落在 [4,15]，对齐 `seedance-2.0.md:21`）；(b) `cut_to_next` ∈ §4.6 枚举值；(c) 校验脚本断言契约里**0 处**出现绝对时间码格式（正则 `\d+:\d{2}` 或 `0–3s` 壁钟轴，对齐 `seedance-2.0.md` 五铁律第1条）。

### 4.2 非功能需求 NFR

**D1-NFR-01 ｜ 引擎隐身（最高优先级铁律）** 任何执行/审计/过程产物绝不可漏进成片，亦不可漏进 `final_prompt`。本要求由 D1-FR-06 的泄漏扫描脚本强制；CI 门：泄漏命中数必须 = 0，否则阻断。

**D1-NFR-02 ｜ 可移植性** 契约必须是**纯数据**（JSON/YAML），不绑定任何宿主的具体 API/函数名。schema 里只出现"声明"（要生成什么、依赖什么、何处停），不出现"调用"（不写 `vimax.render()` 之类）。判定：把契约文件交给一个**不是幻映**的宿主，它应能纯靠 schema 文档驱动，无需读套件源码。

**D1-NFR-03 ｜ 无损映射（信息保真）** 从镜头卡映射到契约**不丢字段**：镜头卡里的焦段/光圈/色温/光比/dBFS/asset_id/切镜方式必须能在契约里被还原（或保留在 `final_prompt` 里、或上提为结构字段）。判定：对基线全片，反向重建（契约→人读摘要）与原镜头卡逐组比对，关键参数 0 丢失。

**D1-NFR-04 ｜ 性能（解析开销）** 宿主 parse 一份契约到可调度 DAG 的耗时应 < 该片生成耗时的 1%（即解析不是瓶颈）。判定：基线全片（约 11 组）契约 parse + 拓扑排序 < 200ms（纯 JSON，无需 LLM）。

**D1-NFR-05 ｜ 成本可控（生成单元粒度）** 契约的 `shot` 粒度 = 镜头组（10–15s 生成单元），**禁止**退化成"每个镜内分切各一个 shot 节点"（会碎、贵、低于 4s 下限）。判定：对基线全片，`shot` 节点数 == 镜头组数（不是镜头数），脚本断言（复核 `seedance-2.0.md:18,55`）。

**D1-NFR-06 ｜ 与现有契约一致（不破 v2.0）** 执行契约是 `output-contract.md` v2.0 的**下游消费者**，不修改 v2.0 镜头卡格式。判定：本方向不改 `storyboard/output-contract.md` 的任何字段定义，只新增 `execution-contract.md` 与一段映射规则。

---

## 5. 设计 Design

### ① 新增 / 改动文件精确路径清单

| 操作 | 文件 | 说明 |
|---|---|---|
| **新增** | `skills/director-suite/production-bible/execution-contract.md` | 本方向核心产物：执行契约 schema 单一权威定义（schema spec + 字段表 + 映射规则 + 自检）。证据要求的新文件。 |
| **新增** | `skills/director-suite/production-bible/execution-contract.schema.json` | 配套 JSON Schema，供宿主与 CI 校验（FR-01 的 `ajv` 校验对象）。 |
| **新增** | `skills/director-suite/production-bible/examples/翡翠楼-execution-contract.json` | 用现有 `production-bible/examples/翡翠楼-全案demo.md` 跑出的契约实例，作回归基线。 |
| **改动（追加，不改既有字段）** | `skills/director-suite/storyboard/SKILL.md` | 6 步管线后追加 **Step 7「导出执行契约（可选 · 宿主驱动时启用）」**，路由到 `execution-contract.md`；明确 Step 7 产物**不是成片**。 |
| **改动（追加链接）** | `skills/director-suite/production-bible/SKILL.md` | 在全案产出尾部增加"可选导出 execution-contract"段，指向新文件。 |
| **改动（追加路由行）** | `skills/director-suite/README.md` | 三层架构表 Skin 行增加"宿主适配层 `execution-contract.md`"，与 `seedance-2.0.md`（模型适配层）并列。 |
| **改动（追加术语）** | `skills/director-suite/_shared/continuity-quality.md` | §8 暂停门 / §7 失败协议处各加一行"→ 结构化字段见 `production-bible/execution-contract.md`"的指针（散文规则↔机器字段的双向锚）。 |

> **不改动**：`output-contract.md`（v2.0 镜头卡格式不动，NFR-06）、`tacit-core.md`、`mapping-tables.md`、`dimensions.md`、`pro-params.md`、`style-refs.md`、`asset-id-convention.md`、`seedance-2.0.md`。

### ② 挂进 Soul / Bone / Skin 哪层

挂 **Skin（皮③ · 输出契约层）**，与 `seedance-2.0.md` 并列为**第二个适配层**：

- `seedance-2.0.md` = **模型适配层**（镜头卡 → 视频模型吃的 prompt）。
- `execution-contract.md` = **宿主适配层**（镜头卡/四表 → 宿主吃的执行图 JSON）。

二者正交：模型适配层管"一条 prompt 怎么写最对模型胃口"，宿主适配层管"这些 prompt/资产怎么被驱动、依赖、卡门、合成"。**不挂 Soul/Bone**——因为它不产生任何导演判断（Soul）也不新增任何视听知识（Bone），它纯粹是**把已有判断/知识序列化成机器格式**。这同时满足 N1（手留宿主）与 NFR-02（可移植：Skin 适配层可换）。

### ③ 关键 schema / 契约字段 / 算法

**顶层结构（`execution-contract.schema.json` 核心）：**

```jsonc
{
  "contract_version": "1.0",
  "final_video_spec": {            // 单一事实源，引 continuity-quality.md §1
    "title": "翡翠楼夜宴",
    "aspect_ratio": "16:9",        // 16:9 | 9:16，禁黑边禁拉伸
    "fps": 24,                     // 24(叙事) | 30(产品)
    "resolution_target": "1080p",  // 720p 生成→超分目标
    "video_model": "Seedance 2.0", // 后续不得擅自切换(continuity-quality.md:80)
    "style_core": "冷峻写实商战悬疑片"
  },

  "key_elements": [                // FR-01/05：四表 asset_id 1:1
    {
      "asset_id": "[Element_LinChen]",
      "type": "character",         // character | scene | prop | voice
      "category": "normal",        // normal | faceswap | digital_human | pov  ← 触发强制门(FR-03)
      "consistency_level": "L1",   // L1硬锚 | L2随剧情(asset-id-convention.md §2)
      "looks": [                   // 多Look显式枚举(continuity-quality.md 一、1)
        {"look_id":"[Element_LinChen]","desc":"基准·深灰衬衫"},
        {"look_id":"[Element_LinChen_Suit]","desc":"赴宴西装"}
      ],
      "ref_images": ["<<<image_1>>>head", "<<<image_2>>>fullbody"], // 双图喂脸
      "model": null,               // FR-05 声明位，可空待宿主默认
      "consistency_audit": {       // FR-05 接地电商全案量化审计
        "silhouette_tol": 0.05,    // 轮廓 ±5%
        "hue_tol": 15,             // HSL 色相 ±15°
        "logo_delta": null,        // 仅产品/LOGO类
        "white_bg_rgb_min": null   // 仅白底产品类(≥245)
      },
      "failure_policy": {          // FR-04
        "retry_within_tool": 2,
        "degrade_chain": ["Nano Banana Pro","Nano Banana 2"], // 同族降级
        "escalate": "stop_and_ask" // faceswap/digital_human 强制此值
      }
    }
  ],

  "shots": [                       // FR-01：= 镜头组(生成单元)，非镜内分切！(NFR-05)
    {
      "shot_id": "G1",
      "scene": "城市初创公司小办公室 日 内",
      "refs": ["[Element_LinChen]","[Element_WangKai]","[Element_Office_Day]","[Prop_Ashtray_01]@s2"], // 引asset_id+状态节点
      "continuity_lock": {         // 上提自镜头组头(output-contract.md §3)
        "main_light_dir": "窗外左侧冷光",
        "color_temp_K": 6000,
        "carry_over": "本组起：林辰未戴外套"   // L2变化显式声明
      },
      "frame_link": {              // 首尾帧承接(continuity-quality.md 一、3)
        "start_frame_from": "G0.final_shot", // 末帧续首帧
        "reference_video_from": null         // 默认null，仅强连续才填(门槛原则 §4)
      },
      "timeline": {"order": 1, "est_duration": [10,12]}, // FR-07 区间估时，无绝对时码
      "cut_to_next": "硬切",        // output-contract.md §4.6 枚举
      "audio_layers": ["A_G1_dialog","A_G1_sfx"], // 指向audio_layer节点
      "failure_policy": {
        "retry_within_tool": 1,
        "degrade_chain": ["Seedance 2.0","Seedance 2.0 Fast"], // 同族
        "escalate": "stop_and_ask"
      },
      "final_prompt": "开始于全景缓推…硬切到中近景…{普通话:这一次没有退路} <烟头摁灭低频> no subtitles, no music"
      //              ↑↑↑ FR-06：唯一进视频模型的字符串，已过引擎隐身自检，零执行词
    }
  ],

  "audio_layers": [                // FR-01：接地AI短剧音频分工+混音dB阶梯
    {
      "layer_id": "A_G1_dialog", "shot_id": "G1", "kind": "dialog",
      "voice_ref": "[Voice_WangKai]", "model": "ElevenLabs",
      "mix_db": 0                  // 人声基准0
    },
    {
      "layer_id": "BGM_main", "kind": "bgm", "model": "Suno5",
      "mix_db": -10               // BGM低于人声8-12dB(AI短剧经验)
    }
  ],

  "pause_gates": [                 // FR-03：散文门→机器门
    {"gate_id":"intent_spec","after":"contract_load","trigger":"always","release":"user_confirm_spec","mandatory":true},
    {"gate_id":"storyboard_review","after":"shots_drafted","trigger":"always","release":"user_approve_board","mandatory":true},
    {"gate_id":"element_render","after":"key_elements.render","trigger":"category in {faceswap,digital_human,pov} OR similarity<0.9","release":"user_confirm_likeness","mandatory":"auto"}, // category命中→true
    {"gate_id":"keyframe_confirm","after":"keyframes.render","trigger":"always","release":"user_approve_keyframe","mandatory":false},
    {"gate_id":"final_cut","after":"assemble","trigger":"always","release":"user_approve_cut","mandatory":true}
  ],

  "dependencies": [                // FR-02：执行DAG的边
    {"from":"[Element_LinChen]","to":"G1","kind":"asset_ready"},
    {"from":"G0","to":"G1","kind":"start_frame"},
    {"from":"G1","to":"assemble","kind":"clip_ready"},
    {"from":"assemble","to":"export","kind":"timeline_ready"}
  ]
}
```

**映射算法（镜头卡 → 契约，写进 `execution-contract.md`）：**

```
1. 扫四表 → 每个 asset_id 建 1 个 key_element（type 由前缀定：Element_/Prop_/Voice_）。
   - consistency_level 取表里 L1/L2；category 取表里"换脸/数字人/POV"标记，否则 normal。
2. 扫分镜每个【镜头组】→ 建 1 个 shot（NFR-05：组级，非镜级）。
   - refs[] = 该组连续性锁定里引用的全部 [Element_*]/[Prop_*]@sN。
   - final_prompt = 该组已生成的 Seedance prompt（直接搬，它已过引擎隐身自检）。
   - timeline.est_duration = 组时长区间；cut_to_next = 组尾切镜方式。
3. 扫每组台词/音效/BGM → 拆 audio_layer（dialog/sfx/bgm），dialog 绑 [Voice_*]，bgm mix_db=-10。
4. 建依赖边：∀ shot：refs 里每个 key_element → 该 shot 连 asset_ready 边；
   强连续组间(frame_link 非空) → start_frame/reference_video 边；
   ∀ shot → assemble；assemble → export。
5. 落 5 个 pause_gate；category∈{faceswap,digital_human,pov} 的 element_render 门 mandatory=true。
6. 自检：跑 §7 自检脚本（is_dag / asset 闭合 / 0 时码 / final_prompt 0 执行词 / shot数==组数）。
   ★ 自检本身只在内部跑，绝不写进契约的任何 final_prompt 或成片（引擎隐身铁律）。
```

### ④ 数据流（ASCII）

```
                        director-suite (脑)                    │        宿主 ViMax/幻映 (手)
─────────────────────────────────────────────────────────────┼──────────────────────────────────
  剧本                                                          │
   │ production-bible (四表互锁 · 已有内容生成DAG)               │
   ▼                                                            │
  角色表 + 场景表 + 道具表  ──asset_id──┐                        │
                                        ▼                       │
                                  分镜镜头卡(v2.0) + Seedance prompt│
                                        │                       │
                  ┌─────────────────────┘                       │
                  ▼  【本方向 D1：Skin·宿主适配层】               │
        execution-contract.md 映射算法                           │
                  │                                              │
                  ▼                                              │
   ┌──────────────────────────────────────┐  纯JSON契约          │   ┌────────────────────────┐
   │ key_element[] / shot[] / audio_layer[]│ ───(可移植)────────────▶ │ parse → 执行DAG          │
   │ + dependencies[] (DAG)                │                     │   │  ① render key_elements   │
   │ + pause_gates[] (强制门)              │                     │   │     └▶[gate]相似度确认    │
   │ + failure_policy / consistency_audit  │                     │   │  ② render shots(每组1clip)│
   │ + final_prompt (⟂执行字段, 已隐身)    │                     │   │  ③ assemble(时间线合成)  │
   └──────────────────────────────────────┘                     │   │     └▶[gate]成片检查      │
                                                                 │   │  ④ export                │
        ★ 执行字段绝不进 final_prompt → 绝不进成片(引擎隐身)        │   └────────────────────────┘
```

---

## 6. 验收标准 Acceptance Criteria (DoD)

> 全部对**基线全片** = `production-bible/examples/翡翠楼-全案demo.md`（已有的全案 demo）重跑，逐条可机验。

1. **契约存在且合法**：`execution-contract.md`（spec）+ `execution-contract.schema.json`（schema）+ `翡翠楼-execution-contract.json`（实例）三文件存在；实例经 `ajv validate` **0 error**。（FR-01）
2. **节点数对账**：实例里 `key_elements` 数 == demo 四表 asset_id 去重数；`shots` 数 == demo 镜头组数（**非镜头数**）；`audio_layers` 覆盖每组的对白/音效/BGM。脚本断言三个等式全 `true`。（FR-01/NFR-05）
3. **DAG 合法**：`dependencies[]` 拓扑排序 `is_dag()==true`；每个 shot 入边含其 refs 全部 key_element；`assemble` 入边==全 shot；`export` 入边=={assemble}。0 违例。（FR-02）
4. **暂停门齐全**：5 个 `gate_id` 全部存在；含 faceswap/digital_human/pov 类 key_element 时其 `element_render` 门 `mandatory==true`；每个 gate `release` 为枚举非空。（FR-03）
5. **失败策略合规**：每生成节点 `failure_policy` 非空；`degrade_chain` 全部同模型族（0 个跨族）；faceswap/digital_human 类 `escalate=="stop_and_ask"`。（FR-04）
6. **审计阈值数值化**：每 key_element `consistency_audit` 阈值全部解析为 number；角色类含 `silhouette_tol`+`hue_tol`。（FR-05）
7. **引擎隐身 0 泄漏**：泄漏扫描脚本遍历所有 `final_prompt`，执行/过程词表命中数 **== 0**；同时全片成片侧（若已出片）无任何 gate/audit 脚注。（FR-06/NFR-01 · 铁律门）
8. **时长制不破**：每 shot `timeline.est_duration ∈ [4,15]`、`order` 连续无跳号；全契约绝对时码正则命中 **== 0**。（FR-07）
9. **可移植性**：契约 JSON 内 0 处出现宿主具体 API 标识符（`vimax\.|render\(|\.exe` 等正则 0 命中）；纯数据。（NFR-02）
10. **不破 v2.0**：`git diff` 显示 `storyboard/output-contract.md` 字段定义**未改**（仅其它文件追加指针）。（NFR-06）

---

## 7. 验证方案 Verification Plan

**验证手段：**

- **(a) Schema 校验 + 结构断言脚本（主力，离线可重复）。** 写一个校验脚本 `verify_execution_contract.py`：`ajv`/`jsonschema` 校 schema → 跑 DoD 第 2/3/4/5/6/7/8/9 条的全部断言（节点对账 / `is_dag` / 门齐全 / 同族降级 / 阈值数值 / `final_prompt` 0 执行词 / 0 时码 / 0 宿主 API）。**这是回归基线**：基线契约实例 + 该脚本，任何后续改动重跑必须全绿。
- **(b) 引擎隐身泄漏扫描（铁律专项）。** 单独的 `leak_scan` 子命令，词表见 FR-06，遍历所有 `final_prompt` 与（若有）成片文本。命中即红、阻断 CI。这条**单独成门**，因为它是铁律。
- **(c) 真机出片 A-B（宿主侧，需用户在 ViMax 跑）。** 用契约驱动宿主 `plan+render+portraits` 链跑通"key_element 出图 → element_render 门停下确认相似度 → shot 出 clip → assemble → export"。A 组 = 人手动复制 prompt 的旧流程，B 组 = 契约驱动。判定 B 组在**无人工二次解析**下跑到 export，且在 `element_render` 门**确实停下**等用户确认（不是一键到底）。
- **(d) 无损映射回比对（NFR-03）。** 写 `contract→人读摘要` 反向重建，与原镜头卡逐组 diff，关键参数（焦段/色温/光比/dBFS/asset_id/切镜）0 丢失。

**测试用例 / 基线：**

- **基线 B0** = `production-bible/examples/翡翠楼-全案demo.md`（已有全案，四表+分镜齐全，是天然的端到端基线）。
- **用例 U1**（含强制门）：把 demo 里某角色标 `category:faceswap`，断言其 `element_render` 门 `mandatory` 自动翻 `true`、`escalate` 自动 `stop_and_ask`。
- **用例 U2**（粒度防退化）：故意把某镜头组的 4 个镜内分切误拆成 4 个 shot，断言脚本第 2 条**报错**（证明 NFR-05 守得住）。
- **用例 U3**（泄漏注入）：往某 `final_prompt` 里塞一句"（自检确认：Σ镜时长=12s）"，断言 `leak_scan` **命中并红**（证明铁律门有效）。

**为何这样能证明"真的有效"：**

- DoD 全是**布尔/数值断言**（无环、数量相等、命中数=0、阈值是 number），不是"质量提升了"这类空话——基线 B0 上从红到绿是可复现的客观事实。
- U2/U3 是**反向用例**（注入已知错误，断言被抓到），证明守门脚本不是只会放行的橡皮图章。
- 真机 A-B（c）证明契约**确实能被宿主无二次解析地消费**（G2/NFR-02 的最终判据），而暂停门**确实在出图后停下**（FR-03 的最终判据）——这两点是纯静态脚本证明不了的，必须真机过。

**落地可靠性理由（4/5）：**

- **加分**：套件侧零运行时（纯产文档+JSON+校验脚本），全部可离线确定性验证；宿主侧 plan+render+portraits 链**已原生存在并验证过**（MEMORY「ViMax 解耦接入 α′」记 C4.3 真机出图付费过、ledger 精确）——"手"是现成的，本方向只补"契约接口"，不造手。引擎隐身有现成自检（`output-contract.md` §7）可直接复用扩展。
- **扣 1 分**：真机 A-B（c）依赖用户亲自在 ViMax 点付费生成（grsai 计费，按铁律"付费按钮不许我点"），无法由本 agent 全自动闭环；且"宿主端 parser 是否完全对齐 schema"有一次性集成风险，需与 ViMax 侧联调一轮。

---

## 8. 依赖与顺序 Dependencies

**依赖的其它 DNN：**

- **production-bible 全案能力（已存在，前置硬依赖）**：本契约的输入是四表+分镜，必须 production-bible 先产出合法四表（`asset-id-convention.md` 闭合）。这是已实现能力，非待办 DNN，但**契约质量上限受四表质量约束**。
- **（弱依赖）C 类"无秤无回归"方向**：`consistency_audit` 的阈值若要从"宿主回检"升级成"套件自带审计工具"，需 C 类方向提供审计脚本；本方向只**声明阈值字段**，不实现审计执行（N4），故为弱依赖、不阻塞。
- **（并行可做）多模型适配方向**：本契约 `final_video_spec.video_model` / key_element `model` 为声明位，换 Kling/Veo/Sora 时需对应模型适配层（类 `seedance-2.0.md`），但契约**结构不变**，两方向解耦并行。

**依赖的宿主能力：**

- 宿主须有可驱动的 **plan + render + portraits 原生链**（幻映/ViMax 已具备，已真机验证）。
- 宿主须实现一个 **execution-contract parser**（读 JSON → 建调度 DAG → 在 pause_gate 处真正阻塞等用户确认 → 按 failure_policy 重试/降级/上报）。**这是宿主侧的一次性工程**，是本方向落地的关键外部依赖（也是扣分项来源）。
- 宿主须有 **ledger/计费门**（已存在）以承接"付费生成由用户亲点"的铁律。

---

## 9. 风险与缓解 Risks & Mitigations

| 风险 | 等级 | 缓解 |
|---|---|---|
| **引擎泄漏**：执行字段漏进 `final_prompt` 进而进成片（违铁律） | 高 | FR-06 物理隔离 + `leak_scan` 专项门 + U3 反向注入用例常驻 CI；`final_prompt` 是唯一进模型的叶子字段，结构上隔离。 |
| **shot 粒度退化成镜级**：碎、贵、低于 Seedance 4s 下限 | 中 | NFR-05 + DoD#2 等式断言 + U2 反向用例；映射算法第 2 步硬绑"组级"。 |
| **宿主 parser 不对齐 schema**：集成一次性失败 | 中 | 先交付 `schema.json` + 基线实例 + 校验脚本给宿主侧**先行联调**（契约先行），再做真机；schema 带 `contract_version` 便于演进。 |
| **可移植性被侵蚀**：有人往契约里塞宿主 API | 中 | NFR-02 + DoD#9 正则门（`vimax\.|render\(` 0 命中）；schema 不定义任何"调用"字段。 |
| **失败链静默跨工具替代**（违 §7 铁律） | 中 | FR-04 断言 `degrade_chain` 同族；跨族强制 `escalate:stop_and_ask`。 |
| **四表质量不足导致契约残缺**（asset_id 不闭合） | 中 | 复用 `asset-id-convention.md` §5 引用闭合回检作映射前置门；不闭合则映射拒绝出契约。 |
| **真机验证受计费/人工门限制，无法全自动** | 低 | 接受：A-B 真机由用户亲点（铁律）；套件侧用 (a)(b)(d) 离线门先把绝大多数缺陷拦在出片前。 |

---

## 10. 工作量与里程碑 Effort & Milestones

**粗估总量：约 2.0–2.5 人周**（套件侧文档/schema/脚本；不含宿主侧 parser 工程量，那计入宿主路线）。

| 里程碑 | 内容 | 交付物 | 估时 |
|---|---|---|---|
| **M1 · Schema 定稿** | 写 `execution-contract.md`（spec+字段表+映射算法+自检）+ `execution-contract.schema.json` | 2 个新文件，schema 自洽（ajv 能加载） | 0.7 人周 |
| **M2 · 基线实例 + 校验脚本** | 用 `翡翠楼-全案demo.md` 跑出 `翡翠楼-execution-contract.json`；写 `verify_execution_contract.py`（含 leak_scan + U1/U2/U3 用例） | 基线实例 + 校验脚本全绿 | 0.8 人周 |
| **M3 · 套件接缝接入** | `storyboard/SKILL.md` 加 Step 7、`production-bible/SKILL.md` 加导出段、`README.md` 加 Skin 行、`continuity-quality.md` 加指针 | 4 处追加 diff，不破 v2.0（DoD#10） | 0.3 人周 |
| **M4 · 宿主联调 + 真机 A-B** | 把 schema+基线交 ViMax 侧对齐 parser；用户亲点跑真机 A-B（c），验门确实停下、无二次解析 | 真机 export 成功 + element_render 门实停证据 | 0.5 人周（依赖宿主侧并联） |

> M1–M3 是套件侧自闭环（可全离线验证）；M4 跨宿主、含付费真机，是落地可靠性的最后一道（也是扣分项所在）。

---

**契约版本** Draft v0.1 ｜ 缺口类 A有脑无手 ｜ 优先级 P1 ｜ 落地可靠性 4/5 ｜ 核心新增 `production-bible/execution-contract.md`（宿主适配层，与 `seedance-2.0.md` 模型适配层并列于 Skin）
