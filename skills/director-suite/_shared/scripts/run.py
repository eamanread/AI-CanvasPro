"""run_eval CLI 入口（避开 `python -m harness.run_eval` 的主模块双重导入陷阱）。

用法：python run.py [cases_dir]   默认 baselines/cases
红演示：python run.py baselines/cases_poison   → 期望 NO-GO / exit1
"""
from __future__ import annotations
import os
import sys

for _s in (sys.stdout, sys.stderr):
    try:
        _s.reconfigure(encoding="utf-8")
    except Exception:
        pass

_HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, _HERE)

import audits.audit_consistency  # noqa: E402,F401  触发 @register
import audits.audit_storyboard  # noqa: E402,F401
import audits.audit_model_adapters  # noqa: E402,F401
import audits.audit_execution  # noqa: E402,F401
import audits.audit_reverse_board  # noqa: E402,F401
import audits.audit_camera_path  # noqa: E402,F401
import audits.audit_audio_assembly  # noqa: E402,F401
import audits.audit_static_board  # noqa: E402,F401
import audits.audit_image_genome  # noqa: E402,F401
import audits.audit_cost  # noqa: E402,F401
import audits.audit_style_fidelity  # noqa: E402,F401
import audits.audit_coverage  # noqa: E402,F401
import audits.audit_terminology  # noqa: E402,F401
import audits.audit_mapping_integrity  # noqa: E402,F401
import audits.audit_versions  # noqa: E402,F401
import audits.audit_bible_interlock  # noqa: E402,F401
import audits.audit_megaprompt_sync  # noqa: E402,F401
from harness.run_eval import run_eval  # noqa: E402

if __name__ == "__main__":
    if "--freeze" in sys.argv:                       # 冻结 L2 回归门黄金签名
        raise SystemExit(run_eval(freeze=True))
    _dir = next((a for a in sys.argv[1:] if not a.startswith("-")), "baselines/cases")
    raise SystemExit(run_eval(_dir))
