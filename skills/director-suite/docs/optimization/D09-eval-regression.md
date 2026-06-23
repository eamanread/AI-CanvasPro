# D9 · 评测回归基线套件（Eval & Regression Baseline Suite）

> 编号 D9 ｜ 缺口类 C（无秤无回归）｜ 优先级 P0 ｜ 状态 Draft v0.1 ｜ 落地可靠性自评 5/5

---

## 1. 问题陈述 Problem

**现状（引 director-suite 具体文件）：**

director-suite 整套件**只有一个端到端基线产物**，且它的"全绿"是 agent 文字自报、不是脚本判据：

- **唯一基线只有《翡翠楼夜宴》一题**：`production-bible/examples/翡翠楼-全案demo.md` + `storyboard/examples/fewshot-翡翠楼夜宴-v2全片.md`。这是一道**典型文戏 / 商战题材**（`翡翠楼-全案demo.md:20`「笑里藏刀的步步绞杀」、文戏对峙、室内对白）。武戏（高速动作/手持/打斗节拍）、POV 互动、商业广告（白底产品/LOGO/电商一致性）、拟人风格化（动物拟人/非写实主体）这四类题材**在基线集里完全缺席**——一旦它们的特征被某次 `_shared/` 改动劣化，套件**没有任何样本能暴露出来**。
- **"自动审计全绿"是文字自报，不是脚本**：`翡翠楼-全案demo.md:9`「块A·实体台账 / **过程审计**」与该 demo 的 §6 自检，是 agent 用自然语言自报"焦点 vs 从属已分清""asset_id 全片唯一且合规范"——**没有被测量的数、没有可被第三方重跑的判据**。`storyboard/output-contract.md:163-174` §7「输出前自检」9 条同样是写给 agent 自己跑的**散文勾选项**，跑没跑、跑没跑对，外部无法验证。
- **改 `_shared/` 无回归秤**：`_shared/` 下 8 个文件（`tacit-core.md`/`mapping-tables.md`/`dimensions.md`/`pro-params.md`/`style-refs.md`/`continuity-quality.md`/`asset-id-convention.md`/`seedance-2.0.md`）是**全成员共享的"骨"与"灵魂"**（见 `README.md:14`）。改其中任何一个（如调情绪×景别映射、换风格库、改连续性阈值），**对全部成员、全部题材生效**，但套件**没有"改前 vs 改后、是否劣化"的对账机制**——只能靠"再让 agent 跑一遍翡翠楼，看上去还行"这种主观、单题、不可重跑的方式。这正是缺口类 **C（无秤无回归）** 的教科书形态。
- **没有"期望特征清单 + 红线"的可判据基线契约**：现有 demo 是**一份成品**，不是**一份带"这道题必须命中哪些特征、绝不能出现哪些红线"的测题卡**。于是"翡翠楼这次跑得对不对"无客观标尺；换一道新题更无从判起。

**痛点（为何是问题）：**

1. **单题盖不住多题材 → 改 `_shared/` 是盲改**。映射表/风格库/连续性是横切全题材的，但唯一基线是文戏。改完在翡翠楼上"看着没退化"，**完全不能证明武戏的高速运镜节拍、POV 的第一人称连续性、商业的白底 LOGO 一致性、拟人的风格锁没被砸**。一处改动可能静默劣化三类题材而无人知。
2. **文字自报审计会撒谎 → 假安全感**。agent 倾向报告成功；"自动审计全绿"没有失败模式。一个连"期望特征是否命中、红线是否触发"都由被测者自己用自然语言宣布的审计，等于没有审计。
3. **无回归对账 → 每次升级都是裸奔**。D-series 其它方向（D1 执行契约、D2 反向拉片、D3 多模型、D4 运镜、D6 音频、D7 静帧、D8 一图成片…）几乎都要动 `_shared/` 或新增成员。**没有一杆"改完重跑、逐题逐项 diff 是否劣化"的秤，所有后续方向的迭代都不安全**——这就是方向简报说的"其余方向安全迭代的前置秤"。
4. **D5 建了"图层的秤"，但没有"文本契约层的秤"**。`D05-consistency-audit.md` 已给出对**生成出来的图**的数值审计（轮廓/HSL/LOGO 偏移）。但 director-suite 的**主产物是镜头卡 + Seedance 提示词（文本契约）**——映射是否守强制项、字段是否齐全、引擎是否泄漏、题材特征是否命中、红线是否触发，这些是**文本契约层**的检查，D5 不覆盖。D9 补的正是这把"文本契约层 + 多题材 + 可重跑回归"的秤。

---

## 2. 证据与接地 Evidence

**哪些源 skill 有此能力（点名）：**

- **电商全案 skill（量化审计 + 基线档案·母范式）**：方向简报点名其有"**量化一致性审计**（轮廓±5% / HSL 色相±15° / LOGO Δ0.05 / 白底 RGB≥245）+ **产品基线档案** + 图像模型分级"。这证明源生态里"**先固化一份基线档案 + 一组量化阈值，再对照判定**"是成熟范式。D9 把它从"单产品的图层档案"**泛化成"多题材的测题卡 + 文本契约审计"**——基线档案 → eval 题卡，量化阈值 → 期望特征/红线判据。
- **AI 短剧 skill（失败-修复对照表 + 内切镜时长经验表）**：方向简报点名其有"**失败-修复对照表**""**内切镜时长经验表**"。这证明源生态把审计结果做成**结构化"特征→偏差→动作"**，而非一句"看着不对"。D9 的回归对账报告（劣化项 → 哪条特征丢了 → 哪个 `_shared/` 改动嫌疑）直接同构此范式。
- **Flova 平台流水线（强制暂停门 + 依赖 DAG）**：`planner→multimodal_analyze_tool→storyboard_designer→media_generator→video_assembler` 带**强制暂停门**。证明"审计是流水线标准一环、卡门放行"是源生态共识。D9 把"回归门"做成可卡 CI 的门（劣化 → NO-GO，不放行 `_shared/` 改动合入）。
- **拉片复刻 skill（参考视频→镜头拆解→换主体保剪辑点）**：证明源生态有"**对一段参考抽取可量化特征清单**"的标准动作。D9 的"每题期望特征清单"正是同构能力——把一题的"应当命中的视听特征"抽成可判据清单。

**director-suite 盲点落在哪个文件/成员：**

