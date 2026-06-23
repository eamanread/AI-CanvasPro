"""D13 余项 · mega-prompt 覆盖审计（@register megaprompt_sync）。纯标准库。

验单产物成员都有对应的 _megaprompts/<member>.megaprompt.md（缺=漂移）。
on kind=="megaprompt"。
"""
from __future__ import annotations
import os
import glob
from harness.audit_report import Report, Verdict
from harness.run_eval import register
from harness import reverse_test

_HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
_SKILL_ROOT = os.path.dirname(os.path.dirname(_HERE))
# 单产物成员应有 mega（全案/反向/静态等编排类暂不要求单文件 mega）
EXPECTED = ["storyboard", "character-board", "color-palette", "keyframe"]


def check_megaprompt(present: set, expected, target: str = "megaprompt") -> Report:
    rep = Report(audit="megaprompt_sync", target=target)
    for m in expected:
        if m not in present:
            rep.add("D13-MEGA-missing", Verdict.FAIL, detail=f"成员 {m} 缺 _megaprompts/{m}.megaprompt.md(漂移)",
                    measured=m, fix=f"补 _megaprompts/{m}.megaprompt.md 或从 EXPECTED 移除")
    return rep.assert_fail_has_fix()


@register("megaprompt_sync")
def run(case) -> Report:
    if getattr(case, "kind", "") != "megaprompt":
        return Report(audit="megaprompt_sync", target=getattr(case, "id", "?"), skipped=True)
    present = {os.path.basename(p).replace(".megaprompt.md", "")
               for p in glob.glob(os.path.join(_SKILL_ROOT, "_megaprompts", "*.megaprompt.md"))}
    return check_megaprompt(present, EXPECTED, "_megaprompts/")


def megaprompt_gate(sample: dict) -> Report:
    return check_megaprompt(set(sample.get("present", [])), sample.get("expected", EXPECTED), "reverse")


reverse_test.register_reverse(
    "megaprompt_sync", megaprompt_gate,
    os.path.join(_HERE, "fixtures", "D13_megaprompt.clean.json"),
    os.path.join(_HERE, "fixtures", "D13_megaprompt.poison.json"),
)
