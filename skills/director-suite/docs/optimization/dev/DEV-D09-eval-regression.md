# D9 · 评测回归基线套件（Eval & Regression Baseline Suite）开发方案

> 编号 D9 ｜ 优先级 P0 ｜ 状态 Dev v0.1 ｜ 前置:[D09-eval-regression.md（本方向 PRD）](../D09-eval-regression.md) + [00-ENGINEERING-SUBSTRATE.md（共享底座）](./00-ENGINEERING-SUBSTRATE.md)
>
> PRD 答 *what/why*；本文件答 *how-to-build*——把 D9 接到共享底座上，**不重造任何验证脚手架**。
> 我只交付：审计插件 `audit_storyboard.py` + 回归对账器 `regression_diff.py`（薄编排）+ 五题材 clean/poison fixture（其中一对喂 reverse_test）+ 五题黄金基线 + 知识/契约文件 + 任务拆解。
> D9 是缺口类 **C（无秤无回归）** 的 P0 横切护栏，且是 **D-series 其余方向安全迭代的前置秤**——任何动 `_shared/` 或新增成员的方向（D1–D8…）合入前必须过 D9 回归门。
> **关系铁律**：D9 复用 D5 已验证的 Drift Report 结构 / 退出码语义 / 隐身闸；与 D5 **正交互补**——**D9 审文本契约层（镜头卡 + Seedance 提示词），D5 审图层（像素）**，检查项重叠数=0（NFR-05/DoD-10）。

---

## 1. 目标与范围

实现 PRD 的 **D9-FR-01..05 / NFR-01..05**：新增**开发期护栏目录 `_eval/`**——① 五题材冷启动基线集（文戏/武戏/POV/商业/拟人，每题 `case.md` 人读 + `case.yaml` 机读判据）；② 文本契约审计插件 `audit_storyboard.py`（6 类机器可判检查，输出统一 `Report`，复用 D5 Drift Report 结构与退出码）；③ 回归对账器 `regression_diff.py` + 五题冻结基线快照（改 `_shared/` 后逐题逐项 diff，劣化判 NO-GO，给嫌疑 `_shared/` 文件指针）；④ 一键入口 `run_eval.py`；⑤ 三条隔离铁律（评测产物不进成片 / 评测样本不当 fewshot / 评测术语零外显）落在 `_eval/README.md` 与脚本上。

指回 PRD 的 FR：本方向把 `output-contract.md §7 散文自检`（写给 agent 自己跑的勾选项）落成**脚本化、可重跑、产 JSON 判据**的秤（FR-02），并补上唯一缺失的"**改 `_shared/` 是否劣化**"的回归门（FR-03）。

**本方向作为"底座插件"的边界（纪律铁律）：**

- **复用不重造**：报告结构（`Report`/`Finding`/`Verdict`）/ GO-NO-GO / 退出码 / `leak_scan` / `snapshot` / `reverse_test` / `run_eval` / `registry` 全部用 `00-ENGINEERING-SUBSTRATE.md` 定义的共享 harness。我**只**写业务判据（`audit_storyboard.py` 的 6 类文本检查 + `regression_diff.py` 的劣化定义）、五对 fixture、五题黄金基线、一份 `_eval/README.md` 知识 + 五题测题卡、若干处注册/交叉引用改动。
- **零业务知识下沉到底座**：测题卡 schema、6 类检查、detector 类型表、劣化定义 a/b/c/d、嫌疑指针算法**全部**写在 `_eval/` 目录与插件私有逻辑里；只往 `lexicon.BY_DIRECTION["D9"]` 注册禁词、往 `_shared/scripts/audits/` 放一个插件。
- **不碰 Soul / 不新增 Bone 知识**（PRD NG5）：不改 `tacit-core.md`/`output-contract.md`/`mapping-tables.md` 任何条款文字，只**追加交叉引用注脚**；审计判据**全部引用既有规则**（强制映射引 `output-contract §2.1`、隐身词表引 `tacit-core §三.6`+`output-contract §7.6`、时长制引 `output-contract §0/§5`），**不发明新阈值**。
- **不评美学**（PRD NG3）：本工具只审"特征命中没命中、红线触没触发、契约合不合规、改 `_shared/` 劣化没劣化"（结构与回归）；难量化项（哇塞度/情绪曲线动人）输出 `NEEDS_HUMAN`，不臆造分数（NFR-03/DoD-3④）。
- **不重复 D5**（NG4/NFR-05）：D9=文本契约层秤（镜头卡字段/映射/隐身/特征），D5=图层秤（像素 HSL/轮廓/LOGO）；二者并行互补、重叠=0。
- **MVP 切线**：`audit_storyboard.py` 确定性闸（6 类检查 + 合成样本真值校准 + 反向注入 + leak_scan）+ `regression_diff.py` 空改动 0 劣化 / 注入劣化必 NO-GO，是"可验证"核心，优先于 M5 真机出镜头卡（付费由用户亲点）。

---

## 2. 交付物清单（精确文件路径表）

| 路径 | 类型 | 说明 |
|---|---|---|
| `skills/director-suite/_eval/README.md` | 知识md | **主交付**：FR-04 三条隔离铁律 + FR-05 开发期工作流挂载位 + NFR-02 脚本缺失降级模型审分支 + 目录约定（与 `_megaprompts/` 同属成员目录外、语义相反） |
| `skills/director-suite/_eval/cases/case-wenxi.{md,yaml}` | fixtures（题卡） | 文戏（锚定翡翠楼·题卡判据独立可跑）。`md`=人读题卡，`yaml`=机读判据 |
| `skills/director-suite/_eval/cases/case-wuxi.{md,yaml}` | fixtures（题卡） | 武戏（高速动作/手持/急切点/单镜≤2.5s 占比）·`script_excerpt` 原创 |
| `skills/director-suite/_eval/cases/case-pov.{md,yaml}` | fixtures（题卡） | POV 互动（第一人称视点连续/视线匹配切镜）·原创 |
| `skills/director-suite/_eval/cases/case-shangye.{md,yaml}` | fixtures（题卡） | 商业广告（白底/LOGO/产品一致性字段）·原创 |
| `skills/director-suite/_eval/cases/case-nirenhua.{md,yaml}` | fixtures（题卡） | 拟人风格化（非写实主体·风格核心锁全片不漂）·原创 |
| `skills/director-suite/_shared/scripts/audits/audit_storyboard.py` | audits插件py | 实现 `run(target)->Report` 并 `@register("storyboard")`；CLI `--case/--output/--json-out/--md-out`；6 类文本检查 + `NEEDS_HUMAN` 分流；`exit 0=GO / 1=NO-GO` |
| `skills/director-suite/_shared/scripts/audits/detectors.py` | audits插件py | detector 求值器（regex / regex_forbidden / ratio / enum_present / field_consistency / mapping_violation 6 类），被 `audit_storyboard.py` 私有调用 |
| `skills/director-suite/_eval/scripts/regression_diff.py` | audits插件py | 回归对账（baseline vs current·劣化定义 a/b/c/d·嫌疑指针·`--accept` re-baseline·写 CHANGELOG） |
| `skills/director-suite/_eval/scripts/run_eval.py` | audits插件py | D9 专用一键入口（薄壳）：跑全 5 题审计 → 调 `regression_diff` → 打印 GO/NO-GO 汇总 + 非零退出码（跨平台，替代 `run_eval.sh`） |
| `skills/director-suite/_eval/baseline/<case_id>.report.json`（×5） | baselines | 五题冻结基线审计报告（回归对账基准，`snapshot.freeze` 产出，判定区零时间戳） |
| `skills/director-suite/_eval/baseline/CHANGELOG.md` | baselines | re-baseline 留痕（每次 `--accept` 写一行：日期/题/改动说明，防静默把劣化洗成新基线） |
| `skills/director-suite/_shared/scripts/fixtures/cases/<case_id>.clean.md`（×5） | fixtures | 每题"全命中合规样本"（严格按 `expected_features` 写、无红线）→ 期望全 PASS、GO |
| `skills/director-suite/_shared/scripts/fixtures/cases/<case_id>.poison.md`（×5） | fixtures | 每题单点注入红线/违例样本（投毒动作见 §6②）→ 期望对应检查 FAIL、NO-GO |
| `skills/director-suite/_shared/scripts/fixtures/gen_storyboard_fixtures.py` | fixtures | 从 clean 程序化派生 poison（注入"自检确认"脚注 / `00:15` 时码 / 情绪5级配中景 / 删必填字段），让 fixture 可冷启动重建、真值精确可控 |
| `skills/director-suite/_shared/scripts/lexicon.py`（改） | registry项 | 往 `BY_DIRECTION["D9"]` 注册本方向禁词全集（§3②） |
| `skills/director-suite/storyboard/output-contract.md`（改） | 契约md（追加） | §7.8 末追加交叉引用注脚（→ 开发期评测/回归与隔离铁律见 `_eval/README.md`）。**原铁律文字不动** |
| `skills/director-suite/_shared/tacit-core.md`（改） | 契约md（追加） | §三.6「引擎隐身检」末追加交叉引用（→ 评测样本 `_eval/cases` 亦不得当 fewshot 搬进创作）。**原条款文字不动** |
| `skills/director-suite/_shared/continuity-quality.md`（改） | 契约md（追加） | 末尾追加一行指针（→ 多题材文本契约回归基线见 `_eval/`；与 D5 图层审计互补）。原条款不动 |
| `skills/director-suite/README.md`（改） | registry项 | 「维护」节追加"改 `_shared/` 或加成员前后跑 `_eval/` 回归门（NO-GO 不合入）"；目录树追加 `_eval/` 节点（标注"开发期护栏·非成片"） |

