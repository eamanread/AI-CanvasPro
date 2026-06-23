# D13 · 产品化 + 文档口径统一（术语收敛 / 契约对版 / 真机基线 / luban 出师 / 安装包 / mega-家族双向校验）

> 编号 D13 ｜ 缺口类 C（无秤无回归）｜ 优先级 P2 ｜ 状态 Draft v0.1 ｜ 落地可靠性自评 4/5

---

## 1. 问题陈述 Problem

director-suite 的"灵魂/骨/皮"内核已成型，但作为**可被理解、可被安装、可被传播、可被验证**的公共 Skill 资产，它的**外壳口径是散的、契约版本是错位的、真机基线是缺的、单文件版与家族包是会漂的**。这是典型缺口类 C：**没有一把统一的秤、也没有可回归的基线**，每次有人改一处，没有任何机制能保证四份门面（DESIGN / README / 各成员 SKILL / megaprompt）不打架。

**现状（引 director-suite 具体文件，逐条有据）。**

- **术语"维度数"三处打架，且自相矛盾。** 同一套内核里：
  - `_shared/tacit-core.md:20/33/44/63`、`DESIGN.md:27/41/87/97/106/117/184`、`_megaprompts/storyboard.megaprompt.md:21/28/35/277` 一律称内部推理管线为 **"情感优先六维 / 情绪优先六维"**；
  - 而 `DESIGN.md:139`、`README.md:14/58` 把 Bone 层知识库称 **"八维导演知识库 / 8 维知识"**（`dimensions.md`）；
  - `tacit-core.md:7`、`DESIGN.md:41` 又有 **"八大支柱"**（Soul 决策算子）。
  三个"维度数"指的是**三件不同的东西**（内部推理管线 / Bone 知识库分类 / Soul 决策支柱），但**从未在任何一处被显式区分**，读者第一眼看到"六维""8 维""八大支柱"只会以为是同一物的笔误。更糟的是 `D02-reverse-board.md:95/301`、`D08-image-first.md:103/340` **早已各自声明过一条 NFR-05"统一为情感优先六维口径、不再混用 5维/8维"**——但这两条 NFR 只写进了各自的 PRD，**从未回灌到 canonical 文件**，于是"要统一"的承诺本身又散落在两份文档里没人执行。这是 D3「可移植性是口头承诺」的同型病：**写了要统一，但统一动作没落地、也没有秤去验证它统一了**。
- **DESIGN 文件树漏 `asset-id-convention.md`。** `grep asset-id-convention DESIGN.md` = **0 命中**。`DESIGN.md:132–159` 的家族文件树是 asset-id-convention.md 诞生前的旧快照，`_shared/` 只列 7 件；而 `README.md:62` 的树已经列了它（8 件）。**同一仓库两张文件树不一致**：DESIGN 说 7 件、README 说 8 件，新读者照 DESIGN 装会以为缺文件、或照 DESIGN 改会漏掉这个**所有跨镜一致性的焊点**（`_shared/asset-id-convention.md`，被四张圣经表交叉引用）。
- **契约版本不齐、且无版本台账。** 实测各 `output-contract.md` / roster 头部：分镜 **v2.0**、角色设定板 **v1.0**、色卡 **v1.0**、关键帧 **v1.0**、角色表 **v1.0**、场景表 **v1.1**、道具表 **v1.0**。版本号散落在 8 个文件头里，**没有任何一处汇总台账**，无法一眼回答"当前全套是什么版本组合""谁配套谁"。scene-roster 已是 v1.1（`scene-roster.md:1`）但 props/character roster 还是 v1.0，**它们都自称"配套《分镜契约 v2.0》"**——配套关系靠每个文件各自一句话口头声明，没有机器可校验的对版矩阵。
- **production-bible 未跑全案真机。** `production-bible/examples/翡翠楼-全案demo.md` 是**手写示范**而非真机产物；README 把 production-bible 列为"🎯 推荐入口"，但**全案四表互锁链路（剧本→角色表+场景表+道具表+分镜表 + 交叉校验闭合）从未被一次真机端到端跑通并留基线**。这意味着这个"推荐入口"是**没有回归锚的承诺**——改了任一上游表，没有任何基线能告诉你"互锁还闭不闭合"。
- **mega-prompt 与家族包会漂、且缺一个成员。** `_megaprompts/` 只有 **4 个**（storyboard / character-board / color-palette / keyframe），**没有 production-bible 的单文件版**——而 production-bible 恰恰是 README 钦点的"推荐入口"，单文件用户（用法 B）**根本拿不到这个入口**。同时单文件版是把 `_shared/` 知识**内联快照**（DESIGN.md:165），与源文件之间**没有任何同步校验**：`storyboard.megaprompt.md:3/169/277` 已对齐 v2.0，但 README.md:88 仍写"44/48 个影视 skill"、style-refs 已 283 条——**任何 `_shared/` 改动都不会自动反映到 4 个 megaprompt 里，漂移悄无声息**。

