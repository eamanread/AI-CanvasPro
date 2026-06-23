# 共享工程底座（Engineering Substrate）· director-suite 优化落地

> **本文件是 13 个方向开发方案的公共地基。** 它回答一个很厉害的人在"把 PRD 变成可落地开发方案"时的第一个判断：\
> **不要让 13 个方向各造一套验证脚手架——先建一套底座，让每个方向变成薄插件。**\
> 所有 `DEV-DNN-*.md` 开发方案都接到本文件定义的构件上，不重造。\
> 状态：Dev v0.1 ｜ 前置阅读：[00-MASTER-SPEC.md](../00-MASTER-SPEC.md)

---

## 0. 对 PRD 方案的 7 条关键完善（"很厉害的人"在 dev 阶段会怎么想）

PRD 回答 *what/why*，每份独立、严谨。但若**逐 PRD 直译成开发任务**，会犯 7 个典型错误。开发方案必须先纠偏：

```
① 底座先于竖井（Substrate over Silos）
   症状：13 份 PRD 各自点名 verify_*.py / leak_scan / 基线 diff → 直译=13 套重复脚手架。
   纠偏：抽出 1 套共享 harness（leak_scan / snapshot / audit_report / reverse_test /
        run_eval / registry），各方向只写"插件"。省 ~35–40% 工量，且口径天然一致。

② 步行骨架先于铺面（Walking Skeleton over Breadth）
   症状：PRD 按方向切，易"先把 D5 全做完再做 D9"。
   纠偏：Sprint0 先打通一条最薄的端到端竖切——D5 audit 跑通翡翠楼基线→出 Drift Report→
        接进 run_eval→注入 +30° 色相→NO-GO。先证明"整条秤能转"，再加项。

③ 探针先于承诺（De-risk Spikes before Commitment）
   症状：D2/D8 命脉是"宿主多模态/读图能力"，PRD 已标 must de-risk，但易被当普通任务排期。
   纠偏：P1 启动前先花 0.5pw 跑能力探针；不可用 → 当场降级到 C 档（纯文本/纯文字），
        不写"假设宿主能读视频"的空头开发。

④ 先立秤，再改菜（Secure the Scale first）
   纠偏：Sprint0/1 的退出门 = run_eval 的 GO/NO-GO 闸上线。此后任何动 _shared/ 的 PR
        不过四项 GO 不许合。把"建秤"做成不可绕过的 CI 门，而不是君子协定。

⑤ 模型注册表前移（Pull the Registry forward）
   症状：D5/D7/D9/D11 都要引用"用哪个模型/选型理由"，若各自硬编码 → 后期大返工。
   纠偏：D3 的 model_registry.json 作为共享构件，在 Sprint1 早期就落地，其余方向一律引用它。

⑥ 反向注入测试是一等交付物（Reverse-tests are Deliverables）
   症状：把"验证脚本"当交付，"证明脚本会变红"当可选。
   纠偏：每个闸必须随附一份 poison fixture；"闸 + 反例" 才算 Done。无反例的闸视为未完成。

⑦ 子弹追踪先于全量（Tracer Bullet for the risky integration）
   症状：D1 执行契约有 7 条 FR，易"全做完再联调"。
   纠偏：先发一颗子弹——只为翡翠楼基线 emit 契约，让 ViMax 消费"1 个 shot + 1 个暂停门真停下"，
        端到端打通后再补满 7 FR。最贵的风险（宿主能否消费）最先被打掉。
```

> 一句话：**PRD 是按"方向"切的；开发方案要按"风险"和"复用"重切。** 风险最高的先探针，复用最多的先建底座，最薄的端到端先走通。

---

## 1. 工程产物目录（落地后仓库长这样）

```
skills/director-suite/
├── _shared/
│   └── scripts/                       ★ 共享工程底座（本文件定义，全方向复用）
│       ├── harness/
│       │   ├── audit_report.py        报告数据结构 + GO/NO-GO + 退出码（§2.1）
│       │   ├── leak_scan.py           铁律①引擎隐身一票否决（§2.2）
│       │   ├── portability_scan.py    铁律②可移植性扫描（§2.3）
│       │   ├── snapshot.py            黄金基线冻结 + 字节级 diff（回归 L2，§2.4）
│       │   ├── reverse_test.py        反向注入测试运行器（证明闸会变红，§2.5）
│       │   ├── run_eval.py            程序级 GO/NO-GO 编排器（D9 脊柱，§2.6）
│       │   ├── registry.py            模型注册表读取器（D3，§2.7）
│       │   └── lexicon.py             集中式禁词表（leak_scan 词源，§2.2）
│       ├── audits/                    各方向"审计插件"（实现 run(target)->Report）
│       │   ├── audit_consistency.py   D5
│       │   ├── audit_storyboard.py    D9
│       │   ├── audit_camera_path.py   D4 …（每方向一个，§3 插件契约）
│       ├── model_registry.json        D3 单一事实来源（模型名/能力位/降级链）
│       └── fixtures/                  poison 反例 + clean 正例（每闸一对，§2.5）
├── _shared/baselines/                 黄金基线（冻结产物 + manifest）
│   ├── jadepavilion/                  翡翠楼全案四表 + v2 全片（既有 demo 冻结）
│   └── cases/                         D9 五题（文戏/武戏/POV/商业/拟人）
├── docs/optimization/
│   ├── 00-MASTER-SPEC.md  + D01..D13 (PRD)
│   └── dev/  00-ENGINEERING-SUBSTRATE.md(本文件) + 01-DEV-PLAN.md + DEV-D01..D13.md
└── (仓库根) Makefile 或 .github/workflows/director-suite-ci.yml   合入门（§5）
```

