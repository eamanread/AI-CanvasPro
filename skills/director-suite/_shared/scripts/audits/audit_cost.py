"""D11 成本/积分感知规划层 · 结构化审计（@register cost）。纯标准库。

验生成单元打满(fill_ratio<0.67 无理由=红) / 禁降档(高潮/换脸/数字人/POV 不许 fast) /
降级目标∈registry / 契约无货币 / 成片零成本词。on kind=="cost"。
"""
from __future__ import annotations
import os
import json
from harness.audit_report import Report, Verdict
from harness.run_eval import register
from harness.leak_scan import leak_scan
from harness.portability_scan import portability_scan
from harness import reverse_test, lexicon, registry as REG

_HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
NO_DOWNGRADE = {"faceswap", "digital_human", "pov"}
D11_LEAK = lexicon.BY_DIRECTION.get("D11", [])


def validate_cost(spec: dict, target: str = "cost") -> Report:
    rep = Report(audit="cost", target=target)

    for g in spec.get("groups", []):
        # D11-FR-02 生成单元打满
        fr = g.get("fill_ratio")
        if isinstance(fr, (int, float)) and fr < 0.67 and not g.get("fill_reason"):
            rep.add("D11-FR-02-fill", Verdict.FAIL, detail=f"组 {g.get('id')} fill_ratio {fr} <0.67 且无理由",
                    measured=fr, threshold=0.67, fix="镜头组打满 10–15s 生成窗口，或注明 fill_reason")
        # D11-NFR-03 禁降档
        sensitive = g.get("emotion_level") == 5 or g.get("category") in NO_DOWNGRADE
        if sensitive and g.get("tier") == "fast":
            rep.add("D11-NFR-03-nodowngrade", Verdict.FAIL,
                    detail=f"组 {g.get('id')} 高潮/换脸/数字人/POV 不许降 fast 档", measured="fast",
                    fix="高潮/换脸/数字人/POV 镜禁降档（质量优先）")

    # D11-NFR-04 降级目标 ∈ registry 既有链（同族）
    dt = spec.get("degrade_to")
    if dt and not REG.same_video_family([REG.video_default(), dt]):
        rep.add("D11-NFR-04-degrade", Verdict.FAIL, detail=f"降级目标 {dt!r} 不在 registry 视频适配器", measured=dt,
                fix="degrade_to ∈ model_registry video.adapters")

    # D11-NFR-02 无货币
    for f in portability_scan(json.dumps(spec, ensure_ascii=False), target="cost-plan").findings:
        rep.findings.append(f)
    # D11-NFR-01 成片零成本词
    for f in leak_scan(spec.get("final_text", ""), extra_terms=D11_LEAK, target="card").findings:
        rep.findings.append(f)
    return rep.assert_fail_has_fix()


@register("cost")
def run(case) -> Report:
    if getattr(case, "kind", "") != "cost":
        return Report(audit="cost", target=getattr(case, "id", "?"), skipped=True)
    return validate_cost(case.raw.get("cost_plan", {}), target=case.id)


def cost_gate(sample: dict) -> Report:
    return validate_cost(sample.get("cost_plan", sample), target="reverse")


reverse_test.register_reverse(
    "cost", cost_gate,
    os.path.join(_HERE, "fixtures", "D11_cost.clean.json"),
    os.path.join(_HERE, "fixtures", "D11_cost.poison.json"),
)