**痛点（为何是问题）。**

1. **口径打架直接削可信度与可安装性。** 一个对外发布的公共 Skill，门面上"六维/8维/八大支柱"混用、两张文件树不一致、版本号对不上——潜在使用者第一印象就是"这套自己都没理顺"，**装机意愿与信任度双降**（这正是 luban"为什么我的 skill 没人装"要解决的）。
2. **没有版本台账 = 升级即埋雷。** 改一处契约（如 props 升 v1.1）时，没有矩阵告诉你"还有谁声明配套我、谁要跟着动"，配套关系靠人肉记忆，**必然漂**。
3. **"推荐入口"无真机基线 = 最关键链路最没保障。** 全案四表互锁是套件最大卖点，却是**唯一没被真机验证过**的链路；它一旦在真实剧本上断链（引用不闭合 / 道具状态轴非单调 / 跨镜锚不一致），**没有任何回归能提前抓到**。
4. **mega 与家族包漂移 = 两个产物各说各话。** 用法 A（家族包）与用法 B（单文件）应是同一套知识的两种封装，一旦无校验，**单文件用户拿到的是过期内核**，且永远拿不到 production-bible 入口——等于偷偷给了两个不同的产品。

> 一句话：**D13 不新增任何创作能力，它给这套已成型的内核装上"产品化的秤"——把散落的口径收敛成单一真相、把版本对齐成可校验矩阵、给推荐入口补真机基线、给两种封装形态加双向同步门、最后走 luban 出师拿证书并打安装包**。这正是缺口类 C（无秤无回归）。

---

## 2. 证据与接地 Evidence

**哪些源 skill / 宿主能力支撑此方向（点名）。**

| 来源 / 证据 | 提供的能力 | 对应本方向的落点 |
|---|---|---|
| **luban（鲁班 · Skill 打磨工坊，已装）** | 五动作方法论（验料/访行/过尺/慢刨/回炉）+ 三把尺（结构尺/实测尺/活体尺）+ "活体对账"（拉真实运行产物对账，绿色 CI 会撒谎）+ 出师证书结果卡 | D13 的**出师流程主轴**：用"活体尺"跑 production-bible 真机、用"结构尺"查口径/版本一致、产出**出师证书**作为发布物 |
| **电商全案源（量化一致性审计证据）** | "轮廓±5% / HSL 色相±15° / LOGO Δ0.05 / 白底 RGB≥245"等**量化阈值审计** | 为 D13 的**口径/版本一致性审计脚本**提供"用数值阈值而非人眼判断"的范式（迁移到文档域：术语命中数、版本矩阵闭合、megaprompt 与源 diff 行数） |
| **Flova 平台 skill（可执行流水线 + 强制暂停门 + DAG）** | planner→…→video_assembler，带依赖 DAG + 跑到导出 | 证明"全案链路可被端到端真机跑通"是源生态既有范式；production-bible 的四表互锁就是它的文档域对应物，**理应同样有一次真机端到端基线** |
| **既有 `D02-NFR-05` / `D08-NFR-05`（本仓库自身文档）** | 两条已写下但未执行的"统一为情感优先六维口径"承诺 | D13 **承接并真正执行**这两条悬空 NFR，把它们从"PRD 里的话"变成"canonical 文件里的事实 + 可回归的术语审计" |

**director-suite 盲点精确落点（落在哪个文件 / 成员 / 哪一层）。**

