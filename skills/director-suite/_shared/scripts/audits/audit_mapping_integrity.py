"""D9 余项 · 映射完整性审计（@register mapping_integrity）。纯标准库。

让"强制映射"规则从 `_shared/mapping-tables.md` §1 取，而非硬编码 → 实现
"打乱 mapping-tables.md → NO-GO + 嫌疑指针"。规则：情绪5级强制景别须含「特写」、
绝不含「中景/全景/远景」（出现即映射被打乱）。on kind=="mapping_integrity"。
"""
from __future__ import annotations
import os
import re
from harness.audit_report import Report, Verdict
from harness.run_eval import register
from harness import reverse_test

_HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))      # _shared/scripts/
_SKILL_ROOT = os.path.dirname(os.path.dirname(_HERE))                     # director-suite/
_MAPPING = os.path.join(_SKILL_ROOT, "_shared", "mapping-tables.md")
LOOSE = ["中景", "中全景", "全景", "大全景", "远景", "大远景"]
LEVEL5 = re.compile(r"^\|\s*5\s*级\s*\|")


def _level5_forced_shotsize(text: str):
    for line in text.splitlines():
        if LEVEL5.match(line.strip()):
            cells = [c.strip() for c in line.split("|")]
            return cells[3] if len(cells) > 3 else None   # 第3列=强制景别
    return None


def check_mapping(text: str, src: str) -> Report:
    rep = Report(audit="mapping_integrity", target=src)
    cell = _level5_forced_shotsize(text)
    if cell is None:
        rep.add("D9-MAP-parse", Verdict.FAIL, detail=f"{src} §1 未解析到情绪5级行",
                fix="保持 mapping-tables.md §1 表格 `| 5 级 | … | 强制景别 |` 结构")
        return rep.assert_fail_has_fix()
    if "特写" not in cell:
        rep.add("D9-MAP-5strict", Verdict.FAIL, detail=f"{src} §1 情绪5级强制景别 {cell!r} 不含「特写」（映射被打乱）",
                measured=cell, threshold="含 特写/大特写",
                fix=f"嫌疑指针：{src} §1 情绪5级强制景别须为 特写/大特写")
    loose_hit = [w for w in LOOSE if w in cell]
    if loose_hit:
        rep.add("D9-MAP-5loose", Verdict.FAIL,
                detail=f"{src} §1 情绪5级强制景别含中景及更松 {loose_hit}（映射被打乱）",
                measured=cell, threshold="禁中景/全景/远景",
                fix=f"嫌疑指针：{src} §1 情绪5级不可配中景及更松（破强制映射）")
    return rep.assert_fail_has_fix()


@register("mapping_integrity")
def run(case) -> Report:
    if getattr(case, "kind", "") != "mapping_integrity":
        return Report(audit="mapping_integrity", target=getattr(case, "id", "?"), skipped=True)
    with open(_MAPPING, encoding="utf-8") as f:
        return check_mapping(f.read(), "_shared/mapping-tables.md")


def mapping_gate(sample) -> Report:
    text = sample if isinstance(sample, str) else sample.get("text", "")
    return check_mapping(text, "reverse")


reverse_test.register_reverse(
    "mapping_integrity", mapping_gate,
    os.path.join(_HERE, "fixtures", "D9_mapping.clean.json"),
    os.path.join(_HERE, "fixtures", "D9_mapping.poison.json"),
)
