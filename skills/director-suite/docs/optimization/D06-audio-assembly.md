# D6 · 音频层 + 时间线合成契约（Audio Layers + Assembly Contract）

> 编号 D6 ｜ 缺口类 A（有脑无手）｜ 优先级 P2 ｜ 状态 Draft v0.1 ｜ 落地可靠性自评 4/5

---

## 1. 问题陈述 Problem

**现状（引 director-suite 具体文件）：**

director-suite 当前对"声音"的覆盖**全部停在"单镜素材级"和"角色身份级"，没有任何"整片轨道级 / 合成级"的工件**：

- **角色身份级（已覆盖）**：`production-bible/character-roster.md` §4「音色锁定（Voice Lock）」把每个有台词角色锁成 `[Voice_<Name>]`（声音身份/标志性处理/voice_reference/生成绑定，L1 音域质地恒定 + L2 情绪基调随弧光），分镜「台词」`【音色】` 子参数只引 `[Voice_*]`（见 `_shared/asset-id-convention.md:16` 音色 ID 约定）。
- **单镜素材级（已覆盖）**：`storyboard/output-contract.md` §4.5「音效数字化」要求每镜写 `声源 + 频率/频段(Hz/kHz) + 时长(ms/s) + 声压级(-XX dBFS) + 调制/包络 + 声像/空间(L/R/C·近/远·干/湿)`；§4.4 台词带三参数；`_shared/mapping-tables.md` §8「情绪 × 声音/音效/配乐/台词情绪」给出 8 行情绪→配乐/音效/环境声/台词的查表。
- **后期纯净否定词（已覆盖）**：`_shared/continuity-quality.md` 三·1「后期纯净类」要求每条视频提示词末尾恒附 `no subtitles, no music, no text overlay, no watermark, no logo`，并写明"有独立旁白音轨时视频提示词里不写旁白文本，防双重音频"。

**但以下"轨道级 / 合成级"能力，director-suite 一处都没有：**

1. **没有 `audio_layers` 工件**：声音目前是"散落在每镜 §4.5 音效字段 + 角色表 §4 音色"里的碎片，**没有一个把整片声音组织成 narration / bgm / sfx 三类时间线轨道、可被合成器消费**的结构化产物。`storyboard/output-contract.md` 全文搜不到 `audio_id` / `audio_layer` / 轨道范围（time-range）概念——声音不可被装配（assembly）只能逐镜读。
2. **没有 BGM 分段 + 混音 dB 阶梯**：`mapping-tables.md` §8 只给"某情绪配什么乐器/密度"的**单格定性**（如"钢琴/弦乐 暖、低密度"），**没有**"BGM 在哪一段进/出、跨段如何 crossfade、人声之下压多少 dB、高潮抬多少 dB"的**可执行混音规则**。方向简报点名的"BGM 低人声 8–12dB / 高潮 +3–5dB / crossfade 0.5s"这套**混音 dB 阶梯**在套件里完全缺失。
3. **没有"视频内嵌轨静音规则"的强制工件**：`continuity-quality.md` 写了 `no music`、"旁白不写进视频 prompt"等**散落原则**，但**没有一个集中契约规定**"视频生成层产出的内嵌音轨（模型自带 BGM/环境声/口型音）哪些必须静音、哪些保留、如何在合成时与独立 narration/bgm/sfx 轨叠加不打架"。这正是 mute 规则——目前只能靠 agent 临场记忆零散原则，无强制门。
4. **没有"首尾帧链 / 180° 插过渡镜"在装配层的收口**：`continuity-quality.md` 三·3 有"首尾帧承接"方案表、五·1 有"180° 轴线规则 / 必须跳轴时插过渡镜"——但这些是**写在"连续性锁定"知识里给单镜用的**，**没有被提到"整片时间线合成"这一层**统一收口为"装配前必过的链式校验"。

**痛点（为何是问题）：**

- **声音不可装配 = 下游做不出成片**：源生态（AI 短剧 `video_assembler`、Flova `video_assembler` 段）证明流水线最后一环是"把分段视频 + 多条音轨合成导出"。director-suite 产出的镜头卡**喂得动视频模型，却喂不动合成器**——因为没有"哪条音轨、从第几秒到第几秒、压多少 dB、怎么淡入淡出"的轨道清单。团队拿到一堆"每镜音效描述"后，**只能人肉重新拼一份混音表**，套件的"声音专业知识"无法落到可执行的合成施工单。
- **混音靠手感 = 不可复现、抢戏**：没有 dB 阶梯，"BGM 压不压人声、高潮抬不抬"全凭混音师临场，跨片不一致；`mapping-tables.md` §8 已立"声音留白"原则却无量化阶梯支撑，原则落不了地。
- **内嵌轨双重音频 = 穿帮高发**：视频模型常自带 BGM/环境声，若不强制静音并与独立轨对齐，成片会出现"两层 BGM 打架 / 旁白与模型口型音重叠"——这是 AI 短剧合成阶段最常见的废片原因，套件目前无门拦截。
- **缺口类落在 A（有脑无手）**：套件**有声音的"脑"**（音色锁定、§4.5 音效数字化、§8 情绪声音表——知道"该是什么声音"），但**没有声音的"手"**（轨道工件 + 混音阶梯 + mute 规则 + 装配链校验——把声音组织成可合成、可导出的时间线）。不是没知识，是知识无法被装配执行。

---

## 2. 证据与接地 Evidence

**哪些源 skill 有此能力（点名）：**

