"""D4 运镜轨迹示意图 · 结构化审计（@register camera_path）。纯标准库。

验示意图卡：10 运镜唯一配色 / 4 区块齐 / 逐切标注条数==源镜头数 / 节奏框时长==Σ镜±1 /
套打提示词含 schematic 声明 / 成片(镜头卡)零示意层泄漏(schematic/箭头/PUSH IN)。on kind=="camera_path"。
"""
from __future__ import annotations
import os
from harness.audit_report import Report, Verdict
from harness.run_eval import register
from harness.leak_scan import leak_scan
from harness import reverse_test, lexicon

_HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MOVES_10 = ["推", "拉", "跟前", "跟后", "环绕", "手持", "斯坦尼康", "升降上", "升降下", "固定"]
BLOCKS_4 = {"轨迹", "图例", "逐切标注", "节奏框"}
D4_LEAK = lexicon.BY_DIRECTION.get("D4", [])


def validate_camera_path(spec: dict, target: str = "camera_path") -> Report:
    rep = Report(audit="camera_path", target=target)
    moves = spec.get("moves", {})
    # D4-FR-01 10 运镜唯一三元组（配色不重）
    missing = [m for m in MOVES_10 if m not in moves]
    if missing:
        rep.add("D4-FR-01-moves", Verdict.FAIL, detail=f"运镜映射缺 {missing}", measured=missing,
                fix="10 运镜各配唯一(色HEX,轨迹形,图标)")
    colors = [v.get("color") for v in moves.values()]
    if len(colors) != len(set(colors)):
        dup = [c for c in colors if colors.count(c) > 1]
        rep.add("D4-FR-01-color", Verdict.FAIL, detail=f"运镜配色重复 {set(dup)}", measured=dup,
                fix="每运镜唯一 HEX，禁撞色")

    sch = spec.get("schematic", {})
    # D4-FR-02 4 区块 + 标注条数 + 节奏时长
    blocks = set(sch.get("blocks", []))
    if blocks != BLOCKS_4:
        rep.add("D4-FR-02-blocks", Verdict.FAIL, detail=f"区块 {blocks} ≠ {BLOCKS_4}", measured=sorted(blocks),
                fix="示意图含 轨迹/图例/逐切标注/节奏框 四区块")
    nann, nshot = len(sch.get("annotations", [])), sch.get("source_shot_count")
    if nann != nshot:
        rep.add("D4-FR-02-annot", Verdict.FAIL, detail=f"逐切标注 {nann} ≠ 源镜头数 {nshot}",
                measured=nann, threshold=nshot, fix="逐切标注条数==源镜头数")
    rt, ss = sch.get("rhythm_total_s"), sch.get("shots_sum_s")
    if isinstance(rt, (int, float)) and isinstance(ss, (int, float)) and abs(rt - ss) > 1:
        rep.add("D4-FR-02-rhythm", Verdict.FAIL, detail=f"节奏框 {rt}s 偏离 Σ镜 {ss}s >±1", measured=rt, threshold=ss,
                fix="节奏框总时长==Σ镜时长(±1s)")
    # D4-FR-03 套打提示词声明 schematic
    if "schematic NOT a final frame" not in sch.get("prompt", ""):
        rep.add("D4-FR-03-disclaimer", Verdict.FAIL, detail="套打提示词缺 'this is a schematic NOT a final frame'",
                fix="示意图提示词显式声明非成片帧")
    # D4-NFR-01 成片零示意层泄漏
    for f in leak_scan(spec.get("final_text", ""), extra_terms=D4_LEAK, target="card").findings:
        rep.findings.append(f)
    return rep.assert_fail_has_fix()


@register("camera_path")
def run(case) -> Report:
    if getattr(case, "kind", "") != "camera_path":
        return Report(audit="camera_path", target=getattr(case, "id", "?"), skipped=True)
    return validate_camera_path(case.raw.get("camera_path", {}), target=case.id)


def camera_gate(sample: dict) -> Report:
    return validate_camera_path(sample.get("camera_path", sample), target="reverse")


reverse_test.register_reverse(
    "camera_path", camera_gate,
    os.path.join(_HERE, "fixtures", "D4_camera.clean.json"),
    os.path.join(_HERE, "fixtures", "D4_camera.poison.json"),
)
