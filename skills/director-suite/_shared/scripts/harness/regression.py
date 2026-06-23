"""L2 回归门（把原 snapshot 的"黄金基线"从死代码变成真会 FAIL 的门）。纯标准库。

机制:冻结每个(case|audit)产出的 check-ID 集合为黄金签名;重跑时若某 (case|audit)
较黄金【丢失了检查】(审计被静默弱化/改坏),判 REGRESSION FAIL + 嫌疑指针。
这弥补了 run_eval 的盲区:GO 只看"当前有没有FAIL",看不出"某审计悄悄不再抓某类问题"。
"""
from __future__ import annotations
import json
import os
from harness.audit_report import Report, Verdict


def signature(reports) -> dict:
    """{ "target|audit": [check-id...] } —— 只取真跑(非skipped)的审计。"""
    sig = {}
    for r in reports:
        if getattr(r, "skipped", False):
            continue
        key = f"{r.target}|{r.audit}"
        sig.setdefault(key, [])
        sig[key].extend(f.check for f in r.findings)
    return {k: sorted(set(v)) for k, v in sig.items()}


def freeze(golden_path: str, sig: dict) -> None:
    os.makedirs(os.path.dirname(golden_path), exist_ok=True)
    with open(golden_path, "w", encoding="utf-8") as f:
        json.dump(sig, f, ensure_ascii=False, sort_keys=True, indent=2)


def check(reports, golden_path: str) -> Report:
    rep = Report(audit="regression", target=os.path.basename(golden_path))
    cur = signature(reports)
    if not os.path.exists(golden_path):
        rep.add("REG-NO-GOLDEN", Verdict.WARN,
                detail=f"无黄金签名 {golden_path}（首次需 freeze）",
                fix="确认产物正确后 freeze（verify.py --freeze）")
        return rep
    golden = json.load(open(golden_path, encoding="utf-8"))
    for key, checks in golden.items():
        cur_checks = set(cur.get(key, []))
        missing = [c for c in checks if c not in cur_checks]
        if missing:
            rep.add("REG-WEAKENED", Verdict.FAIL,
                    detail=f"{key} 较黄金基线丢失检查 {missing}（审计被弱化/回归）",
                    measured=missing, threshold=checks,
                    fix=f"嫌疑指针:某改动让 {key} 不再产出 {missing};恢复行为，或经审核 re-freeze 黄金签名")
    return rep
