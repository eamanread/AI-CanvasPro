"""D13 余项 · 契约版本台账审计（@register versions）。纯标准库。

验：每个带「契约版本：vX.Y」标记的契约文件，都在 VERSIONS.md 台账里、且版本一致。
台账漏登 or 版本失配 → FAIL + 嫌疑指针。on kind=="versions"。
"""
from __future__ import annotations
import os
import re
import glob
from harness.audit_report import Report, Verdict
from harness.run_eval import register
from harness import reverse_test

_HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))      # _shared/scripts/
_SKILL_ROOT = os.path.dirname(os.path.dirname(_HERE))                     # director-suite/
MARKER = re.compile(r"契约版本[^\n]*?(v\d+\.\d+)")
LEDGER_ROW = re.compile(r"\|\s*`([^`]+)`\s*\|\s*(v\d+\.\d+)")


def _parse_ledger(versions_md: str) -> dict:
    return {m.group(1): m.group(2) for m in LEDGER_ROW.finditer(versions_md)}


def check_versions(ledger: dict, markers: dict, target: str = "versions") -> Report:
    rep = Report(audit="versions", target=target)
    for f, ver in markers.items():
        if f not in ledger:
            rep.add("D13-VER-missing", Verdict.FAIL, detail=f"{f} 有契约版本标记 {ver} 但 VERSIONS.md 台账未登记",
                    measured=f, fix=f"嫌疑指针：VERSIONS.md 补登 {f} = {ver}")
        elif ledger[f] != ver:
            rep.add("D13-VER-mismatch", Verdict.FAIL,
                    detail=f"{f} 文件标记 {ver} ≠ 台账 {ledger[f]}", measured=ver, threshold=ledger[f],
                    fix=f"嫌疑指针：对齐 {f} 文件头与 VERSIONS.md 版本")
    return rep.assert_fail_has_fix()


@register("versions")
def run(case) -> Report:
    if getattr(case, "kind", "") != "versions":
        return Report(audit="versions", target=getattr(case, "id", "?"), skipped=True)
    with open(os.path.join(_SKILL_ROOT, "VERSIONS.md"), encoding="utf-8") as f:
        ledger = _parse_ledger(f.read())
    markers = {}
    for p in glob.glob(os.path.join(_SKILL_ROOT, "**", "*.md"), recursive=True):
        rel = os.path.relpath(p, _SKILL_ROOT).replace("\\", "/")
        if rel.startswith("docs/") or rel.startswith("_shared/scripts/") or rel == "VERSIONS.md":
            continue
        with open(p, encoding="utf-8") as f:
            m = MARKER.search(f.read())
        if m:
            markers[rel] = m.group(1)
    return check_versions(ledger, markers, "VERSIONS.md")


def versions_gate(sample: dict) -> Report:
    return check_versions(sample.get("ledger", {}), sample.get("markers", {}), "reverse")


reverse_test.register_reverse(
    "versions", versions_gate,
    os.path.join(_HERE, "fixtures", "D13_versions.clean.json"),
    os.path.join(_HERE, "fixtures", "D13_versions.poison.json"),
)
