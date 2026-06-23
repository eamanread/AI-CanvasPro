# D2 · 拉片复刻反向成员（reverse-board）

> 编号 D2 ｜ 缺口类 B（单向单模单模型）｜ 优先级 P1 ｜ 状态 Draft v0.1 ｜ 落地可靠性自评 3/5

---

## 1. 问题陈述 Problem

**现状（director-suite 实测）**：整个套件是**纯前向流水线**——入口只有"剧本/片段 → 分镜"。

- `storyboard/SKILL.md` 第 13 行白纸黑字写"把用户的【剧本/片段/桥段】转成可直接喂给视频生成模型的分镜镜头卡提示词"，6 步管线（`SKILL.md` L21–31）的 **Step 0 寓居读本**输入就是文字剧本，没有任何"读一段参考视频"的入口。
- `production-bible/SKILL.md` 同样从剧本起步产四张互锁表（README.md L27）。
- `_shared/` 八件共享知识里，**唯一**沾"视频"输入的是 `continuity-quality.md`：它只把视频当作**连续性参考素材**用（L41–56「首尾帧承接 / 视频参考门槛」、L50 `reference_video`），即"用上一镜的视频去续下一镜"，而**不是**"分析一条外部参考片、把它的镜头语言拆出来复刻"。
- `style-refs.md` 的 283 名家参考是**静态文字语汇库**（"借谁的眼睛说"，L9），靠的是导演记忆里的招式，不是从用户当下给的某条具体视频里**测量**出来的手感。

**痛点（为何是问题）**：

1. **最高频的真实创作诉求缺口**：用户拿到一条"想要做成这样"的参考片（竞品广告、爆款短剧片头、某导演的运镜），当前套件无法接住——只能让用户把感受**口述成文字剧本**，运镜节奏/剪辑点/景别曲线这些**最难用语言转述**的恰恰在转述中丢失。
2. **`key_element` 换主体这一核心玩法没有载体**：源生态"拉片复刻"的精髓是"保留剪辑点/运镜/节奏，只换主体"，这正好命中 `asset-id-convention.md` 的 `[Element_*]` 焊点能力，但没有成员把"参考片镜头骨架"喂进这个焊点。
3. **知识库是死的、不自我进化**：`style-refs.md`（283 条）与 `mapping-tables.md`（8 张情绪×视听表）当前只能靠人工增补，无"从真实拉片产物回灌真实手感"的学习闭环。
4. **缺口类 B 的典型症状**：套件"单向"（只前向）、且对视频这种模态"单模"（只当连续性素材、不当可拆解的设计源）。

---

## 2. 证据与接地 Evidence

**源生态点名（哪些源 skill 已证明此能力可执行）**：

- **拉片复刻 skill（直接同源）**：方向简报已点明其全流程"参考视频 → 镜头拆解 00:00-15s → 换主体保剪辑点"。这是 D2 的母本。
- **一图成片"视觉基因解构"**：证明"从一份已有视觉成品反推出可复用设计要素"是成熟可执行流程（拆解 → 抽要素 → 换内容重组）。D2 把它从"单图"扩到"时序视频"。
- **Flova 平台可执行流水线**：`planner → multimodal_analyze_tool → storyboard_designer → media_generator → video_assembler`，带依赖 DAG（2→1；3→2）+ 强制暂停门。其中 **`multimodal_analyze_tool` 就是 D2 必需的宿主多模态视频分析节点**，且它作为 DAG 第 2 节点被 `storyboard_designer`（第 3 节点）消费——证明"多模态分析产物喂分镜设计"这条数据流在生产系统里跑通过。
- **AI 短剧 skill 的"运镜轨迹示意图 + 内切镜时长经验表"**：证明运镜与切点是可被结构化记录、量化复用的对象（D2 拆解产物的字段范式）。

**director-suite 盲点精确落点（落在哪个文件/成员）**：

| 盲点 | 落在 |
|---|---|
| 无"视频 → 镜头拆解"入口 | 缺一个**新成员** `reverse-board/`（与 storyboard/ 平级） |
| 多模态视频分析能力未声明、未契约化 | `_shared/` 缺一份"视频拉片分析"知识（拆解协议 + 字段范式 + 宿主能力门槛） |
| `key_element` 换主体无"镜头骨架"载体 | `asset-id-convention.md` 已有 `[Element_*]` 焊点，但无"剪辑骨架 = clip skeleton"这一可复用对象的注册约定 |
| 知识库不自学习 | `style-refs.md` / `mapping-tables.md` 无"拉片产物回灌"通道 |