> **只读消费、不改语义**：`storyboard/output-contract.md`（§2.1 强制映射 / §3§4 字段 / §0§5 时长制 / §7.6§7.8 隐身判据来源）、`_shared/tacit-core.md §三.6`（隐身词表来源）、`_shared/mapping-tables.md §1`（情绪×景别映射判据 + T6 可注入劣化点）、`production-bible/examples/翡翠楼-全案demo.md`（文戏锚）、`storyboard/examples/fewshot-翡翠楼夜宴-v2全片.md`（文戏 clean 样本来源）、`DEV-D05-consistency-audit.md`（复用其 Drift Report 结构与隐身闸范式）。
>
> **目录归属备注**：审计**插件**（`audit_storyboard.py`/`detectors.py`）与 **fixture**（clean/poison）放在底座共享区 `_shared/scripts/audits/`、`_shared/scripts/fixtures/cases/`（与 D5 插件并列，统一被 `run_eval`/`reverse_test` 发现）；**题卡 / baseline / 回归对账器 / 一键入口 / README** 放在 D9 专属护栏目录 `_eval/`（PRD §5.1 钦定，强调"开发期护栏·物理隔离于成片"）。两处职责分明：底座区=可被全套件复用的机制插件；`_eval/`=D9 的题材知识 + 回归资产 + 隔离铁律。

---

## 3. 与共享底座的接线

### ① 复用 harness 哪些构件

| 底座构件 | D9 怎么用 |
|---|---|
| `harness/audit_report.py`（§2.1） | `audit_storyboard.run()` 返回 `Report`；6 类检查每条 `append Finding(check="D9-FR-02.fields", verdict=…, detail="镜头1-2 缺『切镜方式』字段", fix=…)`；特征/红线逐条 `Finding(check="feature.F2"/"redline.R1", …)`；收尾 `rep.assert_fail_has_fix()`；`decision`（有 FAIL→NO-GO）/`exit_code`（0/1）走统一语义。**判定区零时间戳**——`audited_at` 只入 Drift Report 的 `header` 元数据、不进 `Report.findings`（NFR-03）。**`feature_hit_rate` 不进 `Report.decision` 派生逻辑**，单独算后写入报告 footer，并由插件在 `run()` 内据 `pass_rule` 判一条 `Finding(check="pass_rule", verdict=PASS/FAIL)`——让"命中率未达阈值"也能落成一条 FAIL→NO-GO（底座 decision 只认 FAIL）。 |
| `harness/leak_scan.py` + `lexicon.py`（§2.2） | NFR-01 铁律闸：对**成片**（被审镜头卡 + Seedance 提示词）跑 `leak_scan(final_text, extra_terms=lexicon.BY_DIRECTION["D9"])`，命中评测/引擎术语即 FAIL。`PROCESS_TERMS` 已含 `审计/Drift/回归/PASS/FAIL/基线档案/tolerance`——D9 的核心泄漏词**底座已覆盖**，本方向补差集（`eval/regression/baseline/red_line/hit_rate/detector/评测✓` 等，§3②）。红线 R1 的"引擎术语泄漏" detector 直接复用 `lexicon.ENGINE_TERMS`，不另抄词表。 |
| `harness/snapshot.py`（§2.4） | `freeze(self_audit_report, "_eval/baseline/<case_id>.report.json")` 把"对每题 clean 样本自审"的报告冻结为五题黄金基线；回归时 `regression_diff` 逐字段对比（不只整文件 diff，见 §4.3）。`re-baseline` 走 `--accept` 显式触发 + 写 `CHANGELOG.md`。**底座 `snapshot.diff_against_golden` 是整文件 WARN 级**——D9 的 `regression_diff` 在其上加"逐题逐项劣化定义 a/b/c/d 的 FAIL 级硬门"，二者分工：snapshot 答"变没变"，regression_diff 答"变坏没坏"。 |
| `harness/reverse_test.py`（§2.5） | `assert_gate_is_real(storyboard_gate, clean_sample, poison_sample, name="D9-storyboard")`——证明闸对 clean（武戏全命中样本）放行 exit0、对 poison（注入"自检确认"脚注）报红 exit1。**五题各一对 fixture，至少武戏那对进 `reverse_test --all`**（完善⑥：无反例的闸视为未完成）。 |
| `harness/run_eval.py`（§2.6） | `@register("storyboard")` 让插件自动进 `run_eval` 的"5 基线 × 全审计 GO/NO-GO"编排；纳入 `make verify` 合入门。**注意**：底座 `run_eval` 的 `load_cases(cases_dir)` 与 D9 的 `_eval/cases/*.yaml` 题卡对接——D9 在 `run_eval` 侧提供 `load_cases` 的 case 加载器（每个 case 携带 `case_yaml_path` + `output_path`，见 §4.5），让底座 `run_eval` 与 D9 专属 `_eval/scripts/run_eval.py`（含回归对账步）两条入口都能跑。 |
| `registry.py` / `model_registry.json`（§2.7） | **弱引用**：审计本身不调模型、零付费（NFR-04）。仅当 `NFR-02` 降级到"模型审分支"时，文档（`_eval/README.md`）说明"由 agent 按 `case.yaml` schema 逐项打分"，不硬编码模型名；`regression_diff` 的 fix 文案若涉重生镜头，模型走 `registry.reg()`，不硬编码。 |

### ② 往 `lexicon.BY_DIRECTION` 加哪些禁词

PRD 底座已预置部分通用过程词于 `PROCESS_TERMS`（`审计/Drift/回归/PASS/FAIL/基线档案/tolerance/偏移量`）。本方向**补全**为「评测层专属、绝不可漏进成片」的差集（FR-04(c)）：

```python
# lexicon.py 改后
BY_DIRECTION = {
    ...,
    "D9": [
        # —— 评测/回归术语（成片侧零出现）——
        "eval", "evaluation", "评测", "评测✓", "评测通过",
        "regression", "回归门", "regression_diff",
        "baseline", "基线档案", "黄金基线", "re-baseline",
        "red_line", "红线", "redline", "red_lines",
        "hit_rate", "命中率", "feature_hit_rate", "expected_features",
        "detector", "pass_rule", "case_id", "case.yaml", "script_excerpt",
        "GO/NO-GO", "NO-GO", "NEEDS_HUMAN", ".eval/", "_eval/",
        # —— 引擎术语（与 ENGINE_TERMS 重叠，显式列入防词表重构漏网）——
        "自检确认", "Σ镜时长", "引擎隐身✓",
    ],
}
```

