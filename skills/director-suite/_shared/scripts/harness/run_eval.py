"""程序级 GO/NO-GO 编排器（D9 脊柱 + 合入门）。

把"全基线 × 全审计 + 引擎隐身门"聚成一个布尔门。任何动 _shared/ 的 PR 必跑。
"""
from __future__ import annotations
from dataclasses import dataclass, field
import json
import os
import glob
from harness.audit_report import Report, Verdict
from harness.leak_scan import leak_scan

_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))  # _shared/scripts/

# name -> run(case)->Report；各方向 import 时经 @register 注册
AUDIT_REGISTRY: dict = {}


def register(name):
    def deco(fn):
        AUDIT_REGISTRY[name] = fn
        return fn
    return deco


@dataclass
class Case:
    id: str
    kind: str = "storyboard"          # "asset"(D5 资产档案审计) | "storyboard"(D9 分镜文本审计)
    final_text: str = ""
    baseline: dict = field(default_factory=dict)
    candidate: dict = field(default_factory=dict)
    raw: dict = field(default_factory=dict)   # 原始 case 字典，供各审计读自家字段


def _load_json(rel_or_abs: str) -> dict:
    path = rel_or_abs if os.path.isabs(rel_or_abs) else os.path.join(_ROOT, rel_or_abs)
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def load_cases(cases_dir: str = "baselines/cases") -> list:
    cases = []
    for p in sorted(glob.glob(os.path.join(_ROOT, cases_dir, "*.json"))):
        raw = json.load(open(p, encoding="utf-8"))
        baseline = _load_json(raw["baseline_ref"]) if "baseline_ref" in raw else raw.get("baseline", {})
        cases.append(Case(id=raw["id"], kind=raw.get("kind", "storyboard"),
                          final_text=raw.get("final_text", ""),
                          baseline=baseline, candidate=raw.get("candidate", {}), raw=raw))
    return cases


_GOLDEN = os.path.join(_ROOT, "baselines", "golden_signature.json")


def collect(cases):
    """跑全基线×全审计,返回 (reports, 统计)。"""
    reports, engaged, skipped, finding_n, orphans = [], 0, 0, 0, []
    for case in cases:
        case_engaged = 0
        for name, fn in sorted(AUDIT_REGISTRY.items()):
            r = fn(case)
            reports.append(r)
            if getattr(r, "skipped", False):
                skipped += 1
            else:
                engaged += 1
                case_engaged += 1
                finding_n += len(r.findings)
        reports.append(leak_scan(case.final_text, extra_terms=["审计报告"], target=case.id))
        if case_engaged == 0:                 # 无任何审计认领 = 静默漏跑(疑 kind 拼错)
            orphans.append(case.id)
    return reports, dict(engaged=engaged, skipped=skipped, finding_n=finding_n, orphans=orphans)


def run_eval(cases_dir: str = "baselines/cases", verbose: bool = True, freeze: bool = False) -> int:
    from harness import regression
    cases = load_cases(cases_dir)
    if not cases:
        print("[run_eval] 无基线 case，跳过（请在 baselines/cases/ 放题材基线）")
        return 0
    reports, st = collect(cases)
    if freeze:
        regression.freeze(_GOLDEN, regression.signature(reports))
        print(f"[run_eval] 已冻结黄金签名 → {_GOLDEN}（{len(regression.signature(reports))} 个 case|audit 键）")
        return 0
    reg = regression.check(reports, _GOLDEN)          # L2 回归门:审计被弱化即 FAIL
    all_reports = reports + [reg]
    fails = [r for r in all_reports if r.exit_code != 0]
    decision = "NO-GO" if (fails or st["orphans"]) else "GO"
    if verbose:
        total = len(cases) * len(AUDIT_REGISTRY)
        print("=" * 64)
        print("[run_eval] ⚠ 本秤量【契约/结构符合度】, 非创作质量; L4 真机/创作A-B 未跑; GO≠终端质量。")
        print(f"[run_eval] cases={len(cases)} audits={len(AUDIT_REGISTRY)} → {decision}")
        print(f"           审计配对 {total} = 真跑 {st['engaged']} / 空转(kind不匹配) {st['skipped']}; 产出 finding {st['finding_n']} 条; L2回归门 {'on' if os.path.exists(_GOLDEN) else 'no-golden'}")
        if st["orphans"]:
            print(f"  ✗ 孤儿 case(无审计认领, 疑 kind 拼错或漏注册): {st['orphans']}")
        for r in all_reports:
            for f in r.findings:
                mark = "✗" if f.verdict == Verdict.FAIL else ("!" if f.verdict == Verdict.WARN else "·")
                print(f"  {mark} [{r.target}/{r.audit}] {f.check}: {f.detail}")
        print("=" * 64)
    return 0 if decision == "GO" else 1


if __name__ == "__main__":
    import sys
    for _s in (sys.stdout, sys.stderr):
        try:
            _s.reconfigure(encoding="utf-8")
        except Exception:
            pass
    sys.path.insert(0, _ROOT)
    # 触发审计注册（CLI 直跑时需手动 import 插件）
    import audits.audit_consistency  # noqa: F401
    _dir = sys.argv[1] if len(sys.argv) > 1 else "baselines/cases"
    raise SystemExit(run_eval(_dir))
