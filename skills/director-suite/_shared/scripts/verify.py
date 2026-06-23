"""合入门入口（步行骨架版）。对应 dev plan §7 Makefile verify。

跑：① reverse_test 每闸 clean/poison 反例 ② run_eval 全基线×全审计 GO/NO-GO
   ③ portability 扫脚本 ④（run_eval 内含 leak_scan 每 case 成片）。
四项任一红 → exit1 → 阻断合入。从 _shared/scripts/ 目录运行：python verify.py
"""
from __future__ import annotations
import os
import sys
import glob

# Windows 控制台默认 GBK，统一切 UTF-8 以输出 ✓/中文（无害于 *nix）
for _s in (sys.stdout, sys.stderr):
    try:
        _s.reconfigure(encoding="utf-8")
    except Exception:
        pass

_HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, _HERE)

# 导入审计插件即自动 @register / register_reverse
import audits.audit_consistency  # noqa: E402,F401
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
from harness import reverse_test, registry  # noqa: E402
from harness.run_eval import run_eval, AUDIT_REGISTRY  # noqa: E402
from harness.portability_scan import portability_scan  # noqa: E402


def _portability_all() -> int:
    """铁律②：扫【可发布的 skill 知识/契约 .md】是否含宿主API/货币。
    排除 docs/（meta 文档，正文会引用被禁词作示例）与 scripts/（CI 工具，含检测正则）。
    """
    skill_root = os.path.dirname(os.path.dirname(_HERE))  # _shared/scripts → _shared → director-suite
    bad = 0
    scanned = 0
    for p in glob.glob(os.path.join(skill_root, "**", "*.md"), recursive=True):
        rel = os.path.relpath(p, skill_root).replace("\\", "/")
        if rel.startswith("docs/") or "/scripts/" in ("/" + rel) or rel.startswith("_shared/scripts/"):
            continue
        scanned += 1
        with open(p, encoding="utf-8") as f:
            rep = portability_scan(f.read(), target=rel)
        for fnd in rep.findings:
            print(f"  ✗ [portability] {rep.target}: {fnd.detail}")
            bad += 1
    print(f"  {'✗' if bad else '✓'} [portability] 扫 {scanned} 个 skill .md，宿主API/货币 命中={bad}")
    return 1 if bad else 0


def main() -> int:
    print("model_registry video.default =", registry.video_default())
    print("\n[1/3] reverse_test（证明每个闸会变红）")
    rc1 = reverse_test.run_all()
    print("\n[2/3] run_eval（全基线 × 全审计 → GO/NO-GO，含每 case leak_scan）")
    rc2 = run_eval()
    print("\n[3/3] portability_scan（铁律②）")
    rc3 = _portability_all()
    overall = "GO" if (rc1 or rc2 or rc3) == 0 else "NO-GO"
    print(f"\n===== verify: {overall} (reverse={rc1} run_eval={rc2} portability={rc3}) =====")
    return 0 if overall == "GO" else 1


if __name__ == "__main__":
    raise SystemExit(main())
