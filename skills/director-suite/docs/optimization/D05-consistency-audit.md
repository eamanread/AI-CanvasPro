# D5 · 量化一致性审计工具（Quantified Consistency Audit）

> 编号 D5 ｜ 缺口类 C（无秤无回归）｜ 优先级 P0 ｜ 状态 Draft v0.1 ｜ 落地可靠性自评 5/5

---

## 1. 问题陈述 Problem

**现状（引 director-suite 具体文件）：**

director-suite 已经有"连续性应该怎么锁"的**规则知识**，但全套件**没有一把对基线的数值化秤**，更没有"审计结果可重跑、可对图核验"的回归门。具体落点：

- **`_shared/continuity-quality.md`** 是纯**定性规则**：§一.6「一致性检查优先级」给的是排查**顺序**（角色位置跳切 ＞ 场景锚点漂移 ＞ 外观漂移），§二.6「交付前自检清单」是 9 条**勾选项**（"空间一致/角色一致/道具状态连贯""逐镜三维星评 1–5 星"）。这些是"看一眼觉得对不对"，**没有任何一条带"对基线测量出偏移多少、阈值是多少、超没超"的数值判定**。唯一出现数值的两处（§一.5「相邻格视线引导坐标偏差 ≤ 20%」、§一.5「色温跳变 ≤ 200K」）是孤立散点，既无"基线档案"承载被测对象，也无统一审计报告结构。
- **`_shared/asset-id-convention.md` §5「一致性回检清单」** 是 5 条**结构性**断言（引用闭合/覆盖完整/道具状态轴一致/锚点一致/命名一致），查的是"ID 引用对不对得上"，**不查"生成出来的图，比例/色相/材质/LOGO 偏了多少"**——它是符号层审计，不是像素/数值层审计。
- **`production-bible/examples/翡翠楼-全案demo.md`** 里的"块A·实体台账 / **过程审计**"与§6「自检（内部跑·此处仅声明结论）」，是 agent 用**自然语言自报**"焦点 vs 从属已分清""asset_id 全片唯一且合规范""L1/L2 标注完整"——即方向简报点名的 **"自动审计全绿"是文字自报**：没有被测量的数、没有对比的基线、没有可被第三方重跑的判据。**自己说"绿"不等于真绿**。

**痛点（为何是问题）：**

1. **无秤 → 一致性靠人眼，规模上崩**：当前唯一可量化的产物是§二.6 的"逐镜三维星评 1–5 星"（人物相似度/背景融合度/色调匹配度），这是**主观打分**，不同评审、不同时间打不一样，且没有"对哪张基线图量出来的"。几十镜的片子靠人眼逐镜比对基线，必然漏、必然不一致。
2. **无基线 → 漂移无参照系**：`continuity-quality.md` 反复强调"上一镜末态 = 本镜初态""锚点不漂"，但**"不漂"是相对谁？** 套件从未定义一份"基线档案（baseline profile）"把角色比例/材质反射率/LOGO 归一化坐标/主导色相这些**可测量量**固化下来，于是"漂移"永远只能定性描述、无法判定"漂了多少、超没超阈值"。
3. **无回归 → 改一处不知道砸没砸别处**：没有"对基线 X 重跑、Y 项审计无⚠️"这种可重复执行的判据，套件任何一次升级（改映射表、换图像模型、调风格库）都**无法证明"一致性没退化"**。这正是缺口类 **C（无秤无回归）** 的定义。
4. **demo 的"全绿"会撒谎**：文字自报审计**没有失败模式**——agent 倾向于报告成功。一个连"基线档案 + 容差阈值 + ⚠️偏移报告"结构都没有的审计，等于没有审计，它给的是虚假的安全感。
5. **方向简报已点名母范式但未抽象**：电商全案 skill 已有完整的"量化一致性审计（轮廓±5% / HSL 色相±15° / LOGO Δ0.05 / 白底 RGB≥245）+ 产品基线档案"，本套件**把它停在了"别的 skill 有"，没有抽象成通用的 `_shared/consistency-audit.md`**——这是直接可搬运的现成能力被漏掉。

---

## 2. 证据与接地 Evidence

**哪些源 skill 有此能力（点名）：**

- **电商全案 skill（母范式·直接证据）**：方向简报明确——有"**量化一致性审计**（轮廓 ±5% / HSL 色相 ±15° / LOGO Δ0.05 / 白底 RGB≥245）+ **产品基线档案** + 图像模型分级（Nano Banana Pro / Seedream 4.5 / NB2）"。这是本方向 `_shared/consistency-audit.md` 的**母模板与阈值来源**：把"产品基线档案"泛化为"**asset 基线档案**"、把"白底 RGB≥245"泛化为"场景母色/主导色相约束"，即得通用审计。
- **Flova 平台流水线（强制暂停门 + 失败-修复对照证据）**：`planner→multimodal_analyze_tool→storyboard_designer→media_generator→video_assembler`，带**强制暂停门**。证明"审计→暂停门→是否放行"是流水线标准一环；AI 短剧的"**失败-修复对照表**"证明源生态把审计结果做成**结构化偏移→修复动作**，而非一句"看着不对"。
- **一图成片的"视觉基因解构" / 拉片复刻的"参考视频→镜头拆解"**：证明源生态把"从一张/一段参考里**抽取可量化特征**"当作标准前置步骤——这正是"从 asset 提取基线档案（比例/HSL/材质反射/LOGO 坐标/朝向）"的同构能力。