> 这些词命中成片即 NFR-01 违反。反例 T7（把一行审计报告/题卡判据注入镜头卡）依赖此集让 `leak_scan` 报红，证明隐身闸是真闸。R1 detector 与此集**共用** `ENGINE_TERMS`，避免两份哲学词表漂移。

### ③ 是否引用 model_registry

**弱引用**：审计脚本本身不选模型、不调模型（NFR-04 零付费调用，全程本地文本/正则/JSON）。仅两处弱引用：(a) `_eval/README.md` 的"脚本缺失降级模型审"分支说明（模型按 `case.yaml` schema 逐项打分，不写死模型名）；(b) `regression_diff` 的 `fixes[*].action` 若建议"重生该镜"，模型走 `registry.reg()["video"]["default"]`，不硬编码。换模型改 registry 一处即可。

### ④ 新增 `audits/audit_storyboard.py` 的 register 名

`@register("storyboard")`——与 00-SUBSTRATE §1 目录树 `audits/audit_storyboard.py D9` 一致。`run_eval` 的 `AUDIT_REGISTRY` 以此名挂载，5 题横切每题。与 D5 的 `@register("consistency")` 并列，二者互不重叠（DoD-10）。

### ⑤ 接上底座的 5 件 Done 清单（对照 00-SUBSTRATE §3）

```
1. audits/audit_storyboard.py 实现 run(target)->Report 并 @register("storyboard")     ✔ T06/T07
2. 往 lexicon.BY_DIRECTION["D9"] 注册禁词集（§3②）                                     ✔ T12
3. fixtures/cases/ 放每题一对 clean + poison，测试里 assert_gate_is_real（至少武戏对） ✔ T08/T09
4. 涉模型选择处一律 registry.reg()，禁硬编码模型名（仅 fix/降级文案）                  ✔ T07/T10
5. baseline/ 放五题黄金基线 report.json，纳入 run_eval 与 snapshot 回归（regression_diff）✔ T10/T11
```

---

## 4. 实现分解（可照着写的真实骨架）

### 4.1 `_eval/cases/case-<genre>.yaml`（测题卡机读判据 · FR-01）

每题一份 YAML，固定字段。**`detector` 是机读判据（枚举类型，非自由文本）**，脚本据此自动判命中/触发。下面给**武戏**完整样例（其余四题同 schema、`expected_features`/`red_lines` 换该题材判别性特征）：

```yaml
# _eval/cases/case-wuxi.yaml
case_id: "wuxi-01"
genre: "武戏"                       # 文戏 | 武戏 | POV | 商业 | 拟人（恰好五题、无缺无重）
script_excerpt: |                   # 冷启动输入剧本片段（原创·不抄示例，过 tacit-core §三.6 题材原创检；约150–300字）
  暴雨夜，废弃纺织厂。陈烬被三名持械者逼到锈蚀的纺机中央，断裂的钢索从头顶垂下……
  （原创片段，不搬运任何示例/参考片题材台词）
expected_features:                  # 期望特征 ≥5；每条 detector 非空且机读
  - id: F1
    desc: "高速动作段强制手持/斯坦尼康运镜命中"
    detector: { type: regex, target: shot_card, pattern: "运镜：.*(手持|Handheld|斯坦尼康|Steadicam)" }
    weight: 0.25
  - id: F2
    desc: "高潮打斗段切点密：单镜≤2.5s 占比≥0.60"
    detector: { type: ratio, metric: shots_le_2_5s, threshold: 0.60 }
    weight: 0.25
  - id: F3
    desc: "动作匹配/甩切/硬切类武戏衔接切镜出现"
    detector: { type: enum_present, field: "切镜方式", any_of: ["动作匹配", "甩切", "硬切"] }
    weight: 0.20
  - id: F4
    desc: "焦段-景别自洽（特写不配14mm广角）且光影分层含色温K+亮度%"
    detector: { type: field_consistency, rule: "focal_vs_shotsize && light_has_K_and_pct" }
    weight: 0.15
  - id: F5
    desc: "每镜头组恰一段 Seedance 提示词、音效数字化（含 dBFS 或 Hz）"
    detector: { type: regex, target: prompt, pattern: "(dBFS|Hz)" }
    weight: 0.15
red_lines:                          # 红线 ≥3；触发即 FAIL
  - id: R1
    desc: "引擎隐身泄漏：成片含哲学术语/自检脚注"
    detector: { type: regex_forbidden, target: shot_card, source: ENGINE_TERMS_PLUS,
                extra: ["自检确认", "Σ镜时长", "引擎隐身✓"] }
  - id: R2
    desc: "出现绝对时间码（破时长制）"
    detector: { type: regex_forbidden, target: all, pattern: "\\b\\d{1,2}:\\d{2}\\b" }
  - id: R3
    desc: "强制映射违例：情绪5级配中景及更松 / 情绪≤2级无理由特写"
    detector: { type: mapping_violation, table: "output-contract §2.1" }
pass_rule:
  feature_hit_rate_min: 0.85        # 加权命中率阈值
  red_lines_allowed: 0              # 红线 0 容忍
```

**五题 detector 差异（题材判别性特征，FR-01 验收②③，每题 ≥5 feature / ≥3 red_line）：**

| 题 | case_id | 判别性 expected_features（节选） | 关键 red_lines |
|---|---|---|---|
| 文戏 | `wenxi-01`（锚翡翠楼） | 对峙固定/缓推命中、分层光影含光比、长对白时长标 `≈`/区间、情绪阶梯不跳级 | R1 隐身、R2 时码、R3 映射违例 |
| 武戏 | `wuxi-01` | 手持/斯坦尼康、单镜≤2.5s 占比≥0.6、动作匹配/甩切、焦段-景别自洽 | 同上三红线 + R4「文戏滥用手持→此处反向期望手持」边界 |
| POV | `pov-01` | 第一人称视点描述连续、视线匹配(eyeline)切镜命中、主观镜头标识、手持/呼吸感字段 | 同三红线 + R4「第一人称中途断成第三人称客观全景无动机」 |
| 商业 | `shangye-01` | 白底/产品主体一致性字段、LOGO 位锁定描述、产品造型跨镜不漂、白底 RGB≥245 描述 | 同三红线 + R4「出现真实品牌名/竞品/夸大功效词」 |
| 拟人 | `nirenhua-01` | 风格核心锁定为非写实主体且全片同一锁、拟人主体特征跨组不漂、声画拟人化一致 | 同三红线 + R4「中途漂回 8K 真人写实（破风格核心锁）」 |

> `case-<genre>.md`（人读题卡）= `script_excerpt` 全文 + 期望特征/红线的中文解释 + 评分规则口语版，供人审与"模型审"降级分支读。**人读题卡与机读 yaml 的 `expected_features.id` 一一对应、不漂**。

### 4.2 `audit_storyboard.py` + `detectors.py`（确定性执行器 · FR-02）

**被审产物切分（§4「成片」边界，复用 00-SUBSTRATE §4）**：把 `--output <成片.md>` 切成两个文本视图——`shot_card`（镜头组/镜头字段区）与 `prompt`（每组 Seedance 提示词区）。detector 的 `target ∈ {shot_card, prompt, all}` 决定扫哪个视图。

