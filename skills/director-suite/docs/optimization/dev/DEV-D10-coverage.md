# D10 · 覆盖补全（断连 4 题材纳管 + 缺类成员滚动补位）开发方案

> 编号 D10 ｜ 优先级 P2/P3 ｜ 状态 Dev v0.1 ｜ 前置：[D10-coverage.md（本方向 PRD）](../D10-coverage.md) + [00-ENGINEERING-SUBSTRATE.md（共享工程底座）](./00-ENGINEERING-SUBSTRATE.md)
>
> PRD 答 *what/why*；本文件答 *how-to-build*——把 D10 接到共享底座上，**不重造任何验证脚手架**。
> 我只交付：审计插件 `audit_coverage.py` + 一对 clean/poison fixture + 黄金基线（POV 互动最小剧本）+ 知识/契约文件（核对账 `coverage-ledger.md`、轻量成员 `pov-interactive/`、`style-refs.md` 补深 / 补节、`continuity-quality.md` 追加三专属硬禁）+ 任务拆解。

---

## 1. 目标与范围

实现 PRD 的 **D10-FR-01~06 + NFR-01~05**：先建一份**断连源逐源核对账** `docs/optimization/coverage-ledger.md`（把 README L88「44/48 同类已覆盖」的口头承诺升级为可核验账本，FR-01），再据账本**分级滚动补位**——半覆盖三条（人文纪录 / 动作 previz / 转播伪纪实）在 `style-refs.md` §六补深为完整气质条目并加专属反向锚定（FR-02）；零覆盖之「拟人风格化 / 主题变身」新增一行 + 变身序列写法（FR-03）；零覆盖之 **POV 互动**立轻量成员 `pov-interactive/`，定义分支骨架 schema + **摊平算法**（分支图 → 每条可达路径一份标准 v2.0 线性卡，FR-04）；视觉基因解构新增 `style-refs.md` 一节（单图反推气质锚，宿主能力门控，FR-06）；**每个补位项配 D9 可消费基线一条**（FR-05）。一句话指回 PRD：把"纸面覆盖率虚高、半覆盖被当已完成、2 类真空、断连源独门能力无落点"修成"逐源逐类可核验、每补一类可被 D9 重跑回归"。

**本方向作为"底座插件"的边界（纪律铁律）：**

- **复用不重造**：报告结构 / GO-NO-GO / `leak_scan` / `snapshot` / `reverse_test` / `run_eval` / `registry` 全部用 `00-ENGINEERING-SUBSTRATE.md` 定义的共享 harness。我**只**写业务判据（`audits/audit_coverage.py`）、一对 fixture、一份黄金基线、若干 Markdown 知识 / 契约文件、几处注册改动。
- **零业务知识下沉到底座**：覆盖度判定逻辑、变身序列 schema、分支骨架 schema、摊平算法、视觉基因反推协议、专属反向锚定规则**全部**写在 `coverage-ledger.md` / `pov-interactive/` 成员 / `style-refs.md` / `continuity-quality.md` 里；底座只新增一条 `lexicon.BY_DIRECTION["D10"]` 禁词 + 一个 `audits/` 插件。
- **Soul 一行不改**（PRD §5② 的结构性保证）：POV 互动 / 主题变身 / 视觉基因解构的"理解侧"全部复用 `tacit-core.md` 寓居读本 + 情绪优先六维；D10 只在 **Bone 扩库**（补 `style-refs.md` 行 / 节）+ 加一个 **Skin 轻量成员**。这是不破引擎隐身（NFR-01）的根本设计。
- **下游契约零改**（PRD N6/依赖）：POV 摊平后的成片仍走现有 `storyboard/output-contract.md` v2.0 + `seedance-2.0.md`，一行不改即过其 §7 全部自检；D10 只产"分支骨架 → 摊平卡"。
- **MVP 切线**：M0（ledger 全覆盖 + README 去口头承诺）+ M1（半覆盖三条补深 + 拟人变身行 + 视觉基因解构节）即可单独证明"覆盖账本不再撒谎 + 半覆盖被补深"，优先于 M2（POV 互动成员）与 M3（真机抽检，付费由用户亲点）。

**非本方向（PRD Non-Goals 对应）**：不一次铺满（萌宠 / Sora 入"滚动待办"区，N1/NFR-04）；不破引擎隐身（变身进度 / 分支状态 / 视觉基因反推标注绝不进成片，N2/NFR-01）；不破可移植性（POV 成员双态、视觉基因解构经探针门控、零平台 API，N3/NFR-02）；不搬题材 / 品牌 / 台词（N4/NFR-05）；不重写真覆盖行（东亚文艺 / 羊毛毡 / 微缩字节级不动，N5/NFR-03）；不做互动叙事运行时引擎（N6）；不做评测打分系统本身（D10 只供 D9 基线，N7）。

---

## 2. 交付物清单（精确文件路径表）

路径以仓库根 `skills/director-suite/` 为基准；底座路径见 SUBSTRATE §1。

| 路径 | 类型 | 说明 |
|---|---|---|
| `docs/optimization/coverage-ledger.md` | 知识md（Bone·元账本） | 断连 4 源 + 5 缺类逐源核对账：9 行 `{源/缺类, 独门能力, 套件落点(§行 或 "无"), 覆盖度∈{真/半/零}, 处置∈{确认/补条目/补节/补成员}, d9_baseline_id}` + "滚动待办"区（FR-01/NFR-04） |
| `pov-interactive/SKILL.md` | 知识md（Skin·入口/编排） | POV 互动成员入口：探题材 → 搭分支骨架 → 各分支落线性卡 → 摊平 → 剥状态；frontmatter 可索引、可触发（≥5 触发词：互动叙事/分支/POV/选择剧情/多结局） |
| `pov-interactive/output-contract.md` | 契约md（Skin） | **中间产物**契约：分支骨架 schema（节点 / 边 / 选择点 / 汇合点 / 终局）+ 摊平自检门；最终成片复用 `../storyboard/output-contract.md`（本契约只管"中间骨架"） |
| `pov-interactive/schema/branch_skeleton.schema.json` | 契约（JSON Schema） | 机器可消费的 `branch_skeleton` JSON Schema（审计脚本 `jsonschema` 校验用，draft 2020-12） |
| `pov-interactive/examples/fewshot-POV互动-demo.md` | 样例md（兼黄金基线人读版） | 最小互动剧本（2 选择点、3 可达终局）→ 分支骨架 → 摊平 → 3 份独立线性 v2.0 卡 |
| `_megaprompts/pov-interactive.megaprompt.md` | 样例md（可移植双态） | POV 成员单文件版（NFR-02），内联分支骨架范式 + 摊平算法描述，自包含、不依赖 Skill 安装 |
| `_shared/scripts/audits/audit_coverage.py` | audits插件py | 实现 `run(target)->Report` 并 `@register("coverage")`；四组判据见 §4（ledger 完整性 / §六条目结构同构 / 分支骨架校验 + 摊平路径计数 / 反向锚定 + 原创扫描），横切复用 `leak_scan` |
| `_shared/scripts/fixtures/D10_coverage.clean.json` | fixtures（正例） | 合法 ledger（9 行齐 + d9_baseline_id 非空）+ 合法分支骨架 + 合法 §六补深行 + 干净成片（应 PASS / GO） |
| `_shared/scripts/fixtures/D10_coverage.poison.json` | fixtures（反例） | 投毒样本（应 FAIL / NO-GO）；含 6 个独立投毒变体，具体见 §6 |
| `_shared/baselines/cases/pov_branch_demo/` | baselines | POV 黄金基线（最小互动剧本 + 冻结分支骨架 + 摊平后 3 份线性卡 + 气质锚 / 隐身禁词清单），纳入 `run_eval` 与 `snapshot` 回归（对齐 SUBSTRATE §1 `cases/` 的"POV 题"槽位） |
| `_shared/scripts/lexicon.py` → `BY_DIRECTION["D10"]` | registry项（新增） | 注册 D10 解构层 / 互动状态 / 变身进度禁词全集（见 §3②） |
| `_shared/scripts/audits/audit_coverage.py` 顶部 `@register` | registry项 | 自动进 `run_eval` 的 GO/NO-GO 编排 |

