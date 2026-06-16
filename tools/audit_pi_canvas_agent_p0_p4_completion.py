"""Disk-only completion audit for the Pi Canvas Agent P0-P4 goal.

This tool intentionally does not open a browser, probe 8777, or start services.
It reports whether the current workspace is offline-ready and whether a supplied
live artifact proves the remaining P0-14 browser requirement.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path
import re
import subprocess
import sys
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
SCHEMA = "pi-canvas-agent-p0-p4-completion-audit-v1"
SOURCE_REQUIREMENT = "docs/PI_CANVAS_AGENT_CLAW_PARITY_P0_P4_PRODUCT_REQUIREMENTS.md"
COMPLETION_AUDIT = "docs/PI_CANVAS_AGENT_P0_P4_COMPLETION_AUDIT.md"
BROWSER_ACCEPTANCE = "docs/CLAW_ASSISTANT_BROWSER_ACCEPTANCE_SCRIPT.md"
R5_RUNNER = "tools/run_canvas_agent_r5_regression.ps1"
LIVE_ARTIFACT_VALIDATOR = "tools/assistant_live_artifact_validator.mjs"
ARTIFACT_SET_MANIFEST_NAME = "p0-p4-live-artifact-set.json"
COMPLETION_AUDIT_RESULT_NAME = "p0-p4-completion-audit-result.json"
REQUIRED_R5_FIXTURES = [
    "docs/assistant_live_cases/r5-basic-create-connect-layout-focus.json",
    "docs/assistant_live_cases/r5-generation-permission-gate.json",
    "docs/assistant_live_cases/r5-invalid-delta-actions-do-not-execute.json",
]
REQUIRED_PREFLIGHT_GATES = [
    "frontend regression",
    "backend regression",
    "P0-P4 audit",
    "P4 platform regression",
]
OFFLINE_REQUIRED_FILES = [
    SOURCE_REQUIREMENT,
    COMPLETION_AUDIT,
    BROWSER_ACCEPTANCE,
    R5_RUNNER,
    LIVE_ARTIFACT_VALIDATOR,
    "tools/run_claw_assistant_offline_regression.py",
    "tools/run_pi_canvas_agent_offline_regression.py",
    "tools/check_pi_canvas_agent_source_tree.py",
]
AUDIT_REQUIRED_MARKERS = [
    "P0-14",
    "8777 browser artifact",
    "-PreflightOnly",
    "nextActions",
    "waiting-for-authorized-live-artifacts",
    "completionAuditCommand",
    "p0-p4-live-artifact-provenance.json",
    "assistant_live_artifact_validator.mjs",
    "Achieved live",
]
REQUIREMENT_ID_RE = re.compile(r"\b(P[0-4]-\d{2})\b")


def _rel_path(path: Path) -> str:
    try:
        return path.resolve().relative_to(ROOT).as_posix()
    except ValueError:
        return str(path)


def _read_text(relative_path: str) -> str:
    return (ROOT / relative_path).read_text(encoding="utf-8")


def audit_offline_readiness() -> tuple[bool, list[str], list[dict[str, Any]]]:
    issues: list[str] = []
    files: list[dict[str, Any]] = []

    for relative_path in OFFLINE_REQUIRED_FILES:
        path = ROOT / relative_path
        exists = path.exists()
        files.append({"path": relative_path, "exists": exists})
        if not exists:
            issues.append(f"missing required offline artifact {relative_path}")

    if (ROOT / COMPLETION_AUDIT).exists():
        audit_text = _read_text(COMPLETION_AUDIT)
        for marker in AUDIT_REQUIRED_MARKERS:
            if marker not in audit_text:
                issues.append(f"completion audit missing marker {marker}")

    if (ROOT / R5_RUNNER).exists():
        runner_text = _read_text(R5_RUNNER)
        for gate in REQUIRED_PREFLIGHT_GATES:
            if gate not in runner_text:
                issues.append(f"R5 runner missing preflight gate {gate}")
        forbidden_terms = (
            "Invoke-WebRequest",
            "Test-NetConnection",
            "Start-Process python",
            "python server.py",
            "Stop-Process",
            "Restart-Service",
        )
        for term in forbidden_terms:
            if term in runner_text:
                issues.append(f"R5 runner must not manage or probe 8777: {term}")

    return len(issues) == 0, issues, files


def validate_live_artifact(artifact_dir: str | None) -> dict[str, Any]:
    if not artifact_dir:
        return {
            "status": "missing",
            "path": "",
            "valid": False,
            "issues": ["no live artifact supplied"],
        }

    resolved = Path(artifact_dir).resolve()
    validator = ROOT / LIVE_ARTIFACT_VALIDATOR
    completed = subprocess.run(
        ("node", str(validator), str(resolved)),
        cwd=ROOT,
        text=True,
        capture_output=True,
    )
    try:
        validation = json.loads(completed.stdout)
    except json.JSONDecodeError:
        validation = {
            "valid": False,
            "issues": [f"validator output was not JSON: {completed.stderr.strip()}"],
        }

    valid = bool(validation.get("valid")) and completed.returncode == 0
    return {
        "status": "valid" if valid else "invalid",
        "path": _rel_path(resolved),
        "valid": valid,
        "issues": list(validation.get("issues") or []),
        "validatorExitCode": completed.returncode,
    }


def _read_artifact_fixture(artifact_dir: str) -> str:
    provenance_path = Path(artifact_dir).resolve() / "p0-p4-live-artifact-provenance.json"
    try:
        provenance = json.loads(provenance_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return ""
    return str(provenance.get("fixture") or "")


def _read_artifact_provenance(artifact_dir: str) -> dict[str, Any]:
    provenance_path = Path(artifact_dir).resolve() / "p0-p4-live-artifact-provenance.json"
    try:
        provenance = json.loads(provenance_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return {}
    return provenance if isinstance(provenance, dict) else {}


def _validate_preflight_results(value: Any, label: str) -> list[str]:
    if not isinstance(value, list):
        value = []
    issues: list[str] = []
    for gate in REQUIRED_PREFLIGHT_GATES:
        matching_result = next(
            (
                item
                for item in value
                if isinstance(item, dict) and item.get("name") == gate
            ),
            None,
        )
        if not matching_result or matching_result.get("passed") is not True:
            issues.append(f"{label} preflightResults must include a passing result for {gate}")
    return issues


def _extract_artifact_dirs_from_manifest(manifest_path: str) -> tuple[list[str], dict[str, Any]]:
    resolved = Path(manifest_path).resolve()
    try:
        manifest = json.loads(resolved.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        return [], {
            "path": _rel_path(resolved),
            "valid": False,
            "issues": [f"artifact set manifest could not be read: {exc}"],
        }

    issues: list[str] = []
    if manifest.get("schema") != "canvas-agent-r5-artifact-set-v1":
        issues.append("artifact set manifest schema must be canvas-agent-r5-artifact-set-v1")
    if manifest.get("producedBy") != R5_RUNNER:
        issues.append(f"artifact set manifest producedBy must be {R5_RUNNER}")
    if manifest.get("requiredFixtures") != REQUIRED_R5_FIXTURES:
        issues.append("artifact set manifest requiredFixtures must match the R5 completion fixtures")
    if manifest.get("completionAuditResult") != COMPLETION_AUDIT_RESULT_NAME:
        issues.append(
            f"artifact set manifest completionAuditResult must be {COMPLETION_AUDIT_RESULT_NAME}"
        )
    service_policy = manifest.get("servicePolicy") if isinstance(manifest.get("servicePolicy"), dict) else {}
    if service_policy.get("userManaged8777") is not True:
        issues.append("artifact set manifest servicePolicy.userManaged8777 must be true")
    if service_policy.get("noServiceManagementOrProbe") is not True:
        issues.append("artifact set manifest servicePolicy.noServiceManagementOrProbe must be true")
    issues.extend(
        _validate_preflight_results(
            manifest.get("preflightResults"),
            "artifact set manifest",
        )
    )

    artifacts = manifest.get("artifacts")
    if not isinstance(artifacts, list):
        artifacts = []
        issues.append("artifact set manifest artifacts must be a list")

    artifact_dirs: list[str] = []
    for index, item in enumerate(artifacts):
        if not isinstance(item, dict):
            issues.append(f"artifact set manifest artifact {index} must be an object")
            continue
        artifact_dir = item.get("artifactDir")
        if not isinstance(artifact_dir, str) or not artifact_dir.strip():
            issues.append(f"artifact set manifest artifact {index} missing artifactDir")
            continue
        artifact_path = Path(artifact_dir)
        if artifact_path.is_absolute():
            artifact_dirs.append(str(artifact_path.resolve()))
        else:
            resolved_artifact_path = (resolved.parent / artifact_path).resolve()
            try:
                resolved_artifact_path.relative_to(resolved.parent)
            except ValueError:
                issues.append(
                    f"artifact set manifest artifact {index} relative artifactDir must stay within "
                    "artifact set manifest directory"
                )
                continue
            artifact_dirs.append(str(resolved_artifact_path))

    return artifact_dirs, {
        "path": _rel_path(resolved),
        "valid": not issues,
        "issues": issues,
        "artifactSetId": str(manifest.get("artifactSetId") or ""),
        "completionAuditResult": str(manifest.get("completionAuditResult") or ""),
    }


def validate_live_artifacts(artifact_dirs: list[str]) -> dict[str, Any]:
    if not artifact_dirs:
        return {
            "status": "missing",
            "path": "",
            "valid": False,
            "issues": ["no live artifact supplied"],
            "requiredFixtures": REQUIRED_R5_FIXTURES,
            "coveredFixtures": [],
            "missingFixtures": REQUIRED_R5_FIXTURES,
            "artifacts": [],
        }

    artifacts: list[dict[str, Any]] = []
    covered_fixtures: list[str] = []
    artifact_set_ids: list[str] = []
    issues: list[str] = []
    for artifact_dir in artifact_dirs:
        result = validate_live_artifact(artifact_dir)
        provenance = _read_artifact_provenance(artifact_dir)
        fixture = str(provenance.get("fixture") or "")
        artifact_set_id = str(provenance.get("artifactSetId") or "")
        result["fixture"] = fixture
        result["artifactSetId"] = artifact_set_id
        artifacts.append(result)
        if artifact_set_id and artifact_set_id not in artifact_set_ids:
            artifact_set_ids.append(artifact_set_id)
        if result["status"] == "valid" and fixture in REQUIRED_R5_FIXTURES and fixture not in covered_fixtures:
            covered_fixtures.append(fixture)
        elif fixture and fixture not in REQUIRED_R5_FIXTURES:
            issues.append(f"unexpected R5 fixture {fixture}")
        if result["status"] != "valid":
            issues.extend(f"{result['path']}: {issue}" for issue in result.get("issues", []))

    missing_fixtures = [fixture for fixture in REQUIRED_R5_FIXTURES if fixture not in covered_fixtures]
    if missing_fixtures:
        issues.extend(f"missing required R5 artifact for {fixture}" for fixture in missing_fixtures)
    if len(artifact_set_ids) > 1:
        issues.append("all R5 artifacts must share the same provenance artifactSetId")

    valid = not issues
    return {
        "status": (
            "valid"
            if valid
            else (
                "mixed-artifact-set"
                if len(artifact_set_ids) > 1
                else ("invalid" if any(item["status"] == "invalid" for item in artifacts) else "incomplete")
            )
        ),
        "path": [item["path"] for item in artifacts],
        "valid": valid,
        "issues": issues,
        "requiredFixtures": REQUIRED_R5_FIXTURES,
        "coveredFixtures": covered_fixtures,
        "missingFixtures": missing_fixtures,
        "artifactSetId": artifact_set_ids[0] if valid and len(artifact_set_ids) == 1 else "",
        "artifactSetIds": artifact_set_ids,
        "artifacts": artifacts,
    }


def validate_live_artifact_inputs(
    artifact_dirs: list[str],
    artifact_set_manifest: str | None = None,
) -> dict[str, Any]:
    manifest_result: dict[str, Any] | None = None
    manifest_artifact_dirs: list[str] = []
    if artifact_set_manifest:
        manifest_artifact_dirs, manifest_result = _extract_artifact_dirs_from_manifest(artifact_set_manifest)

    live_result = validate_live_artifacts([*artifact_dirs, *manifest_artifact_dirs])
    if manifest_result:
        live_result["artifactSetManifest"] = ARTIFACT_SET_MANIFEST_NAME
        live_result["artifactSetManifestPath"] = manifest_result["path"]
        live_result["completionAuditResult"] = manifest_result.get("completionAuditResult", "")
        if manifest_result["artifactSetId"] and not live_result.get("artifactSetId"):
            live_result["artifactSetIds"] = sorted(
                set([*live_result.get("artifactSetIds", []), manifest_result["artifactSetId"]])
            )
        if not manifest_result["valid"]:
            live_result["valid"] = False
            live_result["status"] = "invalid"
            live_result["issues"].extend(manifest_result["issues"])
        elif live_result.get("artifactSetId") and manifest_result["artifactSetId"] != live_result.get("artifactSetId"):
            live_result["valid"] = False
            live_result["status"] = "mixed-artifact-set"
            live_result["issues"].append("artifact set manifest artifactSetId must match artifact provenance")
    return live_result


def collect_requirement_statuses() -> dict[str, Any]:
    source_ids: set[str] = set()
    status_by_id: dict[str, str] = {}
    missing_from_audit: list[str] = []
    not_offline_ready: list[str] = []

    if (ROOT / SOURCE_REQUIREMENT).exists():
        source_ids = set(REQUIREMENT_ID_RE.findall(_read_text(SOURCE_REQUIREMENT)))

    if (ROOT / COMPLETION_AUDIT).exists():
        for line in _read_text(COMPLETION_AUDIT).splitlines():
            if not line.startswith("| P"):
                continue
            cells = [cell.strip() for cell in line.strip().strip("|").split("|")]
            if len(cells) < 4:
                continue
            requirement_id = cells[0]
            if REQUIREMENT_ID_RE.fullmatch(requirement_id):
                status_by_id[requirement_id] = cells[3]

    for requirement_id in sorted(source_ids):
        status = status_by_id.get(requirement_id)
        if not status:
            missing_from_audit.append(requirement_id)
            continue
        if status != "Achieved" and not status.startswith("Achieved offline"):
            not_offline_ready.append(requirement_id)

    return {
        "total": len(source_ids),
        "statusById": {requirement_id: status_by_id[requirement_id] for requirement_id in sorted(status_by_id)},
        "missingFromAudit": missing_from_audit,
        "notOfflineReady": not_offline_ready,
    }


def build_next_actions(complete: bool, offline_ready: bool, live_result: dict[str, Any]) -> dict[str, Any]:
    if complete:
        status = "complete"
    elif not offline_ready:
        status = "fix-offline-readiness"
    else:
        status = "waiting-for-authorized-live-artifacts"

    return {
        "status": status,
        "blockedRequirement": "" if complete else "P0-14",
        "authorizationRequired": "" if complete else "user-managed-8777-ready",
        "preflightCommand": f"{R5_RUNNER} -PreflightOnly",
        "liveRunCommand": R5_RUNNER,
        "completionAuditCommand": (
            "python tools/audit_pi_canvas_agent_p0_p4_completion.py "
            "--live-artifact <artifact-dir-1> <artifact-dir-2> <artifact-dir-3>"
        ),
        "artifactSetAuditCommand": (
            "python tools/audit_pi_canvas_agent_p0_p4_completion.py "
            f"--live-artifact-set <{ARTIFACT_SET_MANIFEST_NAME}>"
        ),
        "artifactSetManifest": ARTIFACT_SET_MANIFEST_NAME,
        "completionAuditResult": COMPLETION_AUDIT_RESULT_NAME,
        "requiredArtifactCount": len(REQUIRED_R5_FIXTURES),
        "requiredFixtures": REQUIRED_R5_FIXTURES,
        "missingFixtures": list(live_result.get("missingFixtures") or []),
        "requiresSameArtifactSetId": True,
        "humanChecklist": [
            "User confirms 8777 is ready and user-managed.",
            "Run the R5 wrapper without starting, stopping, restarting, status-checking, or probing 8777.",
            "Collect all three artifactDir paths emitted by the same wrapper run.",
            "Run the completion audit with all three artifact directories.",
            "Mark the goal complete only when the audit reports complete=true.",
        ],
        "servicePolicy": {
            "userManaged8777": True,
            "noServiceManagementOrProbe": True,
        },
    }


def build_audit_payload(
    live_artifacts: list[str] | None = None,
    live_artifact_set: str | None = None,
) -> dict[str, Any]:
    offline_ready, offline_issues, offline_files = audit_offline_readiness()
    live_result = validate_live_artifact_inputs(live_artifacts or [], live_artifact_set)
    requirements = collect_requirement_statuses()
    if requirements["missingFromAudit"]:
        offline_ready = False
        offline_issues.extend(
            f"requirement missing from completion audit: {requirement_id}"
            for requirement_id in requirements["missingFromAudit"]
        )
    live_valid = live_result["status"] == "valid"
    complete = offline_ready and live_valid
    if "P0-14" in requirements["statusById"]:
        requirements["statusById"]["P0-14"] = "Achieved live" if live_valid else "Not achieved live"
    if live_valid:
        requirements["notOfflineReady"] = [
            requirement_id for requirement_id in requirements["notOfflineReady"] if requirement_id != "P0-14"
        ]
    elif "P0-14" not in requirements["notOfflineReady"]:
        requirements["notOfflineReady"].append("P0-14")
        requirements["notOfflineReady"].sort()
    missing_requirements = [] if complete else ([] if not offline_ready else ["P0-14"])
    if not offline_ready:
        missing_requirements.append("offline-readiness")
    next_actions = build_next_actions(complete, offline_ready, live_result)

    return {
        "schema": SCHEMA,
        "sourceRequirement": SOURCE_REQUIREMENT,
        "complete": complete,
        "offlineReady": offline_ready,
        "missingRequirements": missing_requirements,
        "requiredPreflightGates": REQUIRED_PREFLIGHT_GATES,
        "offlineEvidence": {
            "requiredFiles": offline_files,
            "issues": offline_issues,
        },
        "requirements": requirements,
        "liveArtifact": live_result,
        "nextActions": next_actions,
        "servicePolicy": {
            "requiresExplicitUserManaged8777Authorization": True,
            "noServiceManagementOrProbe": True,
        },
    }


def parse_args(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--live-artifact",
        action="append",
        nargs="+",
        default=[],
        help="Optional artifact directory produced by tools/run_canvas_agent_r5_regression.ps1",
    )
    parser.add_argument(
        "--live-artifact-set",
        default="",
        help=f"Optional {ARTIFACT_SET_MANIFEST_NAME} manifest produced by tools/run_canvas_agent_r5_regression.ps1",
    )
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv or sys.argv[1:])
    live_artifacts = [artifact for group in args.live_artifact for artifact in group]
    payload = build_audit_payload(live_artifacts, args.live_artifact_set or None)
    print(json.dumps(payload, ensure_ascii=False, indent=2))
    return 0 if payload["complete"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