```python
# _shared/scripts/audits/detectors.py — 6 类 detector 求值器（纯文本/正则/JSON，零图像零模型）
import re
from harness import lexicon

# 解析层：把成片 .md 解析成结构（镜头组 → 镜头 → 字段）。失败/含糊项不臆造 → 标 NEEDS_HUMAN。
def parse_storyboard(text: str) -> dict:
    """→ {'groups':[{'fields':{...}, 'shots':[{'fields':{...}, 'duration_s':float|None}], 'prompt':str}]}
    依 output-contract §3/§4 固定字段顺序解析；'时长：Xs' 抽 duration_s（区间/≈ 取中值并标 estimated=True）。"""
    ...

# —— 6 类 detector，统一签名 detect(view, det, ctx) -> (hit:bool, measured) ——
def d_regex(view, det, ctx):                 # type: regex          命中=True
    return bool(re.search(det["pattern"], _pick_view(view, det.get("target","all")))), None

def d_regex_forbidden(view, det, ctx):        # type: regex_forbidden 命中=触发红线(返回 True=触发)
    terms = []
    if det.get("source") == "ENGINE_TERMS_PLUS":
        terms = lexicon.ENGINE_TERMS + det.get("extra", [])
        pat = "|".join(re.escape(t) for t in terms)
    else:
        pat = det["pattern"]
    m = re.search(pat, _pick_view(view, det.get("target","all")))
    return bool(m), (m.group(0) if m else None)   # measured = 命中的具体词，写进 detail

def d_ratio(view, det, ctx):                  # type: ratio          比率≥threshold=命中
    if det["metric"] == "shots_le_2_5s":
        shots = ctx["all_shots"]
        durs  = [s["duration_s"] for s in shots if s["duration_s"] is not None]
        if not durs: return None, "NEEDS_HUMAN"          # 全是估值/无法判 → 不臆造
        ratio = sum(1 for d in durs if d <= 2.5) / len(durs)
        return ratio >= det["threshold"], round(ratio, 3)
    ...

def d_enum_present(view, det, ctx):           # type: enum_present   任一枚举值在该字段出现=命中
    vals = ctx["field_values"].get(det["field"], [])
    hit = any(any(a in v for v in vals) for a in det["any_of"])
    return hit, None

def d_field_consistency(view, det, ctx):      # type: field_consistency  规则全真=命中
    # rule="focal_vs_shotsize && light_has_K_and_pct" → 拆成原子谓词逐镜判，全镜通过才命中
    return _eval_consistency_rule(det["rule"], ctx), None

def d_mapping_violation(view, det, ctx):      # type: mapping_violation  发现违例=触发红线
    # 引 output-contract §2.1：逐镜取(情绪强度, 景别)，查强制项：
    #   情绪5级配中景及更松 → 违例；情绪≤2级特写且无破格动机标注 → 违例
    violations = _scan_mapping(ctx["shots"])
    return (len(violations) > 0), violations          # measured = 违例镜列表

DETECTORS = { "regex": d_regex, "regex_forbidden": d_regex_forbidden, "ratio": d_ratio,
              "enum_present": d_enum_present, "field_consistency": d_field_consistency,
              "mapping_violation": d_mapping_violation }
```

```python
# _shared/scripts/audits/audit_storyboard.py — 6 类机器检查 → 统一 Report（复用 D5/底座结构）
import argparse, json, sys, yaml
from harness.audit_report import Report, Finding, Verdict
from harness.run_eval import register
from harness import lexicon, leak_scan
from audits import detectors

def audit(case: dict, output_text: str) -> Report:
    rep = Report(audit="storyboard", target=case["case_id"])
    ctx = detectors.parse_storyboard(output_text)              # 解析成片为结构 + 视图
    views = {"shot_card": ctx["_shot_card_text"], "prompt": ctx["_prompt_text"], "all": output_text}

    # —— ① 字段齐全（output-contract §3/§4 固定字段无空缺）——
    for missing in detectors.missing_required_fields(ctx):     # 逐组/逐镜检 §3/§4 必填字段
        rep.findings.append(Finding("D9-FR-02.fields", Verdict.FAIL,
            f"{missing['where']} 缺字段『{missing['field']}』", measured=missing['field'],
            fix=f"按 output-contract §{missing['sec']} 补『{missing['field']}』字段"))

    # —— ② 强制映射守没守（§2.1 景别-情绪强制项）——  ※ 同时也是 R3 的判据来源
    for v in detectors.d_mapping_violation(views, {"type":"mapping_violation"}, ctx)[1]:
        rep.findings.append(Finding("D9-FR-02.mapping", Verdict.FAIL,
            f"{v['shot']} 情绪{v['emotion']}级配{v['shotsize']}（违 §2.1 强制项）", measured=v,
            fix="按 §2.1 改景别或显式标破格动机"))

    # —— ③ 时长制无绝对时码（§0/§5）——
    hit, code = detectors.d_regex_forbidden(views, {"type":"regex_forbidden","target":"all",
                 "pattern": r"\b\d{1,2}:\d{2}\b"}, ctx)
    if hit:
        rep.findings.append(Finding("D9-FR-02.no_wallclock", Verdict.FAIL,
            f"出现绝对时间码 {code!r}（破时长制 §0/§5）", measured=code,
            fix="删除绝对时码，改写『时长：Xs』（§5 双时长观）"))

    # —— ④ 引擎隐身 0 泄漏（tacit-core §三.6 + output-contract §7.6）——
    leak = leak_scan.leak_scan(views["shot_card"] + "\n" + views["prompt"],
                               extra_terms=lexicon.BY_DIRECTION["D9"])
    rep.findings.extend(leak.findings)                          # 命中即 FAIL（底座 leak_scan 已给 fix）

    # —— ⑤ 期望特征命中（按 case.expected_features 逐条判 + 加权命中率）——
    weighted_hit = 0.0; total_w = 0.0
    for feat in case["expected_features"]:
        det = feat["detector"]; fn = detectors.DETECTORS[det["type"]]
        hit, measured = fn(views, det, ctx)
        total_w += feat["weight"]
        if hit is None:                                        # 不可判 → NEEDS_HUMAN，不臆造、不计权
            rep.findings.append(Finding(f"feature.{feat['id']}", Verdict.WARN,
                f"{feat['desc']} → NEEDS_HUMAN", measured="NEEDS_HUMAN"))
            continue
        weighted_hit += feat["weight"] if hit else 0.0
        rep.findings.append(Finding(f"feature.{feat['id']}",
            Verdict.PASS if hit else Verdict.WARN,             # 单特征未命中=WARN，不直接 NO-GO；汇总进 hit_rate
            f"{feat['desc']}: {'命中' if hit else '未命中'}", measured=measured, threshold=feat["weight"]))
    hit_rate = round(weighted_hit / total_w, 4) if total_w else 0.0

    # —— ⑥ 红线触发（按 case.red_lines 逐条判，触发即 FAIL）——
    for rl in case["red_lines"]:
        det = rl["detector"]; fn = detectors.DETECTORS[det["type"]]
        triggered, measured = fn(views, det, ctx)
        if triggered:
            rep.findings.append(Finding(f"redline.{rl['id']}", Verdict.FAIL,
                f"红线触发 {rl['desc']}: {measured!r}", measured=measured,
                fix=f"消除触发源（{rl['desc']}）；评测产物绝不进成片（_eval/README §隔离铁律）"))

    # —— pass_rule 闸：命中率未达阈值 → 一条 FAIL（让 hit_rate 也能 NO-GO，底座 decision 只认 FAIL）——
    if hit_rate < case["pass_rule"]["feature_hit_rate_min"]:
        rep.findings.append(Finding("D9-FR-02.pass_rule", Verdict.FAIL,
            f"加权命中率 {hit_rate} < 阈值 {case['pass_rule']['feature_hit_rate_min']}", measured=hit_rate,
            threshold=case["pass_rule"]["feature_hit_rate_min"],
            fix="补足未命中特征（见上 feature.* WARN 行）或核对 detector"))

    rep.feature_hit_rate = hit_rate                            # 挂在 report 上，写进 footer（不入 decision）
    rep.assert_fail_has_fix()                                  # 铁律：每 FAIL 必带 fix
    return rep

@register("storyboard")                                       # 自动进 run_eval 的 GO/NO-GO
def run(target) -> Report:
    case = yaml.safe_load(open(target.case_yaml_path, encoding="utf-8"))
    output_text = open(target.output_path, encoding="utf-8").read()
    return audit(case, output_text)

def _cli():
    ap = argparse.ArgumentParser(description="文本契约审计（确定性加固，缺失则走 _eval/README 的模型审分支）")
    ap.add_argument("--case", required=True); ap.add_argument("--output", required=True)
    ap.add_argument("--json-out"); ap.add_argument("--md-out")
    a = ap.parse_args()
    case = yaml.safe_load(open(a.case, encoding="utf-8"))
    rep = audit(case, open(a.output, encoding="utf-8").read())
    if a.json_out: open(a.json_out, "w", encoding="utf-8").write(rep.to_json())   # sort_keys、无时间戳
    if a.md_out:   open(a.md_out, "w", encoding="utf-8").write(_to_markdown(rep))
    print(rep.to_json()); sys.exit(rep.exit_code)             # exit 0=GO / 1=NO-GO

if __name__ == "__main__":
    _cli()
```