**最小侵入改动（非新建，仅追加行 / 节 / 注册）：**

| 路径 | 改动 |
|---|---|
| `README.md` | L88「44/48…同类已覆盖」→「逐源核对见 `docs/optimization/coverage-ledger.md`」（去口头承诺，FR-01）；「🎞 单产物成员」表新增一行 `🕹️ POV 互动叙事 → pov-interactive/`；目录结构树新增 `pov-interactive/` 与 `coverage-ledger.md` 节点 |
| `_shared/style-refs.md` | §六 L121「纪实观察/生活流」补深为人文纪录完整条目 + 伦理反向锚定（FR-02）；L131「动作预演分镜」补深 previz 简化卡变体说明（FR-02）；L125「体育转播伪纪实」补深比分条/隔行/cutaway + 禁真实联赛锚定（FR-02）；§六**新增一行**「拟人风格化/主题变身」+ 变身序列写法（FR-03）；**新增小节「八之二、视觉基因解构（从单图反推气质锚·宿主能力门控）」**（FR-06，排号避让既有 §八武戏，下文统一称"视觉基因解构节"）。**东亚文艺 L106/L120、羊毛毡 L130、微缩 L129 字节级不动**（NFR-03） |
| `_shared/continuity-quality.md` | §三「合规/版权类（硬禁）」L177 处追加三条专属硬禁：纪录片不摆拍可识别真人 / 不伪造真实事件 + 转播禁真实联赛 LOGO / 球员名 + 变身禁名人脸（NFR-05） |
| `storyboard/SKILL.md` | 路由表追加一行「做互动/分支叙事 → 读 `../pov-interactive/`」（≤3 行，NFR-04；仅当 M0 据 ledger 定 POV 为独立成员，本方案默认独立） |

> **只读消费、不改**：`tacit-core.md`（情绪优先六维引擎，一行不改）、`mapping-tables.md`（各路径独立校情绪强制项）、`dimensions.md`、`pro-params.md`、`storyboard/output-contract.md`（POV 摊平卡下游契约，零改即过 §7）、`seedance-2.0.md`（模型适配）。

---

## 3. 与共享底座的接线

### ① 复用 harness 哪些构件

| 底座构件（SUBSTRATE §2） | D10 怎么用 |
|---|---|
| `audit_report.py`（§2.1） | 审计插件输出唯一形态 `Report/Finding/Verdict`；`Finding.check` 引回 PRD 的 `D10-FR-0x`/`D10-NFR-0x`/`DoD#n`；调 `assert_fail_has_fix()` 保证每条 FAIL 带可执行修复动作；判定区零时间戳 |
| `leak_scan.py` + `lexicon.py`（§2.2） | **直接复用，不重写**。对所有补位项的**成片**（摊平后镜头卡 + Seedance 提示词 + 变身落卡）grep 引擎 / 过程 / 执行词 + D10 禁词；D10 把"变身进度 / frame_/ 分支 node_id / 视觉基因 / 反推 / 伦理核验 / previz标注"加进 `lexicon.BY_DIRECTION["D10"]`（NFR-01 引擎隐身硬门，DoD#7） |
| `portability_scan.py`（§2.3） | **横切复用，不新增脚本**。合入门 §5 的 `portability_all` 统一扫 `pov-interactive/SKILL.md`、`pov-interactive.megaprompt.md`、`style-refs.md` 新增行 / 节（不得出现 `vimax.`/`grsai.`/`.exe`/`localhost:8777`/货币），证 NFR-02 |
| `snapshot.py`（§2.4） | `freeze` 把"最小互动剧本 → 分支骨架 → 摊平 3 卡"冻成黄金基线；改 `pov-interactive` 摊平逻辑后用 `diff_against_golden` 测"路径枚举 / 摊平结构是否无故漂移"（回归 L2，PRD §7 摊平回归） |
| `reverse_test.py`（§2.5） | `assert_gate_is_real(audit_coverage.run, clean, poison)` 证明本方向四组闸不是橡皮图章（完善⑥：闸 + 反例才算 Done） |
| `run_eval.py`（§2.6） | `audit_coverage` 经 `@register("coverage")` 自动进 5 基线 × 全审计的 GO/NO-GO 编排；`pov_branch_demo` 进 `cases/`（占 SUBSTRATE §1 cases 五题里的 POV 槽位） |
| `registry.py` / `model_registry.json`（§2.7） | **只读不改**。POV 摊平卡 / 变身落卡走 Seedance，模型名一律 `registry.video_default()`（当前解析 `seedance-2.0`），禁在成员 / 契约 / 条目里硬编码模型名常量。本方向**不新增 / 不修改** `model_registry.json`（D3 单一事实来源） |

> D10 **不新增** harness 机制文件，只新增 1 个 `audits/audit_coverage.py` 插件。

### ② 往 `lexicon.BY_DIRECTION` 加哪些禁词

`lexicon.py` 现状 `BY_DIRECTION` **无** D10 槽位（SUBSTRATE §2.2 只预置了 D5/D8/D4）。本方向**新增** "D10 补位项的过程产物、绝不可漏进成片"全集（NFR-01 grep 禁词表的来源）：