| 盲点 | 命中文件 | 缺什么 | 归类 |
|---|---|---|---|
| 维度术语三处混用、自相矛盾 | `DESIGN.md`(六维/8维/八大支柱)、`README.md:14/58`、`tacit-core.md`、`storyboard.megaprompt.md` | 缺**单一术语表（glossary）**显式区分"三个不同的维度概念" + 全仓收敛 | 文档口径 · Skin 外壳 |
| DESIGN 文件树漏 asset-id-convention | `DESIGN.md:132–159`（0 命中） | 缺该条目，与 `README.md:62` 树不一致 | 文档口径 |
| 版本号散落、无台账 | 8 个 `output-contract.md`/roster 文件头 | 缺**版本对版矩阵（version matrix）** | 文档口径 · 契约 |
| 推荐入口无真机基线 | `production-bible/`（example 为手写） | 缺**一次真机全案产物 + 互锁审计基线** | 无秤无回归 · 核心 |
| megaprompt 与源无同步校验、缺 PB 单文件 | `_megaprompts/`（仅 4 个，无 production-bible） | 缺**双向同步门 + 第 5 个 megaprompt** | 无秤无回归 |

---

## 3. 目标与非目标 Goals / Non-Goals

**目标（Goals）。**

- **G1 单一术语真相。** 新增 `_shared/glossary.md`，**显式定义并区分三个"维度概念"**（情感优先六维=内部推理管线、Bone 八维知识库=`dimensions.md`分类、Soul 八大支柱=决策算子），全仓口径收敛到它，并落一个**术语审计脚本**保证不再回弹。
- **G2 全仓门面一致。** DESIGN 文件树补 `asset-id-convention.md`、与 README 树**逐行对齐**；新增 `VERSIONS.md` 版本对版矩阵，作为所有契约版本的**唯一台账**。
- **G3 推荐入口有真机基线。** 用一个真实剧本把 production-bible **全案四表互锁端到端真机跑通一次**，落 `production-bible/examples/<案名>-真机基线/`，并配一份**互锁审计清单**（引用闭合 / 覆盖完整 / 道具状态轴单调 / 跨镜锚一致）。
- **G4 两种封装双向校验。** 补 production-bible 第 5 个 megaprompt；新增**同步校验脚本**，使任何 `_shared/` 改动若未反映到对应 megaprompt 即**报红**（diff 守门）。
- **G5 走 luban 出师。** 跑完 luban 五动作三把尺，产出**《Skill 打磨报告》+ 出师证书结果卡**作为可传播发布物。
- **G6 打安装包。** 产出一份**可一键安装的发布构件**（家族包 zip + 安装/校验脚本 + 版本戳），并附"装机即可跑通"的烟测清单。

**非目标（Non-Goals）。**

- **N1 不动 Soul、不破引擎隐身。** D13 **一行不改** `tacit-core.md` 的推理逻辑；术语收敛只改"对外称谓与文档措辞"，不改任何决策算子。**任何审计脚本 / 真机基线 / 出师过程产物，绝不可漏进成片提示词**——审计产物只存在于 `docs/`、`tools/`、`examples/<案名>-真机基线/.audit/`，与成片层物理隔离。
- **N2 不破可移植性。** 不引入对幻映宿主、特定 server、特定路径的硬依赖；安装包与校验脚本须在"纯 skills 目录"下独立成立（仅依赖 Python 标准库 + 文本文件），换机即用。
- **N3 不新增创作维度 / 不改契约语义。** 不新增映射表、不改 v2.0 字段结构；版本对齐只做"对版与台账"，**不做语义升级**（语义升级归各自方向，如 props 若要升 v1.1 是独立工作）。
- **N4 不做真机付费滥跑。** production-bible 真机基线只跑**一次**留档；涉及计费的视觉生成（grsai/gemini）由用户亲自点，D13 只负责文字四表链路 + 把"需付费步骤"标注为人工门。

---

## 4. 需求 Requirements

### 4.1 功能需求 FR

**D13-FR-01 · 术语收敛 + glossary 单一真相 + 术语审计脚本**
- 描述：新增 `_shared/glossary.md`，用一张表显式定义三个互不相同的"维度/支柱"概念及其 canonical 称谓、所属层、对应文件；然后全仓把混用措辞收敛到 glossary 口径（内部推理管线统一称"情感优先六维管线"；Bone 知识库统一称"八维导演知识库（`dimensions.md`）"；Soul 算子统一称"八大支柱"）。再写 `tools/audit_terminology.py`：扫描全仓 `.md`，对"维度概念"出现处校验称谓是否在 glossary 白名单内、且未在禁用别名表（如"5维""5 维""六大维度"指代内部管线时的误写）中。
- 可量化验收：①`glossary.md` 存在且含 3 个概念 × {canonical 名 / 层 / 文件 / 一句话区分} 四列；②`audit_terminology.py` 对全仓运行 **0 处违规**（违规=出现禁用别名 或 同一概念用了非 canonical 称谓）；③`D02-NFR-05`/`D08-NFR-05` 两条悬空承诺被本 FR 实际兑现（脚本输出里它们指向的"5维/8维混用"计数归零）。