**director-suite 盲点落在哪个文件/成员：**

- **盲点根源**：`_shared/continuity-quality.md` 只有**定性规则 + 散点数值**，没有"基线档案 schema + 容差阈值表 + ⚠️偏移报告结构"三件套，也没有承载它们的独立文件。`asset-id-convention.md` §5 是**符号层**回检、不是**数值层**审计。
- **盲点表现**：`翡翠楼-全案demo.md` 的"过程审计 / §6 自检"是**文字自报全绿**，无被测数、无基线、无可重跑判据 —— 即"demo 自动审计全绿是文字自报"的实证。
- **结论**：需新增**一份 Bone 层共享知识 `_shared/consistency-audit.md`**（基线档案 + 容差阈值 + ⚠️偏移报告结构），并新增**一支确定性最高、可对图核验的审计脚本** `_shared/scripts/audit_consistency.py`（确定性优先，简报明确"可配套脚本化检查·确定性最高·可对图核验"）。铁律继承 `asset-id-convention.md §5 footer` 与 `storyboard/output-contract.md §7.8`：**审计只内部跑，绝不进成片**。

---

## 3. 目标与非目标 Goals / Non-Goals

**Goals：**

- **G1（建秤）**：定义 **asset 基线档案 schema（Baseline Profile）**——从已确认的"基准图/三视图/设定板"提取可量化特征：身材/物件**轮廓比例**、**HSL 主色弧光**、**材质反射率 0–100**、**LOGO/标识归一化坐标**、**朝向/视线向量**，并固化为 `[Element_*]/[Prop_*]` 绑定的基线档案文件。
- **G2（定阈值）**：定义统一**容差阈值表（Tolerance）**：轮廓 ±5% / 色相 ±15° / 明度 ±10% / LOGO 归一化坐标 Δ0.05 / 色温 ≤200K（承 `continuity-quality.md` 既有口径，不冲突），并允许按 L1/L2 与题材分档收紧/放宽。
- **G3（出报告）**：定义**结构化 ⚠️ 偏移警告报告（Drift Report）**：逐 asset、逐被测项给出 `{基线值, 实测值, 偏移量, 阈值, 判定 PASS/⚠️/FAIL}`，把"自动审计全绿"从文字自报升级为**可对图核验的数值表**。
- **G4（可重跑回归）**：配套 **`audit_consistency.py`**（确定性最高、可对图核验）：输入基线档案 + 待审图，输出 Drift Report（JSON + Markdown），可冷启动重跑，作为套件升级的**回归门**（对基线 X 重跑，Y 项无 ⚠️ 即放行）。
- **G5（接暂停门）**：审计结果接 `continuity-quality.md §二.8 强制暂停门`：出图后**审计未过（有 FAIL）→ 暂停 + 回修，不放行进视频/成片**。

**Non-Goals（明确边界）：**

- **NG1（不破引擎隐身·铁律）**：基线档案、容差阈值、Drift Report、审计脚本输出**全部是过程产物**，**绝不可漏进成片**——不进镜头卡、不进 Seedance 提示词、不作为"审计✓/全绿"脚注附在任何成片表尾。本铁律直接继承并扩展 `asset-id-convention.md §5 footer`（"只在内部跑，绝不写进成片"）与 `storyboard/output-contract.md §7.8`（"自检不外显·属过程不属成片"），把它从"符号自检"扩展到"数值审计"。
- **NG2（不破可移植性）**：`_shared/consistency-audit.md` 是**纯 Markdown 知识**，零宿主绑定；脚本 `audit_consistency.py` 仅依赖 **Pillow + numpy**（图像处理最小集，不绑任何宿主 App / `127.0.0.1:8777`），且**脚本不可得时套件仍可工作**——审计可降级为"按 schema 由模型读图填表的人审/模型审"模式（脚本是确定性加固，非硬依赖）。
- **NG3（不是质量评分器）**：本工具只审"**对基线漂没漂、漂多少**"（一致性），**不评**"画得美不美/构图好不好"（品味）；美学评测是 D-series 另案（品味缺口 D），与本案正交。
- **NG4（不替代人审兜底）**：审计是**护栏**不是终判；脚本可量化项（轮廓/HSL/明度/LOGO 坐标）走脚本，难量化项（脸部身份相似度/材质质感）保留人审/模型审分支，二者并行写进同一报告。
- **NG5（不改 ID 体系）**：只**消费** `asset-id-convention.md` 的 `[Element_*]/[Prop_*]`、L1/L2、`@sN` 状态节点，不新增/不改 ID 命名规范。

---

## 4. 需求 Requirements

### 4.1 功能需求 FR

