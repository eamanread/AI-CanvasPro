"""D2 拉片复刻反向 · 结构化审计（@register reverse_board）。纯标准库。

验 clip_skeleton：双时长(组≤15s/Σ镜≈组±1) / 骨架占位符零专有名词泄漏 /
运镜·切镜合法 / 换主体成片引擎隐身(无时间码/拉片/clip_skeleton)。
读视频的多模态拆解(A/B 档)是 de-risk 探针，涉宿主能力，本审计只验产出骨架结构。on case.kind=="reverse"。
"""
from __future__ import annotations
import os
import re
import json
from harness.audit_report import Report, Verdict
from harness.run_eval import register
from harness.leak_scan import leak_scan
from harness import reverse_test, lexicon

_HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))  # _shared/scripts/
PLACEHOLDER = re.compile(r"^<<[^<>]+>>$")
MOVES = ["推", "拉", "跟前", "跟后", "环绕", "手持", "斯坦尼康", "升降", "固定",
         "Push", "Pull", "Lead", "Follow", "Orbit", "Handheld", "Steadicam", "Crane", "Static"]
CUTS = ["硬切", "直切", "叠化", "匹配剪辑", "动作匹配", "视线匹配", "J-cut", "L-cut",
        "淡入", "淡出", "黑场", "甩切", "定格"]
D2_LEAK = lexicon.BY_DIRECTION.get("D2", [])


def _has(val, vocab):
    return any(k in (val or "") for k in vocab)


def validate_skeleton(sk: dict, target: str = "clip_skeleton") -> Report:
    rep = Report(audit="reverse_board", target=target)
    groups = sk.get("shot_groups", [])
    mode = sk.get("source_probe", {}).get("mode", "C")

    for g in groups:
        gd = g.get("duration_s")
        shots = g.get("shots", [])
        # D2-FR-02 双时长
        if not (isinstance(gd, (int, float)) and 4 <= gd <= 15):
            rep.add("D2-FR-02-group", Verdict.FAIL, detail=f"组 {g.get('id')} 时长 {gd} 不在 [4,15]",
                    measured=gd, threshold=[4, 15], fix="镜头组=生成单元 ≤15s，超了拆下一组")
        ssum = sum(s.get("rel_duration_s", 0) for s in shots)
        if isinstance(gd, (int, float)) and abs(ssum - gd) > 1:
            rep.add("D2-FR-02-sum", Verdict.FAIL, detail=f"组 {g.get('id')} Σ镜 {ssum} 偏离组时长 {gd} >±1s",
                    measured=ssum, threshold=gd, fix="Σ(组内镜时长) ≈ 组时长(±1s)")
        for s in shots:
            # D2-FR-03 骨架占位符（主体/地点零专有名词）
            for key in ("subject_ref", "location_ref"):
                v = s.get(key)
                if v is not None and not PLACEHOLDER.match(str(v)):
                    rep.add("D2-FR-03-placeholder", Verdict.FAIL,
                            detail=f"{key}={v!r} 非占位符（疑参考片专有名词泄漏）", measured=v,
                            fix="主体/地点用 <<SUBJECT_MAIN>>/<<LOCATION>> 占位，换主体时再绑")
            # D2-FR-04 运镜·切镜合法（同源可逆）
            if not _has(s.get("camera_move"), MOVES):
                rep.add("D2-FR-04-move", Verdict.FAIL, detail=f"运镜 {s.get('camera_move')!r} 不在十类",
                        measured=s.get("camera_move"), fix="运镜 ∈ output-contract §2.2 十类")
            if not _has(s.get("cut_to_next"), CUTS):
                rep.add("D2-FR-04-cut", Verdict.FAIL, detail=f"切镜 {s.get('cut_to_next')!r} 不在允许值",
                        measured=s.get("cut_to_next"), fix="切镜方式 ∈ output-contract §4.6")

    # D2-FR-03b 源专有名词不得出现在骨架任何处（扫描时排除黑名单字段本身，避免自命中）
    scan_obj = {k: v for k, v in sk.items() if k != "source_proper_nouns"}
    blob = json.dumps(scan_obj, ensure_ascii=False)
    for pn in sk.get("source_proper_nouns", []):
        if pn in blob:
            rep.add("D2-FR-03-propernoun", Verdict.FAIL, detail=f"参考片专有名词 {pn!r} 泄漏进骨架",
                    measured=pn, fix="剥离参考片片名/角色名/品牌，只留结构占位")

    # D2-NFR-01 换主体成片引擎隐身（无时间码/拉片/clip_skeleton + 基础禁词）
    for f in leak_scan(sk.get("final_text", ""), extra_terms=D2_LEAK, target="reskin").findings:
        rep.findings.append(f)

    # mode C（无多模态）禁臆造时间码：骨架整体不得含绝对时码
    if mode == "C" and re.search(r"\b\d{1,2}:\d{2}\b", blob):
        rep.add("D2-NFR-mode", Verdict.FAIL, detail="C 档(无多模态)骨架含绝对时间码（疑臆造）",
                fix="C 档按节拍/相对时长，不臆造壁钟时码")

    return rep.assert_fail_has_fix()


@register("reverse_board")
def run(case) -> Report:
    if getattr(case, "kind", "") != "reverse":
        return Report(audit="reverse_board", target=getattr(case, "id", "?"), skipped=True)
    return validate_skeleton(case.raw.get("clip_skeleton", {}), target=case.id)


def reverse_gate(sample: dict) -> Report:
    return validate_skeleton(sample.get("clip_skeleton", sample), target="reverse")


reverse_test.register_reverse(
    "reverse_board", reverse_gate,
    os.path.join(_HERE, "fixtures", "D2_reverse.clean.json"),
    os.path.join(_HERE, "fixtures", "D2_reverse.poison.json"),
)