**关键算法要点（可照着落地）：**
- **解析层是命门**：`parse_storyboard` 按 `output-contract §3/§4` 的**固定字段名与顺序**切块（`镜头组N 时长：`/`镜头N-M 时长：`/`景别：`/`运镜：`/`切镜方式：` 等锚点正则）；解析失败或字段含糊**不臆造**→ 标 `NEEDS_HUMAN`（NFR-03/DoD-3④）。
- **确定性铁律**：全程无随机、无时间戳进判定区；`Report.to_json()` 用 `sort_keys`——同输入两次运行 JSON 逐字节一致（NFR-03/DoD-7）。`feature_hit_rate` 是确定性的加权和，非估计。
- **退出码语义**：`exit 0=GO / 1=NO-GO`，直接喂 `make verify`、`reverse_test`、`regression_diff`。
- **红线 R1 词表单一来源**：复用 `lexicon.ENGINE_TERMS`，不在 yaml 里重抄哲学词（防两份词表漂移）。

### 4.3 `regression_diff.py`（回归对账 · FR-03 · 逐题逐项劣化定义）

```python
# _eval/scripts/regression_diff.py — baseline vs current 逐题逐项 diff（确定性，无随机/无时间戳判定）
import argparse, json, subprocess, sys, datetime
from pathlib import Path

FIVE_CASES = ["wenxi-01", "wuxi-01", "pov-01", "shangye-01", "nirenhua-01"]

def _load(p):
    return json.loads(Path(p).read_text(encoding="utf-8"))

def _failed_checks(report, prefix):
    return {f["check"] for f in report["findings"]
            if f["verdict"] == "FAIL" and f["check"].startswith(prefix)}

def _redline_count(report):
    return sum(1 for f in report["findings"]
               if f["check"].startswith("redline.") and f["verdict"] == "FAIL")

def diff_case(base, cur, eps=0.0):
    """劣化定义 a/b/c/d，任一命中即该题 NO-GO。"""
    worse = []
    # (a) 新增红线触发（基线计数 < 当前计数）
    if _redline_count(cur) > _redline_count(base):
        worse.append(f"new_redline ({_redline_count(base)}→{_redline_count(cur)})")
    # (b) 特征加权命中率下降（默认 eps=0.0，不允许任何下降）
    if cur["feature_hit_rate"] < base["feature_hit_rate"] - eps:
        worse.append(f"hit_rate↓ {base['feature_hit_rate']}→{cur['feature_hit_rate']}")
    # (c) 新增字段缺失（基线 PASS、当前 FAIL 的 fields_ 项）
    if _failed_checks(cur, "D9-FR-02.fields") - _failed_checks(base, "D9-FR-02.fields"):
        worse.append("new_field_missing")
    # (d) 新增引擎隐身泄漏
    if _failed_checks(cur, "LEAK") - _failed_checks(base, "LEAK"):
        worse.append("new_engine_leak")
    return worse

def shared_files_in_git_diff():
    """读 git diff --stat 的 _shared/ 范围给嫌疑指针（对齐 AI 短剧『失败-修复对照表』）。"""
    try:
        out = subprocess.run(["git", "diff", "--stat", "HEAD", "--", "skills/director-suite/_shared/"],
                             capture_output=True, text=True, check=False).stdout
        return [l.split("|")[0].strip() for l in out.splitlines() if "_shared/" in l]
    except Exception:
        return ["<git 不可用：人工核对 _shared/ 最近改动>"]

def regression(baseline_dir, current_dir, eps=0.0):
    overall = "GO"; report = []
    for cid in FIVE_CASES:
        base = _load(Path(baseline_dir) / f"{cid}.report.json")
        cur  = _load(Path(current_dir)  / f"{cid}.report.json")
        worse = diff_case(base, cur, eps)
        if worse:
            overall = "NO-GO"
            report.append({"case": cid, "regressions": worse, "suspect": shared_files_in_git_diff()})
    return {"decision": overall, "cases": report}

def accept_rebaseline(current_dir, baseline_dir, note):
    """--accept：把 current 升为新基线 + 写 CHANGELOG.md 一行（防静默把劣化洗成新基线）。"""
    assert note, "re-baseline 必须带 --note 改动说明（FR-03③）"
    for cid in FIVE_CASES:
        (Path(baseline_dir) / f"{cid}.report.json").write_text(
            (Path(current_dir) / f"{cid}.report.json").read_text(encoding="utf-8"), encoding="utf-8")
    ts = datetime.date.today().isoformat()
    with open(Path(baseline_dir) / "CHANGELOG.md", "a", encoding="utf-8") as fh:
        fh.write(f"- {ts} re-baseline: {note}\n")

def _cli():
    ap = argparse.ArgumentParser(description="D9 回归对账门（确定性、可重跑）")
    ap.add_argument("--baseline", required=True); ap.add_argument("--current", required=True)
    ap.add_argument("--eps", type=float, default=0.0)
    ap.add_argument("--accept", action="store_true"); ap.add_argument("--note", default="")
    a = ap.parse_args()
    if a.accept:
        accept_rebaseline(a.current, a.baseline, a.note); print("re-baselined."); sys.exit(0)
    res = regression(a.baseline, a.current, a.eps)
    print(json.dumps(res, ensure_ascii=False, sort_keys=True, indent=2))
    sys.exit(0 if res["decision"] == "GO" else 1)             # exit 0=GO / 1=NO-GO（CI 消费）

if __name__ == "__main__":
    _cli()
```

> **为何不直接用底座 `snapshot.diff_against_golden`**：底座 snapshot 答"产物逐字节变没变"（WARN 级，整文件 md5）；D9 回归门要答"**变坏没坏**"（FAIL 级，逐项劣化定义 a/b/c/d）——正常重构/措辞调整不算劣化，只有"新增红线 / 命中率降 / 新增缺字段 / 新增泄漏"才 NO-GO。`regression_diff` 在 snapshot 之上加这层语义。`snapshot.freeze` 仍用来冻结基线 report.json。

### 4.4 `run_eval.py`（D9 一键入口 · FR-05 · 跨平台替代 .sh）

```python
# _eval/scripts/run_eval.py — 全 5 题审计 → 回归对账 → 打印 GO/NO-GO 汇总
import json, sys, tempfile
from pathlib import Path
from audits.audit_storyboard import audit
import regression_diff, yaml

CASES_DIR = Path("_eval/cases"); BASELINE_DIR = Path("_eval/baseline")

def main(output_dir):
    """output_dir 内含 5 个 <case_id>.out.md（被审产物，agent 跑题产出或真机产出）。"""
    cur_dir = Path(tempfile.mkdtemp())
    summary = []
    for yml in sorted(CASES_DIR.glob("*.yaml")):
        case = yaml.safe_load(yml.read_text(encoding="utf-8"))
        out = Path(output_dir) / f"{case['case_id']}.out.md"
        rep = audit(case, out.read_text(encoding="utf-8"))
        (cur_dir / f"{case['case_id']}.report.json").write_text(rep.to_json(), encoding="utf-8")
        summary.append((case["case_id"], rep.decision, rep.feature_hit_rate))
    reg = regression_diff.regression(BASELINE_DIR, cur_dir)    # 与冻结基线对账
    print("== 逐题审计 ==")
    for cid, dec, hr in summary: print(f"  {cid:14} {dec:6} hit_rate={hr}")
    print(f"== 回归对账 == {reg['decision']}")
    for c in reg["cases"]: print(f"  劣化 {c['case']}: {c['regressions']} 嫌疑 {c['suspect']}")
    audit_nogo = any(d == "NO-GO" for _, d, _ in summary)
    overall = "NO-GO" if (audit_nogo or reg["decision"] == "NO-GO") else "GO"
    print(f"== 整体 == {overall}")
    return 0 if overall == "GO" else 1

if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1] if len(sys.argv) > 1 else "_eval/.runs/latest"))
```

