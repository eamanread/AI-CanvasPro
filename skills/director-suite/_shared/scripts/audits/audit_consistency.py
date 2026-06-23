"""D5 量化一致性审计（S1：6 阈值 · profile 对比 + 可选 Pillow 像素对图）。

阈值表（与 continuity-quality 数值口径一致，见 DEV-D05 §FR-02）：
  轮廓/头身比 ±5% · 色相 ±15° · 明度 ±10%(绝对百分点) · 色温 ≤200K · LOGO Δ0.05 · 白底RGB ≥245
像素对图：case.raw 给 image 路径且环境有 Pillow 时，从图实测主色 HSL 覆盖 candidate；
         无 Pillow → 优雅降级为 profile 对比（本机当前路径），不擅自安装依赖。
"""
from __future__ import annotations
import os
from harness.audit_report import Report, Verdict
from harness.run_eval import register
from harness import reverse_test

_HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))  # _shared/scripts/

TOL = {
    "headbody_ratio_pct": 5.0,   # 轮廓/头身比 ±5%
    "hue_deg": 15.0,             # 色相 ±15°
    "lightness_pct": 10.0,       # 明度 ±10（绝对百分点）
    "color_temp_k": 200.0,       # 色温 ≤200K
    "logo_norm": 0.05,           # LOGO 归一化坐标 Δ0.05（max 轴）
    "white_bg_min": 245,         # 白底 RGB ≥245
}


def _hue_delta(a: float, b: float) -> float:
    d = abs(float(a) - float(b)) % 360.0
    return round(360.0 - d if d > 180.0 else d, 1)


def audit_profiles(candidate: dict, baseline: dict, target: str = "") -> Report:
    rep = Report(audit="consistency", target=target or baseline.get("asset_id", "<asset>"))
    c, b = candidate, baseline

    if "headbody_ratio" in c and "headbody_ratio" in b:
        base = float(b["headbody_ratio"])
        pct = round(abs(float(c["headbody_ratio"]) - base) / base * 100.0, 1)
        _judge(rep, "D5-FR-02-silhouette", pct, TOL["headbody_ratio_pct"], "头身比偏移", "%",
               "重生该 asset 使头身比回到基线 ±5% 内")

    if "hue_deg" in c and "hue_deg" in b:
        _judge(rep, "D5-FR-02-hue", _hue_delta(c["hue_deg"], b["hue_deg"]), TOL["hue_deg"], "色相偏移", "°",
               "重生使主色色相回到基线 ±15° 内，或经审核 re-freeze 基线")

    if "lightness_pct" in c and "lightness_pct" in b:
        d = round(abs(float(c["lightness_pct"]) - float(b["lightness_pct"])), 1)
        _judge(rep, "D5-FR-02-lightness", d, TOL["lightness_pct"], "明度偏移", "pp",
               "调整曝光/明度回到基线 ±10 个百分点内")

    if "color_temp_k" in c and "color_temp_k" in b:
        d = round(abs(float(c["color_temp_k"]) - float(b["color_temp_k"])), 0)
        _judge(rep, "D5-FR-02-colortemp", d, TOL["color_temp_k"], "色温跳变", "K",
               "锁主光色温，跨镜跳变 ≤200K")

    if "logo_norm_xy" in c and "logo_norm_xy" in b and c["logo_norm_xy"] and b["logo_norm_xy"]:
        dx = abs(float(c["logo_norm_xy"][0]) - float(b["logo_norm_xy"][0]))
        dy = abs(float(c["logo_norm_xy"][1]) - float(b["logo_norm_xy"][1]))
        _judge(rep, "D5-FR-02-logo", round(max(dx, dy), 3), TOL["logo_norm"], "LOGO坐标偏移", "",
               "锁 LOGO 归一化坐标，偏移 ≤0.05")

    if "white_bg_rgb_min" in c:                       # 白底 KV：单值下限检查
        v = float(c["white_bg_rgb_min"])
        if v < TOL["white_bg_min"]:
            rep.add("D5-FR-02-whitebg", Verdict.FAIL,
                    detail=f"白底最暗 RGB {v} < 阈值 {TOL['white_bg_min']}", measured=v, threshold=TOL["white_bg_min"],
                    fix="纯白底 RGB ≥245，去有色投影/道具残留")
        else:
            rep.add("D5-FR-02-whitebg", Verdict.PASS, detail=f"白底最暗 RGB {v} ≥ {TOL['white_bg_min']}",
                    measured=v, threshold=TOL["white_bg_min"])

    return rep.assert_fail_has_fix()


def _judge(rep, check, measured, threshold, label, unit, fix):
    if measured > threshold:
        rep.add(check, Verdict.FAIL, detail=f"{label} {measured}{unit} > 阈值 {threshold}{unit}",
                measured=measured, threshold=threshold, fix=fix)
    else:
        rep.add(check, Verdict.PASS, detail=f"{label} {measured}{unit} ≤ {threshold}{unit}",
                measured=measured, threshold=threshold)


def _measure_from_image(image_path: str) -> dict:
    """有 Pillow 才走：从图实测主色 hue/lightness。无则返回 {} 由调用方降级。"""
    try:
        from PIL import Image  # noqa
        import colorsys
    except Exception:
        return {}
    try:
        im = Image.open(image_path).convert("RGB").resize((64, 64))
        px = list(im.getdata())
        r = sum(p[0] for p in px) / len(px) / 255
        g = sum(p[1] for p in px) / len(px) / 255
        bl = sum(p[2] for p in px) / len(px) / 255
        h, l, s = colorsys.rgb_to_hls(r, g, bl)
        return {"hue_deg": round(h * 360, 1), "lightness_pct": round(l * 100, 1)}
    except Exception:
        return {}


@register("consistency")
def run(case) -> Report:
    if getattr(case, "kind", "asset") != "asset":      # 只审资产档案 case
        return Report(audit="consistency", target=case.id, skipped=True)
    candidate = dict(case.candidate)
    img = case.raw.get("image") if getattr(case, "raw", None) else None
    if img:
        measured = _measure_from_image(os.path.join(_HERE, img) if not os.path.isabs(img) else img)
        candidate.update(measured)                     # 有 Pillow 则用实测覆盖；无则保留 profile
    return audit_profiles(candidate, case.baseline, target=case.id)


def consistency_gate(sample: dict) -> Report:
    return audit_profiles(sample["candidate"], sample["baseline"], target="reverse")


reverse_test.register_reverse(
    "consistency", consistency_gate,
    os.path.join(_HERE, "fixtures", "D5_consistency.clean.json"),
    os.path.join(_HERE, "fixtures", "D5_consistency.poison.json"),
)