---

## 3. 目标与非目标 Goals / Non-Goals

**Goals**

- G1：新增成员 `reverse-board/`，提供"参考视频 → 完整镜头拆解（节拍分段 ≤15s/镜头组、运镜语言、景别曲线、剪辑切点）"的可执行流程。
- G2：拆解产物对齐**已有 `storyboard/output-contract.md` v2.0 契约**（场景→镜头组→镜头三层），使"换主体"后能**零改契约**直接驱动下游 Seedance 链。
- G3：提供"换主体保骨架"机制——保留**剪辑点/运镜/节奏**（时序骨架），仅替换主体/题材/造型（`[Element_*]` 焊点），且换主体后情绪×视听仍守 `mapping-tables.md` 强制项。
- G4：建立**学习闭环**——拉片产物可经人工确认后回灌 `style-refs.md`（招式条目）/`mapping-tables.md`（边界微调），让知识库"长出真实手感"。
- G5：**先 de-risk 宿主多模态视频分析能力**：在跑全流程前，用一个能力探针确认宿主能否读视频帧/时间码/运动信息；不能则优雅降级到"关键帧序列 + 用户口述时间码"模式。

**Non-Goals（边界铁律）**

- N1：**不破引擎隐身**。拉片得到的"00:00–00:03 推镜"等**带绝对时间码的分析过程产物属于过程，绝不漏进成片**。最终镜头卡仍遵 v2.0「时长制不写绝对时间码」（`storyboard/output-contract.md` L11）、遵 `tacit-core.md` L3「引擎隐身」。拆解出的时间码只在内部骨架里用于排序，落卡时换算成「时长：Xs」。
- N2：**不破可移植性**。reverse-board 作为 Skill / mega-prompt 两态都要能跑（README.md L74–80）；多模态分析能力**通过宿主能力门控**，不写死任何特定平台 API（不绑 Flova/不绑某云）。宿主无多模态能力时降级模式仍能产出有用骨架。
- N3：**不搬运题材**。拉片只复刻**镜头骨架/手感**，不得把参考片的具体题材/台词/品牌搬进输出（守 `tacit-core.md` L66「题材原创检」+ `continuity-quality.md` 合规版权类 L171–178）。
- N4：**不新增视频模型适配层**。下游仍走现有 `seedance-2.0.md`；D2 只产骨架，不碰 Skin 的模型适配（那是另一方向）。
- N5：不做版权过滤的法律判定（仅做"题材原创 + 无品牌/Logo/可读真实台词搬运"的工程级反向锚定）。

---

## 4. 需求 Requirements

### 4.1 功能需求 FR

**D2-FR-01 · 宿主多模态能力探针与降级（先 de-risk）**
- 描述：`reverse-board/SKILL.md` 第一步必须先跑"能力探针"，判定宿主能否（a）按时间戳读取视频帧、（b）感知镜头切点、（c）感知运动/运镜方向。据结果选三档模式之一：**A 全自动拆解**（宿主可读视频）/ **B 半自动**（宿主可读用户提供的关键帧序列 + 用户给的粗时间码）/ **C 口述兜底**（用户文字描述参考片，退化为前向 storyboard 但保留"骨架优先"写法）。
- 验收：给同一条 15s 参考片，三档模式都能产出**结构合法**（通过下方 D2-FR-03 schema 校验）的骨架；探针在 A 不可用时**显式落到 B/C 且告知用户当前档位**，绝不静默假装拆了视频（对齐 `continuity-quality.md` L188「缺参考必须停下，不得虚构」）。

**D2-FR-02 · 完整镜头拆解（节拍分段 ≤15s/镜头组）**
- 描述：把参考片按 `tacit-core.md` 寓居读本 + `dimensions.md` 节奏切分，拆成**镜头组（节拍分段，每段 ≤15s，对齐生成单元）→ 镜头（剪辑切点分切）**两层，逐镜测量：景别、机位、运镜（手法 + 方向 + 速度感）、剪辑切点（切镜方式）、镜内时长、主导情绪强度 0–5（查 `mapping-tables.md` 反推）。
- 验收：拆解后**每个镜头组时长 ≤15s**且 `Σ镜时长 ≈ 组时长（±1s）`（复用 `output-contract.md` §5 双时长校验）；运镜字段三件套齐全（手法+意图+物理描述，遵 `output-contract.md` L65）；对 15s 基线片，自动模式拆出的**切点数与人工标注切点数偏差 ≤1**。