### 4.5 `gen_storyboard_fixtures.py`（合成 poison 生成器 · 真值精确可控）

```python
# _shared/scripts/fixtures/gen_storyboard_fixtures.py — 从 clean 派生 poison（单点注入、真值已知）
from pathlib import Path

def inject_selfcheck_footer(text):       # → 触发 R1 引擎隐身红线（真值：必命中"自检确认"）
    return text + "\n\n自检确认：Σ镜时长=12s；引擎隐身✓；情绪强度N级标注外显。\n"

def inject_wallclock(text):              # → 触发 R2 绝对时码红线（真值：注入"00:15"）
    return text.replace("镜头1-2 时长：5s", "镜头1-2 时长：5s（00:15 入点）", 1)

def break_mapping(text):                 # → 触发 R3/§2.1 强制映射违例（情绪5级配中景）
    return text.replace("景别：特写（遵情绪5→特写）", "景别：中景（遵情绪5→中景）", 1)

def drop_required_field(text):           # → 触发 ①字段齐全 FAIL（删一镜的『切镜方式』整行）
    return "\n".join(l for l in text.splitlines() if not l.strip().startswith("切镜方式："))

POISONS = {"selfcheck": inject_selfcheck_footer, "wallclock": inject_wallclock,
           "mapping": break_mapping, "drop_field": drop_required_field}

def build(clean_path, out_dir, variants):
    clean = Path(clean_path).read_text(encoding="utf-8")
    for v in variants:
        Path(out_dir, f"{Path(clean_path).stem.replace('.clean','')}.poison.{v}.md")\
            .write_text(POISONS[v](clean), encoding="utf-8")
```

---

## 5. 任务拆解（Tickets）

| Ticket | 描述 | 产物 | 工时(人天) | 前置 |
|---|---|---|---|---|
| D9-T01 | 定 `case-<genre>.yaml` schema（FR-01 字段固定）；写文戏题卡 yaml/md（锚翡翠楼，判据独立可跑） | `_eval/cases/case-wenxi.{md,yaml}` + schema 说明 | 0.75 | — |
| D9-T02 | 写武戏题卡（原创 `script_excerpt` + ≥5 feature + ≥3 red_line + pass_rule） | `case-wuxi.{md,yaml}` | 0.5 | T01 |
| D9-T03 | 写 POV 题卡（第一人称视点连续/视线匹配·原创） | `case-pov.{md,yaml}` | 0.5 | T01 |
| D9-T04 | 写商业题卡（白底/LOGO/产品一致性·原创·禁真实品牌名） | `case-shangye.{md,yaml}` | 0.5 | T01 |
| D9-T05 | 写拟人题卡（非写实主体·风格核心锁全片不漂·原创） | `case-nirenhua.{md,yaml}` | 0.5 | T01 |
| D9-T06 | 实现 `detectors.py`：6 类 detector 求值器 + `parse_storyboard` 解析层（含 NEEDS_HUMAN 分流） | `audits/detectors.py` | 1.5 | T01 |
| D9-T07 | 实现 `audit_storyboard.py`：6 类检查 + 加权命中率 + pass_rule 闸 + `run()@register("storyboard")` + `_cli` + JSON/MD 双输出 + exit 码 + `assert_fail_has_fix` | `audits/audit_storyboard.py` | 1.5 | T06 |
| D9-T08 | 写 `gen_storyboard_fixtures.py`；为五题各造 clean 全命中样本（文戏复用翡翠楼 fewshot 节选）+ 4 类 poison | `gen_*.py` + 5× clean.md + poison 变体 | 1.0 | T07 |
| D9-T09 | 造 fixture 对（clean/poison）；写 `assert_gate_is_real` 测试（武戏对接 `reverse_test`）+ 四类真阳性测回断言 | `fixtures/cases/*.{clean,poison}.md` + 测试 | 0.75 | T08 |
| D9-T10 | 实现 `regression_diff.py`：劣化定义 a/b/c/d + 嫌疑指针(git diff) + `--accept` re-baseline + CHANGELOG；fix 文案引 registry | `_eval/scripts/regression_diff.py` | 1.0 | T07 |
| D9-T11 | 对五题 clean 样本自审→冻结 `<case_id>.report.json`（snapshot.freeze）×5 + `CHANGELOG.md`；写回归"空改动 0 劣化"断言 | `_eval/baseline/*.report.json` + 回归测试 | 0.5 | T07,T08 |
| D9-T12 | `lexicon.py` 注册 `BY_DIRECTION["D9"]` 全集；NFR-01 leak_scan 专项 + 反例 T7（注入一行审计报告→必报命中）；样本隔离 grep | `lexicon.py`(改) + leak 测试 | 0.5 | T07 |
| D9-T13 | 写 `_eval/README.md`（三条隔离铁律 + 工作流挂载位 + 降级模型审分支）；`run_eval.py` 一键入口 | `_eval/README.md` + `_eval/scripts/run_eval.py` | 0.75 | T07,T10 |
| D9-T14 | 三处契约追加交叉引用（output-contract §7.8 / tacit-core §三.6 / continuity-quality 末）+ README 维护节 + 目录树（原文字不动） | 4× .md(改) | 0.5 | T13 |
| D9-T15 | `@register` 接 run_eval；接 Makefile `verify`；T6 真劣化验证（打乱 mapping-tables §1 → NO-GO + 嫌疑指向） | run_eval/Makefile 接通 + T6 验证报告 | 0.5 | T10,T11 |
| D9-T16 | (M5,付费由用户亲点)取 1–2 题（武戏/文戏）真机跑出镜头卡；人评脚本判定与肉眼一致(DoD-11)；detector 边界调参 | 对图核验报告 + 调参结论 | 0.75 | T15 |

> 合计约 **13.0 人天 ≈ 2.6 人周**（不含 T16 真机 0.75d 的用户排期等待），与 PRD §10 的 2.5–3.0 人周吻合（底座复用省下脚手架工量）。关键路径 **T01→T06→T07→T08→T09 / T10→T11→T15**。五道题卡 T02–T05 可并行；M4 隐身闸(T12)可与 T10/T11 并行。

---

## 6. 测试方案

### ① 正例（clean 基线：用哪份，期望 GO）

- 用每题的 `fixtures/cases/<case_id>.clean.md`：严格按该题 `expected_features` 写、无任何红线（文戏 clean 直接节选翡翠楼 `fewshot-翡翠楼夜宴-v2全片.md`，其余四题按各自 `script_excerpt` 造全命中合规样本）。
- 期望：`audit→` 字段齐全/映射/无时码/隐身 全 PASS、红线触发=0、`exit 0`、`feature_hit_rate ≥ pass_rule.feature_hit_rate_min`（武戏 ≥0.85）、`decision=GO`。对应 **DoD-2**。
- 回归用：此自审报告即 `_eval/baseline/<case_id>.report.json` 的内容，`snapshot.freeze` 冻结。

### ② 反向注入（poison fixture：具体投毒什么数据，期望 FAIL，期望测回值）

`gen_storyboard_fixtures.py` 从每题 clean 派生**已知单点扰动**样本，真值精确可逐项核对：