**D5-FR-01 asset 基线档案 schema 与提取规程（Baseline Profile）**
- 描述：在 `_shared/consistency-audit.md` 定义基线档案 schema：每个被审 `[Element_*]/[Prop_*]`（及 `@sN` 状态节点）绑定一份基线档案，从其**已确认基准图/三视图/设定板**提取 6 类可量化特征：① **轮廓比例**（头身比 / 物件长宽高比，相对单位）；② **HSL 主色弧光**（主导色相 H 0–360°、饱和 S、明度 L，取画面主色与角色服装/物件主色各一组）；③ **材质反射率 0–100**（高光强度归一化分值）；④ **LOGO / 标识归一化坐标**（bbox 中心 (x,y) ∈ [0,1]，相对画幅，无 LOGO 则置 null）；⑤ **朝向 / 视线向量**（正/侧/背 + 偏角，或 (dx,dy) 单位向量）；⑥ **白底/母色约束**（白底场景 RGB≥245 像素占比；非白底场景记录"90% 主导色相"区间，承场景表口径）。该档案与 `[Element_*]` L1 项绑定（L1 跨全片锁死、是审计第一对象）。
- 可量化验收：①schema 6 类特征字段齐全，每类含 `{字段名, 取值范围/单位, 提取方法, L1/L2 归属}` 四列（脚本/人审均按此填）；②对 `翡翠楼-全案demo.md` 的 `[Element_LinChen]`（7.5 头身、瞳色 #3A2A1E、自然黑发 #1A1A1A、左眉尾小痣）与 `[Prop_TangSuit_01]`（藏青 #1C2A3A、真丝缎面柔反光）各产出一份**填满 6 类特征**的样例基线档案，无空字段；③LOGO 归一化坐标在无 LOGO 时显式记 `null`（不得留空——留空与 null 语义混淆视为不合格）。

**D5-FR-02 容差阈值表（Tolerance Table）**
- 描述：在 `_shared/consistency-audit.md` 定义统一容差阈值表，对 FR-01 每类特征给出**默认阈值 + L1/L2 分档 + 题材修饰**：轮廓比例 **±5%**、HSL 色相 **±15°**、明度 **±10%**、（饱和默认 ±15%，可题材调）、材质反射率 **±10/100**、LOGO 归一化坐标 **Δ0.05**（欧氏距离）、跨镜色温 **≤200K**（承 `continuity-quality.md §一.5`）、白底 **RGB≥245**（承电商母范式）。L1 项阈值为硬阈（超即 FAIL）；L2 项允许"已在状态轴显式声明的变化"豁免（变化点不计漂移，未声明的突变照常 FAIL）。
- 可量化验收：①阈值表每行含 `{被测项, 默认阈值, L1阈值, L2行为, 题材修饰示例}`；②6 个核心数值阈值（轮廓±5% / 色相±15° / 明度±10% / LOGO Δ0.05 / 色温≤200K / 白底≥245）与本契约逐字一致、可 grep；③阈值表与 `continuity-quality.md` 既有数值（色温≤200K、视线偏差≤20%）**无冲突**（冲突项 = 0，色温阈值复用同值）。

**D5-FR-03 结构化 ⚠️ 偏移警告报告（Drift Report）**
- 描述：定义 Drift Report 固定结构：报告头 `{被审镜头组/asset 列表, 基线档案版本, 审计时间戳——仅存于报告，不入成片}`；逐 asset 逐被测项一行 `{asset_id, 被测项, 基线值, 实测值, 偏移量, 阈值, 判定}`，判定枚举 **`PASS` / `⚠️WARN`（接近阈值，建议复看）/ `FAIL`（超阈，必须回修）**；报告尾 `{FAIL 计数, ⚠️ 计数, 放行结论 GO/NO-GO, 失败项→建议修复动作}`（修复动作对齐 AI 短剧"失败-修复对照表"范式）。报告同时产出 **JSON（机读/回归 diff 用）+ Markdown（人读）** 双格式。
- 可量化验收：①每被测项行 7 字段齐全（缺一不合格）；②`FAIL 计数 > 0 → 放行结论必为 NO-GO`（脚本断言，不允许有 FAIL 还 GO）；③每个 FAIL 行必有对应"建议修复动作"非空；④报告体内**不含任何成片字段**（无台词/无 Seedance 提示词/无"审计✓"将被附到成片的迹象）——泄漏即不合格。

**D5-FR-04 审计脚本 `audit_consistency.py`（确定性·可对图核验·可重跑回归门）**
- 描述：实现 `_shared/scripts/audit_consistency.py`：输入 `--baseline <基线档案.json> --candidate <待审图...> [--tolerance <阈值.json>]`，对**可确定性测量的 4 类**（轮廓比例 / HSL 主色 / 明度 / LOGO 归一化坐标 / 白底占比）跑像素级测量，按 FR-02 阈值判定，输出 FR-03 的 Drift Report（JSON+MD）。难量化项（脸部身份相似度、材质质感）输出 `NEEDS_HUMAN` 行、不臆造数值。脚本以**非零退出码**表达 NO-GO（`exit 0`=GO、`exit 1`=有 FAIL），供 CI/回归门消费。
- 可量化验收：①脚本对"基线图自审自身"（candidate==baseline）→ 全 PASS、`exit 0`、Drift Report 所有偏移量 ≈0（轮廓/HSL/明度偏移 < 阈值的 1/10）；②构造一张**故意改色相 +30°**的待审图 → 该项判 FAIL、`exit 1`、报告偏移量 ≈30°（±3°）；③构造一张 **LOGO 平移 Δ0.1** 的图 → LOGO 项 FAIL（Δ0.1 > 0.05）；④脚本仅依赖 Pillow+numpy（`pip install` 之外零宿主依赖），`--help` 可独立运行；⑤同输入重跑两次，JSON 报告逐字节一致（确定性，便于回归 diff）。