- **AI 短剧 skill（方向简报直接证据）**：明确带"**混音 dB 阶梯（BGM 低人声 8–12dB）**" + "**音频模型分工 Suno5 / ElevenLabs / 豆包**" + "失败-修复对照表"。这是本方向"混音 dB 阶梯 + 音频模型分工"的母证据——证明轨道级混音规则是行业标配。
- **AI 短剧 / 拉片复刻的 `video_assembler` 段（方向简报直接证据）**：流水线跑到"**时间线合成导出**"，把分段视频 + narration/bgm/sfx 多轨合成。证明"分镜→镜头卡"之后必须有一层"音频层 + 时间线装配"，本套件正缺这一层。
- **Flova 平台流水线**（`planner→multimodal_analyze→storyboard_designer→media_generator→video_assembler`，带依赖 DAG + 强制暂停门）：`video_assembler` 是流水线**终点节点**，输入含多条音频轨。证明音频装配是流水线标准末环。
- **拉片复刻"参考视频→镜头拆解 00:00–15s→换主体保剪辑点"**：证明源生态把"时间线 / 剪辑点 / 段落范围"做成可视的时间线结构，而非只留每镜文字——支撑本方向的 time-range（轨道时间范围）结构。

**director-suite 盲点落在哪个文件/成员：**

- **盲点根源（无工件）**：`storyboard/output-contract.md` 只有**镜内 §4.5 音效字段**（散在每镜），无整片轨道工件；`_shared/` 八件共享知识里**无 `assembly.md`**（无装配层契约）。声音知识有三处（角色表 §4 / 分镜 §4.5 / mapping §8）却**无一处把它们汇成一条可消费的时间线**。
- **盲点表现（无混音阶梯 / 无 mute 规则 / 无装配链）**：
  - `mapping-tables.md` §8 = 定性查表，**无 dB 阶梯数值**（无 8–12dB / +3–5dB / 0.5s）。
  - `continuity-quality.md` 三·1 = 散落 `no music` 原则，**无集中的"视频内嵌轨静音规则"契约**。
  - `continuity-quality.md` 三·3「首尾帧承接」+ 五·1「180° 插过渡镜」= 写在单镜连续性里，**未在"时间线合成"层统一收口为装配前必过链**。
- **结论**：需**新增一件 `_shared/` 共享契约 `assembly.md`（Bone 层）** + **扩 storyboard 契约新增 `audio_layer` 段（Skin 层只读消费角色表音色 / §4.5 音效，回写轨道工件）**，把散落声音知识装配成一条"narration/bgm/sfx 三轨 + dB 阶梯 + mute 规则 + 首尾帧/180° 装配链"的可合成时间线。

---

## 3. 目标与非目标 Goals / Non-Goals

**Goals：**

- G1：新增 **`_shared/assembly.md`**（Bone 层装配契约），把"音频层 + 时间线合成"立成套件的**装配级单一事实源**：定义 narration/bgm/sfx 三类轨道 schema、混音 dB 阶梯（BGM 低人声 8–12dB / 高潮 +3–5dB / crossfade 0.5s）、视频内嵌轨静音（mute）规则、首尾帧链 + 180° 插过渡镜的装配前链式校验。
- G2：**扩 `storyboard/output-contract.md` 新增 `audio_layer` 段**——产出一份**整片 `audio_layers` 工件**（每条轨 `audio_id` / 类型 narration|bgm|sfx / 范围 range(组号或镜号区间) / 源绑定 / 混音参数），**派生**于已有的角色表 `[Voice_*]`、分镜 §4.5 音效、§8 情绪声音表，不引入新创作自由度。
- G3：混音参数**全部量化**（dBFS 数值 + crossfade 秒 + mute 布尔），使工件可直接驱动合成器 / `video_assembler`，并可被审计脚本逐项断言。
- G4：把套件**已存在但散落**的 `no music` / 旁白不双写 / 首尾帧承接 / 180° 过渡，在装配层**收口成一组可重跑的装配门**（assembly gate），与既有 §7 自检门并行。

**Non-Goals（明确边界）：**

- NG1（**不破引擎隐身**）：`audio_layers` 工件与装配门是**过程 / 施工单产物**，类同审计/自检——**轨道范围标注、dB 数值、mute 表、装配链校验结果绝不可漏进成片**（不写进 Seedance 成片提示词、不渲染为画面文字/字幕）。引擎隐身铁律（`storyboard/output-contract.md` §7.6/§7.8）在此扩展为"**装配层不可漏进成片层**"。
- NG2（**不破可移植性**）：装配契约只产出**合成器无关**的轨道清单 + 混音参数 + mute 规则，**不绑定**任何宿主 App / 具体合成软件（剪映/PR/FFmpeg/MediaKit）；音频模型分工（Suno/ElevenLabs/豆包）只作**可替换的推荐档**写在一行模型标记，换模型仅改该行。成员形态保持纯 Markdown 契约，**不引入需安装的运行时依赖**（不写 Python/FFmpeg 脚本作为强依赖）。
- NG3：不替代单镜 §4.5 音效字段（那是素材源，本方向**只读消费并汇轨**）、不替代角色表 §4 音色锁定（音色身份事实源仍在角色表）；不做"真机出声 / 真混音渲染"（那是宿主合成步，本方向只产施工单）。
- NG4：不改 storyboard 既有字段语义（§4.5 音效 / §4.4 台词 / 角色表 §4 音色 **只读引用**，新增 `audio_layer` 段为追加，不回写改写既有字段）。
- NG5：不做"自动听音反推轨道"（那是拉片/反向方向另案）；不引入新的视频模型适配（仍以 Seedance 为目标，仅在装配层声明内嵌轨 mute）。

---

## 4. 需求 Requirements

### 4.1 功能需求 FR

