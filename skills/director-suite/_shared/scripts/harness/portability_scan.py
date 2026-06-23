"""铁律② 可移植性。skill 文件内不得出现宿主 API 或真实货币单位。

否则破坏"可独立安装的大脑"——执行/成本的"手"属于宿主，不焊进 skill。
"""
from __future__ import annotations
import re
from harness.audit_report import Report, Verdict

HOST_API = [r"vimax\.", r"\brender\(", r"\.exe\b", r"grsai\.", r"localhost:8777", r"127\.0\.0\.1:8777"]
CURRENCY = [r"[¥$]\s?\d", r"\d+\s?积分", r"\d+\s?元/次", r"\d+\s?元每次"]


def portability_scan(text: str, target: str = "<skill file>") -> Report:
    rep = Report(audit="portability", target=target)
    for pat in HOST_API:
        m = re.search(pat, text)
        if m:
            rep.add("PORTABILITY_HOST", Verdict.FAIL,
                    detail=f"skill 文件含宿主 API: /{pat}/ → {m.group(0)!r}", measured=m.group(0),
                    fix="改为机器可消费契约字段，宿主侧实现移出 skill")
    for pat in CURRENCY:
        m = re.search(pat, text)
        if m:
            rep.add("PORTABILITY_CURRENCY", Verdict.FAIL,
                    detail=f"skill 文件含真实货币单位: {m.group(0)!r}", measured=m.group(0),
                    fix="改为无量纲相对系数（如 1.0×）与生成次数 N，不写货币")
    return rep
