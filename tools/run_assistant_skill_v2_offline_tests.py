import json
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from services.assistant_skill_v2_offline_runner import run_v2_skill_offline_tests


def main(argv=None):
    argv = list(argv or sys.argv[1:])
    skill_root = argv[0] if argv else None
    result = run_v2_skill_offline_tests(skill_root=skill_root)
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 0 if result.get("success") else 1


if __name__ == "__main__":
    raise SystemExit(main())