**D6-FR-01 `audio_layers` 三轨工件（narration / bgm / sfx · 时间线轨道清单）**
- 描述：在 `storyboard/output-contract.md` 新增 `audio_layer` 段，产出**一份整片 `audio_layers` 工件**：由若干条 `audio_layer` 组成，每条含固定字段 `{audio_id, type∈{narration,bgm,sfx}, range, source_ref, mix}`。`audio_id` 遵新增前缀 `[Audio_<Type>_<NN>]`（与 `_shared/asset-id-convention.md` §1 同构追加）；`range` 用**组号或镜号区间**表达（与 storyboard 时长制一致，**不写绝对时间码**，如 `range: G3–G5` 或 `range: 镜2-1～2-4`）；`narration` 轨 `source_ref` 引 `[Voice_*]`（复用角色表音色，不重述）；`sfx` 轨 `source_ref` 引对应镜的 §4.5 音效条目（汇轨，不重写参数）；`bgm` 轨 `source_ref` 写 §8 情绪→配乐档 + 音频模型档（Suno5/豆包，可替换）。
- 可量化验收：①工件中每条 `audio_layer` 五字段齐全（缺一即 schema 不合格，脚本断言）；②`type` 仅取 {narration,bgm,sfx} 三值，越界数 = 0；③每条 narration 轨的 `source_ref` 必命中角色表已注册 `[Voice_*]`（未命中 = 0）；④每条 `range` 的组号/镜号必落在该片 storyboard 实际存在的组/镜区间内（越界 = 0）；⑤对 `storyboard/examples/fewshot-翡翠楼夜宴-v2全片.md` 全片生成 `audio_layers`，narration 轨条数 ≥ 有台词角色数、sfx 轨覆盖所有写了 §4.5 音效的镜（漏轨 = 0）。

**D6-FR-02 混音 dB 阶梯（BGM 压人声 / 高潮抬升 / crossfade · 量化混音规则）**
- 描述：在 `_shared/assembly.md` 定义一张**固定混音 dB 阶梯表**，并令 `audio_layers` 工件每条轨的 `mix` 字段按表取值。基准锚点（方向简报指定，写死为契约默认）：**对话场景 BGM 电平 = 人声电平 − 8～12 dB（默认 −10 dB）**；**高潮段 BGM 抬升 +3～5 dB（相对其对话基准）**；**BGM 段间 / BGM↔静默 crossfade = 0.5s**；narration（旁白）轨默认 −0 dB 作人声基准（0 dBFS 参考线由片定，旁白与对话同档）；sfx 关键音效允许瞬态峰值高于人声但**均方电平不抢人声**。`mix` 字段固定结构：`mix: {base_dbfs, duck_under_voice_db, climax_boost_db, crossfade_s, sidechain}`。
- 可量化验收：①阶梯表三个核心数值与简报逐字一致（人声下压 ∈[8,12]、高潮抬升 ∈[3,5]、crossfade = 0.5s），脚本断言区间命中；②工件中每条 `bgm` 轨 `mix.duck_under_voice_db` ∈ [8,12]（越界 = 0）；③标记为高潮（情绪强度 ≥4 的组所覆盖的 bgm 段）`mix.climax_boost_db` ∈ [3,5]（漏标或越界 = 0）；④所有 bgm 段相邻边界 `crossfade_s` == 0.5（容差 0；除显式标注硬切 `crossfade_s: 0` 并写动机）；⑤存在"对话段 BGM 自动 ducking"声明（`sidechain: voice` 或等价），缺失数 = 0。

**D6-FR-03 视频内嵌轨静音规则（mute · 防双重音频）**
- 描述：在 `_shared/assembly.md` 立一节**"视频内嵌轨静音规则"**并令工件落地：视频模型生成的 clip **自带内嵌音轨**（模型脑补的 BGM / 环境声 / 口型音），装配时按规则处理——**默认 mute 模型内嵌 BGM 与内嵌旁白**（防与独立 narration/bgm 轨双重音频），**保留**模型内嵌的口型同步音（lip-sync 关联音，若独立 narration 不覆盖该镜）与**可选保留**模型内嵌环境声（当独立 sfx 轨未覆盖该镜且模型环境声质量达标）。每个镜头组在工件里给一条 `embedded_track_policy: {mute_bgm:true, mute_narration:true, keep_lipsync:<bool>, keep_ambient:<bool>}`，并与 `continuity-quality.md` 三·1「视频提示词末尾恒附 `no music`」**双重保险**（提示词层抑制生成 + 装配层 mute 兜底）。
- 可量化验收：①工件每个镜头组恰有一条 `embedded_track_policy`（缺失 = 0）；②`mute_bgm` 与 `mute_narration` 默认 = true，置 false 必须同行写动机（无动机的 false = 不合格）；③`keep_lipsync` 为 true 的镜，其独立 narration 轨**不得**同时覆盖同一镜（冲突 = 0，防口型音与旁白重叠）；④对应镜的 Seedance 成片提示词仍含 `no music`（与提示词层一致性核验，缺失 = 0）。

**D6-FR-04 装配前链式校验（首尾帧链 + 180° 插过渡镜 + 时间线闭合 · assembly gate）**
- 描述：在 `_shared/assembly.md` 立一组**"装配前必过链"**，把套件已存在的散落原则收口为可重跑装配门：(a) **首尾帧链**——相邻镜头组承接处，上组末帧 == 下组首帧锚点（复用 `continuity-quality.md` 三·3 方案表），避开淡出黑帧；(b) **180° 轴线链**——跨镜跨组不跳轴，**必须跳轴处显式登记一条过渡镜**（复用五·1）；(c) **音画时间线闭合**——每条 `audio_layer` 的 `range` 必被 storyboard 实际镜头组时长覆盖，narration 轨总时长 ≈ 其覆盖镜组 Σ时长（容差 ±1s，复用 storyboard §5 时长闭合口径），无悬空轨（range 指向不存在的组）。校验结果产出为**内部装配报告**（绝不进成片，NFR-01）。
- 可量化验收：①首尾帧链：相邻组承接断点（上组末帧锚点 ≠ 下组首帧锚点且未声明动因）数 = 0；②180° 链：检出跳轴处 100% 有对应"过渡镜"登记，漏登记 = 0；③时间线闭合：悬空轨（range 越界）= 0；narration 轨时长偏差 ≤ ±1s；④装配报告本身**零泄漏**进任何成片提示词（grep `audio_id|range|dBFS|mute|装配|过渡镜登记` 在 Seedance 成片提示词命中 = 0）。