**D5-FR-05 审计接入暂停门 + 引擎隐身闸（知识层挂载）**
- 描述：在 `_shared/consistency-audit.md` 写明审计在管线中的**挂载位**：出图后（角色设定板/关键帧/场景图渲染后）→ 跑审计 → `continuity-quality.md §二.8` 强制暂停门读 Drift Report 的 GO/NO-GO：**NO-GO 必须回修不放行**；并明确**引擎隐身闸**——审计三件套（基线档案/阈值/Drift Report）与脚本输出**只存在于过程目录**（如 `.audit/`），**严禁**作为字段、脚注、参考帧进入镜头卡 / Seedance 提示词 / 任何成片表。在 `asset-id-convention.md §5` 与 `storyboard/output-contract.md §7.8` 各加一条交叉引用指针（指向本审计、不改既有语义）。
- 可量化验收：①`consistency-audit.md` 含"挂载位 = 出图后、暂停门前"明确语句；②含"NO-GO→不放行"硬规则；③对一份含 Drift Report 的运行产物，grep 成片镜头卡 / Seedance 提示词中 `基线档案|偏移量|Drift|审计✓|PASS|FAIL|tolerance`，命中 **= 0**；④`asset-id-convention.md §5`、`storyboard/output-contract.md §7.8` 各新增 1 条交叉引用注脚（只加引用，原条款文字不变）。

### 4.2 非功能需求 NFR

**D5-NFR-01 引擎隐身 + 审计不漏进成片（铁律）**
- 审计全链路（基线档案 / 阈值 / Drift Report / 脚本日志）均为过程产物，**绝不进成片**；引擎术语（Polanyi/默会/格式塔/寓居/方法论/支柱编号）在审计产物里也零出现（审计产物虽是内部物，但仍可能被误贴进成片，故同样禁术语）。验收：对成片镜头卡 + Seedance 提示词 grep 审计字段与引擎术语，命中均 = 0（DoD-4）。

**D5-NFR-02 可移植性**
- 知识层纯 Markdown、零宿主绑定；脚本仅 Pillow+numpy，不绑宿主 App / 不出现 `127.0.0.1:8777` 等痕迹；**脚本缺失时审计可降级为模型读图填 schema 的人审/模型审模式**（套件不因没装 Python 而瘫）。验收：`_shared/` 内审计知识无运行时强依赖；脚本头注明"可选确定性加固，缺失则走模型审分支"。

**D5-NFR-03 确定性与可重跑（回归门核心）**
- 同一 (基线, 待审图, 阈值) 输入，脚本输出 Drift Report **逐字节可复现**（无随机、无时间戳混入判定区——时间戳仅存报告头元数据区、不参与判定）。验收：连续 2 次运行 JSON 报告 diff = 0（FR-04⑤）。

**D5-NFR-04 性能/成本**
- 单 asset 审计（脚本路径）应为**亚秒级本地计算、0 次付费模型调用**；真机出图（被审对象的生成）属上游成员既有成本，本工具不新增付费调用；难量化项的"模型审"分支按需触发、不默认每像素调模型。验收：脚本审 1 asset 在常规笔记本 < 2s；脚本路径付费调用数 = 0。

**D5-NFR-05 一致性口径自洽（不制造新矛盾）**
- 审计阈值与套件既有数值口径**不打架**：色温 ≤200K 复用 `continuity-quality.md §一.5`；白底 ≥245 复用电商母范式；星评 1–5 保留为"难量化项的人审分档"、并在报告里与数值项分区呈现（不混淆主观分与客观偏移）。验收：阈值冲突项 = 0；报告中主观人审分与客观数值偏移分两区，不混表。

---

## 5. 设计 Design

### 5.1 新增/改动文件精确路径清单

**新增（4 个）：**
```
skills/director-suite/_shared/consistency-audit.md            # 基线档案schema + 容差阈值表 + Drift Report结构 + 挂载位（Bone）
skills/director-suite/_shared/scripts/audit_consistency.py    # 确定性审计脚本（Pillow+numpy，输出JSON+MD，exit码=GO/NO-GO）
skills/director-suite/_shared/scripts/examples/baseline_LinChen.json   # FR-01 样例基线档案（对图核验用）
skills/director-suite/docs/optimization/D05-consistency-audit.md       # 本 PRD（已落盘）
```

**改动（4 个，均为追加/注册，不改既有语义）：**
```
skills/director-suite/_shared/continuity-quality.md
  - §一.6「一致性检查优先级」末追加交叉引用：「→ 数值化审计与基线档案见 _shared/consistency-audit.md」
  - §二.8「强制暂停门」追加一句：出图后审计 NO-GO → 不放行（指向本审计，原门位文字不动）
skills/director-suite/_shared/asset-id-convention.md
  - §5「一致性回检清单」追加交叉引用注脚：符号层回检之外的数值层审计见 consistency-audit.md（原 5 条不变）
skills/director-suite/storyboard/output-contract.md
  - §7.8「自检不外显」追加一句：数值审计产物（基线档案/Drift Report）同属过程，绝不进成片（原铁律文字不动）
skills/director-suite/README.md
  - 「三层架构 ② 骨」一行的文件清单追加 consistency-audit.md；目录结构树 _shared/ 下新增该文件与 scripts/ 节点
```

