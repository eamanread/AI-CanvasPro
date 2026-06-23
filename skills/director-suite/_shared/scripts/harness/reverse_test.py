"""反向注入测试运行器：证明每个闸对 poison 会变红、对 clean 放行。

完善⑥的执行手段。无 poison fixture 的闸视为未完成。
"""
from __future__ import annotations
import json
import os

_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))  # _shared/scripts/

# name -> (gate_fn, clean_path, poison_path)；各方向 import 时注册
REVERSE_TESTS: dict = {}


def register_reverse(name: str, gate_fn, clean_path: str, poison_path: str) -> None:
    REVERSE_TESTS[name] = (gate_fn, clean_path, poison_path)


def assert_gate_is_real(gate_fn, clean_sample, poison_sample, name: str = "") -> bool:
    """gate_fn(sample)->Report。证明闸对干净样本放行、对投毒样本报红。"""
    c = gate_fn(clean_sample)
    if c.exit_code != 0:
        raise AssertionError(f"[{name}] 干净样本被误杀(假阳性):\n{c.to_json()}")
    p = gate_fn(poison_sample)
    if p.exit_code != 1:
        raise AssertionError(f"[{name}] 投毒样本未被抓(橡皮图章!):\n{p.to_json()}")
    return True


def _load(rel: str):
    path = rel if os.path.isabs(rel) else os.path.join(_ROOT, rel)
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def run_all(verbose: bool = True) -> int:
    if not REVERSE_TESTS:
        print("[reverse_test] 无注册的反例（每个闸应注册一对 clean/poison）")
        return 0
    failed = []
    for name, (gate_fn, clean_p, poison_p) in sorted(REVERSE_TESTS.items()):
        try:
            assert_gate_is_real(gate_fn, _load(clean_p), _load(poison_p), name=name)
            if verbose:
                print(f"  ✓ [{name}] clean 放行 / poison 报红")
        except AssertionError as e:
            failed.append(name)
            print(f"  ✗ [{name}] {e}")
    if verbose:
        print(f"[reverse_test] {len(REVERSE_TESTS) - len(failed)}/{len(REVERSE_TESTS)} 闸为真闸")
    return 0 if not failed else 1


if __name__ == "__main__":
    raise SystemExit(run_all())