| 盲点 | 现落在哪 | 缺什么 |
|---|---|---|
| 多题材冷启动基线 | 仅 `production-bible/examples/翡翠楼-全案demo.md`（**单题·文戏**）+ `storyboard/examples/fewshot-翡翠楼夜宴-v2全片.md` | 缺 武戏/POV/商业/拟人 各 1 道**带期望特征+红线**的测题卡 |
| 机器可跑审计 | `storyboard/output-contract.md:163-174` §7（**散文自检**）、demo §6（**文字自报**） | 缺脚本化、可重跑、产 JSON 判据的审计器 |
| 回归对账（改 `_shared/` 是否劣化） | **完全没有文件** | 缺 baseline 快照 + diff 对账 + GO/NO-GO 门 |
| 文本契约层的秤 | `D05-consistency-audit.md` 只审**图**（像素层） | 缺审**镜头卡/Seedance 提示词**（文本契约层）的秤 |
| 测题卡格式 | demo 是**成品**不是**测题** | 缺"输入剧本 + 期望特征清单 + 红线 + 评分规则"的 eval 题卡 schema |

**结论：** director-suite 有"骨"（`_shared/` 知识）、有"皮"（输出契约），但**没有一台"对着多题材测题、机器判分、改 `_shared/` 后回归对账"的秤架**。本方向新增 **`_eval/`** 目录：① 五题材冷启动基线集（带期望特征 + 红线）② 文本契约审计脚本（复用 D5 的脚本范式与隐身闸）③ 回归对账器（baseline 快照 + diff + GO/NO-GO 门）。**作为开发期护栏（Skin 之外，不进任何成片）**。

---

## 3. 目标与非目标 Goals / Non-Goals

**Goals：**

- **G1（多题材建样本）**：建 `_eval/cases/` —— **文戏 / 武戏 / POV / 商业 / 拟人 各 1 道**冷启动测题卡（共 5 道，文戏直接锚定既有翡翠楼，其余 4 道新建），每道含 `{输入剧本片段, 期望特征清单 expected_features, 红线 red_lines, 评分规则}`。
- **G2（建可跑审计秤）**：实现 `_eval/scripts/audit_storyboard.py`——对一份**镜头卡 + Seedance 提示词成片产物**跑机器可判检查项（字段齐全 / 强制映射守没守 / 引擎隐身 0 泄漏 / 期望特征命中率 / 红线 0 触发 / 时长制无绝对时码），输出结构化报告（JSON+MD），**复用 `D05-consistency-audit.md` 的 Drift Report 结构、退出码语义与隐身闸**。
- **G3（建回归对账门）**：实现 `_eval/scripts/regression_diff.py` + `_eval/baseline/` 快照——改任何 `_shared/` 后，对 5 道题重跑审计、与冻结基线 diff，断言"**无新增红线、无特征命中率下降、无新增字段缺失**"，否则判 **NO-GO（劣化）**，作为 `_shared/` 改动的回归门。
- **G4（作为开发期护栏，明确隔离）**：`_eval/` 整目录是**开发期工具**，与 `_megaprompts/`（即用产物）、各成员 `output-contract.md`（成片契约）**物理隔离**；eval 产物（测题卡/审计报告/baseline 快照）**绝不进任何成片、绝不被 agent 当 fewshot 搬运题材**。
- **G5（becomes 其余方向的前置秤）**：把 D9 定位成 D-series 的**地基护栏**——任何动 `_shared/` 或新增成员的方向（D1–D8 等），合入前必须过 D9 回归门。

**Non-Goals（明确边界）：**

- **NG1（不破引擎隐身·铁律）**：eval 题卡、审计脚本、审计报告、baseline 快照、回归 diff 输出**全部是开发期/过程产物**，**绝不可漏进成片**——不进镜头卡、不进 Seedance 提示词、不作为"评测✓/全绿"脚注附在任何成片表尾，**也不可作为 fewshot 把题卡里的题材/台词搬进真实剧本输出**（既要防"审计泄漏进成片"，又要防"测题被当样本污染创作原创性"）。本铁律继承 `storyboard/output-contract.md:170-172` §7.6/§7.8 与 `tacit-core.md:67` 引擎隐身检，并扩展到"**评测层 ≠ 成片层、评测样本 ≠ 创作样本**"。
- **NG2（不破可移植性）**：`_eval/cases/*` 与 baseline 是**纯 Markdown/JSON 知识**，零宿主绑定；脚本 `audit_storyboard.py`/`regression_diff.py` 仅依赖 **Python 标准库 + PyYAML**（文本/正则/JSON 处理，**不依赖任何宿主 App / `127.0.0.1:8777` / 图像库**），且**脚本不可得时仍可降级**为"按题卡 schema 由模型读产物逐项打分"的模型审模式（脚本是确定性加固、非硬依赖）。
- **NG3（不是美学评分器）**：D9 审"**特征命中没命中、红线触没触发、契约合不合规、改 `_shared/` 劣化没劣化**"（结构与回归），**不评**"画得美不美/构图好不好/哇塞度高不高"（品味）。美学评测属品味缺口（D 类）另案，与本案正交。
- **NG4（不替代真机出片审计 / 不替代 D5）**：D9 审的是**文本契约层产物**（镜头卡 + Seedance 提示词）。**生成出来的图/视频**的像素层一致性审计走 **D5（`audit_consistency.py`）**；二者并行、互补、不重叠（D9=文本契约层秤，D5=图层秤）。
- **NG5（不改既有契约语义 / 不新增 `_shared/` 知识）**：D9 **只消费**既有 `_shared/` 规则（映射强制项 / 引擎隐身词表 / 时长制 / asset-id 约定）作为审计判据来源，**不新增/不修改**任何 `_shared/` 知识、不改 `output-contract.md` v2.0 字段定义。审计判据**引用**既有规则，不发明新规则。

---

## 4. 需求 Requirements

### 4.1 功能需求 FR

