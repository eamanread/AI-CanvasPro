"""D10 覆盖补全 · 结构化审计（@register coverage）。纯标准库。

验：ledger ≥9 行(每行覆盖判定+d9_baseline_id 非空) + POV 摊平路径数==可达终局数 +
变身序列(≥4态:原态+≥2中间+目标 / invariant_locks 非空) + 成片零互动/变身过程产物泄漏。on kind=="coverage"。
"""
from __future__ import annotations
import os
from harness.audit_report import Report, Verdict
from harness.run_eval import register
from harness.leak_scan import leak_scan
from harness import reverse_test, lexicon

_HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
D10_LEAK = lexicon.BY_DIRECTION.get("D10", [])


def validate_coverage(spec: dict, target: str = "coverage") -> Report:
    rep = Report(audit="coverage", target=target)

    # D10-FR-01 ledger ≥9 行，每行覆盖判定 + d9_baseline_id
    ledger = spec.get("ledger", [])
    if len(ledger) < 9:
        rep.add("D10-FR-01-count", Verdict.FAIL, detail=f"ledger {len(ledger)} 行 < 9(4断连+5缺类)",
                measured=len(ledger), threshold=9, fix="补全 4 断连源 + 5 缺类共 9 行")
    for row in ledger:
        if not row.get("coverage") or not row.get("d9_baseline_id"):
            rep.add("D10-FR-01-row", Verdict.FAIL, detail=f"ledger 行 {row.get('source')} 缺 coverage/d9_baseline_id",
                    measured=row.get("source"), fix="每行填覆盖落点 + 真实 d9_baseline_id(禁悬空)")

    # D10-FR-04 POV 摊平路径数 == 可达终局数
    pov = spec.get("pov_branch", {})
    if pov:
        fb, re_ = pov.get("flattened_boards"), pov.get("reachable_endings")
        if fb != re_:
            rep.add("D10-FR-04-pov", Verdict.FAIL, detail=f"摊平路径 {fb} ≠ 可达终局 {re_}", measured=fb, threshold=re_,
                    fix="每条可达路径恰一份合法卡，无悬空")

    # D10-FR-03 变身序列 ≥4 态 + invariant_locks
    tr = spec.get("transmute", {})
    if tr:
        if len(tr.get("states", [])) < 4:
            rep.add("D10-FR-03-states", Verdict.FAIL, detail=f"变身序列 {len(tr.get('states', []))} 态 <4(原+≥2中间+目标)",
                    measured=len(tr.get("states", [])), threshold=4, fix="原态→≥2中间态→目标态")
        if not tr.get("invariant_locks"):
            rep.add("D10-FR-03-lock", Verdict.FAIL, detail="变身缺 invariant_locks(不变量锁)",
                    fix="每态锁不变量(毛色/脸型等)")

    # D10-NFR 成片零互动/变身过程产物泄漏
    for f in leak_scan(spec.get("final_text", ""), extra_terms=D10_LEAK, target="card").findings:
        rep.findings.append(f)
    return rep.assert_fail_has_fix()


@register("coverage")
def run(case) -> Report:
    if getattr(case, "kind", "") != "coverage":
        return Report(audit="coverage", target=getattr(case, "id", "?"), skipped=True)
    return validate_coverage(case.raw.get("coverage", {}), target=case.id)


def coverage_gate(sample: dict) -> Report:
    return validate_coverage(sample.get("coverage", sample), target="reverse")


reverse_test.register_reverse(
    "coverage", coverage_gate,
    os.path.join(_HERE, "fixtures", "D10_coverage.clean.json"),
    os.path.join(_HERE, "fixtures", "D10_coverage.poison.json"),
)