```python
# lexicon.py 新增（追加到 BY_DIRECTION）
BY_DIRECTION["D10"] = [
    # —— 变身序列过程产物（FR-03，落卡须剥离）——
    "变身进度", "过渡态", "transmute_sequence", "invariant_lock",
    "frame_F0", "frame_F1", "frame_F2", "frame_F3", "_progress",
    # —— POV 互动分支结构（FR-04，摊平后绝不进成片）——
    "branch_skeleton", "node_id", "choice", "choices", "merge", "汇合点",
    "选择点", "分支", "branch", "goto", "跳转", "回边", "可达终局", "摊平",
    # —— 视觉基因解构标注（FR-06，反推产物只喂风格锁定，标注不进成片）——
    "视觉基因", "视觉基因解构", "反推", "母色", "色相反推", "读图能力探针", "探针",
    # —— previz / 纪录片 / 转播的"自指"标注（半覆盖条目专属，FR-02）——
    "previz标注", "技术草图自指", "伦理核验", "采访同意核验",
]
# 注：纯 `frame_\d` 形态由审计插件用正则 r"frame_F?\d" 单独硬扫（见 §4.2），
#     不进 lexicon 字符串列表（leak_scan 用 re.escape 逐词匹配，无法表达正则类）。
```

> 这些词是 D10 各补位项的**中间产物本体**（分支骨架里必须有 node_id / 变身 schema 里必须有 _progress——这是过程产物本体）；但 `leak_scan` 扫的是**成片**（摊平后的镜头卡 + Seedance 提示词 + 变身落卡）——成片里出现任意一条 = NO-GO（NFR-01 / DoD#7）。引擎术语（Polanyi/默会/格式塔/寓居/方法论/支柱）由底座 `ENGINE_TERMS` 已覆盖，D10 无需重列。

### ③ 是否引用 model_registry

**引用，只读**。POV 摊平卡 / 变身落卡的视频模型名一律经 `registry.video_default()` 取（当前解析为 `seedance-2.0`）；M3 可选真机出片抽检走 `registry.reg()["video"]["default"]`。本方向**不新增 / 不修改** `model_registry.json`。`pov-interactive/output-contract.md`、`style-refs.md` 变身条目、megaprompt 文案提到"喂给视频模型"时用中性措辞，不写死模型名常量（避免 D3 前移后返工 + 满足 `portability_scan` 不命中宿主 API）。

### ④ 新增 `audits/audit_coverage.py` 的 register 名

```python
@register("coverage")          # run_eval 的 AUDIT_REGISTRY key = "coverage"
def run(target) -> Report: ...
```

register 名 = `"coverage"`（与 audit 名 / `Report.audit` 字段一致，下划线风格对齐 `audit_consistency`/`audit_storyboard`/`audit_image_genome`）。

---

## 4. 实现分解（可照着写的真实骨架）

### 4.0 数据契约：`CoverageTarget`（插件输入）

`run_eval` / `reverse_test` 喂给插件的 `target` 形态。fixture JSON 与基线 case 都按此结构（一个 target 把 D10 四组判据要审的全部喂进来，便于单插件横切）：

```jsonc
// CoverageTarget schema（fixtures 与 baselines 共用）
{
  "id": "pov_branch_demo",                 // 被审对象标识（进 Report.target）
  "ledger_rows": [                          // FR-01：9 行核对账（缺行=审计 FAIL）
    {
      "source_or_gap": "一图成片（断连源3）",
      "unique_ability": "视觉基因解构：从单图反推色相/光质/构图/材质/名家锚",
      "suite_landing":  "style-refs.md §视觉基因解构节",  // 真/半覆盖给§行；零覆盖原写"无"，补后给落点
      "coverage":       "零覆盖",            // 真覆盖|半覆盖|零覆盖
      "disposition":    "补节",              // 确认|补条目|补节|补成员
      "d9_baseline_id": "BL-D10-VGD-01"      // 非空且须命中 baseline_ids（悬空=FAIL）
    }
    /* …共 9 行：4 断连源 + 5 缺类… */
  ],
  "baseline_ids": ["BL-D10-POV-01","BL-D10-TRANS-01","BL-D10-DOC-01",
                   "BL-D10-BCAST-01","BL-D10-VGD-01"],  // 真实存在的基线 id 全集
  "styleref_rows": [                        // FR-02/03：§六补深/新增行（四列结构核验）
    { "genre": "拟人风格化/主题变身",
      "style_anchor": "…", "shot_movement": "…",
      "visual_anchor": "…", "light_color": "…",
      "reverse_anchor": "禁名人脸/禁真实IP主体" }   // 半/变身行专属反向锚定
  ],
  "branch_skeleton": { /* 见 4.3 schema */ },        // FR-04：POV 分支骨架
  "flattened_boards": [ /* 摊平后每路径一份 v2.0 卡 */ ],  // FR-04 摊平产物
  "transmute_sequence": { /* 见 4.4 schema */ },     // FR-03：变身序列（可空）
  "final_text": "……所有补位项的成片汇总（摊平卡+变身落卡+Seedance提示词）……"  // leak_scan 扫描对象
}
```

### 4.1 审计插件 `audit_coverage.py`（四组判据骨架）