**D9-FR-01 ｜ 多题材冷启动基线集（5 题测题卡 + 期望特征 + 红线）**
- 描述：在 `_eval/cases/` 建 **5 道**测题卡，覆盖 **文戏 / 武戏 / POV / 商业 / 拟人**，每道一个 `case-<genre>.md`（人读题卡）+ `case-<genre>.yaml`（机读判据）。`yaml` 含固定字段：`{case_id, genre, script_excerpt(冷启动输入剧本片段,原创·不抄示例), expected_features[](每条={id, desc, detector, weight}), red_lines[](每条={id, desc, detector}), pass_rule(命中率阈值)}`。`detector` 是机读判据（正则/字段存在/枚举命中），不是自由文本。每题期望特征须落到该题材的**判别性视听特征**（如武戏：手持/高速运镜命中、情绪 4–5 级切点密、单镜≤2.5s 占比；POV：第一人称视点连续、视线匹配切镜；商业：白底/LOGO/产品一致性字段；拟人：风格核心锁定非写实主体且全片不漂）。
- 可量化验收：① `_eval/cases/` 下恰好 5 个 `genre ∈ {文戏,武戏,POV,商业,拟人}` 的题卡，无缺无重；② 每题 `expected_features` ≥ 5 条、`red_lines` ≥ 3 条，**每条 detector 非空且可机读**（脚本能据 detector 自动判命中/触发，无需人解释）；③ 文戏题 `case_id` 锚定既有翡翠楼（`script_excerpt` 引同一题材但题卡判据可独立跑），其余 4 题 `script_excerpt` 为**原创剧本片段**（不搬任何示例/参考片题材台词，过 `tacit-core.md:66` 题材原创检）；④ 五题 `pass_rule` 给出明确命中率阈值（如 `expected_features 加权命中 ≥ 0.85 且 red_lines 触发 = 0`）。

**D9-FR-02 ｜ 文本契约审计脚本 `audit_storyboard.py`（机器可跑·复用 D5 范式）**
- 描述：实现 `_eval/scripts/audit_storyboard.py`：输入 `--case <case.yaml> --output <被审成片产物.md>`，对镜头卡 + Seedance 提示词跑 **6 类机器可判检查**：① **字段齐全**（每镜头组/镜头按 `output-contract.md` §3/§4 固定字段无空缺）；② **强制映射守没守**（景别-情绪强制项：无 5 级中景、无 ≤2 级无理由特写，按 `output-contract.md` §2.1）；③ **时长制无绝对时码**（正则 `\d+:\d{2}`/`\d+–\d+s` 壁钟轴命中=0）；④ **引擎隐身 0 泄漏**（词表 `Polanyi|默会|格式塔|寓居|支柱|方法论|情绪强度N级标注外显|自检确认|Σ镜时长`，命中=0）；⑤ **期望特征命中**（按 case 的 `expected_features[].detector` 逐条判命中，算加权命中率）；⑥ **红线触发**（按 `red_lines[].detector` 逐条判，触发即记）。输出**复用 `D05-consistency-audit.md` 的 Drift Report 结构**：逐检查项行 `{check_id, expected, found, verdict ∈ PASS/⚠️WARN/FAIL/NEEDS_HUMAN}` + 尾结论 `{fail/redline 计数, hit_rate, decision GO/NO-GO, 失败项→建议动作}`，产 JSON+MD 双格式，**`exit 0`=GO / `exit 1`=有红线或未达 pass_rule**。
- 可量化验收：① 对一份**故意合规的产物**（按题卡造的全命中样本）→ 全 PASS、红线触发=0、`exit 0`、`hit_rate ≥ pass_rule`；② 对一份**故意注入 1 处红线**的产物（如塞入「自检确认：Σ镜时长=12s」脚注 → 触发引擎隐身红线）→ 该红线 FAIL、`exit 1`、报告指明触发的 `red_line.id`；③ 对一份**故意违强制映射**的产物（情绪 5 级配中景）→ 强制映射检 FAIL；④ 难判项（如"哇塞度""情绪曲线是否动人"）输出 `NEEDS_HUMAN` 行、不臆造分数；⑤ 同输入重跑两次，JSON 报告（排除时间戳元数据后）逐字节一致（确定性，便于回归 diff）；⑥ 脚本仅依赖 Python 标准库 + PyYAML，`--help` 可独立运行。

**D9-FR-03 ｜ 回归对账器 `regression_diff.py` + baseline 快照（改 `_shared/` 是否劣化）**
- 描述：实现 `_eval/scripts/regression_diff.py` + `_eval/baseline/<case_id>.report.json`（冻结的基线审计报告）。流程：改 `_shared/` 后 → 对 5 题各跑 `audit_storyboard.py` 得**当前报告** → `regression_diff.py --baseline _eval/baseline/ --current <当前报告目录>` 逐题逐项对比，判**劣化**定义为下列任一：(a) **新增红线触发**（基线 0、当前 >0）；(b) **特征加权命中率下降**（`current.hit_rate < baseline.hit_rate - ε`，ε 默认 0.0，即不允许任何下降）；(c) **新增字段缺失**（基线 PASS、当前 FAIL 的字段齐全项）；(d) **新增引擎隐身泄漏**。任一劣化 → 该题 NO-GO；任一题 NO-GO → 整体 NO-GO、`exit 1`，报告列出**劣化题 → 劣化项 → 嫌疑 `_shared/` 改动**（读 `git diff --stat` 的 `_shared/` 范围给嫌疑指针，对齐 AI 短剧"失败-修复对照表"）。允许**显式 re-baseline**（`--accept` 把当前快照升为新基线，需带改动说明，留痕）。
- 可量化验收：① **不改 `_shared/` 重跑** → 5 题全 GO、`exit 0`、diff 报告 0 劣化项（确定性自洽，证明秤本身稳定）；② **构造一处劣化改动**（如临时把 `mapping-tables.md` 情绪-景别映射打乱）→ 至少 1 题命中率下降或红线新增 → 整体 NO-GO、`exit 1`、报告指出劣化题与嫌疑文件 `_shared/mapping-tables.md`；③ `_eval/baseline/` 含 5 题各一份冻结 `report.json`，`re-baseline` 路径需 `--accept` 显式触发且写入 `_eval/baseline/CHANGELOG.md` 一行说明（防静默把劣化"洗成"新基线）；④ `regression_diff.py` 仅依赖标准库，确定性、可重跑。

**D9-FR-04 ｜ 引擎隐身闸 + 评测/创作样本隔离（铁律落地）**
- 描述：在 `_eval/README.md` 写明三条隔离铁律并在脚本与目录结构上落地：(a) **审计产物不进成片**——审计报告/baseline/diff 只存 `_eval/` 与 `.eval/` 过程目录，严禁作为字段/脚注/参考进入镜头卡或 Seedance 提示词；(b) **测题样本不进创作**——`_eval/cases/*.script_excerpt` 是**测题输入**，agent 跑真实用户剧本时**严禁**把题卡里的题材/场景/台词当 fewshot 搬运（违 `tacit-core.md:66` 题材原创检）；(c) **评测词表零外显**——审计/评测术语（eval/regression/baseline/red_line/hit_rate/detector/审计/评测）与引擎术语（Polanyi/默会/格式塔/支柱/方法论）**绝不出现在成片侧**。配套**隐身专项 grep**：对成片镜头卡 + Seedance 提示词扫上述两类词表，命中=0；并构造**反例**（故意把一行审计报告塞进镜头卡 → grep 必报命中，证明闸是真闸）。在 `storyboard/output-contract.md:172` §7.8 与 `tacit-core.md:67` 各加一条交叉引用指针（指向 `_eval/`，**不改既有条款文字**）。
- 可量化验收：① `_eval/README.md` 含上述三条隔离铁律明确语句；② 对一份含审计报告的运行产物，grep 成片镜头卡/Seedance 提示词中 `eval|regression|baseline|red_line|hit_rate|detector|评测✓|审计✓|Polanyi|默会|格式塔|支柱|方法论`，命中 **= 0**；③ 反例：故意注入一行审计报告 → 隐身 grep **报命中**（闸有效）；④ `output-contract.md §7.8`、`tacit-core.md` 各新增 1 条交叉引用注脚，原条款文字未改（`git diff` 仅见追加）。