**D2-FR-03 · 抽取 key_element 与剪辑骨架对象（clip_skeleton）**
- 描述：从拆解结果抽出两类对象：（a）`key_element` = 参考片里的**可换主体槽位**（主角/关键道具/场景），（b）`clip_skeleton` = 与主体**解耦的时序骨架**（每镜：景别/运镜/切镜方式/相对时长/情绪强度，**不含具体主体描述**）。骨架注册进 `asset-id-convention.md` 体系（新增"骨架不是 asset、是镜头序列模板"的约定）。
- 验收：导出的 `clip_skeleton` JSON/YAML 通过 schema 校验（见 §5③）；骨架字段中**零主体专有名词**（用占位 `<<SUBJECT>>`/`<<PROP>>`/`<<LOCATION>>`），抓取脚本对骨架做正则扫描，命中任何参考片专有名词即判 FAIL。

**D2-FR-04 · 换主体保骨架（喂现有 storyboard 契约）**
- 描述：用户给"新主体/新题材"，reverse-board 把新主体填入 `clip_skeleton` 的 `<<SUBJECT>>` 槽，输出**符合 `storyboard/output-contract.md` v2.0 的完整镜头卡 + 每组一段 Seedance 提示词**。换主体后必须重跑 `mapping-tables.md` 强制项校验（情绪 5 级禁中景等），若新主体情绪曲线与原骨架冲突，**以情绪为准微调骨架并留痕**（守 `tacit-core.md`「情绪先行」）。
- 验收：产物直接通过 `storyboard/output-contract.md` §7 的 9 条输出前自检（尤其 #6 引擎隐身、#3 景别-情绪强制项、#9 每组恰一段 Seedance）；剪辑切点序列与原骨架**逐镜切镜方式一致率 ≥90%**（情绪冲突导致的留痕调整计入合法偏差）。

**D2-FR-05 · 学习闭环：拉片产物回灌知识库**
- 描述：拉片产生的"新招式"（如某个未在 `style-refs.md` 收录的运镜组合/光色手法）经**用户显式确认**后，按固定格式追加到 `style-refs.md` 招式库或 `mapping-tables.md` 边界注记；回灌条目须标注来源类型（"拉片归纳"）但**不含参考片可识别信息**（无片名/品牌）。
- 验收：回灌走 PR/diff（人审），非自动写库；回灌后 `style-refs.md` 仍通过 §6「引擎隐身 + 无题材搬运」检查；提供一个 `reverse-learnings.md` 暂存区，确认前不污染主库。

### 4.2 非功能需求 NFR

- **D2-NFR-01 · 引擎隐身（铁律）**：拉片全过程产物（绝对时间码 00:00-15s、切点表、"这是推镜"的分析标注、能力探针档位、骨架占位符 `<<SUBJECT>>`）**绝不出现在最终成片镜头卡 / Seedance 提示词里**。落卡前所有绝对时间码换算为「时长：Xs」。验收口径同 `output-contract.md` §7#8。
- **D2-NFR-02 · 可移植性**：reverse-board 必须同时以（a）Agent Skill、（b）`_megaprompts/reverse-board.megaprompt.md` 单文件两态可用（对齐 README.md 两种用法）；多模态依赖通过 D2-FR-01 探针门控，不写死平台。
- **D2-NFR-03 · 性能/成本**：拆解一条 ≤15s 片，自动模式宿主调用次数有上限（建议 ≤ 帧采样 N 帧，N 随片长线性、默认 1fps 采样），避免逐帧爆 token；降级 B/C 模式零额外模型调用。
- **D2-NFR-04 · 一致性**：换主体输出仍受 `continuity-quality.md` 全部连续性/质量门约束（asset_id 硬锚、180° 轴线、色温≤200K 跳变、首尾帧承接门槛）。
- **D2-NFR-05 · 口径统一**：D2 文档统一采用"情感优先六维管线"口径（`tacit-core.md` 第二节），不再混用"5维/8维"措辞，顺手收敛遗留口径分歧。

---

## 5. 设计 Design

### ① 新增 / 改动文件精确路径清单