```python
# _shared/scripts/audits/audit_coverage.py
import re
from harness.audit_report import Report, Finding, Verdict
from harness.run_eval import register
from harness.leak_scan import leak_scan
from harness import lexicon

# 断连源 / 参考图专有名词黑名单（NFR-05 原创扫描；只列"招式以外的题材/品牌/人名"样例，按真实源校准）
PROPER_NOUN_BLOCKLIST = [
    "HappyHorse", "你的女友", "一图成片",        # 断连源/源剧本名
    "NBA", "ESPN", "棒球大联盟", "英超", "中超",   # 真实联赛/转播品牌
]

@register("coverage")
def run(target) -> Report:
    rep = Report(audit="coverage", target=target["id"])
    _check_ledger(target, rep)                 # 组1：FR-01 ledger 完整性
    _check_styleref_rows(target, rep)          # 组2：FR-02/03 §六条目结构同构
    _check_branch_and_flatten(target, rep)     # 组3：FR-04 分支骨架+摊平路径计数
    _check_originality(target, rep)            # 组4：NFR-05 反向锚定+原创扫描
    _merge_leak(target, rep)                   # 横切：NFR-01 引擎隐身（复用 leak_scan）
    rep.assert_fail_has_fix()
    return rep

# —— 组1：ledger 9 行齐 + 落点精确 + d9_baseline_id 非空且命中 —— (FR-01, DoD#1/#5)
def _check_ledger(t, rep):
    rows = t.get("ledger_rows", [])
    if len(rows) < 9:
        rep.findings.append(Finding("D10-FR-01", Verdict.FAIL,
            f"ledger 行数 {len(rows)} < 9（4断连源+5缺类）", measured=len(rows), threshold=9,
            fix="补齐缺失的源/缺类行，每行填全 6 字段"))
    ids = set(t.get("baseline_ids", []))
    for r in rows:
        # 真/半覆盖必给精确落点；零覆盖原可写"无"，但处置=补节/补条目/补成员后须给落点
        if r["coverage"] in ("真覆盖","半覆盖") and not re.search(r"style-refs\.md|§|L\d", r["suite_landing"]):
            rep.findings.append(Finding("D10-FR-01", Verdict.FAIL,
                f"{r['source_or_gap']} 判 {r['coverage']} 但落点不精确: {r['suite_landing']!r}",
                fix="补 style-refs.md §六 L1xx 或具体文件§行"))
        bid = r.get("d9_baseline_id","")
        if not bid:
            rep.findings.append(Finding("D10-FR-05", Verdict.FAIL,
                f"{r['source_or_gap']} d9_baseline_id 悬空", fix="指向真实存在的 D10 基线 id"))
        elif r["disposition"] != "确认" and bid not in ids:
            rep.findings.append(Finding("D10-FR-05", Verdict.FAIL,
                f"d9_baseline_id {bid!r} 未命中任何真实基线", measured=bid, threshold=sorted(ids),
                fix="在 baselines/ 落地该基线或改正 id"))

# —— 组2：§六补深/新增行四列齐 + 列结构同构 + 半/变身行带专属反向锚定 —— (FR-02/03, NFR-03, DoD#2/#3/#8)
REQUIRED_COLS = ["style_anchor","shot_movement","visual_anchor","light_color"]
NEEDS_REVERSE = {"纪实观察/生活流","人文纪录","体育转播伪纪实","拟人风格化/主题变身","动作预演分镜"}
def _check_styleref_rows(t, rep):
    for row in t.get("styleref_rows", []):
        missing = [c for c in REQUIRED_COLS if not row.get(c)]
        if missing:
            rep.findings.append(Finding("D10-FR-02", Verdict.FAIL,
                f"§六行 {row.get('genre')!r} 缺列 {missing}（须与现有14行四列同构）",
                fix="补全 风格锚/景别运镜/视觉锚点/光色 四列"))
        if row.get("genre") in NEEDS_REVERSE and not row.get("reverse_anchor"):
            rep.findings.append(Finding("D10-NFR-05", Verdict.FAIL,
                f"{row.get('genre')!r} 缺专属反向锚定", fix="补 ≥1 条硬禁（不摆拍真人/禁真实联赛/禁名人脸）"))

# —— 组3：分支骨架校验 + 无悬空 + 摊平路径数=可达终局数 —— (FR-04, DoD#4)
def _check_branch_and_flatten(t, rep):
    bs = t.get("branch_skeleton")
    if not bs: return                          # 非 POV case 跳过
    ok, msg = validate_branch_skeleton(bs)     # jsonschema + 结构断言（见 4.3）
    if not ok:
        rep.findings.append(Finding("D10-FR-04", Verdict.FAIL, f"分支骨架非法: {msg}",
            fix="补齐 nodes/edges/choice/merge/ending 字段或修不可达节点"))
        return
    reachable = count_reachable_endings(bs)
    boards = t.get("flattened_boards", [])
    if len(boards) != reachable:
        rep.findings.append(Finding("D10-FR-04", Verdict.FAIL,
            f"摊平卡数 {len(boards)} ≠ 可达终局数 {reachable}", measured=len(boards), threshold=reachable,
            fix="每条可达路径恰产一份线性卡；检查悬空/不可达分支"))
    for b in boards:                           # 每卡过 storyboard §7 九条自检（结构子集）
        for miss in storyboard_selfcheck(b):
            rep.findings.append(Finding("D10-FR-04", Verdict.FAIL,
                f"摊平卡 {b.get('path_id')} 未过 §7: {miss}", fix="按 output-contract §7 修字段"))

# —— 组4：断连源/参考图专有名词扫描=0 —— (NFR-05, DoD#11)
def _check_originality(t, rep):
    blob = t.get("final_text","") + str(t.get("styleref_rows","")) + str(t.get("transmute_sequence",""))
    for noun in PROPER_NOUN_BLOCKLIST:
        if re.search(re.escape(noun), blob):
            rep.findings.append(Finding("D10-NFR-05", Verdict.FAIL,
                f"补位产物搬运断连源/品牌专有名词: {noun!r}", measured=noun,
                fix="删除题材/品牌/人名，只保留气质锚词（招式不搬题材）"))

# —— 横切：引擎隐身（复用底座 leak_scan，附 D10 禁词 + frame_\d 正则硬扫）—— (NFR-01, DoD#7)
def _merge_leak(t, rep):
    final = t.get("final_text","")
    sub = leak_scan(final, extra_terms=lexicon.BY_DIRECTION.get("D10", []))
    rep.findings.extend(sub.findings)          # 把 leak_scan 的 FAIL 并进本报告
    if re.search(r"frame_F?\d", final):        # 正则类，lexicon 表达不了
        rep.findings.append(Finding("D10-NFR-01", Verdict.FAIL,
            "成片含变身帧号 frame_\\d", fix="落卡时剥离 _frame/_progress（strip_transmute_meta）"))
```

> `validate_branch_skeleton` / `count_reachable_endings` / `storyboard_selfcheck` 是**业务工具函数**，与插件同文件或放 `audits/_coverage_lib.py`；底座不感知它们（机制零业务知识）。

### 4.2 摊平算法（PRD §5③ 的可落地实现）