**D9-FR-05 ｜ 回归门接 CI / 开发期工作流（前置秤落地）**
- 描述：在 `_eval/README.md` + `README.md` 写明 D9 在**开发期工作流**中的挂载位：**任何动 `_shared/` 或新增成员的改动，合入前必须跑 `regression_diff.py`，NO-GO 则不合入**（劣化先修或显式 re-baseline 并说明）。提供一个一键入口 `_eval/scripts/run_eval.sh`（或 `.py` 跨平台）：跑全 5 题审计 → 回归对账 → 打印 GO/NO-GO 汇总。明确这是**护栏不是终判**：难量化的品味项保留人评分支，但**结构/红线/回归三类机器项 NO-GO 即硬阻断**。
- 可量化验收：① `run_eval.sh`（或等价跨平台脚本）一条命令跑完 5 题审计 + 回归对账，打印每题 GO/NO-GO + 整体结论 + 非零退出码；② `README.md`「维护」节追加"改 `_shared/` 前后跑 `_eval/` 回归门"的明确指引；③ 整体 NO-GO 时退出码非零（可被 CI/pre-commit 消费）；④ 文档写明"机器项硬阻断、品味项人评、二者分区"，不混判。

### 4.2 非功能需求 NFR

**D9-NFR-01 ｜ 引擎隐身 + 评测/创作样本双隔离（最高优先级铁律）**
- 评测全链路（题卡 / 审计脚本 / 报告 / baseline / diff 输出）均为开发期产物，**绝不进成片、绝不被当 fewshot 搬进创作**；评测术语与引擎术语在成片侧零出现。验收：FR-04 的双词表 grep 命中均=0 + 反例 grep 报命中（DoD-4）。

**D9-NFR-02 ｜ 可移植性**
- 题卡/baseline 纯 Markdown/YAML/JSON、零宿主绑定；脚本仅 Python 标准库 + PyYAML，不绑宿主 App / 不出现 `127.0.0.1:8777` 痕迹 / **不依赖图像库**（纯文本契约审计）；**脚本缺失时审计可降级为模型按题卡 schema 逐项打分的模型审模式**（套件不因没装脚本而瘫）。验收：`_eval/` 内无运行时强依赖；脚本头注明"可选确定性加固、缺失走模型审分支"。

**D9-NFR-03 ｜ 确定性与可重跑（回归门核心）**
- 同一 (题卡, 被审产物) 输入，`audit_storyboard.py` 输出报告（排除时间戳元数据区后）**逐字节可复现**（无随机、判定不依赖时间戳）；`regression_diff.py` 不改 `_shared/` 重跑必 0 劣化。验收：连续 2 次审计 JSON diff=0（FR-02⑤）；空改动回归 diff=0 劣化（FR-03①）。

**D9-NFR-04 ｜ 性能 / 成本**
- 文本契约审计是**本地文本处理**，单题审计应**亚秒级、0 次付费模型调用**；全 5 题审计 + 回归对账应在常规笔记本 **< 10s**（纯文本/正则/JSON，无图像、无模型）。真机出产物（让 agent 跑题生成镜头卡）属上游、非脚本成本；"模型审"降级分支按需触发、不默认每题调模型。验收：脚本路径 5 题端到端 < 10s；脚本路径付费调用数=0。

**D9-NFR-05 ｜ 与既有契约一致（不制造新矛盾 / 不重复 D5）**
- 审计判据**全部引用既有规则**（强制映射引 `output-contract.md §2.1/§3/§4`、引擎隐身词表引 `tacit-core.md:67`+`output-contract.md §7.6`、时长制引 `output-contract.md §0/§5`），**不发明新阈值、不新增 `_shared/` 知识**；与 D5 不重叠（D9=文本契约层、D5=图层）。验收：审计脚本每条 check 注明引用的既有规则出处；与 D5 检查项重叠数=0（D9 不审像素、D5 不审镜头卡字段）。

---

## 5. 设计 Design

### 5.1 新增 / 改动文件精确路径清单

**新增（核心目录 `_eval/`）：**
```
skills/director-suite/_eval/README.md                              # _eval 总说明 + 三条隔离铁律 + 开发期工作流挂载位（开发期护栏）
skills/director-suite/_eval/cases/case-wenxi.md     + case-wenxi.yaml     # 文戏（锚定翡翠楼·题卡判据独立）
skills/director-suite/_eval/cases/case-wuxi.md      + case-wuxi.yaml      # 武戏（高速动作/手持/急切点）
skills/director-suite/_eval/cases/case-pov.md       + case-pov.yaml       # POV 互动（第一人称视点连续）
skills/director-suite/_eval/cases/case-shangye.md   + case-shangye.yaml   # 商业广告（白底/LOGO/产品一致性）
skills/director-suite/_eval/cases/case-nirenhua.md  + case-nirenhua.yaml  # 拟人风格化（非写实主体·风格锁全片不漂）
skills/director-suite/_eval/scripts/audit_storyboard.py            # 文本契约审计（6类机器检查，产Drift Report·复用D5结构）
skills/director-suite/_eval/scripts/regression_diff.py             # 回归对账（baseline vs current·GO/NO-GO·嫌疑指针）
skills/director-suite/_eval/scripts/run_eval.py                    # 一键入口：全5题审计→对账→汇总（跨平台）
skills/director-suite/_eval/baseline/<case_id>.report.json (×5)    # 5题冻结基线审计报告（回归对账基准）
skills/director-suite/_eval/baseline/CHANGELOG.md                  # re-baseline 留痕（每次 --accept 写一行说明）
skills/director-suite/docs/optimization/D09-eval-regression.md     # 本 PRD（已落盘）
```

