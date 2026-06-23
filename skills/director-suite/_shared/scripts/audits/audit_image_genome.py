"""D8 图像优先入口 + 视觉基因解构 · 结构化审计（@register image_genome）。纯标准库。

验四维基因卡(Subject_Structure/Color_Palette_Ratio/Lighting_Environment/Texture_Simulation)齐 +
色板三色配比和=1.0±0.05 + 成片零解构层泄漏(HEX/视觉基因/解构/四维标签)。on kind=="genome"。
"""
from __future__ import annotations
import os
import re
from harness.audit_report import Report, Verdict
from harness.run_eval import register
from harness.leak_scan import leak_scan
from harness import reverse_test, lexicon

_HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DIMS = ["Subject_Structure", "Color_Palette_Ratio", "Lighting_Environment", "Texture_Simulation"]
HEX = re.compile(r"#[0-9A-Fa-f]{6}")
D8_LEAK = lexicon.BY_DIRECTION.get("D8", [])


def validate_genome(spec: dict, target: str = "genome") -> Report:
    rep = Report(audit="image_genome", target=target)
    g = spec.get("genome", {})

    # D8-FR-01 四维齐全
    miss = [d for d in DIMS if d not in g]
    if miss:
        rep.add("D8-FR-01-dims", Verdict.FAIL, detail=f"视觉基因缺维度 {miss}", measured=miss,
                fix="四维齐：Subject_Structure/Color_Palette_Ratio/Lighting_Environment/Texture_Simulation")

    # D8-FR-02 色板配比和 = 1.0 ±0.05
    ratio = g.get("Color_Palette_Ratio", {}).get("ratio")
    if isinstance(ratio, list) and ratio:
        s = round(sum(ratio), 3)
        if abs(s - 1.0) > 0.05:
            rep.add("D8-FR-02-ratio", Verdict.FAIL, detail=f"色板配比和 {s} ≠ 1.0±0.05", measured=s, threshold=1.0,
                    fix="主/辅/点缀三色配比和=100%")

    # D8-FR-07 成片零解构层泄漏（HEX + 四维标签 + 解构词）
    ft = spec.get("final_text", "")
    if HEX.search(ft):
        rep.add("D8-FR-07-hex", Verdict.FAIL, detail=f"成片残留 HEX {HEX.search(ft).group(0)}",
                measured=HEX.search(ft).group(0), fix="成片镜头卡不写 HEX，色彩用创作语言")
    for f in leak_scan(ft, extra_terms=D8_LEAK + DIMS, target="card").findings:
        rep.findings.append(f)
    return rep.assert_fail_has_fix()


@register("image_genome")
def run(case) -> Report:
    if getattr(case, "kind", "") != "genome":
        return Report(audit="image_genome", target=getattr(case, "id", "?"), skipped=True)
    return validate_genome(case.raw.get("genome_card", {}), target=case.id)


def genome_gate(sample: dict) -> Report:
    return validate_genome(sample.get("genome_card", sample), target="reverse")


reverse_test.register_reverse(
    "image_genome", genome_gate,
    os.path.join(_HERE, "fixtures", "D8_genome.clean.json"),
    os.path.join(_HERE, "fixtures", "D8_genome.poison.json"),
)