### 4.2 非功能需求 NFR

**D6-NFR-01 引擎隐身 + 装配层不漏进成片（铁律）**
- `audio_layers` 工件、混音 dB 阶梯、mute 表、装配链校验报告**全部是过程/施工单产物**，**绝不可**写进 Seedance 成片提示词、**绝不可**渲染为画面文字/字幕；同时引擎术语（Polanyi/默会/格式塔/支柱编号/方法论）仍零出现。验收：对成片提示词 grep `audio_id|\[Audio_|range:|dBFS|duck_under|crossfade|mute_bgm|embedded_track|装配报告|过渡镜登记` 命中 = 0；grep 引擎术语命中 = 0。**唯一允许进成片提示词的声音内容**仍是既有 §4.4 台词 / §4.5 音效的创作语言（如 Seedance 的 `{语言:台词}`/`<音效>`/`(BGM)` 标记），轨道级元数据一律留在工件。

**D6-NFR-02 可移植性（合成器无关 / 音频模型可替换）**
- 装配契约 = 纯 Markdown，零运行时依赖、零宿主绑定；轨道清单不出现具体合成软件 API 或 `127.0.0.1:8777` 宿主痕迹；音频模型分工（旁白·对话 zh→豆包/en→ElevenLabs、BGM→Suno5）只作**推荐档**写在一行 `audio_model_profile`，换模型仅改该行。验收：`_shared/assembly.md` 与 `storyboard/output-contract.md` 新增段内无 `.py/.js/.exe` 强依赖、无宿主 App 痕迹；音频模型只在 `audio_model_profile` 行出现且标注"可替换"。

**D6-NFR-03 派生一致性（工件 == 已锁声音事实）**
- `audio_layers` 工件必须 100% 可回溯：narration 轨回溯角色表 `[Voice_*]`、sfx 轨回溯分镜 §4.5、bgm 档回溯 §8 情绪声音表；**禁止"为合成好看"新增镜头卡/角色表里没有的声音**。验收：抽样 ≥3 条轨，逐项核对源绑定（`[Voice_*]` 存在 / §4.5 镜号存在 / §8 情绪档存在），差异项 = 0；工件未引入任何上游未登记的新音源。

**D6-NFR-04 性能 / 成本**
- `audio_layers` 工件 + 装配报告为**纯文本派生**，应在一次模型回合内完成，**0 次真机出声调用**；真机混音/合成为**可选末步**（由宿主合成器执行，付费/慢步由用户亲点），且**整片一次合成**，不逐镜出声。验收：工件产出 0 次真机调用即可完成；若触发真机，合成调用次数 == 1（整片），非逐镜。

**D6-NFR-05 一致性（混音留白原则不被违反）**
- dB 阶梯须服从 `mapping-tables.md` §8 已立的"声音留白"原则：恐怖/爆发戏**允许 bgm 段标 `mute`（静默即最强音）**，悲伤戏 bgm 密度低 + 不抢戏。验收：工件允许 `type:bgm` 段取 `mix.base_dbfs: mute`（静默段）且对恐怖/爆发/悲伤情绪组**不强制铺满 bgm**（这些组若标 bgm 必须 base 电平 ≤ 对话基准且密度低，违反 §8 ❗禁止条 = 不合格）。

---

## 5. 设计 Design

### 5.1 新增 / 改动文件精确路径清单

**新增（2 个）：**
```
skills/director-suite/_shared/assembly.md                         # 装配契约：三轨schema+dB阶梯+mute规则+装配链（Bone）
skills/director-suite/docs/optimization/D06-audio-assembly.md     # 本 PRD（已落盘）
```

**改动（4 个，均为追加 / 注册，不改既有语义）：**
```
skills/director-suite/storyboard/output-contract.md
  - 新增 §8「audio_layer 段 / audio_layers 工件」：三轨 schema + range(组/镜号) + source_ref + mix 字段
  - §7 自检门追加一条「装配自检（引 _shared/assembly.md 装配门）」
  - 附样例追加一段全片 audio_layers 工件（校验基准，与现有镜头组样例对应）
skills/director-suite/_shared/asset-id-convention.md
  - §1 命名表追加一行：音频轨 Audio `[Audio_<Type>_<NN>]`（narration/bgm/sfx 三型，与 [Voice_*] 协同）
  - §3 参考绑定追加：audio_layer 的 source_ref 引 [Voice_*]/§4.5镜号/§8情绪档 写法
skills/director-suite/_shared/mapping-tables.md
  - §8 表后追加交叉引用注脚：「→ 轨道化 / dB 阶梯 / 合成见 _shared/assembly.md」（只加指针，不改表）
skills/director-suite/README.md
  - 「_shared/ 家族共享知识」目录树新增 assembly.md 节点（8件→9件）
  - 「关键设定」处补一行：音频装配契约见 _shared/assembly.md
```

**只读消费、不改：** `production-bible/character-roster.md` §4（音色身份事实源）、`continuity-quality.md` 三·1/三·3/五·1（mute 原则 / 首尾帧 / 180° 知识源）。

### 5.2 挂进 Soul / Bone / Skin 哪层