**改动（4 处，均为追加/注册，不改既有语义）：**
```
skills/director-suite/storyboard/output-contract.md
  - §7.8「自检不外显」末追加交叉引用：「→ 开发期评测/回归审计与隔离铁律见 _eval/README.md；评测产物同属过程，绝不进成片」（原铁律文字不动）
skills/director-suite/_shared/tacit-core.md
  - §三.6「引擎隐身检」末追加交叉引用：「→ 评测样本(_eval/cases)亦不得当 fewshot 搬进创作；评测层隔离见 _eval/README.md」（原条款文字不动）
skills/director-suite/README.md
  - 「维护」节追加一行：改 _shared/ 或加成员前后跑 _eval/ 回归门（NO-GO 不合入）；目录结构树追加 _eval/ 节点（标注"开发期护栏·非成片"）
skills/director-suite/_shared/continuity-quality.md
  - 末尾追加一行指针：→ 多题材文本契约回归基线见 _eval/（与 D5 图层审计互补：D9 审镜头卡/提示词、D5 审图）（原条款不动）
```

**只读消费、不改：** `storyboard/output-contract.md`（强制映射/字段/隐身判据来源）、`_shared/tacit-core.md`（隐身词表来源）、`_shared/mapping-tables.md`（情绪×景别映射判据）、`production-bible/examples/翡翠楼-全案demo.md`（文戏锚）、`D05-consistency-audit.md`（复用其 Drift Report 结构与隐身闸范式）。

### 5.2 挂进 Soul / Bone / Skin 哪层

- **Skin 之外 · 开发期护栏层（明确不在三层之内）**：`_eval/` **不是** Soul/Bone/Skin 任何一层——它不产导演判断（Soul）、不新增视听知识（Bone）、不产成片契约（Skin）。它是**横切三层的开发期质量护栏**，**对三层的产物（镜头卡/提示词）做秤、对三层的改动（尤其 Bone 层 `_shared/`）做回归门**。这与 `_megaprompts/`（即用产物）一样位于"成员目录之外"，但语义相反：`_megaprompts/` 是**对外即用**、`_eval/` 是**对内护栏**。
- **主要监视对象 = Bone 层 `_shared/`**：因为 `_shared/` 改动横切全成员全题材，D9 的回归门**主要为保护 Bone 层改动而存在**（也覆盖新增成员的产物质量）。
- **Soul（灵魂 · 零改动）**：不触碰 `tacit-core.md` 知识（仅追加 1 条交叉引用指针）；引擎隐身铁律被本工具**继承并扩展**为"评测层不漏成片 + 评测样本不污染创作"。D9 是 Soul 内部"自检"的**可重跑外化**——把 Soul 的定性自检，落成 `_eval/` 层可重跑的机器秤，但秤的读数与测题永不外显进成片、永不当创作样本。

### 5.3 关键 schema / 契约字段 / 算法

**(A) eval 测题卡 schema（FR-01，`case-<genre>.yaml`）**
```yaml
case_id: "wuxi-01"
genre: "武戏"                       # 文戏 | 武戏 | POV | 商业 | 拟人
script_excerpt: |                   # 冷启动输入剧本片段（原创·不抄示例，过题材原创检）
  暴雨夜，废弃工厂。陈烬被三人围在中央，铁链甩出……（原创片段，约150–300字）
expected_features:                  # 期望特征（≥5）：每条 detector 机器可判
  - id: F1
    desc: "高速动作段强制手持/斯坦尼康运镜命中"
    detector: { type: regex, target: 镜头卡, pattern: "运镜：.*(手持|Handheld|斯坦尼康|Steadicam)" }
    weight: 0.25
  - id: F2
    desc: "高潮打斗段情绪 4–5 级、切点密（单镜≤2.5s 占比≥60%）"
    detector: { type: ratio, metric: shots_le_2_5s, threshold: 0.60 }
    weight: 0.25
  - id: F3
    desc: "动作匹配/甩切类切镜方式出现（武戏衔接）"
    detector: { type: enum_present, field: 切镜方式, any_of: ["动作匹配","甩切","硬切"] }
    weight: 0.20
  - id: F4
    desc: "焦段-景别自洽（特写不配14mm广角）且光影分层含色温K+亮度%"
    detector: { type: field_consistency, rule: "focal_vs_shotsize && light_has_K_and_pct" }
    weight: 0.15
  - id: F5
    desc: "每镜头组恰一段 Seedance 提示词、含音效数字化（dBFS/Hz）"
    detector: { type: regex, target: prompt, pattern: "(dBFS|Hz)" }
    weight: 0.15
red_lines:                          # 红线（≥3）：触发即 FAIL
  - id: R1
    desc: "引擎隐身泄漏：成片含哲学术语/自检脚注"
    detector: { type: regex_forbidden, target: 成片, pattern: "Polanyi|默会|格式塔|寓居|支柱|方法论|自检确认|Σ镜时长" }
  - id: R2
    desc: "出现绝对时间码（破时长制）"
    detector: { type: regex_forbidden, target: 全文, pattern: "\\d+:\\d{2}|\\d+–\\d+s\\b壁钟" }
  - id: R3
    desc: "强制映射违例：情绪5级配中景及更松 / ≤2级无理由特写"
    detector: { type: mapping_violation, table: "output-contract.md §2.1" }
pass_rule:                          # 通过判据
  feature_hit_rate_min: 0.85        # 加权命中率阈值
  red_lines_allowed: 0              # 红线 0 容忍
```

**(B) 审计报告结构（FR-02，复用 D5 Drift Report 结构，逐项行 + 尾结论）**
```jsonc
{
  "header": { "case_id":"wuxi-01", "genre":"武戏", "output_ref":"…/wuxi-out.md",
              "baseline_version":"1.0", "audited_at":"2026-06-22T…" }, // 时间戳仅元数据·不参与判定
  "rows": [
    { "check_id":"fields_complete",   "expected":"§3/§4 字段无空", "found":"OK",   "verdict":"PASS" },
    { "check_id":"mapping_mandatory", "expected":"无5级中景",      "found":"OK",   "verdict":"PASS" },
    { "check_id":"no_wallclock",      "expected":"0 绝对时码",     "found":0,      "verdict":"PASS" },
    { "check_id":"engine_invisible",  "expected":"0 泄漏词",       "found":0,      "verdict":"PASS" },
    { "check_id":"feature.F2",        "expected":"≤2.5s占比≥0.60", "found":0.71,   "verdict":"PASS", "weight":0.25 },
    { "check_id":"redline.R1",        "expected":"无泄漏",         "found":"hit:自检确认", "verdict":"FAIL" },
    { "check_id":"wow_factor",        "verdict":"NEEDS_HUMAN", "note":"哇塞度/情绪曲线转人评" }
  ],
  "footer": { "fail_count":1, "redline_count":1, "feature_hit_rate":0.85,
              "decision":"NO-GO",                                  // 红线触发 → 必 NO-GO
              "fixes":[ { "check":"redline.R1",
                          "action":"删除镜头卡尾『自检确认』脚注；引擎隐身只内部跑（output-contract §7.8）" } ] }
}
```