**只读消费、不改：** `production-bible/*-roster.md`（基线特征的上游来源：角色表头身比/瞳色/发色、场景表母色/色温、道具表材质/颜色）、`character-board/` `keyframe/` `color-palette/`（被审图的产出方）。

### 5.2 挂进 Soul / Bone / Skin 哪层

- **Bone（骨 · 主要落点）**：`_shared/consistency-audit.md` = 新的"导演知识库"数据（基线 schema + 阈值表 + 报告结构），与 `continuity-quality.md`/`mapping-tables.md` 同级、被全成员共享消费。脚本 `audit_consistency.py` 是 Bone 数据的**确定性执行器**（数据为本、脚本为加固）。
- **Skin（皮 · 挂载点，零新增成员）**：审计**在出图后由各视觉成员（character-board/keyframe/color-palette）调用**，不新建独立成员目录——审计是横切关注点（cross-cutting），挂在既有成员的"出图后自检"步，而非成为第 5 个产物。
- **Soul（灵魂 · 零改动）**：不触碰 `tacit-core.md`；引擎隐身铁律被本工具继承并扩展为"**数值审计层不漏成片**"。审计是 Soul"自检"的**可量化外化**——把 Soul 内部的定性自检，落成 Bone 层可重跑的数值秤，但秤的读数永不外显进成片。

### 5.3 关键 schema / 契约字段 / 算法

**(A) asset 基线档案 schema（FR-01，写入 consistency-audit.md，JSON 形态）**
```jsonc
{
  "asset_id": "[Element_LinChen]",
  "profile_version": "1.0",
  "source_image": "character-board/LinChen_3view.png",   // 已确认的基准图（不入成片，仅审计引用）
  "level": "L1",                                          // L1=硬锚优先审；L2 项另挂状态轴
  "features": {
    "proportion":  { "head_body_ratio": 7.5, "unit": "head", "method": "三视图量取头/全身像素比" },
    "hsl_primary": { "hair":  { "h": 0,   "s": 0,  "l": 10 },   // #1A1A1A 自然黑
                     "iris":  { "h": 24,  "s": 32, "l": 18 } }, // #3A2A1E 深棕（H从RGB换算）
    "material_reflectance": { "skin": 18, "scale": "0-100", "method": "高光像素强度归一化" },
    "logo_norm_xy": null,                                  // 角色无LOGO → 显式 null（FR-01③）
    "orientation": { "front": [0,0], "side": [1,0], "method": "视线/鼻尖向量单位化" },
    "base_color_constraint": { "type": "non_white", "dominant_hue_band": [200,230], "coverage": 0.90 }
  },
  "marks": ["左眉尾下方小痣 @ norm(0.43,0.38)"]            // 特征记号点，坐标审计
}
```

**(B) 容差阈值表（FR-02，写入 consistency-audit.md）**

| 被测项 | 默认阈值 | L1（硬阈，超即 FAIL） | L2 行为 | 题材修饰示例 |
|---|---|---|---|---|
| 轮廓比例 head_body / 长宽比 | ±5% | ±5% | 已声明 Look 变化豁免 | 写实更严 ±3% |
| HSL 色相 H | ±15° | ±15° | 状态轴色温弧光段豁免 | 国风纯意境 ±10° |
| 明度 L | ±10% | ±10% | 暖→冷弧光段按声明豁免 | — |
| 饱和 S | ±15% | ±15% | 同上 | — |
| 材质反射率（0–100） | ±10 | ±10 | 新→旧/损坏态按状态轴豁免 | — |
| LOGO 归一化坐标 Δ（欧氏） | 0.05 | 0.05 | 不适用（LOGO 多为 L1） | 包装镜 0.03 |
| 跨镜色温 K | ≤200K | ≤200K | 弧光段按声明 | 承 continuity-quality §一.5 |
| 白底占比 RGB≥245 | ≥（基线占比 −5%） | 同 | — | 承电商母范式 |

> L2 豁免规则：仅当该变化点**已在 `asset-id-convention.md` 的状态轴/`@sN` 节点或场景表色温弧光显式声明**时，本次偏移记 `EXEMPT`（不计 FAIL）；未声明的突变照常判 FAIL（防"借 L2 之名静默漂移"）。

**(C) Drift Report 结构（FR-03，逐项行 + 尾结论）**
```jsonc
{
  "header": { "group": "S1-镜组1", "assets": ["[Element_LinChen]","[Prop_Phone_01]"],
              "baseline_version": "1.0", "audited_at": "2026-06-22T..." },  // 时间戳仅元数据，不参与判定
  "rows": [
    { "asset_id":"[Element_LinChen]", "item":"hsl_primary.hair.h",
      "baseline":0, "measured":2, "drift":2, "tolerance":15, "verdict":"PASS" },
    { "asset_id":"[Element_LinChen]", "item":"proportion.head_body_ratio",
      "baseline":7.5, "measured":8.2, "drift_pct":9.3, "tolerance_pct":5, "verdict":"FAIL" },
    { "asset_id":"[Element_LinChen]", "item":"face_identity",
      "verdict":"NEEDS_HUMAN", "note":"脸部身份相似度脚本不判，转人审/模型审" }
  ],
  "footer": { "fail_count":1, "warn_count":0, "decision":"NO-GO",       // FAIL>0 → 必 NO-GO（FR-03②）
              "fixes":[ { "item":"proportion.head_body_ratio",
                          "action":"重生该镜并锁三视图头身比 7.5；ImageToImage 参考基准图" } ] }
}
```