```python
# audits/_coverage_lib.py —— POV 分支图 → 多条线性 v2.0 卡 + 剥状态
def enumerate_paths(bs):
    """枚举所有 起点(kind=scene,入度0) → 终局(kind=ending) 的可达路径。"""
    start = next(n["node_id"] for n in bs["nodes"]
                 if not any(e["to"] == n["node_id"] for e in bs["edges"]))
    adj = {}
    for e in bs["edges"]:
        adj.setdefault(e["from"], []).append(e["to"])
    endings = {n["node_id"] for n in bs["nodes"] if n["kind"] == "ending"}
    paths, stack = [], [(start, [start])]
    seen_on_path = set()                       # 防回边死循环：路径内不重复访问节点
    while stack:
        node, path = stack.pop()
        if node in endings:
            paths.append(path); continue
        for nxt in adj.get(node, []):
            if nxt not in path:                # 切断循环（回边不无限展开）
                stack.append((nxt, path + [nxt]))
    return paths

def count_reachable_endings(bs):
    return len({p[-1] for p in enumerate_paths(bs)}) if False else len(enumerate_paths(bs))
    # 注：FR-04② "路径数=可达终局数" —— 这里取"可达路径数"。若一终局多路径可达，
    #     摊平须每路径一卡（用户体验=每条剧情线一份），故计数用 len(paths) 非 len(终局集合)。
    #     ledger/契约里写死此约定，避免歧义。

def no_dangling(bs):
    reachable = {nid for p in enumerate_paths(bs) for nid in p}
    all_nodes = {n["node_id"] for n in bs["nodes"]}
    return all_nodes == reachable, (all_nodes - reachable)   # 第二项=不可达悬空节点集

def flatten_pov(bs, script):
    probe_pov_lock(bs)                          # 锁第一人称 POV（复用 §六 L128 一镜到底 POV 锚）
    ok, dangling = no_dangling(bs)
    assert ok, f"悬空/不可达节点: {dangling}"    # FR-04①
    boards = []
    for p in enumerate_paths(bs):               # 每条路径 → 一份独立线性卡
        groups = [node_group(bs, nid) for nid in p]
        board  = render_linear_v2(groups, script)   # 走标准 v2.0 三层(场景→组→镜)
        board  = re_run_emotion_mapping(board)       # 情绪先行：每路径独立校 mapping 强制项
        board  = strip_interactive_meta(board)       # NFR-01：删 node_id/choices/edges/状态
        assert passes_selfcheck(board, "storyboard/output-contract.md §7")  # 复用既有9条自检
        boards.append(board)
    assert len(boards) == count_reachable_endings(bs)   # FR-04②
    return boards                               # 输出=每路径一份标准线性卡 + 每组一段 Seedance

def strip_interactive_meta(board):
    """NFR-01 兜底：从落卡正文删去一切互动结构字段（白名单字段保留，其余剥离）。"""
    BANNED = ("node_id","choices","choice","edges","branch","goto","选择","分支","汇合","摊平")
    for shot in board["shots"]:
        for k in list(shot.keys()):
            if any(b in k for b in BANNED): shot.pop(k)
        shot["text"] = scrub(shot.get("text",""), BANNED)   # 正文同样擦
    return board
```

### 4.3 分支骨架 schema（`branch_skeleton.schema.json`，FR-04 中间产物·绝不入成片）

```jsonc
// pov-interactive/schema/branch_skeleton.schema.json (draft 2020-12，节选关键约束)
{
  "type": "object",
  "required": ["pov_lock", "nodes", "edges"],
  "properties": {
    "pov_lock": {                       // 第一人称 POV 锁定（复用 §六 L128 锚）
      "type": "object",
      "required": ["person", "anchor", "camera"],
      "properties": {
        "person": { "const": "first" },
        "anchor": { "type": "string" },               // "oneer/POV(§六 L128)"
        "camera": { "type": "string" }                // "镜头呼吸+手持拟真"
      }
    },
    "nodes": {
      "type": "array", "minItems": 2,
      "items": {
        "type": "object",
        "required": ["node_id", "group", "kind"],
        "properties": {
          "node_id": { "type": "string", "pattern": "^N\\d+$" },
          "group":   { "type": "string", "pattern": "^G\\d+$" },   // 镜头组
          "kind":    { "enum": ["scene","choice","merge","ending"] },
          "choices": {                                // 仅 kind=choice 用
            "type": "array",
            "items": { "type": "object",
                       "required": ["label","to"],
                       "properties": { "label": {"type":"string"}, "to": {"type":"string"} } }
          },
          "from": { "type": "array", "items": {"type":"string"} }  // 仅 kind=merge 用
        }
      }
    },
    "edges": {
      "type": "array", "minItems": 1,
      "items": { "type": "object", "required": ["from","to"],
                 "properties": { "from": {"type":"string"}, "to": {"type":"string"},
                                 "via": {"type":"string"} } }      // 经哪个 choice label
    }
  }
}
```

校验逻辑 `validate_branch_skeleton(bs)`：① jsonschema 通过；② 每个 `kind=choice` 节点至少 2 个 `choices`；③ 每条 `edge.from/to` 命中真实 `node_id`；④ 至少 1 个 `kind=ending`；⑤ `no_dangling` 为真（无不可达节点）；⑥ `enumerate_paths` 在带回边时**终止**（路径内不重复访问保证有限）。

### 4.4 变身序列 schema（FR-03 中间产物·绝不入成片）

```yaml
# style-refs.md「拟人风格化/主题变身」行内嵌的变身序列范式（人读），机器侧投进 transmute_sequence
transmute_sequence:
  type: 主体置换型变身                # 区别于羊毛毡/微缩的"质感变身"
  invariant_lock: 标志色             # 全程锁定的不变量：轮廓|标志色|关键道具(复用 continuity 物件叙事锚)
  states:                            # _前缀字段=禁出字段(落卡剥离)
    - { _frame: F0, role: 原态,   desc: "(创作语言·入成片)", _progress: 0 }
    - { _frame: F1, role: 过渡态1, desc: "...",              _progress: 40 }
    - { _frame: F2, role: 过渡态2, desc: "...",              _progress: 75 }
    - { _frame: F3, role: 目标态,  desc: "...",              _progress: 100 }
  # 落卡：每个 state.desc 摊为一张独立镜头卡；_frame/_progress 由 strip_transmute_meta 剥离(NFR-01)
```

`strip_transmute_meta(board)`：删去所有 `_frame`/`_progress`/`invariant_lock`/`transmute_sequence` 标注，仅保留各 `state.desc` 作为独立镜头卡的画面内容（白名单同 §4.2）。

### 4.5 视觉基因解构节降级（FR-06，写进 `style-refs.md` 新节，宿主能力门控）

```
# style-refs.md「八之二、视觉基因解构（从单图反推气质锚·宿主能力门控）」伪代码
def visual_gene_decompose(ref_image):
    if host_can_read_image():                 # 探针(档A)
        gene = extract({色相,光质,构图秩序,材质,名家锚})    # 5 类要素自动反推
    else:                                     # 探针(档B 降级)
        gene = ask_user_describe()            # 用户口述参考图气质
        gene = map_to_styleref_row(gene)      # 归类到 §六最近气质行 / §五名家库锚
    assert no_proper_nouns(gene)              # NFR-05: 只取气质，零题材/品牌/可读文字搬运
    return gene                               # → 喂 storyboard Step3 风格锁定(气质锚，非题材)
# 与 D2 拉片正交：D2 拆"视频时序骨架"，本节拆"单图气质基因"；ledger 记两者边界（R9）
```

### 4.6 `coverage-ledger.md` 行 schema（FR-01）+ 滚动待办区（NFR-04）