**新增（成员目录，与 storyboard/ 平级）**
```
skills/director-suite/reverse-board/
├── SKILL.md                      # 成员入口：拉片复刻 6 步管线（探针→拆解→抽骨架→换主体→喂契约→回灌）
├── output-contract.md            # 拆解中间产物契约（clip_skeleton + key_element 字段 schema）
│                                 #   注：最终成片直接复用 ../storyboard/output-contract.md，本契约只管"中间骨架"
└── examples/
    └── fewshot-拉片复刻-demo.md   # 一条原创参考片骨架 → 换主体 → 成片 的脱敏 few-shot
```

**新增（共享知识，Bone 层）**
```
skills/director-suite/_shared/
└── reverse-analysis.md           # 拉片分析协议：能力探针三档/帧采样策略/运镜反推表/切点识别/时间码→时长换算/反向锚定（无题材搬运）
```

**新增（学习闭环暂存区）**
```
skills/director-suite/_shared/
└── reverse-learnings.md          # 拉片归纳新招式暂存区（人审确认前不进 style-refs.md 主库）
```

**新增（mega-prompt 导出，保可移植性 NFR-02）**
```
skills/director-suite/_megaprompts/
└── reverse-board.megaprompt.md
```

**改动（最小侵入）**
```
skills/director-suite/_shared/asset-id-convention.md
   ↑ 新增一节「6. 剪辑骨架对象（clip_skeleton）约定」：骨架是镜头序列模板（非 asset），
     用占位 <<SUBJECT>>/<<PROP>>/<<LOCATION>> 解耦主体；说明它如何对接 [Element_*] 焊点。
skills/director-suite/README.md
   ↑ 「家族成员·单产物成员」表新增一行 reverse-board；「目录结构」补两份 _shared 文件。
skills/director-suite/_shared/style-refs.md
   ↑ 文末新增「招式回灌入口」说明：拉片归纳条目从 reverse-learnings.md 经人审合入此处的格式。
```

### ② 挂进 Soul / Bone / Skin 哪层

| 文件 | 层 | 理由 |
|---|---|---|
| `reverse-board/SKILL.md` | **Skin（入口/编排）** | 它是成员入口 + 6 步编排，复用 Soul 引擎、查 Bone 知识、产 Skin 契约 |
| `_shared/reverse-analysis.md` | **Bone** | 与 `dimensions.md`/`mapping-tables.md` 同级的导演知识库——拉片分析协议是"把视频翻成参数"的知识 |
| `_shared/reverse-learnings.md` | **Bone（暂存）** | 知识库的增量入口 |
| `clip_skeleton` schema（在 output-contract.md） | **Skin（契约）** | 锁字段格式 |
| 拆解时的"读懂参考片情绪节拍/寓居" | **复用 Soul** `tacit-core.md` | **不新增 Soul 文件**——引擎不动，只被复用 |

> 关键：**Soul 一行不改**。拉片的"理解"仍走 `tacit-core.md` 寓居读本/情绪优先六维，D2 只是把它的输入从"文字剧本"扩成"视频→拆解骨架→当作结构化剧本"。这是不破引擎隐身的结构性保证。

### ③ 关键 schema / 契约字段 / 算法

**clip_skeleton schema（中间产物，绝不入成片）**
```yaml
clip_skeleton:
  source_probe:                 # 能力探针结果（过程产物，NFR-01 禁入成片）
    mode: A | B | C             # A全自动 / B半自动关键帧 / C口述兜底
    can_read_frames: bool
    can_detect_cuts: bool
    can_detect_motion: bool
    sample_fps: 1.0             # NFR-03 帧采样率
  key_elements:                 # 可换主体槽位
    - slot: <<SUBJECT_MAIN>>    # 占位符，零专有名词（FR-03 验收）
      role: protagonist
      original_hint: "(内部参考，不入成片)"
    - slot: <<PROP_KEY>>
      role: contiguity_prop
  shot_groups:                  # 节拍分段，每段 ≤15s（FR-02）
    - group_id: G1
      duration_s: 12            # 组时长 ∈ [4,15]
      beat: "蓄势"
      _abs_timecode: "00:00-00:12"   # 过程产物，下划线前缀=禁入成片，落卡换成"时长：12s"
      shots:
        - shot_id: G1-S1
          rel_duration_s: 4
          shot_size: 中景       # 反推自帧
          camera_move:          # 三件套（output-contract L65）
            type: Push In
            intent: 情绪逼近
            physical: "位移约12cm 匀速"
          cut_to_next: 硬切      # 剪辑切点（output-contract §4.6 允许值）
          emotion_intensity: 3  # 0-5，反推查 mapping-tables
          subject_ref: <<SUBJECT_MAIN>>   # 只引槽位，不写具体主体
  invariants_locked:            # 换主体时必须保留的"骨架不变量"
    - cut_rhythm                # 剪辑切点序列
    - camera_move_sequence      # 运镜序列
    - emotion_curve             # 情绪强度曲线
```