**纪律**：底座（`harness/`）零业务知识、纯机制；业务判据全在各方向的 `audits/audit_*.py` 插件与 `_shared/*.md` 知识文件里。底座只依赖 Python 标准库 +（仅像素审计）Pillow/numpy。

---

## 2. 六个共享构件（真实代码骨架）

### 2.1 `audit_report.py` — 统一报告 / GO-NO-GO / 退出码

所有审计的输出形态唯一，回归才可比对。**判定区零时间戳**（确定性铁律）。

```python
# audit_report.py
from dataclasses import dataclass, field, asdict
from enum import Enum
import json, sys

class Verdict(str, Enum):
    PASS = "PASS"; WARN = "WARN"; FAIL = "FAIL"

@dataclass(frozen=True)
class Finding:
    check: str          # 检查项ID，引回 PRD 的 DoD/FR，如 "D5-FR-02"
    verdict: Verdict
    detail: str         # 客观事实，如 "色相偏移 30.2° > 阈值 15°"
    measured: object = None
    threshold: object = None
    fix: str = ""       # FAIL 必须非空：可执行修复动作

@dataclass
class Report:
    audit: str                       # 审计名，如 "consistency"
    target: str                      # 被审对象标识
    findings: list = field(default_factory=list)

    @property
    def decision(self) -> str:       # 有 FAIL 必 NO-GO（全方向统一语义）
        return "NO-GO" if any(f.verdict == Verdict.FAIL for f in self.findings) else "GO"

    @property
    def exit_code(self) -> int:      # 0=GO, 1=NO-GO（CI 用）
        return 0 if self.decision == "GO" else 1

    def to_json(self) -> str:        # 判定区确定性：sort_keys + 无时间戳
        body = {"audit": self.audit, "target": self.target,
                "decision": self.decision,
                "findings": [asdict(f) for f in self.findings]}
        return json.dumps(body, ensure_ascii=False, sort_keys=True, indent=2)

    def assert_fail_has_fix(self):   # 铁律：每条 FAIL 必带修复动作
        for f in self.findings:
            if f.verdict == Verdict.FAIL and not f.fix:
                raise AssertionError(f"FAIL 缺修复动作: {f.check}")
```

### 2.2 `leak_scan.py` + `lexicon.py` — 铁律① 引擎隐身一票否决

对"成片"grep 过程/审计/执行/引擎词表，命中即 NO-GO。词表**集中**在 `lexicon.py`，各方向往里加自己的词，不各写一份。

```python
# lexicon.py — 集中式禁词（成片绝不可出现）
ENGINE_TERMS = ["Polanyi","默会","格式塔","寓居","方法论","支柱","知觉","tacit"]
PROCESS_TERMS = ["自检","审计","Drift","偏移量","基线档案","tolerance","PASS","FAIL","回归"]
EXEC_TERMS   = ["pause_gate","DAG","retry","degrade","leak_scan","node_id","分支","branch"]
COST_TERMS   = ["gen_cost","预算","省积分","降级到Fast","1.0×"]
# 各方向插件可 extend：D5→Drift系；D8→视觉基因/HSL/#HEX；D4→schematic/箭头/PUSH IN…
BY_DIRECTION = { "D5": ["审计✓"], "D8": ["视觉基因","Color_Palette","Subject_Structure"], "D4": ["schematic","机位图标"] }

# leak_scan.py
import re
from harness.audit_report import Report, Finding, Verdict
from harness import lexicon

def leak_scan(final_text: str, extra_terms=None) -> Report:
    """final_text = 成片（镜头卡 + Seedance 提示词 + 四表）。命中任意禁词 → FAIL。"""
    terms = (lexicon.ENGINE_TERMS + lexicon.PROCESS_TERMS +
             lexicon.EXEC_TERMS + lexicon.COST_TERMS + (extra_terms or []))
    rep = Report(audit="leak_scan", target="<成片>")
    for t in terms:
        if re.search(re.escape(t), final_text):
            rep.findings.append(Finding(
                check="LEAK", verdict=Verdict.FAIL,
                detail=f"成片命中过程/引擎词: {t!r}",
                fix=f"从成片删除 {t!r}；该词属过程产物，只可留在内部审计文件"))
    return rep
```