```yaml
# docs/optimization/coverage-ledger.md（9 行核对账 + 滚动待办，机器侧投进 ledger_rows）
- source_or_gap: "一图成片（断连源3）"
  unique_ability: "视觉基因解构：从单图反推色相/光质/构图/材质/名家锚"
  suite_landing:  "style-refs.md §视觉基因解构节(本版新增)"  # 真/半给§行，零覆盖原写"无"
  coverage:       零覆盖
  disposition:    补节
  d9_baseline_id: BL-D10-VGD-01

# === 滚动待办区（NFR-04，本版未做、待真实需求触发）===
backlog:
  - { gap: "小猫萌宠", reason: "内容题材非气质，避免一次铺满", trigger: "待真实需求" }
  - { gap: "Sora 式新模型适配", reason: "新模型超本版范围", trigger: "待真实需求" }
```

九行覆盖度判定速查（M0 产出，对齐 PRD §2 证据表）：

| # | 源/缺类 | 覆盖度 | 处置 | d9_baseline_id |
|---|---|---|---|---|
| 1 | HappyHorse 东亚文艺 | 真覆盖（L106/L120） | 确认 | —（确认项无须基线，ledger 标"N/A·真覆盖"） |
| 2 | 人文纪录 | 半覆盖（§六 L121） | 补条目 | BL-D10-DOC-01 |
| 3 | 一图成片（视觉基因解构） | 零覆盖 | 补节 | BL-D10-VGD-01 |
| 4 | 主题变身特效 | 零覆盖 | 补条目 | BL-D10-TRANS-01 |
| 5 | POV 互动 | 零覆盖·架构级 | 补成员 | BL-D10-POV-01 |
| 6 | 动作 previz | 半覆盖（§六 L131） | 补条目 | BL-D10-PREVIZ-01 |
| 7 | 转播伪纪实 | 半覆盖（§六 L125） | 补条目 | BL-D10-BCAST-01 |
| 8 | 一镜到底 POV | 真覆盖（§六 L128） | 确认 | —（视角锚已承载；互动分支归 #5） |
| 9 | 羊毛毡/微缩 | 真覆盖（L130/L129） | 确认 | —（真覆盖·NFR-03 不动） |

> 注：确认项（真覆盖）的 `d9_baseline_id` 列填 `N/A·真覆盖`（非空、非悬空），审计 `_check_ledger` 对 `disposition=="确认"` 跳过命中校验。补位项（处置≠确认）共 6 项 → 6 条基线（PRD §7 列 5 条，本方案补 previz 1 条凑齐"每补一类配基线"，DoD#5）。

---

## 5. 任务拆解（Tickets）

| Ticket ID | 描述 | 产物 | 工时(人天) | 前置 |
|---|---|---|---|---|
| **D10-T01** | 写 `coverage-ledger.md`：逐源核对 4 断连源 + 5 缺类，填 9 行（覆盖度 / 落点 / 处置 / d9_baseline_id）+ 滚动待办区 | `docs/optimization/coverage-ledger.md` | 1.0 | SUBSTRATE 已落地 |
| **D10-T02** | 改 `README.md` L88 去口头承诺，改为指向 ledger；目录树 + 成员表加 `pov-interactive`/`coverage-ledger` 节点 | `README.md` diff | 0.25 | T01 |
| **D10-T03** | `style-refs.md` §六 L121 补深人文纪录完整条目（四列 + 伦理反向锚定）；L131 补深 previz 简化卡变体；L125 补深转播比分条/隔行/cutaway + 禁联赛锚定 | `style-refs.md` 三行补深 | 0.75 | T01 |
| **D10-T04** | `style-refs.md` §六新增「拟人风格化/主题变身」行 + 变身序列范式（原态→≥2 过渡→目标，含 invariant_lock） | `style-refs.md` 新增行 | 0.5 | T01 |
| **D10-T05** | `style-refs.md` 新增「视觉基因解构节」：5 类反推要素 + 探针两档降级 + 与 D2 正交声明 | `style-refs.md` 新节 | 0.5 | T01 |
| **D10-T06** | `continuity-quality.md` §三 L177 追加三专属硬禁（纪录真人/事件 + 转播联赛 LOGO/球员名 + 变身名人脸） | `continuity-quality.md` diff | 0.25 | T03/T04 |
| **D10-T07** | 立 `pov-interactive/` 成员：SKILL.md（6 步管线 + 触发词）+ output-contract.md（分支骨架契约 + 摊平自检门） | `pov-interactive/SKILL.md` + `output-contract.md` | 1.0 | T01 |
| **D10-T08** | 写 `branch_skeleton.schema.json`（draft 2020-12，节点/边/选择/汇合/终局约束） | `pov-interactive/schema/branch_skeleton.schema.json` | 0.5 | T07 |
| **D10-T09** | 实现摊平算法库 `_coverage_lib.py`：`enumerate_paths`/`no_dangling`/`count_reachable_endings`/`flatten_pov`/`strip_interactive_meta`/`strip_transmute_meta` | `audits/_coverage_lib.py` | 1.0 | T08 |
| **D10-T10** | 写最小互动剧本黄金基线：2 选择点 / 3 可达终局 → 分支骨架 → 摊平 3 卡（人读 md + 冻结 json） | `pov-interactive/examples/fewshot-POV互动-demo.md` + `baselines/cases/pov_branch_demo/` | 0.75 | T09 |
| **D10-T11** | 写审计插件 `audit_coverage.py`：四组判据 + leak_scan 横切 + `@register("coverage")` | `audits/audit_coverage.py` | 1.0 | T09 |
| **D10-T12** | 注册 `lexicon.BY_DIRECTION["D10"]` 禁词全集（变身/分支/视觉基因/previz 自指） | `lexicon.py` diff | 0.25 | T11 |
| **D10-T13** | 造 fixture 一对：`D10_coverage.clean.json`（GO）+ `D10_coverage.poison.json`（6 投毒变体，FAIL）；写 `assert_gate_is_real` 测试 | `fixtures/D10_coverage.{clean,poison}.json` + 测试 | 0.75 | T11/T12 |
| **D10-T14** | 落 6 条 D9 基线（POV/TRANS/DOC/BCAST/VGD/PREVIZ），每条含 few-shot + 气质锚命中清单(≥3) + 隐身禁词清单 + 期望产物形态；回填 ledger d9_baseline_id | 6 条基线 + ledger 回填 | 0.75 | T03/T04/T05/T10 |
| **D10-T15** | 写 `pov-interactive.megaprompt.md` 双态（内联分支骨架范式 + 摊平描述，自包含） | `_megaprompts/pov-interactive.megaprompt.md` | 0.5 | T07 |
| **D10-T16** | 把 `pov_branch_demo` 纳入 `run_eval` cases + `snapshot.freeze` 冻结；接进 Makefile `verify` 跑绿；真机抽检 2 例（变身 + POV，付费由用户点） | run_eval/Makefile 跑绿 + 抽检记录 | 0.5 | T13/T14 |