**(C) 回归对账算法（FR-03 伪代码，强调确定性 + 劣化定义 + 嫌疑指针）**
```python
def regression_diff(baseline_dir, current_dir, eps=0.0):
    overall = "GO"; report = []
    for case in five_cases:                      # 文戏/武戏/POV/商业/拟人
        b = load(baseline_dir/f"{case}.report.json")
        c = load(current_dir/f"{case}.report.json")
        worse = []
        # (a) 新增红线
        if c.redline_count > b.redline_count: worse.append("new_redline")
        # (b) 命中率下降（默认不容忍任何下降）
        if c.feature_hit_rate < b.feature_hit_rate - eps: worse.append(f"hit_rate↓ {b.feature_hit_rate}->{c.feature_hit_rate}")
        # (c) 新增字段缺失（基线 PASS、当前 FAIL）
        if newly_failed(b, c, check_prefix="fields_"): worse.append("new_field_missing")
        # (d) 新增引擎隐身泄漏
        if newly_failed(b, c, check_prefix="engine_invisible"): worse.append("new_engine_leak")
        if worse:
            overall = "NO-GO"
            report.append({ "case":case, "regressions":worse,
                            "suspect": shared_files_in_git_diff() })  # 读 git diff --stat 的 _shared/ 范围给嫌疑
    return Report(report, overall)               # exit 1 if NO-GO else 0
# 注：确定性文本/JSON 比较；无随机；时间戳排除在判定外（NFR-03）
# re-baseline：仅 --accept 显式触发，把 current 升为 baseline 并写 CHANGELOG.md 一行（FR-03③）
```

### 5.4 数据流（ASCII）

```
  _eval/cases/case-{文戏,武戏,POV,商业,拟人}.yaml (题卡:期望特征+红线+pass_rule)
            │ (输入剧本片段·只测不创作)
            ▼
   agent 按既有 6 步管线跑出  ──►  镜头卡 + Seedance 提示词 (被审成片产物)
            │                                  │ (只读消费既有规则作判据)
            ▼                                  ▼
   ┌──────────── audit_storyboard.py (开发期护栏·复用D5结构) ────────────┐
   │ ①字段齐全 ②强制映射 ③无绝对时码 ④引擎隐身0泄漏 ⑤特征命中率 ⑥红线触发 │
   │      判据来源: output-contract §2.1/§3/§4 · tacit-core §三.6 (只读)   │
   └───────────────────────────────┬──────────────────────────────────┘
                                    ▼
                      <case>.report.json + .md (Drift Report: 行级 + GO/NO-GO)
                                    │
            ┌───────────────────────┴───────────────────────┐
            ▼ 当前报告 ×5                                     ▼ 冻结基线 _eval/baseline/*.report.json
   ┌──────── regression_diff.py ────────┐                    │
   │ 劣化定义(a新红线/b命中率↓/c缺字段/d泄漏)│◄───────────────────┘
   │  → 嫌疑指针: git diff 的 _shared/ 范围 │
   └──────────────┬──────────────────────┘
        ┌─────────┴─────────┐
        ▼ GO                ▼ NO-GO
  _shared/ 改动可合入   劣化:不合入(先修 或 --accept re-baseline 留痕)
        │
        ▼  ✗ 引擎隐身闸 + 评测/创作样本隔离(NFR-01)
  ┄┄ 题卡/审计报告/baseline 绝不进成片、绝不当 fewshot ┄┄►  镜头卡/Seedance 成片(零评测痕迹·零术语)
```

---

## 6. 验收标准 Acceptance Criteria (DoD)

- **DoD-1（FR-01）**：`_eval/cases/` 含恰好 5 道 `genre∈{文戏,武戏,POV,商业,拟人}` 题卡，每题 `expected_features ≥ 5`、`red_lines ≥ 3`，**每条 detector 非空且机读**；其余 4 题 `script_excerpt` 为原创（过 `tacit-core.md:66` 题材原创检，无搬运示例题材台词）。
- **DoD-2（FR-02 真阴性）**：`audit_storyboard.py` 对每题"按题卡造的全命中合规样本" → 全 PASS、红线=0、`exit 0`、`hit_rate ≥ pass_rule`。
- **DoD-3（FR-02 真阳性）**：注入红线（自检脚注/绝对时码/情绪5级配中景）的样本 → 对应红线/检查 FAIL、`exit 1`、报告指明触发的 `check_id`/`red_line.id` 且 fixes 非空。
- **DoD-4（NFR-01 铁律双隔离）**：对含审计报告的运行产物，grep 成片镜头卡+Seedance 提示词中 `eval|regression|baseline|red_line|hit_rate|detector|评测✓|审计✓` 命中 **= 0**；grep 引擎术语（Polanyi/默会/格式塔/支柱/方法论/自检确认）命中 **= 0**；反例（注入一行审计报告）→ grep **报命中**（闸有效）。
- **DoD-5（FR-03 回归稳定）**：**不改 `_shared/` 重跑** → 5 题全 GO、`exit 0`、diff 0 劣化项（秤自身确定性稳定）。
- **DoD-6（FR-03 劣化可抓）**：构造一处 `_shared/` 劣化改动（如打乱 `mapping-tables.md` 情绪-景别映射）→ ≥1 题命中率下降或新增红线 → 整体 NO-GO、`exit 1`、报告指出劣化题与嫌疑文件 `_shared/mapping-tables.md`。
- **DoD-7（NFR-03 确定性）**：同输入连续 2 次审计，JSON 报告（排除时间戳后）diff = 0。
- **DoD-8（FR-04/FR-05 接入）**：`_eval/README.md` 含三条隔离铁律 + 开发期工作流挂载位；`output-contract.md §7.8`、`tacit-core.md §三.6`、`README.md` 维护节均已加交叉引用/指引，且原条款文字未改（`git diff` 仅见追加）；`run_eval.py` 一条命令跑完 5 题审计+对账并打印 GO/NO-GO + 非零退出码。
- **DoD-9（NFR-02 可移植）**：脚本仅 Python 标准库 + PyYAML、无图像库、无宿主 App 痕迹；`_eval/README.md` 含"脚本缺失则降级模型审"分支；题卡/baseline 纯文本。
- **DoD-10（NFR-04 性能 / NFR-05 不重复 D5）**：脚本路径 5 题端到端 < 10s、付费调用=0；审计每条 check 注明引用的既有规则出处；与 D5 检查项重叠数=0（D9 不审像素、D5 不审镜头卡字段）。
- **DoD-11（人评一致性·可选真机）**：取 1 题（如武戏）让 agent 真跑出镜头卡，跑 `audit_storyboard.py`，人眼复核"脚本判的 PASS/FAIL/命中率与肉眼看到的题材特征是否一致"（≥3 名评审一致通过）。