| 用例 | 投毒动作（精确） | 期望判定 | 期望测回值（硬核对） |
|---|---|---|---|
| **T2 红线·隐身** | clean 尾部追加一行 `自检确认：Σ镜时长=12s；引擎隐身✓` | `redline.R1` **FAIL** + `LEAK` FAIL | 报告 `measured="自检确认"`、`decision=NO-GO`、`exit 1`、指明 `redline.R1` |
| **T3 红线·时码** | 把 `镜头1-2 时长：5s` 改成含 `00:15` 入点 | `D9-FR-02.no_wallclock`/`redline.R2` **FAIL** | `measured="00:15"`、NO-GO、`exit 1` |
| **T4 违例·映射** | 把某情绪5级镜的 `景别：特写` 改成 `景别：中景`（破 §2.1 强制项，无破格动机标注） | `D9-FR-02.mapping`/`redline.R3` **FAIL** | `measured` 列出 `{shot, emotion:5, shotsize:中景}`、NO-GO |
| **T5 缺字段** | 删一镜的整行 `切镜方式：…`（破 §4.6 必填） | `D9-FR-02.fields` **FAIL** | `measured="切镜方式"`、`fix` 指 §4.6、NO-GO |
| **T-HR 命中率** | 武戏样本删掉所有 `手持/斯坦尼康` 运镜（F1 未命中，权重 0.25 掉） | `feature.F1` WARN + `pass_rule` **FAIL** | `feature_hit_rate≈0.75 < 0.85`、NO-GO（证明 hit_rate 下降也能 NO-GO） |

> 真值由 `gen_storyboard_fixtures.py` 注入，故"测回的命中词/违例镜 = 注入的扰动"可逐项布尔/字符串核对——这是"真的有效"的硬证据。对应 **DoD-3**。难判项（哇塞度/情绪曲线动人）→ `NEEDS_HUMAN` 行，不臆造分数（DoD-3④）。

### ③ `assert_gate_is_real` 调用示例

```python
# tests/test_d9_storyboard.py
from harness.reverse_test import assert_gate_is_real
from audits.audit_storyboard import audit
import yaml
from types import SimpleNamespace

def _gate(sample):                       # sample={'case':case_dict,'output':md_text} → Report
    return audit(sample["case"], sample["output"])

def test_d9_gate_is_real():
    case   = yaml.safe_load(open("_eval/cases/case-wuxi.yaml", encoding="utf-8"))
    clean  = {"case": case, "output": open("_shared/scripts/fixtures/cases/wuxi-01.clean.md",  encoding="utf-8").read()}
    poison = {"case": case, "output": open("_shared/scripts/fixtures/cases/wuxi-01.poison.selfcheck.md", encoding="utf-8").read()}
    assert_gate_is_real(_gate, clean, poison, name="D9-storyboard")
    # 干净样本 exit0 放行、投毒样本 exit1 报红；否则断言抛错（橡皮图章/假阳性即失败）

def test_d9_redline_value():             # 真值核对：测回命中词 = 注入词
    case = yaml.safe_load(open("_eval/cases/case-wuxi.yaml", encoding="utf-8"))
    rep  = audit(case, open("_shared/scripts/fixtures/cases/wuxi-01.poison.selfcheck.md", encoding="utf-8").read())
    r1 = next(f for f in rep.findings if f.check == "redline.R1")
    assert r1.verdict.value == "FAIL" and "自检确认" in str(r1.measured)
    assert rep.exit_code == 1
```

### ④ 回归：冻结哪份黄金基线，改什么后重跑应如何

- **冻结**：五题各一份 `_eval/baseline/<case_id>.report.json` = 对各题 clean 样本自审的报告（全 PASS、GO、`feature_hit_rate ≥ 阈值`）。`snapshot.freeze(self_audit_report, path)`。
- **空改动重跑（T5/DoD-5）**：不动 `_shared/`，对同一组 clean 样本重跑 `audit` → `regression_diff.regression(baseline, current)` 断言 `decision=GO`、0 劣化项（秤自身确定性稳定、无假阳性）。JSON 逐字节比对（时间戳已排除判定区外）：diff=0。
- **真劣化重跑（T6/DoD-6）**：临时**打乱 `_shared/mapping-tables.md §1` 的情绪-景别映射**（例：把"情绪5级强制景别"从 `特写 BCU / 大特写 ECU` 改成 `中景 MS`）→ agent 据被污染的映射重跑出镜头卡 → 至少 1 题（武戏/文戏）`D9-FR-02.mapping`/`redline.R3` 新增 FAIL 或命中率下降 → `regression_diff` 判该题 `new_redline`/`hit_rate↓` → 整体 **NO-GO、`exit 1`**，`suspect` 指向 `skills/director-suite/_shared/mapping-tables.md`。
  - **空改动 0 劣化 + 注入劣化必 NO-GO** 是一对**对偶证据**：前者证秤无假阳性（不冤枉好改动），后者证秤无假阴性（抓得住坏改动）——这正是缺口类 C「对基线 X 重跑、Y 项是否劣化」的反义。
- **re-baseline 留痕**：合理改进（如有意调映射）→ `regression_diff --accept --note "调情绪5级映射加大特写，经评审"` → 升级基线 + `CHANGELOG.md` 写一行（防静默把劣化洗成新基线，DoD-8）。
- **铁律 grep（DoD-4）**：对成片镜头卡 + Seedance 提示词跑 `leak_scan(final_text, extra_terms=BY_DIRECTION["D9"])`，评测术语（`eval|regression|baseline|red_line|hit_rate|detector|评测✓|审计✓`）与引擎术语（`Polanyi|默会|格式塔|支柱|方法论|自检确认`）命中 **= 0**；反例 T7（把一行审计报告注入镜头卡）→ 必报命中（证明闸是真闸）。另查真实剧本输出**未搬运任何题卡 `script_excerpt` 的题材/台词**（样本隔离 grep）。

### ⑤ 真机那一层怎么验（付费按钮由用户点）

- M5/T16：取 1–2 题（武戏 + 文戏），让 agent **真机跑既有 6 步管线出镜头卡**（文戏可直接复用翡翠楼路径，武戏为新题；付费步由用户亲点 grsai/gemini 生成站位与出图环节）。
- 跑 `audit_storyboard.py` 得 Drift Report，人评（≥3 名评审一致，DoD-11）：脚本判的 PASS/FAIL/命中率与肉眼看到的题材特征**一致**（武戏抓到手持/急切点、文戏抓到对峙/分层光影）；且脚本能抓人眼易忽略的项（某镜漏 `切镜方式` 字段、某组超 15s 未拆、某镜情绪5级误配中景）。边界体感反哺 `case.yaml` 的 detector 阈值（如 `shots_le_2_5s` 占比阈值）调参。

---

## 7. 里程碑与退出门

