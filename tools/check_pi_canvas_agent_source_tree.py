from dataclasses import dataclass
from pathlib import Path


REQUIRED_PATHS = [
    "integrations/pi_canvas_agent/package.json",
    "integrations/pi_canvas_agent/package-lock.json",
    "integrations/pi_canvas_agent/src/protocol.ts",
    "integrations/pi_canvas_agent/src/huanyingTools.ts",
    "integrations/pi_canvas_agent/src/runner.ts",
    "integrations/pi_canvas_agent/src/protocol.js",
    "integrations/pi_canvas_agent/src/huanyingTools.js",
    "integrations/pi_canvas_agent/src/runner.js",
    "integrations/pi_canvas_agent/src/runner.test.ts",
    "integrations/pi_canvas_agent/dist/protocol.js",
    "integrations/pi_canvas_agent/dist/huanyingTools.js",
    "integrations/pi_canvas_agent/dist/runner.js",
    "integrations/pi_canvas_agent/packaging/sidecar-manifest.json",
    "integrations/pi_canvas_agent/packaging/start-pi-canvas-agent.bat",
    "vendor/node/windows-x64/node.exe",
    "vendor/node/windows-x64/LICENSE.node.txt",
    "services/canvas_agent_action_schema.py",
    "services/canvas_agent_context_service.py",
    "services/pi_bridge_service.py",
    "services/pi_runtime_service.py",
    "services/canvas_agent_route_service.py",
]

LICENSE_PATHS = [
    "integrations/pi_canvas_agent/LICENSE",
    "integrations/pi_canvas_agent/LICENSE.pi.txt",
]


@dataclass(frozen=True)
class SourceTreeCheckResult:
    ok: bool
    missing: list[str]


def check_source_tree(root: Path) -> SourceTreeCheckResult:
    missing = [path for path in REQUIRED_PATHS if not (root / path).exists()]
    if not any((root / path).exists() for path in LICENSE_PATHS):
        missing.append(LICENSE_PATHS[0])
    return SourceTreeCheckResult(ok=not missing, missing=missing)


def main() -> int:
    root = Path(__file__).resolve().parents[1]
    result = check_source_tree(root)

    if not result.ok:
        print("Pi canvas agent source preflight: BLOCKED")
        for path in result.missing:
            print(f"missing: {path}")
        return 2

    print("Pi canvas agent source preflight: OK")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
