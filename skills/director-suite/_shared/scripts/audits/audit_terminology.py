"""D13 文档口径统一 · 术语审计（@register terminology）。纯标准库。

扫可发布 skill .md（排除 docs/ meta 文档、scripts/ 工具），禁用维度计数别名：
知识库 canonical = 「五大维度」（dimensions.md 自述）。
区分三概念，**不误伤**：① 情感优先「六维」推理管线(tacit-core,正确) ② 「八大支柱」Polanyi(正确)
③ 知识库「五大维度」(本审计统一,禁「八维/8维知识」旧措辞)。glossary.md 为权威。on kind=="productization"。
"""
from __future__ import annotations
import os
import glob
from harness.audit_report import Report, Verdict
from harness.run_eval import register
from harness import reverse_test

_HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))   # _shared/scripts/
_SKILL_ROOT = os.path.dirname(os.path.dirname(_HERE))                  # director-suite/

# 禁用别名 → canonical（只针对"知识库维度计数"，不碰六维管线/八大支柱）
BANNED = {
    "八维导演知识库": "五大维度导演知识库",
    "八维知识": "五大维度知识",
    "8维导演知识库": "五大维度导演知识库",
    "8维知识": "五大维度知识",
    "8 维知识": "五大维度知识",
}


def scan_text(text: str, target: str) -> Report:
    rep = Report(audit="terminology", target=target)
    for bad, canon in BANNED.items():
        if bad in text:
            rep.add("D13-FR-01-term", Verdict.FAIL, detail=f"用了旧口径 {bad!r}（应 {canon!r}）",
                    measured=bad, threshold=canon, fix=f"改 {bad!r} → {canon!r}（知识库统一「五大维度」，见 glossary.md）")
    return rep.assert_fail_has_fix()


@register("terminology")
def run(case) -> Report:
    if getattr(case, "kind", "") != "productization":
        return Report(audit="terminology", target=getattr(case, "id", "?"), skipped=True)
    rep = Report(audit="terminology", target=case.id)
    for p in glob.glob(os.path.join(_SKILL_ROOT, "**", "*.md"), recursive=True):
        rel = os.path.relpath(p, _SKILL_ROOT).replace("\\", "/")
        if rel.startswith("docs/") or rel.startswith("_shared/scripts/"):
            continue
        with open(p, encoding="utf-8") as f:
            for fnd in scan_text(f.read(), rel).findings:
                rep.findings.append(fnd)
    return rep.assert_fail_has_fix()


def terminology_gate(sample) -> Report:
    text = sample if isinstance(sample, str) else sample.get("text", "")
    return scan_text(text, "reverse")


reverse_test.register_reverse(
    "terminology", terminology_gate,
    os.path.join(_HERE, "fixtures", "D13_terminology.clean.json"),
    os.path.join(_HERE, "fixtures", "D13_terminology.poison.json"),
)
