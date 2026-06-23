"""模型注册表读取器（D3 单一事实来源）。

换模型 = 改 model_registry.json 1 处；其余代码一律引用本模块，禁硬编码模型名。
"""
from __future__ import annotations
import json
import os
import functools

_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))  # _shared/scripts/
_REGISTRY = os.path.join(_ROOT, "model_registry.json")


@functools.lru_cache(maxsize=1)
def reg() -> dict:
    with open(_REGISTRY, encoding="utf-8") as f:
        return json.load(f)


def video_default() -> str:
    return reg()["video"]["default"]


def image_default() -> str:
    return reg()["image"]["default"]


def voice_for(lang: str) -> str:
    return reg()["voice"].get(lang, reg()["voice"].get("zh"))


def same_video_family(chain) -> bool:
    """降级链是否全在 video 族内（禁跨族静默替代）。"""
    adapters = set(reg()["video"]["adapters"].keys())
    return all(m in adapters for m in chain)