### 2.3 `portability_scan.py` — 铁律② 可移植性

skill 文件内不得出现宿主 API 或真实货币单位（否则破坏"可独立安装的大脑"）。

```python
# portability_scan.py
HOST_API = [r"vimax\.", r"render\(", r"\.exe\b", r"grsai\.", r"localhost:8777"]
CURRENCY = [r"[¥$]\s?\d", r"\d+\s?积分", r"\d+\s?元/次"]
def portability_scan(skill_file_text: str) -> Report:
    rep = Report(audit="portability", target="<skill file>")
    for pat in HOST_API + CURRENCY:
        if re.search(pat, skill_file_text):
            rep.findings.append(Finding("PORTABILITY", Verdict.FAIL,
                f"skill 文件含宿主/货币耦合: /{pat}/",
                fix="改为无量纲相对系数或机器可消费契约字段，宿主侧实现移出 skill"))
    return rep
```

### 2.4 `snapshot.py` — 黄金基线冻结 + 回归 diff（L2）

```python
# snapshot.py
import json, hashlib
def freeze(artifact: dict, path: str):           # 冻结归一化产物为黄金基线
    norm = json.dumps(artifact, ensure_ascii=False, sort_keys=True)
    open(path, "w", encoding="utf-8").write(norm)

def diff_against_golden(current: dict, golden_path: str) -> Report:
    rep = Report(audit="regression", target=golden_path)
    cur = json.dumps(current, ensure_ascii=False, sort_keys=True)
    gold = open(golden_path, encoding="utf-8").read()
    if cur != gold:                              # 任何实质漂移 → 人审定性是否劣化
        rep.findings.append(Finding("REGRESSION", Verdict.WARN,
            "产物相对黄金基线漂移", measured=hashlib.md5(cur.encode()).hexdigest()[:8],
            threshold=hashlib.md5(gold.encode()).hexdigest()[:8],
            fix="人审 diff：若为有意改进则 re-freeze 基线，否则回滚"))
    return rep
```

### 2.5 `reverse_test.py` — 反向注入（证明闸会变红，非橡皮图章）

> **完善⑥的执行手段。** 每个闸必须随附一对 fixture：`clean`（应 PASS）+ `poison`（应 FAIL）。

```python
# reverse_test.py
def assert_gate_is_real(gate_fn, clean_sample, poison_sample, name=""):
    """gate_fn(sample)->Report。证明闸对干净样本放行、对投毒样本报红。"""
    c = gate_fn(clean_sample)
    assert c.exit_code == 0, f"[{name}] 干净样本被误杀(假阳性): {c.to_json()}"
    p = gate_fn(poison_sample)
    assert p.exit_code == 1, f"[{name}] 投毒样本未被抓(橡皮图章!): {p.to_json()}"
    return True
# fixtures/ 下每闸一对：例 D5_consistency.clean.json / D5_consistency.poison.json(色相+30°)
```

### 2.6 `run_eval.py` — 程序级 GO/NO-GO 编排器（D9 脊柱 + 合入门）

```python
# run_eval.py — 把"全基线 × 全审计 + 两条铁律门"聚成一个布尔门
from harness.audit_report import Report
AUDIT_REGISTRY = {}   # name -> run(target)->Report，各方向 import 时注册
def register(name): 
    def deco(fn): AUDIT_REGISTRY[name] = fn; return fn
    return deco

def run_eval(cases_dir="_shared/baselines/cases") -> int:
    reports = []
    for case in load_cases(cases_dir):                 # 5 题基线
        for name, fn in AUDIT_REGISTRY.items():
            reports.append(fn(case))                    # 各方向审计插件
        reports.append(leak_scan(case.final_text))      # 铁律① 横切每题
    decision = "NO-GO" if any(r.exit_code for r in reports) else "GO"
    print(format_summary(reports, decision))            # 打印逐项 + 总判
    return 0 if decision == "GO" else 1                 # CI 退出码
if __name__ == "__main__":
    raise SystemExit(run_eval())
```

### 2.7 `model_registry.json` + `registry.py` — D3 单一事实来源（前移）