- **Bone（骨 · 主要落点）**：`_shared/assembly.md` = 新的**装配级查表 / 规则数据**（三轨 schema、dB 阶梯表、mute 规则、装配链定义），与 `mapping-tables.md`/`continuity-quality.md` 同级，被所有成员共享引用。这是套件第 9 件共享知识。
- **Skin（皮 · 一处契约增量）**：`storyboard/output-contract.md` 新增的 `audio_layer` 段 = 成员产物契约的追加产物（整片 `audio_layers` 工件），**只读** Bone 层的 dB 阶梯 / 三轨 schema、**只读**角色表 `[Voice_*]` 与分镜 §4.5 音效，**派生汇轨**，自身不新增声音创作自由度。
- **Soul（灵魂 · 零改动）**：不触碰 `tacit-core.md`；引擎隐身铁律被装配契约**继承并扩展**为"装配层不漏成片"。混音留白的"感觉"判断仍由既有 §8 / 默会内核给出，本方向只把它**量化落地为 dB**。

### 5.3 关键 schema / 契约字段 / 算法

**(A) 音频轨 ID 前缀（追加进 `asset-id-convention.md` §1）**

| 类型 | 格式 | 例 | 定义于 |
|---|---|---|---|
| 音频轨 Audio | `[Audio_<Type>_<NN>]`（Type∈Narration/Bgm/Sfx，两位序号） | `[Audio_Bgm_01]`、`[Audio_Narration_01]`、`[Audio_Sfx_03]` | assembly.md / storyboard §8 |

> 与 `[Voice_<Name>]` 协同：`[Voice_*]` 是**音色身份**（谁的嗓子，角色表锁），`[Audio_Narration_NN]` 是**一条旁白/对话轨实例**（这条轨 source_ref 引哪个 `[Voice_*]` + 覆盖哪段 range）。一个 `[Voice_*]` 可被多条 `[Audio_Narration_*]` 轨复用。

**(B) `audio_layer` 单轨 schema（FR-01，写入 storyboard §8）**
```
[Audio_<Type>_<NN>]
  type:        narration | bgm | sfx          # 三选一（FR-01②）
  range:       G3–G5  或  镜2-1～2-4           # 组号/镜号区间，不写绝对时间码（FR-01④）
  source_ref:  narration→[Voice_LinChen]       # 复用角色表音色，不重述
               sfx→§4.5@镜2-2(烟头摁灭)         # 汇分镜音效，不重写参数
               bgm→§8情绪档(悬疑:低频drone) + audio_model_profile.bgm
  mix:
    base_dbfs:           -10   | 0(人声基准) | mute(留白段)   # FR-02/NFR-05
    duck_under_voice_db: 10    （bgm 对话段压人声 ∈[8,12]）   # FR-02①②
    climax_boost_db:     4     （高潮段抬升 ∈[3,5]，非高潮=0）# FR-02③
    crossfade_s:         0.5   （段间/进出，硬切=0+动机）     # FR-02④
    sidechain:           voice （对话段自动 ducking）          # FR-02⑤
  embedded_track_policy（镜头组级，FR-03）:
    { mute_bgm:true, mute_narration:true, keep_lipsync:<bool>, keep_ambient:<bool> }
```

**(C) 混音 dB 阶梯表（FR-02，写入 assembly.md · 写死为契约默认）**

| 场景 / 段落类型 | narration/对话(人声) | bgm 电平 | sfx 关键音效 | crossfade |
|---|---|---|---|---|
| 对话段（默认） | 0 dB（人声基准线） | **人声 − 10 dB**（范围 −8～−12，sidechain=voice 自动 ducking） | 瞬态峰值可高，均方不抢人声 | 进出 0.5s |
| 高潮 / 爆发段（情绪≥4） | 随戏（嘶吼或骤静） | **对话基准 + 4 dB**（范围 +3～+5） | 冲击 sub-bass 允许峰值 | 0.5s |
| 留白 / 恐怖静默段（§8） | 可近无声 | **mute（静默即最强音）** | 单点 stinger 可破静默 | 进出 0.5s |
| 悲伤 / 极简段（§8） | 颤、慢、几近无声 | 低密度、电平 ≤ 对话基准、不抢戏 | 长尾混响 | 0.5s |

> 三个核心数值（人声下压 8–12dB / 高潮 +3–5dB / crossfade 0.5s）来自 AI 短剧混音 dB 阶梯，**写死为契约默认**，可被显式标注覆盖（覆盖须写动机）。

**(D) 视频内嵌轨静音规则（FR-03，写入 assembly.md）**
```
默认（每镜头组一条 embedded_track_policy）：
  mute_bgm        = true   # 模型脑补 BGM 一律静音（独立 bgm 轨接管）
  mute_narration  = true   # 模型脑补旁白/对话一律静音（独立 narration 轨接管）
  keep_lipsync    = 视情   # 若独立 narration 未覆盖该镜且模型口型音质量达标→保留
  keep_ambient    = 视情   # 若独立 sfx 未覆盖该镜且模型环境声达标→保留
双重保险：提示词层 continuity-quality 三·1 末尾 `no music`（抑制生成）
        + 装配层 mute（兜底，防漏生的内嵌轨）
冲突门：keep_lipsync=true 的镜，独立 narration 轨 range 不得覆盖同一镜（FR-03③）
```

