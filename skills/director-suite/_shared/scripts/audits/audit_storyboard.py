"""D9 评测回归 · 分镜文本契约审计（@register storyboard）。纯标准库。

六类检查（DEV-D09 §4）：① 字段齐全 ② 强制映射(情绪5级禁中景) ③ 无绝对时码
④ 引擎隐身(复用 leak_scan) ⑤ 期望特征加权命中率 ≥ pass_rule ⑥ 红线触发=0。
case.raw 里：expected_features=[{id,pattern,weight}]、red_lines=[{id,pattern,fix}]、pass_rule。
"""
from __future__ import annotations
import os
from harness.audit_report import Report, Verdict
from harness.run_eval import register
from harness.leak_scan import leak_scan
from harness import reverse_test, lexicon
from audits import detectors as D

_HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))  # _shared/scripts/

REQUIRED_HEAD = ["时长", "主情绪", "节奏"]      # 镜头头行三参数
REQUIRED_BODY = ["景别", "切镜方式"]            # 每镜必含
D9_LEAK_TERMS = lexicon.BY_DIRECTION.get("D9", [])


def audit_text(final_text: str, spec: dict, target: str = "storyboard") -> Report:
    rep = Report(audit="storyboard", target=target)
    text = final_text or ""

    # ① 字段齐全
    heads = D.shot_heads(text)
    n = len(heads)
    if n == 0:
        rep.add("D9-fields", Verdict.FAIL, detail="未解析到任何镜头(镜头N-M)", measured=0,
                fix="按 output-contract v2.0 写镜头头行 镜头N-M 时长/主情绪/节奏")
    for h in heads:
        for f in REQUIRED_HEAD:
            if f not in h:
                rep.add("D9-fields", Verdict.FAIL, detail=f"镜头头行缺「{f}」: {h[:24]}…",
                        measured=f, fix="补镜头头行三参数 时长+主情绪+节奏(§4.1)")
    for f in REQUIRED_BODY:
        if n and text.count(f) < n:
            rep.add("D9-fields", Verdict.FAIL, detail=f"「{f}」出现 {text.count(f)} < 镜头数 {n}",
                    measured=text.count(f), threshold=n, fix=f"每镜补「{f}」字段")

    # ② 强制映射（情绪5级禁中景及更松，逐镜头组定位）
    for mv in D.mapping_violations(text):
        rep.add("D9-mapping", Verdict.FAIL, detail=f"强制映射违例：{mv}", measured=mv,
                fix="情绪5级用特写/大特写；破格须显式标注动机")

    # ③ 无绝对时码 + ④ 引擎隐身（复用底座 leak_scan，含 ABS_TIMECODE）
    for f in leak_scan(text, extra_terms=D9_LEAK_TERMS, target=target).findings:
        rep.findings.append(f)

    # ⑤ 期望特征加权命中率
    feats = spec.get("expected_features", [])
    if feats:
        tot = sum(float(f.get("weight", 1)) for f in feats) or 1.0
        hit = sum(float(f.get("weight", 1)) for f in feats if D.present(f["pattern"], text))
        rate = round(hit / tot, 3)
        pass_rule = float(spec.get("pass_rule", 0.85))
        miss = [f["id"] for f in feats if not D.present(f["pattern"], text)]
        if rate < pass_rule:
            rep.add("D9-feature_hit", Verdict.FAIL,
                    detail=f"特征命中率 {rate} < pass_rule {pass_rule}；未命中 {miss}",
                    measured=rate, threshold=pass_rule, fix=f"补足题材特征：{miss}")
        else:
            rep.add("D9-feature_hit", Verdict.PASS, detail=f"特征命中率 {rate} ≥ {pass_rule}",
                    measured=rate, threshold=pass_rule)

    # ⑥ 红线触发
    for rl in spec.get("red_lines", []):
        if D.present(rl["pattern"], text):
            rep.add("D9-redline", Verdict.FAIL, detail=f"触发红线 {rl['id']}：/{rl['pattern']}/", measured=rl["id"],
                    fix=rl.get("fix", "移除该红线内容"))

    return rep.assert_fail_has_fix()


@register("storyboard")
def run(case) -> Report:
    if getattr(case, "kind", "storyboard") != "storyboard":
        return Report(audit="storyboard", target=case.id, skipped=True)
    return audit_text(case.final_text, getattr(case, "raw", {}) or {}, target=case.id)


def storyboard_gate(sample: dict) -> Report:
    return audit_text(sample.get("final_text", ""), sample, target="reverse")


reverse_test.register_reverse(
    "storyboard", storyboard_gate,
    os.path.join(_HERE, "fixtures", "D9_storyboard.clean.json"),
    os.path.join(_HERE, "fixtures", "D9_storyboard.poison.json"),
)

# P1 对抗对:hard-negative(合法但刁钻,跨组/运镜prose中景→应放行) vs sneaky-poison(5级组真配中景→应报红)
# 证明逐镜头组检查能抓"作者预期之外"的真违例、且不误杀合法刁钻样本(非自指)。
reverse_test.register_reverse(
    "storyboard_adv", storyboard_gate,
    os.path.join(_HERE, "fixtures", "D9_storyboard_adv.clean.json"),
    os.path.join(_HERE, "fixtures", "D9_storyboard_adv.poison.json"),
)


def leak_wallclock_gate(sample) -> Report:
    """leak_scan 壁钟时码自检:配乐时点应放行、范围式切分应报红。"""
    return leak_scan(sample.get("text", ""), target="leak-selftest")


reverse_test.register_reverse(
    "leak_wallclock", leak_wallclock_gate,
    os.path.join(_HERE, "fixtures", "leak_wallclock.clean.json"),
    os.path.join(_HERE, "fixtures", "leak_wallclock.poison.json"),
)