**(D) 审计算法（FR-04 伪代码，强调确定性 + 不臆造）**
```python
def audit(baseline, candidate_img, tol):
    rows = []
    # 1) HSL 主色：对 candidate 主体区域取主色，与 baseline.hsl_primary 比
    for part, base_hsl in baseline.features.hsl_primary.items():
        m = dominant_hsl(candidate_img, region=part)         # 确定性：直方图众数色
        rows += judge("hsl."+part+".h", base_hsl.h, m.h, tol.hue, kind="deg")    # 环形角差
        rows += judge("hsl."+part+".l", base_hsl.l, m.l, tol.lightness, kind="pct")
    # 2) 轮廓比例：分割掩膜量头/身像素比
    r = head_body_ratio(candidate_img)
    rows += judge("proportion", baseline.proportion.head_body_ratio, r, tol.proportion, kind="pct")
    # 3) LOGO 归一化坐标：模板匹配定位 → 中心归一化 → 欧氏距
    if baseline.logo_norm_xy is not None:
        xy = locate_logo(candidate_img)                       # 找不到 → FAIL（LOGO 丢失）
        rows += judge_xy("logo", baseline.logo_norm_xy, xy, tol.logo_delta)
    # 4) 白底占比
    if baseline.base_color_constraint.type == "white":
        rows += judge("white_ratio", base, white_ratio(candidate_img, 245), tol.white, kind="ge")
    # 5) 难量化项不臆造，转人审
    rows.append(row("face_identity", verdict="NEEDS_HUMAN"))
    fail = [x for x in rows if x.verdict=="FAIL"]
    decision = "NO-GO" if fail else "GO"                       # FR-03②：有 FAIL 必 NO-GO
    return Report(rows, decision, fixes=suggest_fixes(fail))   # exit 1 if NO-GO else 0
# 注：所有测量为确定性图像运算；无随机种子；时间戳只入 header 元数据区，不入判定（NFR-03）
```

### 5.4 数据流（ASCII）

```
production-bible 三表(头身比/瞳色发色/母色色温/材质颜色/LOGO)      已确认基准图(三视图/设定板/关键帧)
            │ (只读·特征来源)                                              │ (像素来源)
            ▼                                                              ▼
   ┌──────────────── consistency-audit (Bone) ────────────────┐   ┌── audit_consistency.py ──┐
   │ FR-01 基线档案 schema(6类特征)  ── 提取 ──►  baseline.json │──►│ 像素测量(确定性)         │
   │ FR-02 容差阈值表(±5%/±15°/Δ0.05/≤200K/≥245)              │   │ + 难量化项→NEEDS_HUMAN   │
   └──────────────────────────────────────────────────────────┘   └────────────┬─────────────┘
                                                                                 ▼
                                                          FR-03 Drift Report(JSON+MD: 行级偏移 + GO/NO-GO)
                                                                                 │
                          ┌──────────────────────────────────────────────────────┤
                          ▼ GO                                                    ▼ NO-GO
              continuity-quality §二.8 暂停门放行                       回修/重生该镜(不放行) ──┐
                          │                                                                     │
                          ▼                                          ✗ 引擎隐身闸(NFR-01)        │
                  进入下游(视频/成片)              ┄┄ 审计三件套+脚本输出 绝不可进 ┄┄►  镜头卡/Seedance 成片
                                                       (审计层 ≠ 成片层；只存 .audit/ 过程目录)  ◄┘(回修后重审)
```

---

## 6. 验收标准 Acceptance Criteria (DoD)

- **DoD-1（FR-01）**：`_shared/consistency-audit.md` 含基线档案 schema（6 类特征齐全，每类四列）；`baseline_LinChen.json` 与一份 `[Prop_TangSuit_01]` 样例**6 类填满、无空字段、无 LOGO 处为显式 null**。
- **DoD-2（FR-02）**：阈值表含 6 个核心数值（轮廓±5% / 色相±15° / 明度±10% / LOGO Δ0.05 / 色温≤200K / 白底≥245），逐字可 grep；与 `continuity-quality.md` 数值冲突项 = 0。
- **DoD-3（FR-03）**：对任一被审 asset 产出 Drift Report，每行 7 字段齐全；**存在 FAIL 时尾结论必为 NO-GO**；每 FAIL 行有非空修复动作；报告体无成片字段。
- **DoD-4（NFR-01 铁律）**：对含 Drift Report 的运行产物，grep 成片镜头卡 + Seedance 提示词中 `基线档案|偏移量|Drift|审计✓|tolerance|PASS|FAIL` 命中 **= 0**；grep 引擎术语（Polanyi/默会/格式塔/支柱/方法论）命中 **= 0**。
- **DoD-5（FR-04 自审）**：`audit_consistency.py` 对"基线图自审自身"→ 全 PASS、`exit 0`、所有偏移量 < 阈值 1/10。
- **DoD-6（FR-04 真阳性）**：对"色相 +30°"图 → 该项 FAIL、`exit 1`、报告偏移 ≈30°(±3°)；对"LOGO 平移 Δ0.1"图 → LOGO FAIL；对"头身比 8.2 vs 基线 7.5"图 → 轮廓 FAIL（偏 9.3% > 5%）。
- **DoD-7（NFR-03 确定性）**：同输入连续 2 次运行，JSON 报告 diff = 0（时间戳排除后逐字节一致）。
- **DoD-8（FR-05 挂载/闸）**：`consistency-audit.md` 含"出图后→暂停门→NO-GO 不放行"明确链路；`asset-id-convention.md §5`、`storyboard/output-contract.md §7.8`、`continuity-quality.md §二.8` 各已加交叉引用，且原条款文字未改。
- **DoD-9（NFR-02 可移植）**：脚本仅 Pillow+numpy；`consistency-audit.md` 含"脚本缺失则降级模型审"分支；产物无宿主 App 痕迹。
- **DoD-10（对图核验·真机可选）**：取 1 个角色的基线图 + 1 张真机出的关键帧，跑脚本得 Drift Report，人眼复核"脚本判的 FAIL/PASS 与肉眼看到的漂移方向一致"（≥3 名评审一致通过）。