## 7. 验证方案 Verification Plan

**验证手段：**

1. **审计脚本合成样本自验（确定性闸·最高可信）**：对每题**人工构造两类样本**做真值——(i) **全命中合规样本**（严格按题卡 `expected_features` 写、无红线）应全 PASS、`exit 0`；(ii) **单点注入红线/违例样本**（塞自检脚注 / 塞绝对时码 / 情绪5级配中景 / 删一个必填字段）应精确触发对应检查 FAIL、`exit 1`。因为注入项是**人为已知真值**，"脚本判得对不对"可逐项核对——这是"真的有效"的硬证据，非主观感受。
2. **回归 diff（空改动自洽 + 劣化可抓·可重跑）**：**(a) 空改动**——不动 `_shared/` 重跑 5 题，断言 0 劣化（证明秤稳定、无假阳性）；**(b) 注入劣化**——临时打乱 `mapping-tables.md` 的情绪-景别映射后重跑，断言至少 1 题命中率下降/新增红线 → 整体 NO-GO 且嫌疑指向 `_shared/mapping-tables.md`（证明秤能抓真劣化）。这正是缺口类 C 要求的"对基线 X 重跑、Y 项是否劣化"。
3. **多题材覆盖验证（盖住盲点）**：5 题各跑一遍审计，断言每题的**题材判别特征**都有对应 detector 且能命中（武戏抓到手持/急切点、POV 抓到第一人称视点连续、商业抓到白底/LOGO 字段、拟人抓到风格锁不漂、文戏抓到对峙/分层光影）——证明基线集**真的覆盖了五类题材的判别性特征**，不是凑数。
4. **引擎隐身 + 样本隔离专项 grep（铁律闸）**：对成片镜头卡 + Seedance 提示词跑 NFR-01 双词表 grep（评测术语 + 引擎术语），命中必须为 0；并构造**反例**——故意把一行审计报告塞进镜头卡 → 隐身 grep 必须报命中（证明闸是真闸）；另查真实剧本输出**未搬运任何题卡 `script_excerpt` 的题材/台词**（样本隔离）。
5. **真机 A-B（可选·人评一致性）**：取 1–2 题让 agent 真跑出镜头卡，跑脚本得报告；人评：脚本判的命中/红线与肉眼一致性（命中率应高），且脚本能抓人眼易忽略的项（如某镜漏了切镜方式字段、某组超 15s 未拆）。

**测试用例 / 基线：**
- 基线 B0：5 题各一份冻结 `report.json`（文戏锚翡翠楼 + 武戏/POV/商业/拟人各一）。
- 用例 T1（真阴性/合规）：全命中合规样本 → 全 PASS、GO、`exit 0`、`hit_rate ≥ pass_rule`。
- 用例 T2（红线·隐身）：注入「自检确认」脚注 → R1 FAIL、NO-GO、`exit 1`。
- 用例 T3（红线·时码）：注入 `00:15` 绝对时码 → R2 FAIL。
- 用例 T4（违例·映射）：情绪 5 级配中景 → 强制映射检 FAIL。
- 用例 T5（回归·空改动）：不改 `_shared/` 重跑 → 0 劣化、GO。
- 用例 T6（回归·真劣化）：打乱 `mapping-tables.md` 情绪-景别映射 → ≥1 题劣化、NO-GO、嫌疑指向 `mapping-tables.md`。
- 反例 T7（隐身闸）：把一行审计报告注入镜头卡 → DoD-4 grep 必报命中。

**为何这样能证明"真的有效"：**
- 用**人工已知真值的合成样本**（全命中 / 单点注入红线）当判据，把"审计准不准"变成"该触发的红线触发了没、该 PASS 的 PASS 了没"——可逐项布尔/数值核对，彻底摆脱"看着没退化"的空话。
- **空改动 0 劣化 + 注入劣化必 NO-GO** 是一对**对偶证据**：前者证明秤无假阳性（不冤枉好改动），后者证明秤无假阴性（抓得住坏改动）——这正是"无秤无回归"缺口 C 的反义，且 JSON 确定性可重跑使其成为**可 CI 化的硬回归门**。
- 反例 T7 证明引擎隐身闸能**真拦截泄漏**、样本隔离 grep 证明测题不污染创作，不是摆设。

**落地可靠性理由（5/5）：**
- 满分因素：① **被审对象是纯文本契约**（镜头卡 + Seedance 提示词），检查项（字段存在/正则/枚举/比率/映射违例）**全是确定性文本运算**，无图像、无模型不确定性——这是 C 类里"秤"最实、最易确定性重跑的一种，比 D5 的像素审计依赖更少（连 Pillow 都不需要）；② **判据全部复用既有规则**（`output-contract.md` 强制映射/字段、`tacit-core.md` 隐身词表、时长制），是抽取既有散文规则为机器判据、而非从零发明阈值；③ **文戏基线已有现成全案**（翡翠楼 demo + fewshot），五题里有一题零新建成本，其余四题只需写"测题卡"（剧本片段 + 期望特征 + 红线）不需出成片；④ **回归门复用 D5 已验证的 Drift Report 结构与退出码语义**，结构成熟、可直接搬运；⑤ 脚本零宿主依赖、缺失可降级模型审，不引入新脆弱点。无明显扣分项，故给 5/5。

## 8. 依赖与顺序 Dependencies

