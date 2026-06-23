"""D12 作者论保真 + 题材禁用触发词 · 词级审计（@register style_fidelity）。纯标准库。

验：声明作者的 must_anchor 逐项在提示词出现(缺漏=FAIL) + 禁用触发词(含中英别名)不出现 +
成片零审计元数据泄漏(banned_trigger/保真✓/anchor_missing)。on kind=="style"。
画面级保真(像不像)走 D9 基线对图+A-B 盲评(软指标)，非本词级闸。
"""
from __future__ import annotations
import os
from harness.audit_report import Report, Verdict
from harness.run_eval import register
from harness.leak_scan import leak_scan
from harness import reverse_test, lexicon

_HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
D12_LEAK = lexicon.BY_DIRECTION.get("D12", [])


def validate_style(spec: dict, target: str = "style") -> Report:
    rep = Report(audit="style_fidelity", target=target)
    rules = spec.get("auteur_rules", {})
    who = spec.get("declared_auteur")
    prompt = spec.get("prompt", "")
    r = rules.get(who, {})

    # D12-FR-01 作者锚缺漏
    if who and r:
        missing = [a for a in r.get("must_anchor", []) if a not in prompt]
        if missing:
            rep.add("D12-FR-01-anchor", Verdict.FAIL, detail=f"作者 {who} must_anchor 缺漏 {missing}",
                    measured=missing, fix=f"提示词补足作者锚：{missing}")
    # D12-FR-02 禁用触发词（含别名归一）
    if r:
        aliases = r.get("aliases", {})
        for b in r.get("banned", []):
            if b in prompt:
                rep.add("D12-FR-02-banned", Verdict.FAIL, detail=f"命中禁用触发词 {b!r}", measured=b,
                        fix=f"删 {b!r}，改用作者合规词")
        for alias, canon in aliases.items():
            if alias in prompt:
                rep.add("D12-FR-02-alias", Verdict.FAIL, detail=f"命中禁用别名 {alias!r}(→{canon})", measured=alias,
                        fix=f"删 {alias!r}（等价禁用 {canon}）")

    # D12-NFR 成片零审计元数据泄漏
    for f in leak_scan(spec.get("final_text", ""), extra_terms=D12_LEAK, target="card").findings:
        rep.findings.append(f)
    return rep.assert_fail_has_fix()


@register("style_fidelity")
def run(case) -> Report:
    if getattr(case, "kind", "") != "style":
        return Report(audit="style_fidelity", target=getattr(case, "id", "?"), skipped=True)
    return validate_style(case.raw.get("style", {}), target=case.id)


def style_gate(sample: dict) -> Report:
    return validate_style(sample.get("style", sample), target="reverse")


reverse_test.register_reverse(
    "style_fidelity", style_gate,
    os.path.join(_HERE, "fixtures", "D12_style.clean.json"),
    os.path.join(_HERE, "fixtures", "D12_style.poison.json"),
)