**(E) 派生 + 装配算法（伪代码，强调"只读派生 + 装配门"）**
```
# ① 汇轨（只读派生，不创作）
audio_layers = []
for ch in roster.voiced_characters:          # narration 轨
    rng = storyboard.shots_with_dialogue(ch) # 该角色台词覆盖的镜区间
    audio_layers.append(AudioLayer(id=newid("Narration"), type="narration",
                                   range=rng, source_ref=ch.voice_id, mix=voice_base()))
for shot in storyboard.shots:                 # sfx 轨
    if shot.音效:                             # 引 §4.5，不重写参数
        audio_layers.append(AudioLayer(id=newid("Sfx"), type="sfx",
                                       range=shot.no, source_ref=f"§4.5@{shot.no}", mix=sfx_mix()))
for seg in bgm_segments(storyboard.emotion_arc):   # bgm 分段（按情绪弧切段）
    m = mapping8[seg.emotion]                  # 引 §8 情绪→配乐档
    audio_layers.append(AudioLayer(id=newid("Bgm"), type="bgm", range=seg.range,
                                   source_ref=f"§8:{m} + {profile.bgm}", mix=bgm_mix(seg)))

# ② 套混音阶梯（FR-02）
def bgm_mix(seg):
    duck = 10                                  # ∈[8,12]
    boost = 4 if seg.emotion >= 4 else 0       # 高潮 ∈[3,5]
    base  = "mute" if seg.emotion in {恐怖,爆发留白} else f"对话基准-{duck}"   # NFR-05 留白
    return Mix(base, duck_under_voice_db=duck, climax_boost_db=boost,
               crossfade_s=0.5, sidechain="voice")

# ③ 内嵌轨 mute（FR-03）
for g in storyboard.shot_groups:
    g.embedded_track_policy = {mute_bgm:True, mute_narration:True,
                              keep_lipsync: not narration_covers(g), keep_ambient: not sfx_covers(g)}
    assert not (g.keep_lipsync and narration_covers(g))    # FR-03③ 冲突门

# ④ 装配前链式校验（FR-04，产内部报告，绝不进成片）
assert no_endframe_break(groups)               # 首尾帧链（三·3）
assert all_axisjump_has_transition(shots)      # 180° 链（五·1）
for L in audio_layers:                          # 时间线闭合
    assert range_within_storyboard(L.range)     # 无悬空轨
    if L.type=="narration":
        assert abs(L.duration - covered_groups_sum(L.range)) <= 1   # ±1s（§5 口径）
emit_internal_assembly_report(...)              # NFR-01：不进成片
```

### 5.4 数据流（ASCII）

```
角色表§4 [Voice_*]      分镜§4.5 音效(每镜)      mapping§8 情绪→配乐      continuity 三·1/三·3/五·1
   (音色身份)              (sfx 素材)              (bgm 定性档)            (no music/首尾帧/180°)
        │                     │                       │                        │
        └──────────┬──────────┴───────────┬───────────┘                        │(规则源)
                   ▼ (只读派生·汇轨)        ▼                                   ▼
   ┌──────────────── storyboard §8 audio_layer 段 (Skin) ────────┐   ┌─ _shared/assembly.md (Bone) ─┐
   │  narration 轨   bgm 轨   sfx 轨  →  整片 audio_layers 工件   │←──│ 三轨schema · dB阶梯表        │
   │       │                                                     │   │ mute规则 · 装配前链式校验    │
   │       ▼ (套 dB 阶梯 + mute 规则)                              │   └──────────────────────────────┘
   │  每轨 mix{base/duck10/boost4/cf0.5/sidechain} + 组级 policy  │
   └───────┬─────────────────────────────────────────┬──────────┘
           │                                          │
           ▼ (装配前链式校验·产内部报告)               ✗ 引擎隐身闸 (NFR-01)
   宿主合成器 / video_assembler 一次合成导出   ┄┄ 工件/dB/mute/报告 绝不写进 ┄┄►  Seedance 成片提示词
   (narration/bgm/sfx 三轨叠加 · 内嵌轨已mute)         (装配层 ≠ 成片层)
```

---

## 6. 验收标准 Acceptance Criteria (DoD)

- DoD-1（FR-01）：`storyboard/output-contract.md` §8 含 `audio_layer` schema；对 `storyboard/examples/fewshot-翡翠楼夜宴-v2全片.md` 生成全片 `audio_layers` 工件，逐条五字段齐全；type 越界 = 0；每条 narration `source_ref` 命中角色表 `[Voice_*]`（未命中 = 0）；每条 range 落在实际组/镜区间（越界 = 0）；sfx 轨覆盖所有写了 §4.5 音效的镜（漏轨 = 0）。
- DoD-2（FR-02）：`_shared/assembly.md` 含混音 dB 阶梯表，三核心数值逐字命中（下压 ∈[8,12]、高潮 ∈[3,5]、crossfade = 0.5）；工件每条 bgm 轨 `duck_under_voice_db` ∈[8,12]；情绪≥4 组覆盖的 bgm 段 `climax_boost_db` ∈[3,5]；相邻 bgm 边界 `crossfade_s` == 0.5（硬切例外须写动机）；存在 `sidechain: voice` 声明。
- DoD-3（FR-03）：工件每个镜头组恰一条 `embedded_track_policy`；`mute_bgm`/`mute_narration` 默认 true，置 false 必带动机；`keep_lipsync=true` 镜与独立 narration 轨无 range 冲突（= 0）；对应镜 Seedance 成片提示词仍含 `no music`。
- DoD-4（FR-04）：装配前链式校验三链全过——首尾帧承接断点 = 0；跳轴处 100% 有过渡镜登记；悬空轨 = 0；narration 轨时长偏差 ≤ ±1s；装配报告产为**内部**产物。
- DoD-5（NFR-01 铁律）：对全片 Seedance 成片提示词 grep `audio_id|\[Audio_|range:|dBFS|duck_under|crossfade|mute_bgm|embedded_track|装配报告|过渡镜登记`，命中 **= 0**；grep 引擎术语（Polanyi/默会/支柱/方法论/格式塔），命中 **= 0**。
- DoD-6（NFR-02）：`assembly.md` 与 storyboard §8 新增段无运行时强依赖文件、无宿主 App 痕迹；音频模型仅在 `audio_model_profile` 行出现且标"可替换"。
- DoD-7（NFR-03 派生一致性）：抽 ≥3 条轨逐项核对源绑定（`[Voice_*]`/§4.5 镜号/§8 情绪档存在），差异 = 0；无上游未登记新音源。
- DoD-8（NFR-05 留白）：恐怖/爆发/悲伤情绪组的 bgm 段允许 `mute` 或低密度 ≤ 对话基准，未出现"配乐填满每一秒"违反 §8 ❗禁止条（违反 = 0）。
- DoD-9（注册落地）：`asset-id-convention.md` §1 已加 `[Audio_*]` 行；`mapping-tables.md` §8 已加交叉引用；`README.md` 目录树 `_shared` 已含 `assembly.md`（9 件）。
- DoD-10（合成核验，真机可选）：取该片 1 次**整片**合成（由用户亲点付费步），人评核验"对话段 BGM 被压下约 10dB、高潮抬升、段间 0.5s crossfade、无双重音频"四项与工件一致（≥3 名评审一致通过）。