- **依赖 `output-contract.md` v2.0 稳定**（只读）：强制映射（§2.1）、字段规范（§3/§4）、时长制（§0/§5）、引擎隐身自检（§7.6/§7.8）是审计判据来源。前置：已就绪。
- **依赖 `tacit-core.md` 引擎隐身词表稳定**（只读）：§三.6 的隐身检词表是红线 R1 判据来源。前置：已就绪。
- **依赖 `mapping-tables.md` 情绪×景别映射**（只读）：作为强制映射检判据 + 回归 T6 的"可注入劣化点"。前置：已就绪。
- **复用 D5（`D05-consistency-audit.md`）的 Drift Report 结构 / 退出码语义 / 隐身闸范式**（弱依赖·结构复用）：D9 的审计报告结构直接套 D5 范式；二者正交互补（D9=文本契约层秤、D5=图层秤），不阻塞。
- **被 D-series 几乎所有方向弱依赖（D9 是前置秤）**：D1（执行契约）/D2（反向拉片）/D3（多模型）/D4（运镜）/D6（音频）/D7（静帧）/D8（一图成片）等凡动 `_shared/` 或新增成员者，合入前过 D9 回归门。**D9 不阻塞它们的开发，但应优先落地为它们的安全护栏**——这是方向简报"其余方向安全迭代的前置秤"的落点。
- **宿主能力（可选）**：真机 A-B（DoD-11）需让 agent 真跑题生成镜头卡（属上游成员既有路径，文戏可直接复用翡翠楼）；脚本路径仅依赖本地 Python + PyYAML，**不依赖宿主**。

## 9. 风险与缓解 Risks & Mitigations

| 风险 | 影响 | 缓解 |
|---|---|---|
| R1 detector 写得太死/太松，误判命中或漏判 | 假阳/假阴、秤不准 | 每 detector 用合成样本（全命中 + 单点注入）双向校准；难判项降级 `NEEDS_HUMAN` 而非臆造；阈值（命中率/占比）写进 yaml 可调 |
| R2 评测产物/测题被误当成片字段或 fewshot 搬运（破隔离铁律） | 破成片、污染创作原创性 | NFR-01 双词表硬闸 + DoD-4 grep + 反例 T7；产物只存 `_eval/`+`.eval/`；FR-04 在两处契约加"绝不进成片/绝不当 fewshot"指针；样本隔离专项 grep |
| R3 5 题覆盖不全/题材判别特征选错（盖不住真盲点） | 回归门有盲区 | 每题特征须落"判别性"（武戏≠文戏的那几个特征）；多题材覆盖验证（手段3）逐题断言判别特征能命中；题卡可增补（schema 开放） |
| R4 "命中率不允许下降"过严，正常重构被误判劣化 | 噪声 NO-GO、白回修 | `eps` 可调（默认 0.0 严，可放宽）；提供 `--accept` 显式 re-baseline + CHANGELOG 留痕（合理变更可洗基线，但必须留痕说明，防静默劣化） |
| R5 难量化项（哇塞度/情绪曲线动人）脚本判不了 | 审计有盲区 | 明确分流 `NEEDS_HUMAN`，保留人评分支；文档写明"机器项硬阻断、品味项人评、分区不混判"（FR-05） |
| R6 与 D5 职责混淆/重复造秤 | 维护混乱 | NFR-05 划清边界：D9=文本契约层（镜头卡/提示词）、D5=图层（像素）；DoD-10 断言重叠=0；D9 复用 D5 报告结构但不审像素 |
| R7 脚本依赖（PyYAML）缺失 | 脚本跑不起 | NFR-02 降级：脚本是确定性加固非硬依赖，缺失则"模型按 yaml schema 逐项打分"的模型审分支；套件不瘫 |
| R8 "自动审计全绿"旧文字自报习惯复发 | 假安全感回潮 | demo/contract 把"全绿"措辞改为引审计报告的 GO/NO-GO（带 hit_rate）；无审计报告不得声称"评测通过" |

## 10. 工作量与里程碑 Effort & Milestones

**粗估总量：约 2.5–3.0 人周。**

- **M1 多题材基线集（约 0.9 周）**：写 5 道题卡——文戏锚翡翠楼（直接复用，写判据 yaml），武戏/POV/商业/拟人各写原创 `script_excerpt` + `expected_features(≥5)` + `red_lines(≥3)` + `pass_rule`；定 `_eval/cases/*.yaml` schema。产出物：5 题卡（人读+机读）。
- **M2 审计脚本（约 0.9 周）**：实现 `audit_storyboard.py`（6 类机器检查 + Drift Report JSON/MD + exit 码 + NEEDS_HUMAN 分流），复用 D5 报告结构。产出物：可重跑审计脚本 + `--help`。
- **M3 回归对账 + 基线快照（约 0.6 周）**：实现 `regression_diff.py`（劣化定义 a/b/c/d + 嫌疑指针 + `--accept` re-baseline）+ `run_eval.py` 一键入口；冻结 5 题 `baseline/*.report.json` + `CHANGELOG.md`。产出物：可重跑回归门 + 基线快照。
- **M4 合成样本测试 + 隐身闸（约 0.4 周）**：构造 T1–T7 合成样本（含已知真值），接 DoD-2/3/5/6/7；跑 DoD-4 + 反例 T7 隐身专项；三处契约加交叉引用 + README 注册。产出物：测试套 + 真值校准报告 + 铁律证据。
- **M5 真机对图核验 + 工作流接入（约 0.2 周）**：取 1–2 题真机跑镜头卡，人评脚本判定与肉眼一致性（DoD-11）；`README.md` 写明"改 `_shared/` 前后跑 `_eval/` 回归门"。产出物：DoD-11 证据 + 工作流挂载文档。

**关键路径**：M1 → M2 → M3（M4 可与 M3 并行，M5 在 M3 后）。M2+M3+M4 的"审计脚本 + 回归门 + 合成样本真值校准"是本案"可验证"的核心交付，优先于 M5 真机。

---

**契约版本**：D9 PRD Draft v0.1 ｜ 缺口类 C（无秤无回归）｜ 优先级 P0 ｜ 落地可靠性 5/5 ｜ 新增开发期护栏目录 `_eval/`（5 题材冷启动基线集 + 文本契约审计脚本 `audit_storyboard.py` + 回归对账器 `regression_diff.py` + baseline 快照）；位于 Skin 之外、横切三层、主要为保护 Bone 层 `_shared/` 改动而存在；复用 `D05-consistency-audit.md` 的 Drift Report 结构与隐身闸；引擎隐身铁律扩展为"**评测层不漏成片 + 评测样本不污染创作**"（继承 `storyboard/output-contract §7.8` 与 `tacit-core §三.6`）；与 D5 正交互补（D9 审镜头卡/提示词文本契约层、D5 审图像素层）；作为 D-series 其余方向安全迭代的**前置秤**。
