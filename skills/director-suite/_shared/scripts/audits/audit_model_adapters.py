"""D3 多模型适配矩阵 · 结构化审计（@register model_adapters）。纯标准库。

验 model_registry.json：7 能力位覆盖 / 默认∈适配器 / 降级同族 / 图像分级 / 音色音乐齐全。
不需宿主、不出图——纯结构断言，落地可靠性高。on case.kind=="config"。
"""
from __future__ import annotations
import os
from harness.audit_report import Report, Verdict
from harness.run_eval import register
from harness import reverse_test, registry as REG

_HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))  # _shared/scripts/


def validate_registry(reg: dict, target: str = "model_registry") -> Report:
    rep = Report(audit="model_adapters", target=target)
    keys = reg.get("capability_keys", [])
    if len(keys) != 7:
        rep.add("D3-FR-01-keys", Verdict.FAIL, detail=f"capability_keys 应为 7，实际 {len(keys)}",
                measured=len(keys), threshold=7, fix="对齐 capability-contract.md 的 7 能力位")

    video = reg.get("video", {})
    adapters = video.get("adapters", {})

    # D3-FR-02 视频适配器 ≥3，默认∈适配器
    if len(adapters) < 3:
        rep.add("D3-FR-02-count", Verdict.FAIL, detail=f"视频适配器 {len(adapters)} < 3",
                measured=len(adapters), threshold=3, fix="至少 seedance+kling3+veo 三个适配层")
    if video.get("default") not in adapters:
        rep.add("D3-FR-05-default", Verdict.FAIL, detail=f"video.default={video.get('default')!r} 不在 adapters",
                measured=video.get("default"), fix="默认模型必须是已注册适配器（单一定义点）")

    # D3-FR-01 每个视频适配器声明全部 7 能力位 + 合法时长窗口
    for name, a in adapters.items():
        caps = a.get("capabilities", {})
        missing = [k for k in keys if k not in caps]
        if missing:
            rep.add("D3-FR-01-coverage", Verdict.FAIL, detail=f"适配器 {name} 缺能力位 {missing}",
                    measured=missing, fix=f"{name} 补声明 {missing}（缺位=未实现）")
        dw = a.get("duration_window_s")
        if not (isinstance(dw, list) and len(dw) == 2 and dw[0] < dw[1]):
            rep.add("D3-FR-02-window", Verdict.FAIL, detail=f"适配器 {name} duration_window_s 非法: {dw}",
                    measured=dw, fix="duration_window_s=[lo,hi] 且 lo<hi")

    # D3-FR-04 降级链：from/to ∈ adapters 且同族（视频族内）
    for fb in video.get("fallback", []):
        for end in ("from", "to"):
            if fb.get(end) not in adapters:
                rep.add("D3-FR-04-fallback", Verdict.FAIL,
                        detail=f"降级链 {end}={fb.get(end)!r} 不在视频适配器（疑跨族静默替代）",
                        measured=fb.get(end), fix="降级目标必须同族（视频→视频）且已注册")

    # D3-FR-03 图像分级 + 音色/音乐
    image = reg.get("image", {})
    if not image.get("default"):
        rep.add("D3-FR-03-image", Verdict.FAIL, detail="image.default 缺失", fix="声明缺省图像模型")
    for lang in ("zh", "en"):
        if lang not in reg.get("voice", {}):
            rep.add("D3-FR-03-voice", Verdict.FAIL, detail=f"voice 缺 {lang} 路由", measured=lang,
                    fix="voice 须含 zh/en 路由")
    if not isinstance(reg.get("music", {}).get("ban_named_artist"), bool):
        rep.add("D3-FR-03-music", Verdict.FAIL, detail="music.ban_named_artist 应为 bool",
                fix="music 声明 ban_named_artist 布尔（禁名人名）")

    return rep.assert_fail_has_fix()


@register("model_adapters")
def run(case) -> Report:
    if getattr(case, "kind", "") != "config":
        return Report(audit="model_adapters", target=getattr(case, "id", "?"), skipped=True)
    return validate_registry(REG.reg(), target=case.id)


def model_gate(sample: dict) -> Report:
    return validate_registry(sample, target="reverse")


reverse_test.register_reverse(
    "model_adapters", model_gate,
    os.path.join(_HERE, "fixtures", "D3_model.clean.json"),
    os.path.join(_HERE, "fixtures", "D3_model.poison.json"),
)