---

## 7. 验证方案 Verification Plan

**验证手段：**

1. **审计脚本（结构闸，自动 · 冷启动可重跑）**：`verify_audio_assembly.py`（或等价 PowerShell/node）——解析 `audio_layers` 工件，断言：FR-01 五字段齐全 + type 三值 + `[Voice_*]`/range 命中、FR-02 dB 阶梯区间（duck∈[8,12]/boost∈[3,5]/cf==0.5）、FR-03 每组一条 policy + mute 默认 true + keep_lipsync 无冲突、FR-04 三链（首尾帧/180°/时间线闭合）、NFR-01 成片提示词零泄漏。这是**可重跑回归门**。
2. **回归 diff（基线）**：以 `storyboard/examples/fewshot-翡翠楼夜宴-v2全片.md` 全片为**固定基线**——它已含林辰/赵山河/王凯三条 `[Voice_*]`、逐镜 §4.5 音效、跨组情绪弧。对其跑汇轨算法，输出"轨道命中表"（narration ≥3 轨 / sfx 覆盖所有音效镜 / bgm 按情绪弧分段）。基线断言：漏轨 = 0、悬空轨 = 0、dB 阶梯区间全命中。改契约后重跑 diff，无新增漏/越界即通过。
3. **真机合成 A/B（合成核验）**：取该片做**整片**合成（付费步，由用户亲点），人评 A/B：A = 仅按散落 §4.5 音效手拼、B = 按 `audio_layers` 工件 + dB 阶梯合成，量"对话清晰度（人声不被 BGM 糊）+ 无双重音频 + 段间过渡平滑"评分，B 应显著高于 A。
4. **引擎隐身 + 内嵌轨专项 grep（铁律闸）**：对全片 Seedance 成片提示词跑 NFR-01 grep（轨道元数据 / dB / mute / 装配报告 / 引擎术语命中必须为 0），并核验每镜成片提示词仍含 `no music`（提示词层 + 装配层 mute 双保险一致）。
5. **反例闸（验证闸是真闸）**：故意把"`[Audio_Bgm_01] duck:-10dBFS`"塞进一条 Seedance 成片提示词 → NFR-01 grep 必须报泄漏；故意给一条 bgm 轨标 `duck_under_voice_db: 6`（越界）→ FR-02 断言必须报不合格；故意给 keep_lipsync=true 的镜叠 narration 轨 → FR-03 冲突门必须报。

**测试用例 / 基线：**
- 基线：`fewshot-翡翠楼夜宴-v2全片.md`（已存在全片，三 `[Voice_*]` + 全镜 §4.5 + 跨组情绪弧，含对话段与情绪起伏，天然覆盖 narration/sfx/bgm 三型）。
- 用例 T1：纯对话组 → narration 轨 base=人声基准、bgm duck=−10dB、sidechain=voice。
- 用例 T2：情绪≥4 高潮组 → 该组 bgm 段 climax_boost ∈[3,5]，段界 crossfade=0.5。
- 用例 T3：恐怖/爆发留白段 → bgm 段允许 `mute`，未铺满（NFR-05）。
- 用例 T4：相邻组承接 → 首尾帧链断点 = 0；含跳轴的组 → 过渡镜登记齐全。
- 反例 T5：轨道元数据塞进成片提示词 / duck 越界 / lipsync+narration 冲突 → 三道闸各自报错。

**为何这样能证明"真的有效"：**
- 结构闸（脚本）+ 基线 diff 把"工件忠实派生、三轨齐全、dB 阶梯合规、装配链闭合、不泄漏成片"全部落成**可量化、可重跑的硬断言**，非主观"音质提升"——每条都是数值阈值 / 存在性 / 命中数 = 0。
- A/B 合成核验把"音频装配确有增益"落到可测指标（人声清晰度 / 无双重音频 / 过渡平滑评分），证明工件对最终合成有实际价值，而非纸面。
- 反例 T5 证明三道闸（隐身 grep / dB 区间 / lipsync 冲突）是**真闸**能拦截，而非摆设。

**落地可靠性理由（4/5）：**
- 上调因素：①数据源全部已结构化已就绪（角色表 `[Voice_*]` / 分镜 §4.5 / mapping §8 / continuity 三·1·三·3·五·1），本方向是**汇轨 + 量化**，不造新创作维度，风险低；②`fewshot-翡翠楼夜宴-v2全片.md` 是天然现成基线（三音色 + 全镜音效 + 情绪弧），审计可立即跑；③成员纯 Markdown、零依赖、合成器无关、可移植；④dB 阶梯三数值有明确行业证据（AI 短剧），写死为默认即可，无需调参探索。
- 扣 1 分因素：真机"整片合成"依赖宿主合成器/`video_assembler`通道（本套件不含合成器），dB 阶梯在**真实混音器上的听感保真**（不同合成器 ducking 实现差异）有不确定性，需 A/B 人评兜底，故不给满分。