> 合计约 11.75 人天 ≈ 2.4 人周（落在 PRD 估 2.5–3.0 人周内）。T03/T04/T05（条目补位）与 T07/T08/T09（POV 成员）可部分并行。

---

## 6. 测试方案

### ① 正例（clean 基线，期望 GO）

用 `_shared/baselines/cases/pov_branch_demo/`（T10 产出，黄金基线）+ `D10_coverage.clean.json`（T13），喂 `audit_coverage.run(clean)`：

- ledger 9 行齐、每行落点精确、6 个补位项 d9_baseline_id 命中 `baseline_ids`、3 确认项标 `N/A·真覆盖`；
- §六补深 3 行 + 新增变身行四列齐、半/变身行带专属反向锚定；
- 分支骨架（2 选择点 / 3 可达终局）通过校验、`no_dangling` 为真、摊平产 3 卡、每卡过 storyboard §7；
- `final_text`（摊平卡 + 变身落卡 + Seedance 提示词）leak_scan 命中 = 0、`frame_\d` 正则命中 = 0、专有名词命中 = 0。
- **期望：`run.decision == "GO"`，`exit_code == 0`。**

### ② 反向注入（poison fixture，期望 FAIL + 期望测回值）

`D10_coverage.poison.json` 含 6 个独立投毒变体，每个单独喂 `run()` 须 NO-GO，且命中**指定** check：

| 投毒变体 | 具体投毒数据（从 clean 改一处） | 期望 | 期望测回 |
|---|---|---|---|
| **P1·ledger 缺行** | 把 9 行 `ledger_rows` 删到 7 行（删掉"人文纪录""转播伪纪实"两行） | FAIL `D10-FR-01` | `measured=7, threshold=9` |
| **P2·基线悬空** | 把 `BL-D10-VGD-01` 改成 `BL-D10-VGD-99`（不在 `baseline_ids`） | FAIL `D10-FR-05` | `measured="BL-D10-VGD-99"`，detail 含"未命中" |
| **P3·四列缺列** | 把「拟人风格化/主题变身」行的 `light_color` 字段置空 | FAIL `D10-FR-02` | detail 含 `缺列 ['light_color']` |
| **P4·缺专属反向锚定** | 把「体育转播伪纪实」行的 `reverse_anchor` 删除 | FAIL `D10-NFR-05` | detail 含"缺专属反向锚定" |
| **P5·摊平路径数错 + 悬空** | 给分支骨架加一个不可达节点 `N9`（无入边）；并把 `flattened_boards` 从 3 份删成 2 份 | FAIL `D10-FR-04`（两条：非法骨架 + 卡数≠终局数） | `measured=2, threshold=3`；dangling 集含 `N9` |
| **P6·引擎隐身泄漏** | 在某摊平卡 `final_text` 里塞「选择 A→跳 N3」+「变身进度 60%」+「frame_F2」+ 断连源名「HappyHorse」 | FAIL `D10-NFR-01`（leak_scan 命中"分支"/"变身进度"/"跳转"）+ `frame_\d` 正则 + `D10-NFR-05`（"HappyHorse"） | leak_scan findings ≥3 条、`frame_\d` 命中、专有名词命中 |

> P6 是**铁律①一票否决**的核心反例：证明"分支状态 / 变身进度 / 帧号 / 断连源题材"漏进成片必被抓。

### ③ `assert_gate_is_real` 调用示例

```python
# tests/test_coverage_gate.py
import json
from harness.reverse_test import assert_gate_is_real
from audits.audit_coverage import run as coverage_run

clean  = json.load(open("_shared/scripts/fixtures/D10_coverage.clean.json", encoding="utf-8"))
poison = json.load(open("_shared/scripts/fixtures/D10_coverage.poison.json", encoding="utf-8"))

def test_coverage_gate_is_real():
    # clean 放行、poison 报红（橡皮图章检）
    assert_gate_is_real(coverage_run, clean, poison["P6_leak"], name="D10-coverage/leak")
    # 逐变体单测：每个 poison 变体独立 NO-GO 且命中指定 check
    for key in ["P1_ledger","P2_baseline","P3_col","P4_reverse","P5_flatten","P6_leak"]:
        rep = coverage_run(poison[key])
        assert rep.exit_code == 1, f"{key} 未被抓(橡皮图章): {rep.to_json()}"
```

### ④ 回归（冻结黄金基线 + 改动后重跑）

- **冻结**：`snapshot.freeze(pov_branch_demo_artifact, "_shared/baselines/cases/pov_branch_demo/golden.json")`——把"分支骨架 → 摊平 3 卡（归一化）"冻成黄金基线。
- **改什么后重跑应如何**：
  - 改 `_coverage_lib.py` 摊平逻辑（如调路径枚举）→ 重跑 `diff_against_golden(current, golden)`：路径枚举 / 摊平结构**不得无故漂移**（WARN 即人审 diff，确认是有意改进才 `re-freeze`，否则回滚）。
  - 改 `style-refs.md` **真覆盖三行**（东亚文艺 L120 / 羊毛毡 L130 / 微缩 L129）→ `git diff` 必须**字节级未改**（NFR-03 / DoD#8）；T11 审计可加一项"真覆盖行哈希比对冻结快照"硬门。
  - 改 `branch_skeleton.schema.json` → 重跑 clean 须仍 GO、6 个 poison 变体须仍 FAIL（闸不退化）。

### ⑤ 真机出片抽检（与用户协作，付费按钮由用户点）

从补位项各抽 1 题材（建议：**拟人变身 1 例 + POV 互动 1 条路径**），按补深条目 / 摊平卡出 1 组 Seedance，**人眼比对气质**（变身是否锁住 invariant_lock 不变量 / POV 是否第一人称沉浸）+ grep 成片无过程产物（`frame_\d|变身进度|node_id|分支`）。条目若空泛，出片气质必跑偏（变身失真 / POV 跳出第一人称），人眼一眼可辨。这是"覆盖真有用"的终极证据。**生成调用由用户亲点（grsai 计费），D10 只产规范 / 条目 / 基线，不产调用代码。**

---

## 7. 里程碑与退出门

