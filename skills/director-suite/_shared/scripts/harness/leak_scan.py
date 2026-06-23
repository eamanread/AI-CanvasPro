"""铁律① 引擎隐身一票否决。

对"成片"（镜头卡 + Seedance 提示词 + 四表）grep 过程/引擎/执行/成本词。命中即 FAIL。
"""
from __future__ import annotations
import re
from harness.audit_report import Report, Verdict
from harness import lexicon

# 绝对时间码（壁钟式切分）也属泄漏：时长制不写绝对时码。
# P1 修误杀:范围式"0-3s/3–6s"是壁钟切分的铁证→永禁;裸 HH:MM(如"3:45")常是配乐/章节时点,
# 仅在【非音乐/章节/片长语境】的行里才判泄漏,避免把"配乐3:45处入"误杀成 NO-GO。
RANGE_TC = re.compile(r"\b\d+\s*[-–]\s*\d+\s*s\b")
CLOCK_TC = re.compile(r"(?<!\d)\d{1,2}:\d{2}(?!\d)")
MUSIC_CTX = re.compile(r"配乐|BGM|音乐|章节|片长|乐章|主题曲|music", re.I)


def _wallclock_hits(text: str) -> list:
    hits = []
    rm = RANGE_TC.search(text)
    if rm:
        hits.append(rm.group(0))
    for line in text.splitlines():
        if MUSIC_CTX.search(line):          # 配乐/章节/片长语境 → 豁免该行的 HH:MM
            continue
        cm = CLOCK_TC.search(line)
        if cm:
            hits.append(cm.group(0))
    return list(dict.fromkeys(hits))         # 去重保序


def leak_scan(final_text: str, extra_terms=None, target: str = "<成片>") -> Report:
    rep = Report(audit="leak_scan", target=target)
    for t in lexicon.all_terms(extra_terms):
        if re.search(re.escape(t), final_text):
            rep.add("LEAK", Verdict.FAIL,
                    detail=f"成片命中过程/引擎词: {t!r}", measured=t,
                    fix=f"从成片删除 {t!r}；该词属过程产物，只可留在内部审计文件")
    for h in _wallclock_hits(final_text):
        rep.add("NO_WALLCLOCK", Verdict.FAIL,
                detail=f"成片含绝对时间码 {h!r}（违时长制）", measured=h,
                fix="改为「时长：Xs」+ 节拍语序，不写壁钟时间码")
    return rep