**运镜反推表（reverse-analysis.md 核心 · 与 output-contract §2.2 互逆）**：把"画面里看到的镜头运动"映射回 §2.2 的 10 种运镜术语（Push In/Pull Out/Lead/Follow/Orbit/Handheld/Steadicam/Crane Up·Down/Static），每行给"视觉特征 → 运镜术语 → 情绪功能"，保证拆解词汇与前向契约同表、可逆。

**核心算法（换主体保骨架，伪代码）**
```
def reverse_replicate(ref_video, new_subject):
    probe = capability_probe()                 # FR-01：先 de-risk
    skel  = decompose(ref_video, probe)        # FR-02：≤15s/组拆解
    skel  = extract_skeleton(skel)             # FR-03：抽 key_element + 占位
    assert no_proper_nouns(skel.shots)         # FR-03 验收门

    board = fill_subject(skel, new_subject)     # FR-04：换主体
    board = re_run_emotion_mapping(board)        # 情绪先行：重校 mapping-tables 强制项
    for g in board.shot_groups:                  # NFR-01：时间码→时长
        g.duration_field = f"时长：{g.duration_s}s"   # 落卡，丢弃 _abs_timecode
        strip_internal_fields(g)                 # 删 source_probe/_abs_timecode/占位标注
    assert passes(board, "storyboard/output-contract.md §7")  # FR-04 验收门
    return board                                 # 输出 = 标准 v2.0 镜头卡 + 每组一段 Seedance
```

### ④ 数据流（ASCII）

```
参考视频 ──► [FR-01 能力探针] ──A可用──► [FR-02 全自动拆解]──┐
   │              │                                          │
   │              └─B/C 降级─► [关键帧/口述 拆解] ────────────┤
   │                                                         ▼
   │                                          [FR-03 抽 key_element + clip_skeleton]
   │                                                         │  (占位 <<SUBJECT>>，零专有名词)
新主体/新题材 ──────────────────────────────────────────────┤
                                                            ▼
                                            [FR-04 换主体 + 重校情绪映射]
                                                            │
                          ┌─────────────────────────────────┤
                          ▼                                  ▼
         [NFR-01 剥离过程产物 / 时间码→时长]      [FR-05 新招式 ──► reverse-learnings.md]
                          │                                  │ (人审)
                          ▼                                  ▼
        标准 v2.0 镜头卡 + 每组一段 Seedance       (确认后) style-refs.md / mapping-tables.md
        (走现有 storyboard/output-contract +                 ↑ 学习闭环回灌
         seedance-2.0.md，零改契约)
```

---

## 6. 验收标准 Acceptance Criteria (DoD)

1. **成员可触发可跑**：`reverse-board/SKILL.md` frontmatter 被索引；对"把这条参考片做成像它一样、主角换成 X"的请求能触发并跑完 6 步，产物为标准 v2.0 镜头卡 + 每组一段 Seedance（非空、非占位）。
2. **三档探针真降级**：宿主多模态不可用时，**显式输出当前为 B/C 档**并继续产骨架；构造一次"伪装宿主无视频能力"的用例，验证它**不静默假拆**（无凭空捏造的时间码）。
3. **拆解结构合法**：对 1 条 ≤15s 基线参考片，每镜头组 ≤15s 且 `Σ镜时长 ≈ 组时长（±1s）`；自动模式切点数 vs 人工标注切点数偏差 ≤1。
4. **骨架零主体泄漏**：导出的 `clip_skeleton` 经正则扫描，主体槽位均为 `<<...>>` 占位，**命中 0 个参考片专有名词**（片名/角色名/品牌）。
5. **换主体保骨架**：换主体产物的逐镜「切镜方式」序列与原骨架一致率 ≥90%（情绪冲突留痕调整计合法偏差）；运镜序列同源可逆（每镜运镜术语 ∈ output-contract §2.2 十类）。
6. **引擎隐身零泄漏（铁律）**：最终镜头卡 + Seedance 提示词中 grep **不到** `00:0`、`<<`、`source_probe`、`clip_skeleton`、`探针`、`时间码`、`拉片`、Polanyi/默会等术语；所有时长以「时长：Xs」呈现，**无绝对时间码**。
7. **下游契约零改**：换主体产物**不改一行** `storyboard/output-contract.md` 即通过其 §7 全部 9 条自检。
8. **学习闭环可控**：新招式先落 `reverse-learnings.md`，经人审 diff 才合入 `style-refs.md`；合入后主库仍过「引擎隐身 + 无题材搬运」检查。
9. **可移植双态**：mega-prompt 单文件版整段复制到对话框，喂一条参考片描述（C 档），能产出合法骨架与成片卡（不依赖 Skill 安装）。