| 里程碑 | 产物 | 退出门（脚本绿 / DoD 过） |
|---|---|---|
| **M0 · 核对（先核验·地基）** | `coverage-ledger.md`（9 行）+ README L88 去口头承诺（T01/T02） | ledger 9 行齐、每行落点精确、d9_baseline_id 列填实（确认项 N/A、补位项指向待落基线）；`grep README "同类已覆盖"` = 0（或仅作指针）。**DoD#1 过。POV 是否独立成员在此据 ledger 定（本方案默认独立）。** |
| **M1 · 条目补位（MVP 切线）** | §六三半覆盖补深 + 拟人变身行 + 视觉基因解构节 + continuity 三专属硬禁（T03/T04/T05/T06） | `audit_coverage._check_styleref_rows` 对补深/新增行全 PASS（四列齐 + 半/变身行带反向锚定）；真覆盖三行 `git diff` 字节级未改；视觉基因解构节含 5 类要素 + 探针两档 + D2 正交声明。**DoD#2/#3/#6/#8/#11 过。** |
| **M2 · POV 互动成员** | `pov-interactive/`（SKILL + 契约 + schema + 摊平库）+ 最小剧本黄金基线 + megaprompt 双态（T07~T10/T15） | 分支骨架 schema 校验通过；最小剧本（2 选择点/3 终局）摊平产 3 份合法 v2.0 卡（路径数=可达终局数、无悬空）；成片卡 grep `选择|分支|node_id|跳转` = 0；megaprompt 单文件可独立跑出分支骨架。**DoD#4/#9 过。** |
| **M3 · 基线 + 隐身门 + 真机收口** | 6 条 D9 基线 + ledger 回填 + 审计插件 + fixture 对 + run_eval/Makefile 跑绿 + 真机抽检 2 例（T11~T14/T16） | `assert_gate_is_real` clean 放行 / 6 poison 变体全报红；`run_eval` 含 `pov_branch_demo` 打印 GO；`make verify` 四项绿；每补位项 ≥1 基线、气质锚命中清单 ≥3、ledger d9_baseline_id 全命中真实基线（悬空=0）；真机抽检气质对 + 成片隐身 grep=0。**DoD#5/#7/#10 过。** |

> **MVP 切线 = M0 + M1**：单独即证明"覆盖账本不再撒谎 + 半覆盖被补深"，是最小可验证里程碑（PRD §10 关键路径）。M0 是地基，必须先于 M1/M2；M1（条目）与 M2（成员）可部分并行；M3 收口（基线 + 隐身门 + 真机）。

---

## 8. 风险与回滚

| 风险 | 影响 | 缓解 / 回滚 | 降级路径 |
|---|---|---|---|
| **R1·POV 复杂分支（回边/循环/不可达）摊平出错** | 路径枚举漏 / 死循环 | `enumerate_paths` 用"路径内不重复访问"切断循环（4.2 已实现，保证有限）；`no_dangling` 断言不可达=0；最小剧本基线先验证，复杂图后扩。**回滚**：摊平库出错则 P5 poison 变红，M2 退出门拦住，不放行 | 若 jsonschema 不可用 → 退化为纯 python 字段断言（`validate_branch_skeleton` 内 `try import jsonschema except` 降级） |
| **R2·变身进度/分支 node_id/反推标注漏进成片** | 破铁律①一票否决 | schema `_` 前缀标记禁出字段 + `strip_interactive_meta`/`strip_transmute_meta` 落卡剥离 + `lexicon.BY_DIRECTION["D10"]` + `frame_\d` 正则 + DoD#7 grep 硬门（P6 反例守住） | 无降级——这是硬铁律，泄漏即 NO-GO，不放行 |
| **R3·重写真覆盖行 → 口径分裂（东亚文艺两套说法）** | 品味不一致 | NFR-03 `git diff` 门：真覆盖三行字节级未改；审计加"真覆盖行哈希比对冻结快照"。**回滚**：diff 命中即回退该行 | — |
| **R4·视觉基因解构宿主读图能力弱** | 自动反推名存实亡 | FR-06 探针两档降级（档A 自动反推 / 档B 用户口述归类 §六最近行），写进节本身，不写死平台 | 档B：无读图能力 → "用户口述参考图气质 + 套件归类"，纯文字可跑（与 D2/D8 同型 de-risk） |
| **R5·"同类已覆盖"核对发现某断连源独门能力真有洞** | 纸面覆盖率虚高被坐实 | T01 ledger 逐源核对就是为暴露此洞；发现即按处置补节/补条目（FR-06 已为视觉基因解构预留落点） | 若发现新洞超本版范围 → 记入"滚动待办区"，标"待真实需求触发"，不一次铺满（NFR-04） |
| **R6·断连源题材/品牌/台词被搬进 style-refs** | 侵权 + 破题材原创检 | NFR-05 `PROPER_NOUN_BLOCKLIST` 专有名词扫描=0（P6 反例）+ 专属硬禁反向锚定（纪录真人/转播联赛/变身名人脸）；视觉基因解构只取气质 | — |
| **R7·FR-06 与 D2 拉片职责重叠（双写视觉基因解构）** | 维护双份 / 口径分裂 | FR-06 节显式声明边界（D2 拆视频时序、本节拆单图气质）；ledger 记两者边界 | — |
| **R8·宿主能力缺失（无读图 / 无生成通道）** | 真机抽检无法跑、视觉基因解构自动档不可用 | 真机抽检（M3 可选）为"加分项"非退出门硬条件——结构性证明（脚本+grep+diff）已能给 GO；真机仅补"条目真有用"软证据，由用户付费亲点 | 全部结构闸（M0~M2 + M3 脚本部分）不依赖宿主，纯文本可跑通 |

**总回滚策略**：所有补位项都是**追加**（ledger 新建、§六补行 / 补节、新成员），真覆盖行 / 下游契约 / Soul 零改。任一补位项审计 FAIL → 该项单独回退（删行 / 删节 / 删成员），不污染其余；`make verify` 四项门是不可绕过的合入闸（SUBSTRATE §5），任一红即阻断合入。

---

> **契约版本**：DEV-D10 Dev v0.1 ｜ 接 D10 PRD Draft v0.1 + 00-ENGINEERING-SUBSTRATE.md ｜ 新增 1 个审计插件 `audit_coverage.py`（四组判据 + leak_scan 横切）+ 1 对 clean/poison fixture（6 投毒变体）+ 1 份 POV 黄金基线 + `coverage-ledger.md` 核对账 + `pov-interactive/` 轻量成员（分支骨架 → 摊平 v2.0 卡）+ `style-refs.md` 补深 3 半覆盖条目 / 新增拟人变身行 / 新增视觉基因解构节 + `continuity-quality.md` 三专属硬禁；6 条 D9 基线；真覆盖项只确认不重写；Soul 一行不改；引擎隐身铁律扩展为"变身进度 / 分支状态 / 视觉基因反推标注绝不漏进成片"。
