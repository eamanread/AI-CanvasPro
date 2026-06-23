"""D6 音频层 + 时间线合成契约 · 结构化审计（@register audio_assembly）。纯标准库。

验 audio_layers 五字段/三型/narration引[Voice_*] + 混音dB阶梯(duck∈[8,12]/boost∈[3,5]/cf==0.5)
+ 每组内嵌轨静音策略(mute_bgm默认true) + 成片零装配元数据泄漏。on kind=="audio"。
"""
from __future__ import annotations
import os
import re
from harness.audit_report import Report, Verdict
from harness.run_eval import register
from harness.leak_scan import leak_scan
from harness import reverse_test, lexicon

_HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
LAYER_TYPES = {"narration", "bgm", "sfx"}
LAYER_FIELDS = ["audio_id", "type", "range", "source_ref", "layout"]
VOICE = re.compile(r"^\[Voice_[^\]]+\]$")
D6_LEAK = lexicon.BY_DIRECTION.get("D6", [])


def validate_audio(spec: dict, target: str = "audio") -> Report:
    rep = Report(audit="audio_assembly", target=target)

    # D6-FR-01 轨道五字段 + 三型 + narration 引 [Voice_*]
    for la in spec.get("audio_layers", []):
        miss = [f for f in LAYER_FIELDS if f not in la]
        if miss:
            rep.add("D6-FR-01-fields", Verdict.FAIL, detail=f"轨 {la.get('audio_id')} 缺字段 {miss}",
                    measured=miss, fix="每轨五字段 audio_id/type/range/source_ref/layout")
        if la.get("type") not in LAYER_TYPES:
            rep.add("D6-FR-01-type", Verdict.FAIL, detail=f"轨 type={la.get('type')!r} 越界",
                    measured=la.get("type"), fix="type ∈ narration|bgm|sfx")
        if la.get("type") == "narration" and not VOICE.match(str(la.get("source_ref", ""))):
            rep.add("D6-FR-01-voice", Verdict.FAIL, detail=f"narration source_ref {la.get('source_ref')!r} 非 [Voice_*]",
                    measured=la.get("source_ref"), fix="narration 轨 source_ref 引角色表 [Voice_*]")

    # D6-FR-02 混音 dB 阶梯
    mix = spec.get("mix_ladder", {})
    duck, boost, cf = mix.get("duck_under_voice_db"), mix.get("climax_boost_db"), mix.get("crossfade_s")
    if not (isinstance(duck, (int, float)) and 8 <= duck <= 12):
        rep.add("D6-FR-02-duck", Verdict.FAIL, detail=f"bgm duck_under_voice_db={duck} 不在 [8,12]", measured=duck,
                fix="对话段 BGM 低人声 8–12dB")
    if not (isinstance(boost, (int, float)) and 3 <= boost <= 5):
        rep.add("D6-FR-02-boost", Verdict.FAIL, detail=f"climax_boost_db={boost} 不在 [3,5]", measured=boost,
                fix="情绪高潮段 BGM 抬升 3–5dB")
    if cf != 0.5:
        rep.add("D6-FR-02-cf", Verdict.FAIL, detail=f"crossfade_s={cf} ≠ 0.5", measured=cf,
                fix="相邻 BGM crossfade 0.5s（硬切例外须动机）")

    # D6-FR-03 每组内嵌轨静音策略
    for g in spec.get("groups", []):
        p = g.get("embedded_track_policy")
        if not p or p.get("mute_bgm") is not True:
            rep.add("D6-FR-03-mute", Verdict.FAIL, detail=f"组 {g.get('id')} 缺 embedded_track_policy.mute_bgm=true",
                    measured=p, fix="视频内嵌轨默认 mute_bgm=true（BGM 走 audio_layer 后期混）")

    # D6-NFR-01 成片零装配元数据泄漏
    for f in leak_scan(spec.get("final_text", ""), extra_terms=D6_LEAK, target="card").findings:
        rep.findings.append(f)
    return rep.assert_fail_has_fix()


@register("audio_assembly")
def run(case) -> Report:
    if getattr(case, "kind", "") != "audio":
        return Report(audit="audio_assembly", target=getattr(case, "id", "?"), skipped=True)
    return validate_audio(case.raw.get("audio", {}), target=case.id)


def audio_gate(sample: dict) -> Report:
    return validate_audio(sample.get("audio", sample), target="reverse")


reverse_test.register_reverse(
    "audio_assembly", audio_gate,
    os.path.join(_HERE, "fixtures", "D6_audio.clean.json"),
    os.path.join(_HERE, "fixtures", "D6_audio.poison.json"),
)