---

## 7. 验证方案 Verification Plan

**验证手段**
- **真机出片（核心证据）**：取 1 条**原创自录/无版权**的 ≤15s 参考片作基线 B0（避免版权与题材搬运污染验证）。跑 A 档全自动拆解 → 抽骨架 → 换主体（如"原片是咖啡广告，换成茶饮"）→ 出成片卡，由用户亲点付费生成 1 组 Seedance（计费门，遵 CLAUDE.md「付费按钮用户亲点」），人眼比对**剪辑节奏/运镜曲线是否复刻、主体是否真换了**。
- **审计脚本（可量化回归）**：写 `reverse-board/verify_skeleton.py`（或等价检查清单）做四件事：(a) schema 校验 clip_skeleton；(b) `Σ镜时长≈组时长(±1s)` + 组 ∈[4,15]；(c) 骨架专有名词正则扫描（DoD#4）；(d) 成片卡引擎隐身 grep（DoD#6 的禁词表）。
- **回归 diff**：把同一条 B0 的拆解骨架冻结为黄金基线 `examples/fewshot-拉片复刻-demo.md`；后续改 reverse-analysis.md 后重拆 B0，diff 骨架结构，**切点序列/运镜序列不得无故漂移**。
- **人评 A-B**：把"D2 换主体产物"vs"让用户口述同一参考片走纯前向 storyboard 的产物"双盲给 3 人评"哪个更像参考片的节奏感"，D2 胜出率作为软指标（非阻塞门，仅佐证价值）。

**测试用例 / 基线**
- B0：1 条原创 ≤15s 参考片（含 ≥3 个剪辑切点、≥2 种运镜、1 次情绪强度跃迁），人工标注切点/运镜/情绪曲线作 ground truth。
- 负例 NB0：伪装"宿主无多模态能力"，验证 D2-FR-01 降级与"不静默假拆"。
- 负例 NB1：参考片含可见品牌 Logo + 一句标志性台词，验证骨架抽取**剥离**了品牌/台词（合规反向锚定生效）。

**为何这样能证明"真的有效"**
- DoD#3/#5 是**数值化对账**（切点偏差≤1、切镜方式一致率≥90%），不是"提升质量"空话——直接量"骨架是否被复刻"。
- DoD#4/#6 用**正则/grep 硬扫**证明"换了主体"且"过程产物没漏进成片"，把两条最容易出错的铁律（题材搬运、引擎泄漏）变成可执行断言。
- DoD#7「下游契约零改即过 §7」证明 D2 真正**复用**而非旁路了现有质量门——它没有偷偷绕开 storyboard 的 9 条自检。

**落地可靠性理由（自评 3/5）**
- 加分：①拆解产物**完全复用**已成熟的 v2.0 契约与 `tacit-core` 引擎，新增面集中在"分析侧"，下游零改、回归面小；②源生态（拉片复刻 + Flova multimodal_analyze + 一图成片视觉基因）已证流程可行，非空想。
- 扣分（卡在 3 不是 4–5 的原因）：**核心风险是宿主多模态视频分析能力的真实强度未知**——能否稳定读时间码/判切点/辨运镜方向，决定 A 档是否名副其实；若宿主弱，实际多落 B/C 档，复刻精度打折。这是 P1 而非 P0、可靠性 3/5 的根因，也正是 G5「先 de-risk」存在的理由。

---

## 8. 依赖与顺序 Dependencies

**依赖的宿主能力**
- **多模态视频分析能力（强依赖，须先 de-risk）**：按时间戳读帧 / 判剪辑切点 / 辨运镜方向。D2-FR-01 探针就是为此依赖做的门控与降级，**先 de-risk 是 D2 的第 0 号前置**。
- 不依赖任何特定平台 API（NFR-02），但若宿主恰好暴露 Flova 式 `multimodal_analyze_tool`，A 档质量更高。

