"""D9 检测器：分镜文本的确定性求值（regex / 计数 / 映射违例）。纯标准库。"""
from __future__ import annotations
import re

SHOT_HEAD = re.compile(r"镜头\s*\d+[-－]\d+[^\n]*")
GROUP_STRENGTH = re.compile(r"情绪强度[:：]\s*([0-5])")
# 中景及更松（情绪5级禁用区）
LOOSE_SIZES = re.compile(r"景别[:：]\s*(中景|中全景|全景|大全景|远景|大远景)")


def present(pattern: str, text: str) -> bool:
    return re.search(pattern, text) is not None


def shot_heads(text: str) -> list:
    return SHOT_HEAD.findall(text)


def mapping_violations(text: str) -> list:
    """逐镜头组判强制映射违例（output-contract §2.1）。

    P1 升级：从"整段共现"改为"逐镜头组定位"——只在【该组情绪强度==5】的块内找
    【景别：中景及更松】才算违例。这样:① 跨组不再误杀(5级组 + 另一2级中景组合法)
    ② 运镜描述里出现"中景"(非景别字段)不误判(LOOSE_SIZES 锚定"景别："前缀)
    ③ 显式标注"破格"动机的豁免。返回违例列表(可多条)。
    """
    out = []
    for block in re.split(r"(?=镜头组\s*\d)", text):
        m = GROUP_STRENGTH.search(block)
        if not m or m.group(1) != "5":
            continue
        if "破格" in block:                      # 显式破格动机 → 豁免
            continue
        for lm in LOOSE_SIZES.finditer(block):
            out.append(f"情绪5级组配「{lm.group(1)}」(中景及更松)")
    return out