**D13-FR-02 · DESIGN/README 文件树对齐 + 版本对版矩阵 VERSIONS.md**
- 描述：修订 `DESIGN.md:132–159` 文件树，补入 `asset-id-convention.md`（`_shared/` 由 7 件→8 件），并与 `README.md` 树逐行对齐。新增 `VERSIONS.md`：列出全部 8 个契约文件的 {文件 / 当前版本 / 配套依赖 / 最后变更}，作为版本唯一台账。写 `tools/audit_versions.py`：交叉校验每个文件头声明的版本号 == VERSIONS.md 记录；并校验"配套声明闭合"（A 声明配套 B v2.0，则 B 实际须为 v2.0）。
- 可量化验收：①`diff` DESIGN 树 vs README 树 = **0 行实质差异**（条目集合相等）；②`VERSIONS.md` 行数 == 实际契约文件数（当前 8）；③`audit_versions.py` 运行**无 ⚠️**（无版本号与台账不符、无配套悬空引用）。

**D13-FR-03 · production-bible 全案真机基线 + 互锁审计**
- 描述：选一个**真实剧本**（非 demo），用 production-bible 全案链路真机端到端产出四张互锁表，落 `production-bible/examples/<案名>-真机基线/`（角色表 / 场景表 / 道具表 / 分镜表 各一文件 + 一份 `manifest.md` 记录输入剧本指纹与产出清单）。配 `tools/audit_bible_interlock.py`：自动校验四互锁不变量。
- 可量化验收（四项互锁不变量，全过方算基线成立）：①**引用闭合**——分镜表里出现的每个 `[Element_*]/[Prop_*]/[Voice_*]` 都能在对应 roster 找到定义（悬空引用数=0）；②**覆盖完整**——三张 roster 里每个被标"叙事关键"的 asset 至少被分镜引用一次（未被使用的关键 asset 数=0，或显式标注 cut）；③**道具状态轴单调**——每个道具的 `@sN` 状态节点在分镜时间轴上单调推进（逆序/缺档=0）；④**跨镜锚一致**——同一 asset_id 在多镜引用时 L1 硬锚字段零变化（漂移数=0）。

**D13-FR-04 · mega↔家族包双向同步门 + 补 production-bible megaprompt**
- 描述：在每个 `_shared/` 关键知识块与对应 megaprompt 内联块之间建立**可追踪映射**（megaprompt 块头标注 `<!-- sync-source: _shared/xxx.md#section -->`）。新增 `_megaprompts/production-bible.megaprompt.md`（第 5 个），把全案链路自包含化。写 `tools/audit_megaprompt_sync.py`：对每个 sync-source 标注，比对源 section 的关键事实（版本号、计数如"283 条""44/48"、术语称谓）是否与 megaprompt 内联值一致，不一致报红。
- 可量化验收：①`_megaprompts/` 文件数 = **5**（含 production-bible）；②`audit_megaprompt_sync.py` 运行**0 处漂移**（含把 README/源里的"44/48"与 megaprompt 内联值核平）；③随机抽改一个 `_shared/` 计数（如 style-refs 283→284），脚本必须**报红**（守门有效性反证）。

**D13-FR-05 · luban 出师 + 安装包 + 一键校验**
- 描述：跑 luban 五动作三把尺，产出 `docs/luban-report.md`（打磨报告）+ 一张可截图传播的**出师证书结果卡**（`docs/cert-card.md` 或 svg）。打**安装包**：`tools/build_skill_pack.py` 产出 `dist/director-suite-vX.Y.Z.zip`（含版本戳 `VERSION` 文件）+ `INSTALL.md`；并提供 `tools/verify_install.py` 跑全部审计脚本（FR-01~04）作为**装机即跑的烟测门**。
- 可量化验收：①`luban-report.md` 含三把尺各自结论 + 出师证书结果卡（含套件名/版本/通过项）；②`build_skill_pack.py` 产出 zip，解压到空 skills 目录后 `verify_install.py` **全绿（FR-01~04 审计 0 违规）**；③zip 内 `VERSION` 与 `VERSIONS.md` 一致。

### 4.2 非功能需求 NFR