**依赖的其它 DNN / 现状件**
- 复用（不改）：`storyboard/output-contract.md` v2.0、`_shared/tacit-core.md`、`mapping-tables.md`、`dimensions.md`、`seedance-2.0.md`、`continuity-quality.md`。
- 软依赖 `asset-id-convention.md` 的 `[Element_*]` 焊点（D2 在其上加 clip_skeleton 约定）。
- 与"知识库自学习/评测审计工具"方向（若另有 DNN 立项）在 **D2-FR-05 学习闭环**处有接口耦合——D2 先用最小 `reverse-learnings.md` 人审通道兜底，不阻塞。

**顺序**
1. 先 de-risk 宿主多模态（FR-01）→ 2. 落 `_shared/reverse-analysis.md` 拆解协议 + clip_skeleton schema → 3. 落 `reverse-board/` 成员与 6 步管线 → 4. 真机基线 B0 验证 → 5. 接学习闭环（FR-05，可后置）→ 6. 出 mega-prompt 双态。

---

## 9. 风险与缓解 Risks & Mitigations

| 风险 | 影响 | 缓解 |
|---|---|---|
| **宿主多模态能力弱/不稳**（核心风险） | A 档名存实亡，复刻精度差 | FR-01 三档探针 + 显式告知档位；B/C 降级仍产可用骨架；先 de-risk 再投入 |
| **绝对时间码/分析产物漏进成片**（引擎隐身破口） | 破铁律，成片出现 `00:00-15s`/`<<SUBJECT>>` | NFR-01 + 算法 `strip_internal_fields` + DoD#6 grep 硬门；schema 用 `_` 前缀标记禁出字段 |
| **题材/品牌/台词搬运**（版权+原创破口） | 侵权、与 tacit-core 题材原创检冲突 | FR-03 占位解耦 + 负例 NB1 + reverse-analysis 合规反向锚定（复用 continuity-quality L171–178） |
| **换主体后情绪曲线与原骨架打架** | 守了骨架却破了"情绪先行" | FR-04 重跑 mapping-tables 强制项，**以情绪为准微调骨架并留痕**（一致率≥90% 已为冲突留合法偏差） |
| **学习闭环污染主库** | 自动回灌把噪声写进 style-refs | FR-05 强制 reverse-learnings.md 暂存 + 人审 diff，禁自动写主库 |
| **逐帧分析爆 token/成本** | 长片拆解昂贵 | NFR-03 默认 1fps 采样 + 帧数上限；超长片要求用户先切到 ≤15s 段 |
| **口径不一致蔓延（5维/8维）** | 文档混乱 | NFR-05 统一"情感优先六维"口径，本 PRD 一并收敛 |

---

## 10. 工作量与里程碑 Effort & Milestones

**粗估：约 2.5–3.5 人周**（不含宿主多模态能力本身的改造——那属宿主侧）。

| 里程碑 | 交付 | 估时 |
|---|---|---|
| **M0 · de-risk** | 宿主多模态能力探针验证：拿 B0 实测能否读帧/判切点/辨运镜，定 A 档可达性；写 FR-01 探针逻辑 | 0.5 人周 |
| **M1 · 拆解知识** | `_shared/reverse-analysis.md`（探针三档 + 运镜反推表 + 切点识别 + 时间码→时长换算 + 合规反向锚定）+ clip_skeleton schema | 0.75 人周 |
| **M2 · 成员落地** | `reverse-board/SKILL.md` 6 步管线 + `output-contract.md`（中间骨架契约）+ `asset-id-convention.md` clip_skeleton 节 + README 挂表 | 0.75 人周 |
| **M3 · 真机验证** | 基线 B0 跑 A/B/C 三档 + `verify_skeleton.py` 审计脚本 + 黄金 few-shot + 负例 NB0/NB1；用户亲点 1 组 Seedance 比对 | 0.75 人周 |
| **M4 · 闭环与双态** | `reverse-learnings.md` 人审通道 + `_megaprompts/reverse-board.megaprompt.md` 可移植双态 | 0.5 人周 |

**MVP 切线**：M0+M1+M2+M3 即可交付"参考视频→换主体→成片"主链（FR-01~04 + 核心 NFR）；M4 学习闭环（FR-05）与 mega-prompt 双态可作第二批。
