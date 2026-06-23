"""D13 余项 · 制片圣经四表互锁审计（@register bible_interlock）。纯标准库。

验四表(角色/场景/道具 + 分镜)互锁四不变量：
① 引用闭合：分镜每个 asset_id ∈ 三表（禁悬空/即兴造ID）
② 覆盖完整：每个 L1/焦点实体 ≥1 镜用到（未用=降级或删）
③ 道具状态轴单调：@sN 跨组按序推进（无逆序突变）
④ L1锚不漂：分镜 looks 里 [Element_] 的锚值 == 角色表锚（无静默漂移）
on kind=="bible"。
"""
from __future__ import annotations
import os
import re
from harness.audit_report import Report, Verdict
from harness.run_eval import register
from harness import reverse_test

_HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
STATE = re.compile(r"@s(\d+)$")


def _base_id(ref: str) -> str:
    return STATE.sub("", ref)


def validate_bible(b: dict, target: str = "bible") -> Report:
    rep = Report(audit="bible_interlock", target=target)
    chars = {c["id"]: c for c in b.get("characters", [])}
    scenes = {s["id"]: s for s in b.get("scenes", [])}
    props = {p["id"]: p for p in b.get("props", [])}
    roster_ids = set(chars) | set(scenes) | set(props)
    sb = b.get("storyboard", [])

    used = set()
    prop_seq = {}   # prop_id -> [state_num...] in storyboard order
    for g in sb:
        for ref in g.get("refs", []):
            bid = _base_id(ref)
            used.add(bid)
            # ① 引用闭合
            if bid not in roster_ids:
                rep.add("D13-IL-refclosure", Verdict.FAIL, detail=f"组 {g.get('group')} 引 {ref} 不在三表(悬空)",
                        measured=ref, fix="回 Step2 补登记该 asset_id 或删引用；禁即兴造ID")
            # ③ 收集道具状态序
            m = STATE.search(ref)
            if m and bid in props:
                prop_seq.setdefault(bid, []).append(int(m.group(1)))
        # ④ L1锚不漂
        for eid, look in (g.get("looks") or {}).items():
            anc = chars.get(eid, {}).get("anchor", {})
            for k, v in (look or {}).items():
                if k in anc and anc[k] != v:
                    rep.add("D13-IL-anchor", Verdict.FAIL,
                            detail=f"组 {g.get('group')} {eid} {k}={v} ≠ 角色表锚 {anc[k]}(L1漂移)",
                            measured=v, threshold=anc[k], fix=f"L1锚不可改：{eid} {k} 锁 {anc[k]}")

    # ② 覆盖完整（焦点/L1 实体须被用到）
    for cid, c in {**chars, **scenes}.items():
        if c.get("focus") and cid not in used:
            rep.add("D13-IL-coverage", Verdict.FAIL, detail=f"焦点实体 {cid} 未被任何镜用到",
                    measured=cid, fix="焦点实体未用→降级为从属或删")
    # ③ 状态轴单调（非递减）
    for pid, seq in prop_seq.items():
        if seq != sorted(seq):
            rep.add("D13-IL-stateaxis", Verdict.FAIL, detail=f"道具 {pid} 状态轴逆序 {seq}(未登记突变)",
                    measured=seq, threshold="单调非递减", fix=f"{pid} 状态须按 @s1→@s2→… 推进")

    return rep.assert_fail_has_fix()


@register("bible_interlock")
def run(case) -> Report:
    if getattr(case, "kind", "") != "bible":
        return Report(audit="bible_interlock", target=getattr(case, "id", "?"), skipped=True)
    return validate_bible(case.raw.get("bible", {}), target=case.id)


def bible_gate(sample: dict) -> Report:
    return validate_bible(sample.get("bible", sample), target="reverse")


reverse_test.register_reverse(
    "bible_interlock", bible_gate,
    os.path.join(_HERE, "fixtures", "D13_bible.clean.json"),
    os.path.join(_HERE, "fixtures", "D13_bible.poison.json"),
)