- **D13-NFR-01 · 引擎隐身不破（铁律）。** 全部审计脚本、真机基线、luban 过程产物、出师证书**绝不可出现在任何成片提示词路径**。审计/过程产物只允许落在 `docs/`、`tools/`、`examples/<案名>-真机基线/.audit/`；验收：对 FR-03 真机基线的分镜表跑现有"引擎隐身检"（`tacit-core.md` 第二节 6 步检查），**0 处方法论/审计术语/支柱编号泄漏**。
- **D13-NFR-02 · 可移植不破。** 所有 `tools/*.py` 仅依赖 Python 标准库 + 纯文本扫描，**不依赖幻映 server / 特定绝对路径 / 网络**；以"skill 根目录"为相对基准。验收：把 `director-suite/` 拷到任意空目录，`verify_install.py` 仍能运行并给出结论。
- **D13-NFR-03 · 性能。** 全套审计脚本（FR-01~04）在本仓规模（约 40 个 md）总运行 **< 10 秒**，可挂 pre-commit / CI 而不拖慢。
- **D13-NFR-04 · 成本。** D13 文字链路**零付费 API**；唯一可能触发计费的是 FR-03 若需视觉资产——但 FR-03 默认只产**文字四表**，视觉生成标注为人工门、不在 D13 自动路径内。验收：D13 全流程可在不调用任何计费模型的前提下完成 FR-01/02/04/05 与 FR-03 文字部分。
- **D13-NFR-05 · 一致性（自指）。** D13 自身产物（glossary / VERSIONS / 各审计脚本输出）必须自洽——`verify_install.py` 一次运行同时校验 FR-01~04，任一不过则整体非绿，**杜绝"局部修好、整体仍漂"**。

---

## 5. 设计 Design

### ① 新增 / 改动文件精确路径清单

**新增（Skin 外壳 + 工具，均不碰 Soul）：**
```
skills/director-suite/_shared/glossary.md                    # FR-01 术语单一真相（三概念区分表）
skills/director-suite/VERSIONS.md                            # FR-02 版本对版矩阵（唯一台账）
skills/director-suite/_megaprompts/production-bible.megaprompt.md   # FR-04 第5个单文件版
skills/director-suite/production-bible/examples/<案名>-真机基线/
    ├── character-roster.out.md  scene-roster.out.md
    ├── props-roster.out.md      storyboard.out.md
    ├── manifest.md              # 输入剧本指纹 + 产出清单
    └── .audit/interlock-report.txt                          # FR-03 互锁审计产物（隔离区）
skills/director-suite/tools/audit_terminology.py             # FR-01
skills/director-suite/tools/audit_versions.py                # FR-02
skills/director-suite/tools/audit_bible_interlock.py         # FR-03
skills/director-suite/tools/audit_megaprompt_sync.py         # FR-04
skills/director-suite/tools/build_skill_pack.py              # FR-05 打包
skills/director-suite/tools/verify_install.py                # FR-05 一键跑全部审计
skills/director-suite/docs/luban-report.md                   # FR-05 打磨报告
skills/director-suite/docs/cert-card.md                      # FR-05 出师证书结果卡
skills/director-suite/INSTALL.md                             # FR-05 安装说明
```

**改动（仅文档措辞 / 文件树，零语义改动）：**
```
skills/director-suite/DESIGN.md         # FR-02 文件树补 asset-id-convention（132–159）；FR-01 措辞挂 glossary
skills/director-suite/README.md         # FR-01 "8维/六维" 措辞挂 glossary；"44/48" 与源核平
skills/director-suite/_shared/tacit-core.md          # FR-01 仅称谓核对（确认全用"情感优先六维"，预期零改）
skills/director-suite/_megaprompts/*.megaprompt.md   # FR-04 每个内联块补 <!-- sync-source --> 标注
```

### ② 挂进 Soul / Bone / Skin 哪层

- **Soul：一行不改**（NFR-01）。`tacit-core.md` 仅做"称谓是否已是 canonical"的只读核对。
- **Bone：零语义改**。`dimensions.md` / `mapping-tables.md` / `pro-params.md` / `style-refs.md` / `continuity-quality.md` / `asset-id-convention.md` 内容不动；仅被 `glossary.md` 与 `VERSIONS.md` **引用**。
- **Skin / 工程外壳：全部新增物落这里**。glossary、VERSIONS、megaprompt、真机基线、审计脚本、安装包都是"产品化外壳"，不参与推理与成片。