## 7. 验证方案 Verification Plan

**验证手段：**

1. **审计脚本自验（确定性闸·最高可信）**：用**合成图对**做真值——同一张基线图自审（应全 PASS）、对其做**已知幅度的单变量扰动**（色相 +30°、明度 −15%、头身比拉伸到 8.2、LOGO 平移 Δ0.1）各生成一张待审图，脚本必须**精确测回扰动量**并据阈值判 FAIL。因为扰动量是**人为注入的已知真值**，脚本"测得准不准、判得对不对"可被逐项核对——这是"真的有效"的硬证据，非主观感受。
2. **回归 diff（基线·可重跑）**：以 `翡翠楼-全案demo.md` 的 `[Element_LinChen]/[Prop_TangSuit_01]` 基线档案为**固定基线**。套件任何升级（改映射表/换图像模型/调风格库）后，对同一组已确认基准图重跑审计，断言"**Drift Report 无新增 FAIL**"——即缺口类 C 要求的"对基线 X 重跑、Y 项无 ⚠️"。
3. **真机出片对图核验（A/B）**：取 1–2 个角色，真机出关键帧（付费步、由用户亲点），跑脚本得 Drift Report；人评：脚本判的 FAIL 项与肉眼漂移方向是否一致（命中率应高），且**脚本能抓到人眼易忽略的细漂**（如色相 12° 仍 PASS、18° 报 FAIL 的边界感知）。
4. **引擎隐身专项 grep（铁律闸）**：对成片镜头卡 + Seedance 提示词跑 NFR-01 grep，审计字段与引擎术语命中必须为 0；并构造**反例**——故意把 Drift Report 一行塞进镜头卡 → 隐身 grep 必须报命中（证明闸是真闸）。

**测试用例 / 基线：**
- 基线 B0：`[Element_LinChen]` 基线档案（头身比 7.5、发 H≈0、瞳 H≈24、无 LOGO=null）。
- 用例 T1（真阴性/自审）：candidate = baseline 图本身 → 全 PASS、GO、exit 0。
- 用例 T2（色相真阳性）：candidate = 发色 H+30° → `hsl.hair.h` FAIL、drift≈30°、NO-GO。
- 用例 T3（轮廓真阳性）：candidate = 头身比 8.2 → 轮廓 FAIL（9.3% > 5%）。
- 用例 T4（LOGO 真阳性）：带 LOGO 的 `[Prop_*]` 基线，LOGO 平移 Δ0.1 → LOGO FAIL（>0.05）。
- 用例 T5（L2 豁免）：服装 Look 变化**已在状态轴声明** → 该项记 EXEMPT 不 FAIL；未声明的同等变化 → FAIL。
- 反例 T6（隐身闸）：把一行 Drift Report 注入镜头卡 → DoD-4 grep 必报命中（闸有效）。

**为何这样能证明"真的有效"：**
- 用**已知幅度合成扰动**当真值，把"审计准不准"变成"测回的偏移量 ≈ 注入的偏移量"——可逐项数值核对，彻底摆脱"看着提升了"的空话。
- 确定性脚本 + JSON 逐字节可复现 → "对基线重跑无新增 FAIL"是**可重复执行的硬回归门**，直接命中缺口类 C（无秤无回归）的反义。
- 反例 T6 证明引擎隐身闸能**真拦截泄漏**，不是摆设。

**落地可靠性理由（5/5）：**
- 满分因素：①母范式（电商全案的轮廓±5%/HSL±15°/LOGO Δ0.05/白底≥245）**已是成熟、被点名的现成能力**，本案是抽象搬运而非从零发明；②被审特征的上游来源（头身比/瞳色发色/母色色温/材质颜色）**在 production-bible 三表里已结构化、已有翡翠楼全案基线**；③核心审计项（HSL/轮廓/明度/LOGO 坐标/白底）是**确定性像素运算**，无模型不确定性、可用合成扰动取真值、可重跑——这是 C 类里"秤"最实、最可证的一种；④脚本零宿主依赖（Pillow+numpy），且脚本缺失可降级模型审，不引入新脆弱点。无明显扣分项，故给 5/5。

## 8. 依赖与顺序 Dependencies