---

## 8. 依赖与顺序 Dependencies

- **配 D1（双时长观 / 时长闭合）**：本方向 `range`（组/镜号区间）与 narration 轨时长闭合**复用 storyboard §5 双时长观与 ±1s 容差口径**（D1 已在 storyboard v2.0 解决）。**前置**：storyboard v2.0 双时长观（已就绪）。方向简报"配 D1"即指此。
- **依赖角色表 §4 音色锁定（已就绪）**：narration 轨 `source_ref` 引 `[Voice_*]`，依赖 `production-bible/character-roster.md` §4 稳定。
- **依赖 §8 情绪声音表 + continuity 规则（已就绪）**：bgm 档引 `mapping-tables.md` §8；mute/首尾帧/180° 引 `continuity-quality.md` 三·1·三·3·五·1。均为只读消费，已就绪。
- **可选依赖宿主合成能力**：真机整片合成依赖宿主 `video_assembler`/合成器/MediaKit（与既有超分通道同性质）；工件 + 装配报告产出**不**依赖宿主。
- **与其它 DNN 的关系**：与 D2（拉片反向）正交（拉片是"听音反推轨"，本方向是"正向汇轨"，互不阻塞）；与 D3（模型适配）弱关联（换视频/音频模型时，`audio_model_profile` 与 `embedded_track_policy` 是其下游消费点，非阻塞）；与 D4（运镜示意图）正交。本方向是 storyboard 的下游装配消费者，**不阻塞** storyboard 既有产出。

---

## 9. 风险与缓解 Risks & Mitigations

| 风险 | 影响 | 缓解 |
|---|---|---|
| R1 轨道元数据（audio_id/dB/mute）被误写进 Seedance 成片提示词（引擎泄漏） | 破成片、破隐身铁律 | NFR-01 硬闸 + DoD-5 grep + 反例 T5；工件首行即标"装配施工单·非成片"；唯一进成片的声音内容仍限 §4.4 台词/§4.5 音效创作语言 |
| R2 内嵌轨未 mute → 双重音频（两层 BGM / 旁白叠口型音） | 合成废片 | FR-03 双重保险（提示词层 `no music` 抑制 + 装配层 mute 兜底）+ keep_lipsync 冲突门；DoD-3 核验 |
| R3 dB 阶梯在不同合成器 ducking 实现下听感不一 | 混音不一致 | 阶梯写 sidechain=voice 语义（而非绑定某器实现）；真机 A/B 人评兜底校准；三数值留区间（8–12/3–5）容差 |
| R4 BGM 分段切点判定歧义（按情绪弧哪里切段） | 段界不稳 | 段界**复用 storyboard 情绪强度组边界**（情绪弧转折=组边界），不另立切段自由度；高潮段 = 情绪≥4 组，规则化裁决 |
| R5 恐怖/悲伤段被机械铺满 BGM 违反 §8 留白 | 抢戏、失原则 | NFR-05 显式允许 `mute`/低密度段，审计断言这些情绪组 bgm 不铺满（违反 §8 ❗禁止条即报） |
| R6 `[Audio_*]` 与 `[Voice_*]` 概念混淆 | ID 体系乱 | §5.3(A) 明确：`[Voice_*]`=音色身份（角色表锁）、`[Audio_Narration_*]`=轨实例（引 Voice + range）；一对多复用写清 |
| R7 真机整片合成付费且慢 | 成本/速度 | NFR-04：工件 + 报告纯文本免真机；真机仅整片一次（非逐镜）；由用户亲点 |

---

## 10. 工作量与里程碑 Effort & Milestones

**粗估总量：约 2.0–2.5 人周。**

- **M1 装配契约 assembly.md（约 0.9 周）**：写 `_shared/assembly.md`——三轨 schema、混音 dB 阶梯表（FR-02 写死三数值）、视频内嵌轨静音规则（FR-03）、装配前链式校验三链（FR-04，收口首尾帧/180°/时间线闭合）。产出物：可评审的 Bone 层装配契约。
- **M2 storyboard §8 audio_layer 段 + ID 注册（约 0.5 周）**：扩 `storyboard/output-contract.md` 新增 §8 `audio_layer` schema + range/source_ref/mix 字段 + 全片 `audio_layers` 样例；§7 自检追加装配门；`asset-id-convention.md` §1 加 `[Audio_*]` 行；`mapping-tables.md` §8 + `README.md` 注册。产出物：可产出工件的 Skin 层契约。
- **M3 审计脚本 + 基线 diff（约 0.6 周）**：`verify_audio_assembly.py` + 对 `fewshot-翡翠楼夜宴-v2全片.md` 跑汇轨命中基线；接 DoD-1～DoD-5 + 反例 T5 断言。产出物：可重跑回归门（含三道真闸验证）。
- **M4 真机整片合成 + A/B 人评（约 0.4 周，付费步由用户亲点）**：1 片整片合成，核验对话 ducking/高潮抬升/0.5s crossfade/无双重音频四项 + A/B 评分。产出物：DoD-10 证据 + dB 阶梯校准结论。

**关键路径**：M1 → M2 → M3（M4 可与 M3 部分并行）。M3 审计脚本是"可验证"核心交付，优先于 M4 真机。

---

**契约版本**：D6 PRD Draft v0.1 ｜ 缺口类 A（有脑无手）｜ 优先级 P2 ｜ 落地可靠性 4/5 ｜ 新增 `_shared/assembly.md`（Bone 装配契约：三轨 schema + 混音 dB 阶梯 + 内嵌轨 mute 规则 + 装配前链式校验）+ storyboard §8 `audio_layer` 段（Skin，只读汇轨派生）；引擎隐身铁律扩展为"装配层不漏成片"；配 D1 复用双时长观时长闭合口径。