### ③ 关键 schema / 契约字段

**(A) `_shared/glossary.md` 核心表（FR-01）**
```
| 概念（canonical 名）   | 所属层 | 实体文件            | 是什么（一句话区分）                       | 禁用别名 |
|------------------------|--------|---------------------|--------------------------------------------|----------|
| 情感优先六维管线        | Soul   | tacit-core.md §二   | 内部推理的 6 个分声部（景别/运镜/光影/色彩/表演/节奏） | 5维 / 五维 / 六大维度 |
| 八维导演知识库          | Bone   | dimensions.md       | Bone 层专业知识的 8 类分门别类（≠推理管线） | 5维 / 六维 |
| 八大支柱                | Soul   | tacit-core.md §一   | 默会决策的 8 个操作化算子（≠维度）          | 八维 |
```

**(B) `VERSIONS.md` 对版矩阵（FR-02），初始快照（实测）**
```
| 契约文件                              | 版本 | 配套依赖                  |
|---------------------------------------|------|---------------------------|
| storyboard/output-contract.md         | v2.0 | —（基准）                 |
| character-board/output-contract.md    | v1.0 | storyboard v2.0           |
| color-palette/output-contract.md      | v1.0 | storyboard v2.0           |
| keyframe/output-contract.md           | v1.0 | storyboard v2.0           |
| production-bible/character-roster.md  | v1.0 | storyboard v2.0           |
| production-bible/scene-roster.md      | v1.1 | storyboard v2.0           |
| production-bible/props-roster.md      | v1.0 | storyboard v2.0           |
| _shared/asset-id-convention.md        | —    | 被四表交叉引用（焊点）    |
```

**(C) megaprompt 同步锚（FR-04）**
```
<!-- sync-source: _shared/style-refs.md#名家参考库 | facts: count=283, rules=6 -->
<!-- sync-source: README.md#知识来源 | facts: grounding=44/48 -->
```
`audit_megaprompt_sync.py` 解析 `facts:` 键值对，与源 section 实测值比对，不等即非零退出。

**(D) FR-03 互锁审计四不变量（伪代码）**
```
refs   = collect_ids(storyboard.out.md)            # [Element_*]/[Prop_*]/[Voice_*]
defs   = collect_ids(char,scene,props rosters)
assert refs - defs == {}                            # ①引用闭合
assert {a for a in defs if a.key and a not in refs} == {}   # ②覆盖完整(关键asset)
for prop in props: assert monotonic(prop.states_in_timeline) # ③状态轴单调
for aid in refs: assert single_value(L1_fields[aid])         # ④跨镜锚一致
```

### ④ 数据流（ASCII）

```
        ┌──────────────── canonical 真相源 (Skin 外壳) ────────────────┐
        │  glossary.md ──► 称谓白名单     VERSIONS.md ──► 版本台账       │
        └───────┬───────────────────────────────┬─────────────────────┘
                │                                │
   audit_terminology.py              audit_versions.py
   (扫全仓 .md, 校称谓)              (校文件头版本==台账, 配套闭合)
                │                                │
   ┌──────── verify_install.py（一键聚合, FR-05 烟测门）───────┐
   │            │                                │             │
   │  audit_bible_interlock.py        audit_megaprompt_sync.py │
   │  (FR-03 真机基线四不变量)        (FR-04 源↔单文件 diff)    │
   └────────────────────────┬─────────────────────────────────┘
                            ▼  全绿 ⇒
              build_skill_pack.py ──► dist/director-suite-vX.Y.Z.zip
                            ▼
              luban 三把尺 ──► luban-report.md + cert-card.md(出师证书)

  隔离铁律(NFR-01): 上图所有产物只活在 docs/ tools/ examples/.audit/，
                    永不进入 *.out.md 的成片提示词字段。
```

---

## 6. 验收标准 Acceptance Criteria (DoD)