- **依赖 production-bible 三表稳定**（只读）：基线特征来源于角色表（头身比/瞳色发色）、场景表（母色/色温/90% 主导色相）、道具表（材质/颜色/LOGO）。前置：production-bible 契约（已就绪）。
- **依赖 asset-id-convention L1/L2 与 `@sN` 状态轴**（只读）：L2 豁免规则要读状态轴声明判"是否已登记的变化"。前置：已就绪。
- **依赖 continuity-quality §一.5（色温≤200K）/§二.8（暂停门）**：阈值复用 + 挂载位。前置：已就绪。
- **宿主能力（可选）**：被审图由 character-board/keyframe/color-palette 真机出图依赖宿主图像模型通道（与既有成员同）；脚本路径仅依赖本地 Python+Pillow+numpy，**不依赖宿主**。
- **与其它 DNN 关系**：与 **D4（运镜轨迹示意图）正交**（D4 是空间可视、D5 是数值审计，互不阻塞）；可为未来"美学评测（品味缺口 D）"提供报告结构范式（弱被依赖，非阻塞）；与 D2/D3（反向/适配）正交。本案是 **P0 横切护栏**，建议优先于其它覆盖类方向落地（一致性是地基）。

## 9. 风险与缓解 Risks & Mitigations

| 风险 | 影响 | 缓解 |
|---|---|---|
| R1 图像分割/主色提取在复杂背景下不稳（量错头身比/主色） | 误判 FAIL/PASS | 测量限定在主体掩膜区；主色取直方图众数（抗噪）；不稳项降级 NEEDS_HUMAN 而非臆造数值；合成扰动用例校准算法精度 |
| R2 审计产物被误当成片字段/参考帧泄漏（破隐身铁律） | 破成片、破铁律 | NFR-01 硬闸 + DoD-4 grep + 反例 T6；产物只存 `.audit/` 过程目录；FR-05 在三处契约加"绝不进成片"指针 |
| R3 L2 合法变化被误判为漂移（豁免规则漏判） | 误报 FAIL、白回修 | L2 豁免严格绑定"状态轴/色温弧光**已显式声明**"；未声明才 FAIL；报告标 EXEMPT 留痕可追 |
| R4 脸部身份相似度等难量化项无法脚本判 | 审计有盲区 | 明确分流 NEEDS_HUMAN，保留人审/模型审分支并行写入同报告；不假装"全脚本可判" |
| R5 阈值过严/过松（题材不同标准不同） | 噪声告警或漏报 | FR-02 题材修饰列 + L1/L2 分档；阈值表是数据、可调；用真机 A/B 校准边界（12° PASS / 18° FAIL 的体感） |
| R6 脚本依赖（Pillow/numpy）在某些环境缺失 | 脚本跑不起来 | NFR-02 降级：脚本是确定性加固非硬依赖，缺失则走"模型读图按 schema 填表"的人审/模型审模式，套件不瘫 |
| R7 "自动审计全绿"的旧文字自报习惯复发 | 假安全感回潮 | demo/contract 把"全绿"措辞改为引 Drift Report 的 GO/NO-GO（带数）；无 Drift Report 不得声称"审计通过" |

## 10. 工作量与里程碑 Effort & Milestones

**粗估总量：约 2.5–3.0 人周。**

- **M1 知识契约（约 0.8 周）**：写 `_shared/consistency-audit.md`——FR-01 基线档案 schema（6 类特征）、FR-02 容差阈值表、FR-03 Drift Report 结构、FR-05 挂载位与隐身闸；产出 `baseline_LinChen.json` + `[Prop_TangSuit_01]` 样例档案。产出物：可评审的契约 + 样例。
- **M2 审计脚本（约 1.0 周）**：实现 `audit_consistency.py`（HSL/轮廓/明度/LOGO 坐标/白底 5 项确定性测量 + NEEDS_HUMAN 分流 + JSON/MD 双输出 + exit 码）；产出物：可重跑脚本。
- **M3 测试与回归基线（约 0.6 周）**：构造合成扰动用例 T1–T6（含已知真值），接 DoD-5/6/7；建 `翡翠楼` 回归基线，断言"无新增 FAIL"。产出物：可重跑回归门 + 真值校准报告。
- **M4 接入与隐身闸（约 0.3 周）**：三处契约加交叉引用指针 + 暂停门挂载；跑 DoD-4 / 反例 T6 隐身专项；README 注册。产出物：闭环挂载 + 铁律证据。
- **M5 真机对图核验（约 0.3 周，付费步由用户亲点）**：1–2 角色真机关键帧跑审计，人评脚本判定与肉眼一致性。产出物：DoD-10 证据 + 阈值边界调参结论。

**关键路径**：M1 → M2 → M3（M4 可与 M3 并行，M5 在 M3 后）。M2+M3 的"脚本 + 合成扰动真值校准"是本案"可验证"的核心交付，优先于 M5 真机。

---

**契约版本**：D5 PRD Draft v0.1 ｜ 缺口类 C（无秤无回归）｜ 优先级 P0 ｜ 落地可靠性 5/5 ｜ 新增 Bone 层共享知识 `_shared/consistency-audit.md`（基线档案 + 容差阈值 + Drift Report）+ 确定性审计脚本 `_shared/scripts/audit_consistency.py`；审计在出图后由各视觉成员调用、接 `continuity-quality §二.8` 暂停门；引擎隐身铁律扩展为"**数值审计层不漏成片**"（继承 `asset-id-convention §5 footer` 与 `storyboard/output-contract §7.8`）。
