"""D7 静态全案/电商 · 结构化审计（@register static_board）。纯标准库。

验 3 Hero(景别递进)+8 Detail(每屏1卖点) / 11图同一商品 asset_id / 主色克制≥85% /
成片零视频字段(运镜/切镜/时长/Seedance)。复用 D5 阈值口径。on kind=="static"。
"""
from __future__ import annotations
import os
import re
from harness.audit_report import Report, Verdict
from harness.run_eval import register
from harness import reverse_test

_HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
HERO_SEQ = ["establishing", "medium", "neutral"]   # 全景→中景→棚拍 递进
VIDEO_FIELDS = re.compile(r"运镜|切镜方式|时长：|Seedance|start_frame|reference_video")


def validate_static(spec: dict, target: str = "static") -> Report:
    rep = Report(audit="static_board", target=target)
    pid = spec.get("product_asset_id")
    hero = spec.get("hero", [])
    detail = spec.get("detail", [])

    # D7-FR-02 恰 3 Hero，景别严格递进，同 asset_id
    if len(hero) != 3:
        rep.add("D7-FR-02-herocount", Verdict.FAIL, detail=f"Hero {len(hero)} ≠ 3", measured=len(hero),
                fix="主图序列恰 3 张(场景氛围/卖点结构/白底KV)")
    if [h.get("shot_type") for h in hero] != HERO_SEQ:
        rep.add("D7-FR-02-seq", Verdict.FAIL, detail=f"Hero 景别非递进 {[h.get('shot_type') for h in hero]}",
                measured=[h.get("shot_type") for h in hero], fix=f"Hero 景别递进 {HERO_SEQ}")

    # D7-FR-03 恰 8 Detail，每屏恰 1 卖点
    if len(detail) != 8:
        rep.add("D7-FR-03-detailcount", Verdict.FAIL, detail=f"Detail {len(detail)} ≠ 8", measured=len(detail),
                fix="详情页恰 8 屏")
    for d in detail:
        sp = d.get("selling_points", [])
        if len(sp) != 1:
            rep.add("D7-FR-03-sp", Verdict.FAIL, detail=f"{d.get('id')} 卖点数 {len(sp)} ≠ 1", measured=len(sp),
                    fix="每屏恰 1 主卖点")

    # D7-NFR-03 引用闭合：11 图同一商品 asset_id
    for item in hero + detail:
        if item.get("asset_id") != pid:
            rep.add("D7-NFR-03-asset", Verdict.FAIL, detail=f"{item.get('id')} asset_id≠商品 {pid}",
                    measured=item.get("asset_id"), threshold=pid, fix="全案 11 图引同一商品 asset_id")

    # D7-FR-01 主色克制 ≥85%
    for item in hero + detail:
        dr = item.get("dominant_ratio")
        if isinstance(dr, (int, float)) and dr < 0.85:
            rep.add("D7-FR-01-dominant", Verdict.FAIL, detail=f"{item.get('id')} 主色域 {dr} < 0.85",
                    measured=dr, threshold=0.85, fix="主导色 ≥85%，点缀 ≤15%")

    # NG4 反向铁律：成片零视频字段（静态全案不该有运镜/切镜/时长/Seedance）
    m = VIDEO_FIELDS.search(spec.get("final_text", ""))
    if m:
        rep.add("D7-NG4-video", Verdict.FAIL, detail=f"静态全案含视频字段: {m.group(0)!r}", measured=m.group(0),
                fix="静态成员禁运镜/切镜/时长/Seedance，纯静态图字段")
    return rep.assert_fail_has_fix()


@register("static_board")
def run(case) -> Report:
    if getattr(case, "kind", "") != "static":
        return Report(audit="static_board", target=getattr(case, "id", "?"), skipped=True)
    return validate_static(case.raw.get("static", {}), target=case.id)


def static_gate(sample: dict) -> Report:
    return validate_static(sample.get("static", sample), target="reverse")


reverse_test.register_reverse(
    "static_board", static_gate,
    os.path.join(_HERE, "fixtures", "D7_static.clean.json"),
    os.path.join(_HERE, "fixtures", "D7_static.poison.json"),
)
