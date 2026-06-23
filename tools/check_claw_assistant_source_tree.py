"""Preflight check for the Claw assistant source tree.

This script is intentionally not part of the default unit test suite. It is a
handoff guard: run it before continuing S1-02/S1-03/S1-04 code slices.
"""

from pathlib import Path
import sys


ROOT = Path(__file__).resolve().parents[1]

REQUIRED_SOURCE_FILES = (
    "services/claw_bridge_service.py",
    "services/claw_action_schema.py",
    "services/claw_skill_registry_service.py",
    "config/assistant-skills/storyboard_director.json",
    "modules/assistant/assistantActionPreview.js",
    "modules/assistant/assistantActionExecutor.js",
    "modules/app/appAssistantPanel.js",
)


def main() -> int:
    missing = [path for path in REQUIRED_SOURCE_FILES if not (ROOT / path).exists()]
    if not missing:
        print("Claw assistant source preflight: OK")
        return 0

    print("Claw assistant source preflight: BLOCKED")
    print("Missing required source files:")
    for path in missing:
        print(f"- {path}")
    print("")
    print("Restore these files before continuing S1-02/S1-03/S1-04 code slices.")
    print("Do not start, stop, restart, status-check, or probe 8777 from this script.")
    return 2


if __name__ == "__main__":
    raise SystemExit(main())
