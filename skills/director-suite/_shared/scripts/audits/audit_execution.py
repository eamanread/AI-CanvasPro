"""D1 执行编排契约 · 结构化审计（@register execution）。纯标准库。

验执行契约实例：引用闭合 / 时长制 est∈[4,15]+order连续 / 依赖DAG无环 /
暂停门(敏感类强制) / 降级同族 / final_prompt 引擎隐身 / 契约无宿主API(可移植)。
不需宿主 parser——纯结构断言。真机 ViMax 消费(G2)另由宿主侧+用户验。on case.kind=="execution"。
"""
from __future__ import annotations
import os
import json
from collections import defaultdict
from harness.audit_report import Report, Verdict
from harness.run_eval import register
from harness.leak_scan import leak_scan
from harness.portability_scan import portability_scan
from harness import reverse_test, registry as REG

_HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))  # _shared/scripts/
SENSITIVE = {"faceswap", "digital_human", "pov"}


def _is_dag(edges) -> bool:
    g = defaultdict(list)
    nodes = set()
    for e in edges:
        g[e["from"]].append(e["to"])
        nodes.add(e["from"])
        nodes.add(e["to"])
    color = {n: 0 for n in nodes}   # 0=white 1=gray 2=black

    def dfs(u):
        color[u] = 1
        for v in g[u]:
            if color.get(v, 0) == 1:
                return False
            if color.get(v, 0) == 0 and not dfs(v):
                return False
        color[u] = 2
        return True

    return all(color[n] != 0 or dfs(n) for n in list(nodes))


def validate_contract(c: dict, target: str = "execution-contract") -> Report:
    rep = Report(audit="execution", target=target)
    ke = {k["id"]: k for k in c.get("key_elements", [])}
    shots = c.get("shots", [])

    # D1-FR-01 引用闭合 + D1-FR-07 时长制
    orders = []
    for s in shots:
        orders.append(s.get("order"))
        for r in s.get("refs", []):
            if r not in ke:
                rep.add("D1-FR-01-refclosure", Verdict.FAIL,
                        detail=f"shot {s.get('id')} 引用 {r} 不在 key_elements", measured=r,
                        fix="回 Step2 补登记该 asset_id 再引用；禁即兴造 ID")
        d = s.get("est_duration")
        if not (isinstance(d, (int, float)) and 4 <= d <= 15):
            rep.add("D1-FR-07-duration", Verdict.FAIL,
                    detail=f"shot {s.get('id')} est_duration={d} 不在 [4,15]", measured=d, threshold=[4, 15],
                    fix="镜头组=生成单元，时长落 [4,15]s；超 15 拆下一组")
        lk = leak_scan(s.get("final_prompt", ""), target=f"shot:{s.get('id')}")
        for f in lk.findings:
            rep.findings.append(f)   # D1-FR-06 引擎隐身 + 绝对时码
    if orders and sorted(orders) != list(range(1, len(orders) + 1)):
        rep.add("D1-FR-07-order", Verdict.FAIL, detail=f"shot order 非连续 1..N: {orders}", measured=orders,
                fix="order 从 1 连续无跳号")

    # D1-FR-03 暂停门：含敏感类 key_element 必须有 mandatory 的 element_render 门
    has_sensitive = any(k.get("category") in SENSITIVE for k in ke.values())
    gates = c.get("pause_gates", [])
    if has_sensitive:
        ok = any("element_render" in g.get("gate_id", "") and g.get("mandatory") is True for g in gates)
        if not ok:
            rep.add("D1-FR-03-gate", Verdict.FAIL,
                    detail="含 faceswap/digital_human/pov，但无 mandatory 的 element_render 暂停门",
                    fix="敏感类出图后强制暂停等用户确认相似度(mandatory=true, escalate=stop_and_ask)")
    for g in gates:
        if not g.get("gate_id") or not isinstance(g.get("mandatory"), bool):
            rep.add("D1-FR-03-gateform", Verdict.FAIL, detail=f"暂停门字段不全: {g}",
                    fix="每门含 gate_id + mandatory(bool) + escalate")

    # D1-FR-04 降级同族
    chain = c.get("degrade_chain", [])
    if chain and not REG.same_video_family(chain):
        rep.add("D1-FR-04-degrade", Verdict.FAIL, detail=f"降级链含跨族/未注册模型: {chain}", measured=chain,
                fix="degrade_chain 全在 video.adapters 内（禁跨族静默替代）")

    # DAG 无环
    if not _is_dag(c.get("dependencies", [])):
        rep.add("D1-DAG", Verdict.FAIL, detail="dependencies 含环（非 DAG）",
                fix="调度依赖须无环：shot→assemble→export")

    # 可移植：契约文本无宿主 API
    for f in portability_scan(json.dumps(c, ensure_ascii=False), target="contract").findings:
        rep.findings.append(f)

    return rep.assert_fail_has_fix()


@register("execution")
def run(case) -> Report:
    if getattr(case, "kind", "") != "execution":
        return Report(audit="execution", target=getattr(case, "id", "?"), skipped=True)
    return validate_contract(case.raw.get("contract", {}), target=case.id)


def execution_gate(sample: dict) -> Report:
    return validate_contract(sample.get("contract", sample), target="reverse")


reverse_test.register_reverse(
    "execution", execution_gate,
    os.path.join(_HERE, "fixtures", "D1_execution.clean.json"),
    os.path.join(_HERE, "fixtures", "D1_execution.poison.json"),
)