- **AC-1（术语，对应 FR-01）**：`audit_terminology.py` 全仓运行**输出 0 违规**；`glossary.md` 含 3 概念四列；对 `D02/D08-NFR-05` 所指"5维/8维混用"的历史计数，脚本报告**归零**。
- **AC-2（文件树+版本，对应 FR-02）**：DESIGN 树与 README 树条目集合 `diff` = **0 行实质差异**；`audit_versions.py` **无 ⚠️**；`VERSIONS.md` 记录数 = 实测契约文件数（8）。
- **AC-3（真机基线，对应 FR-03）**：`production-bible/examples/<案名>-真机基线/` 存在四表 + manifest；`audit_bible_interlock.py` 四不变量**全过**（悬空引用=0 / 未用关键 asset=0 / 状态轴逆序=0 / L1 漂移=0）；该分镜表过引擎隐身检**0 泄漏**。
- **AC-4（双向同步，对应 FR-04）**：`_megaprompts/` = **5 个文件**；`audit_megaprompt_sync.py` **0 漂移**；反证测试——故意改一处源计数，脚本**必报红**。
- **AC-5（出师+安装包，对应 FR-05）**：`dist/*.zip` 解压到空 skills 目录后 `verify_install.py` **全绿**；`luban-report.md` 含三把尺结论 + 出师证书结果卡；zip 内 `VERSION` == `VERSIONS.md`。
- **AC-6（隔离铁律，对应 NFR-01）**：对全仓 `*.out.md` 成片字段做泄漏扫描（方法论/支柱编号/审计术语），**0 命中**。
- **AC-7（可移植+性能，对应 NFR-02/03）**：脚本仅依赖标准库；全套审计单次运行 **< 10s**；换空目录仍可运行。

> 全部 AC 不含"提升质量"类空话——每条都是"对基线/全仓重跑，X 项审计 0 违规 / 产物存在性 / 数值阈值"。

---

## 7. 验证方案 Verification Plan

**验证手段。**
1. **静态审计回归（FR-01/02/04）**：四个 `audit_*.py` 即回归本身——它们把"口径一致 / 版本对齐 / 单文件不漂"变成可重复运行、可挂 CI 的布尔门。每次改文档后重跑，**diff 由人眼判断降级为脚本判定**（迁移自电商全案"量化审计"范式：用阈值不用人眼）。
2. **真机活体对账（FR-03，luban 活体尺）**：选真实剧本跑全案，留 `examples/<案名>-真机基线/`。验证不是"看着像对"，而是**四互锁不变量逐项布尔校验** + 对分镜表跑引擎隐身检。这是 luban"绿色 CI 会撒谎、要拉真实产物对账"的直接落地。
3. **守门有效性反证（FR-01/04）**：故意注入一处违规（术语别名 / megaprompt 计数偏移），确认脚本**报红**——证明门不是橡皮图章。
4. **装机烟测（FR-05）**：把打出的 zip 解压到一个**全新空目录**，跑 `verify_install.py`，证明"换机即用、装完即绿"（同时验 NFR-02 可移植）。

**测试用例 / 基线。**
- 基线 B1：`examples/<案名>-真机基线/`（FR-03 产物，互锁审计的回归锚）。
- 用例 T1：注入 `README` 写"五维管线" → `audit_terminology.py` 必报 1 违规。
- 用例 T2：把 props-roster 头改 v1.1 但不更新 VERSIONS → `audit_versions.py` 必报版本失配。
- 用例 T3：style-refs 283→284 不同步 megaprompt → `audit_megaprompt_sync.py` 必报漂移。
- 用例 T4：在真机基线分镜表故意删一个 prop 定义 → `audit_bible_interlock.py` 必报悬空引用。

**为何这样能证明"真的有效"。** 缺口类 C 的本质是"没秤没回归"。D13 的有效性不靠主观"看起来统一了"，而靠**四把布尔秤 + 一条真机基线 + 反证注入**：①一致性变成脚本可判定的 0/1；②最关键、过去唯一没验证过的链路（全案互锁）有了**可重跑的产物基线 + 不变量审计**；③反证用例证明门会真的拦截违规，而非永远绿。三者合一，"统一/对齐/不漂"从口头承诺变成**可回归的事实**。

**落地可靠性理由（4/5）。** 高把握：FR-01/02/04/05 是纯文本扫描 + 打包，技术风险极低，全在标准库内完成，且本仓已有 `tools/build_windows_onefile.py` 等打包先例可借。扣 1 分在 FR-03：全案真机基线依赖一个真实剧本的端到端跑通与人工选案，且"覆盖完整/状态轴单调"两条不变量的自动判定需要 roster 字段足够规整（现有 roster 已具备 asset_id/状态轴字段，但真机产物的字段填充质量需一次人工兜底），故不是 5/5。

---

## 8. 依赖与顺序 Dependencies