```jsonc
// model_registry.json — 全套件唯一模型定义点；换模型=改这里 1 处，0 处镜头卡被动
{
  "video":  { "default": "seedance-2.0",
              "adapters": { "seedance-2.0": {...7字段支持矩阵...}, "kling-3": {...}, "veo": {...} },
              "fallback": [{"from":"seedance-2.0","to":"seedance-2.0-fast","trigger":"timeout|overload"}] },
  "image":  { "default": "nano-banana-pro", "tier": {"material":"seedream-4.5","draft":"nano-banana-2"} },
  "voice":  { "zh": "doubao", "en": "elevenlabs" },
  "music":  { "default": "suno-5", "ban_named_artist": true }
}
```
```python
# registry.py
import json, functools
@functools.lru_cache
def reg(): return json.load(open("_shared/scripts/model_registry.json", encoding="utf-8"))
def video_default(): return reg()["video"]["default"]   # continuity-quality.md 改为引用此处
```

---

## 3. 插件契约（一个方向如何"接上"底座）

每个方向交付一个审计插件，**只写业务判据，机制全复用底座**：

```python
# audits/audit_consistency.py  (D5 为例)
from harness.audit_report import Report, Finding, Verdict
from harness.run_eval import register

@register("consistency")                      # 自动进 run_eval 的 GO/NO-GO
def run(target) -> Report:
    rep = Report(audit="consistency", target=target.id)
    # …业务判据：读基线档案 + 阈值表，对图测量 → append Finding(check="D5-FR-02", ...)
    rep.assert_fail_has_fix()
    return rep
```

**"接上底座" = 完成下列 5 件，缺一不算 Done：**
```
1. audits/audit_<dir>.py 实现 run(target)->Report 并 @register
2. 往 lexicon.BY_DIRECTION 注册本方向的禁词（喂 leak_scan）
3. fixtures/ 放一对 clean + poison，并在测试里 assert_gate_is_real
4. 若涉模型选择 → 一律 registry.reg()，禁硬编码模型名
5. baselines/ 放/复用一份黄金基线，纳入 run_eval 与 snapshot 回归
```

---

## 4. "成片"边界定义（leak_scan 的扫描对象，全套件统一）

```
成片（leak_scan 必须扫，零过程词）          过程产物（内部，永不进成片）
────────────────────────────────────       ──────────────────────────────
镜头卡（output-contract v2.0 字段）          Drift/审计报告、run_eval 输出
每组 Seedance 成片提示词                      execution-contract JSON、暂停门元数据
四表（角色/场景/道具/分镜）                    成本规划 Σgen_cost、视觉基因解构卡
character-board/color-palette/keyframe 成片   reverse fixtures、CI 日志
```
> 红线：过程产物可被人/卡片看见（reply_to_user 式），但**绝不可序列化进上表左列**。这条边界是铁律①的判定依据。

---

## 5. 合入门（CI / Makefile）— 把"建秤"变成不可绕过的门

```makefile
# Makefile（或等价 .github/workflows/director-suite-ci.yml）
verify:                       # 任何动 _shared/ 或新增成员的 PR 必跑
	python -m harness.run_eval                       # ① 5 基线 × 全审计 → GO/NO-GO
	python -m harness.reverse_test --all             # ② 每闸 clean/poison 反例必过
	python -m tests.leak_scan_all                    # ③ 全成片 leak_scan 命中=0
	python -m tests.portability_all                  # ④ 可移植性扫描=0
# 四项任一 exit!=0 → CI 红 → 阻断合入（§MASTER-SPEC 7.3）
```

---

## 6. 步行骨架（Sprint 0 · 一条最薄的端到端竖切）

> 在铺开 13 个方向前，先用 ~3–4 天打通整条秤，证明底座可转：

```
步骤                                                        退出判据
────────────────────────────────────────────────────────  ─────────────────────
1 写 harness/audit_report.py + leak_scan.py + lexicon.py    单测过
2 冻结翡翠楼四表为 baselines/jadepavilion/ 黄金基线          snapshot.freeze 成功
3 写 audits/audit_consistency.py 最小版(只做色相+轮廓两项)   对基线 run→GO,exit0
4 造 poison：基线复制+色相+30° → fixtures/D5.poison.json     audit→FAIL,exit1,测回30°±3°
5 reverse_test.assert_gate_is_real(audit_consistency,…)     干净放行/投毒报红 双过
6 audit_consistency @register → run_eval 跑通                run_eval 打印 GO/NO-GO
7 接进 Makefile verify 目标                                  make verify 红/绿可复现
────────────────────────────────────────────────────────
✅ 骨架立住 = 后续每个方向只是"再挂一个 audits/插件 + 一对 fixture + 一份基线"。
```

---

*本底座一旦落地，13 个方向的开发方案（`DEV-DNN-*.md`）一律以"插件 + fixture + 基线"的形态接入，不重造机制。每份 dev 方案的"测试方案"节直接调用本文件的 `assert_gate_is_real` / `run_eval` / `snapshot`，确保口径与可验证性全套件一致。*