| Milestone | 产物 | 退出门（哪些脚本必须绿 / 哪些 DoD 必须过） |
|---|---|---|
| **M0 步行骨架（Sprint 0 后续，~0.4 周）** | `case-wuxi.yaml` + `detectors.py`/`audit_storyboard.py` 最小版（只做 ①字段 ④隐身 ⑥红线三类）+ 武戏 clean/poison(selfcheck) 一对 | 对武戏 clean `audit→GO,exit0`；poison `audit→FAIL,exit1,测回"自检确认"`；`assert_gate_is_real` 双过；`@register("storyboard")`→`run_eval` 打印 GO/NO-GO；接 `make verify`。**证明文本契约这条秤能转。**（前序底座骨架由 D5 在 Sprint 0 承载，D9 复用其 harness） |
| **M1 多题材基线集（~0.9 周）** | 五题 `case-<genre>.{md,yaml}` 全（文戏锚翡翠楼 + 武戏/POV/商业/拟人原创）；schema 定稿 | **DoD-1**（恰 5 题、无缺无重、每题 ≥5 feature/≥3 red_line、detector 非空机读、其余四题 `script_excerpt` 原创过题材原创检）绿 |
| **M2 审计脚本（~0.9 周）** | `detectors.py` + `audit_storyboard.py` 全（6 类检查 + 加权命中率 + pass_rule 闸 + NEEDS_HUMAN + JSON/MD + exit 码） | **DoD-2**（clean 全 PASS、`hit_rate ≥ pass_rule`）、**DoD-9**（仅标准库+PyYAML、无图像库、`--help` 独立跑）、**DoD-10**（每 check 注引用规则出处、与 D5 重叠=0）绿 |
| **M3 回归对账 + 基线快照（~0.6 周）** | `regression_diff.py`（劣化 a/b/c/d + 嫌疑指针 + `--accept`）+ `run_eval.py` + 五题 `baseline/*.report.json` + `CHANGELOG.md` | **DoD-5**（空改动 5 题全 GO、0 劣化）、**DoD-6**（打乱 mapping-tables → ≥1 题 NO-GO、嫌疑指向 mapping-tables.md）、**DoD-7**（2 次审计 JSON diff=0）绿；`reverse_test --all` 过 |
| **M4 合成样本测试 + 隐身闸（~0.4 周，可与 M3 并行）** | `gen_storyboard_fixtures.py` + 五对 fixture + 测试套 + lexicon 注册 + 三处契约交叉引用 + README | **DoD-3**（T2–T5 + T-HR 真阳性测回准、fix 非空）、**DoD-4**（leak grep=0 + 反例 T7 报命中 + 样本隔离 grep）、**DoD-8**（`_eval/README` 三铁律 + 三处交叉引用原文字未改 + `run_eval.py` 一键跑完打印 GO/NO-GO + 非零退出码）绿 |
| **M5 真机对图核验 + 工作流接入（~0.2 周，付费由用户亲点）** | 1–2 题真机镜头卡 Drift Report + detector 边界调参结论 + README 维护节工作流挂载 | **DoD-11**（≥3 评审脚本判定与肉眼一致） |

> **MVP 切线 = M0+M1+M2+M3+M4**：确定性脚本 + 五题材题卡 + 合成样本真值校准 + 回归门是"可验证"核心，优先于 M5 真机。关键路径 M0→M1→M2→M3，M4 与 M3 并行，M5 殿后。**退出门即合入门**：任何动 `_shared/` 的 PR 必过 `make verify` 四项（run_eval / reverse_test / leak_scan / portability）全 GO 才许合（完善④，不可绕过）；其中 `run_eval` 的"5 题 × storyboard 审计 + 回归对账"是 D9 落点。

---

## 8. 风险与回滚

| 风险 | 影响 | 缓解 / 回滚 / 降级 |
|---|---|---|
| **R1 detector 写太死/太松**（误判命中、漏判红线） | 假阳/假阴、秤不准 | 每 detector 用合成样本（clean 全命中 + 单点注入 poison）双向校准（§6②）；难判项降级 `NEEDS_HUMAN` 而非臆造；阈值（命中率/占比）写进 `case.yaml` 可调。**回滚**：某 detector 假阳性高，降级该特征为 `NEEDS_HUMAN`（脚本仍跑其余项，不全废）。 |
| **R2 解析层 `parse_storyboard` 对自由格式镜头卡解析失败** | 字段检/映射检全废 | 解析锚定 `output-contract §3/§4` **固定字段名+顺序**正则；解析失败的镜/字段标 `NEEDS_HUMAN`、不臆造判 PASS；clean 样本严格按契约格式造，先证解析对再加题材。**回滚**：解析不稳的检查项降级 `NEEDS_HUMAN`。 |
| **R3 评测产物/测题被误当成片字段或 fewshot 搬运**（破隔离铁律） | 破成片、污染创作原创性 | NFR-01 双词表硬闸（lexicon `BY_DIRECTION["D9"]` + `ENGINE_TERMS`）+ DoD-4 grep + 反例 T7；产物只存 `_eval/`+`.eval/`；FR-04 在两处契约加"绝不进成片/绝不当 fewshot"指针；样本隔离专项 grep。**反例 T7 是真闸的证明**——闸失效会被 reverse_test 抓。 |
| **R4 五题覆盖不全/判别特征选错**（盖不住真盲点） | 回归门有盲区 | 每题特征落"判别性"（武戏≠文戏的那几条，见 §4.1 差异表）；多题材覆盖验证逐题断言判别特征能命中；题卡 schema 开放可增补（加第六题只需加一份 yaml + clean/poison + baseline）。 |
| **R5 "命中率不允许下降"过严**（正常重构被误判劣化） | 噪声 NO-GO、白回修 | `regression_diff --eps` 可调（默认 0.0 严，可放宽）；`--accept` 显式 re-baseline + `CHANGELOG` 留痕（合理变更可洗基线，但必须留痕说明，防静默劣化）。 |
| **R6 难量化项（哇塞度/情绪曲线动人）脚本判不了** | 审计有盲区 | 明确分流 `NEEDS_HUMAN`（WARN 级、不计权、不臆造），保留人评分支；`_eval/README` 写明"机器项硬阻断、品味项人评、分区不混判"（FR-05）。 |
| **R7 与 D5 职责混淆/重复造秤** | 维护混乱 | NFR-05 划清边界：D9=文本契约层（镜头卡/提示词字段/映射/隐身/特征），D5=图层（像素 HSL/轮廓/LOGO）；DoD-10 断言重叠=0；D9 复用 D5 报告结构但**不审像素、不 import Pillow/numpy**。 |
| **R8 宿主缺 PyYAML** | 脚本跑不起 | **NFR-02 降级**：脚本是确定性**加固**非硬依赖。缺失则走 `_eval/README` 的"模型审分支"——agent 按 `case.yaml` schema（纯 Markdown 可读）逐项打分，套件不瘫，只丢"逐字节可复现"的确定性回归门（回归降级为人审 diff）。题卡/baseline 纯文本，与脚本可用性解耦。**可选**：若环境连 PyYAML 都不便，题卡可改用 JSON（标准库 `json`），`case-<genre>.json` 与 yaml 等价。 |
| **R9 "自动审计全绿"旧文字自报习惯复发** | 假安全感回潮 | demo/contract 把"全绿"措辞改为引审计报告的 GO/NO-GO（带 `hit_rate`）；**无 `audit_storyboard` 报告不得声称"评测通过"**；leak_scan 把 `评测✓/审计✓` 列禁词，误贴成片即报红。 |

**宿主能力缺失的降级总线（NFR-02）**：题卡知识（`_eval/cases/*.md`/`.yaml`）与 `_eval/README.md` 永远可用（纯文本零宿主绑定）；脚本（`audit_storyboard.py`/`regression_diff.py`）是**可选确定性加固**——脚本头注明"缺失则走模型审分支"。最坏情况（无 Python）套件退到"模型按 `case.yaml` schema 读成片逐项打分"的人审/模型审模式，**评测护栏仍在**，只是丢掉"逐字节可复现"的确定性回归门。脚本全程零宿主 App 痕迹（无 `127.0.0.1:8777`）、零图像库、零付费调用（NFR-02/NFR-04）。

---

> **契约版本**：DEV-D9 v0.1 ｜ 缺口类 C（无秤无回归）｜ 优先级 P0 ｜ register 名 `storyboard` ｜ 接 00-ENGINEERING-SUBSTRATE.md 全套 harness（audit_report / leak_scan+lexicon / snapshot / reverse_test / run_eval / registry）。新增开发期护栏目录 `_eval/`（五题材冷启动基线集 + 回归对账器 + 一键入口 + 隔离铁律）与底座共享区插件（`audit_storyboard.py`/`detectors.py` + 五对 fixture）。**D9 是 D-series 其余方向安全迭代的前置秤**：任何动 `_shared/` 或新增成员的方向合入前过 D9 回归门。复用 D5 Drift Report 结构 / 退出码语义 / 隐身闸；与 D5 **正交互补**（D9 审镜头卡/提示词文本契约层、D5 审图像素层，重叠=0）；引擎隐身铁律**继承** `output-contract §7.8` + `tacit-core §三.6` 并**扩展**为"**评测层不漏成片 + 评测样本不污染创作**"。MVP 切线 = M0–M4（确定性脚本 + 五题材题卡 + 合成样本真值校准 + 回归门），优先于 M5 真机。