- **承接并执行 `D02-NFR-05` / `D08-NFR-05`**：这两条"统一为情感优先六维口径"的悬空承诺由 D13-FR-01 真正落地，D13 是它们的执行体。
- **被所有其它 D 方向依赖（横切基线）**：D13 的 `VERSIONS.md` 与 `audit_*` 一旦建立，**后续任何方向新增成员 / 升级契约都应进矩阵、过审计门**——D13 是其它方向的"产品化地基"，建议**优先于大规模新增成员（如 D08 image-genome / D10 新成员）落地**，否则新增物又会绕过秤。
- **宿主能力**：仅依赖 Python 标准库（NFR-02）；不依赖幻映 server / 网络 / 计费模型。
- **luban skill（已装）**：FR-05 出师流程直接调用。

**建议顺序**：FR-01（术语，最广影响）→ FR-02（树+版本台账）→ FR-04（同步门，需 VERSIONS 就位）→ FR-03（真机基线）→ FR-05（出师+打包，聚合前四者）。

---

## 9. 风险与缓解 Risks & Mitigations

| 风险 | 表现 | 缓解 |
|---|---|---|
| **术语收敛改坏 Soul 措辞** | 为统一称谓误改 tacit-core 推理逻辑 | NFR-01 铁律：tacit-core 仅只读核对、预期零改；术语脚本只校"对外称谓"不碰算子；改动经引擎隐身检兜底 |
| **审计脚本产物漏进成片** | `.audit/` 内容被误拼进 megaprompt/分镜 | NFR-01 物理隔离 + AC-6 对全仓 `*.out.md` 做泄漏扫描；megaprompt 同步锚仅是 HTML 注释，渲染/复制时不入正文 |
| **真机基线选案不具代表性** | 选了太简单的剧本，四不变量"假过" | FR-03 选案须含≥1 个有状态轴的叙事道具 + ≥2 个跨镜复用 asset，使四不变量都被真正触发；manifest 记录选案理由 |
| **megaprompt 同步门维护成本** | 每改 `_shared/` 要手动同步 5 个单文件 | 同步锚 `facts:` 只校"关键事实"（版本/计数/称谓）而非全文，降低同步面；脚本报红即定位到具体块，不必全文 diff |
| **版本矩阵与文件头双写漂移** | VERSIONS 与文件头各填各的 | `audit_versions.py` 把"文件头==台账"做成硬校验，双写不一致即非绿，从机制上禁止漂移 |
| **luban 出师流于形式** | 拿证书但没真验 | 出师证书的"通过项"必须逐条引用 AC-1~AC-7 的脚本输出，无脚本绿则证书不签发 |

---

## 10. 工作量与里程碑 Effort & Milestones

**粗估：约 2.0 人周。**

- **M1 · 口径地基（FR-01 + FR-02）— 0.6 人周**：写 `glossary.md` + `VERSIONS.md`；收敛 DESIGN/README/megaprompt 措辞与文件树；落 `audit_terminology.py` + `audit_versions.py`。**门**：AC-1、AC-2 全绿。
- **M2 · 同步门（FR-04）— 0.4 人周**：补 production-bible megaprompt（第 5 个）；为 5 个 megaprompt 加 sync-source 锚；落 `audit_megaprompt_sync.py` + T3 反证。**门**：AC-4。
- **M3 · 真机基线（FR-03）— 0.6 人周**：选真实剧本跑全案四表，落 `examples/<案名>-真机基线/`；落 `audit_bible_interlock.py` + T4 反证；分镜表过引擎隐身检。**门**：AC-3、AC-6。
- **M4 · 出师与打包（FR-05）— 0.4 人周**：`verify_install.py` 聚合四审计；`build_skill_pack.py` 出 zip + INSTALL.md；跑 luban 三把尺出 `luban-report.md` + 出师证书结果卡。**门**：AC-5、AC-7，装机烟测全绿。

**关键路径**：M1 → M2/M3（可并行）→ M4。M4 是聚合门，前三个里程碑的审计脚本是它的输入。

---

> **契约版本**：D13 PRD Draft v0.1 ｜ 缺口类 C（无秤无回归）｜ 优先级 P2 ｜ 落地可靠性 4/5 ｜ 不新增创作能力、不动 Soul（引擎隐身/可移植双不破）；新增物全落 Skin 工程外壳（glossary / VERSIONS / 第5个 megaprompt / 真机基线 / 4 审计脚本 / 打包+出师）；承接执行 D02/D08 悬空的"情感优先六维口径统一"NFR-05，是其它方向的产品化地基。
