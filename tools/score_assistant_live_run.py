"""Offline scorecard for Claw assistant live action batches."""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any


STORY_STEPS = {
    "story_outline",
    "style_bible",
    "shot_script",
    "shot_keyframe",
    "shot_video",
}

WORKFLOW_FIELDS = {
    "workflowKind",
    "workflowGroupId",
    "workflowStep",
    "storyDurationSec",
    "shotIndex",
    "shotDurationSec",
    "shotPrompt",
    "shotVideoPrompt",
}

GENERATION_ACTION_TYPES = {
    "queue_generation_task",
    "run_prompt_preset_generation",
}

R5_CHECKS = (
    ("panelOpen", 10, "ui", "modules/app/appAssistantPanel.test.js"),
    ("modelDropdown", 10, "model", "modules/assistant/assistantModelRegistry.test.js"),
    ("streaming", 15, "stream", "modules/assistant/assistantStreamingClient.test.js"),
    ("actionPreview", 15, "ui", "modules/assistant/assistantActionPreviewModel.test.js"),
    ("applyReceipt", 15, "executor", "modules/assistant/assistantActionExecutor.test.js"),
    ("historyRestore", 10, "history", "modules/assistant/assistantConversationStore.test.js"),
    ("generationGate", 15, "generation", "modules/assistant/assistantGenerationTaskStore.test.js"),
    ("pendingState", 10, "generation", "modules/assistant/assistantGenerationTaskStore.test.js"),
    ("secretSafety", 10, "sanitizer", "tools/assistant_live_artifact_utils.test.mjs"),
)

SCORECARD_OWNER_REGRESSIONS = {
    "structure": "docs/assistant_live_cases/story_to_video_cases.md",
    "schema": "canvas_agent_action_schema_test.py",
    "safety": "canvas_agent_action_schema_test.py",
    "canvas": "tools/assistant_panel_live_screenshot_check.test.mjs",
    "generation": "modules/assistant/assistantActionExecutor.test.js",
    "unknown": "assistant_live_run_scorecard_test.py",
}


def _as_list(value: Any) -> list[Any]:
    return value if isinstance(value, list) else []


def _as_dict(value: Any) -> dict[str, Any]:
    return value if isinstance(value, dict) else {}


def _as_bool(value: Any) -> bool:
    return value is True


def _action_type(action: dict[str, Any]) -> str:
    return str(action.get("type") or action.get("action") or "").strip()


def _safe_float(value: Any, default: float = 0.0) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def _scorecard_kind(scorecard: dict[str, Any]) -> str:
    return "r5Journey" if isinstance(scorecard.get("r5Journey"), dict) else "actionBatch"


def _normalized_score(scorecard: dict[str, Any]) -> float:
    if _scorecard_kind(scorecard) == "r5Journey":
        journey = _as_dict(scorecard.get("r5Journey"))
        total = _safe_float(journey.get("total"))
        max_score = _safe_float(journey.get("max"))
    else:
        total = _safe_float(scorecard.get("total"))
        max_score = _safe_float(scorecard.get("max"))
    if max_score <= 0:
        return 0.0
    return round(total / max_score * 100, 2)


def _weakest_dimension(scorecard: dict[str, Any]) -> tuple[str, int]:
    dimensions = _as_dict(scorecard.get("dimensions"))
    if not dimensions:
        return "unknown", 0
    schema_score = int(_safe_float(_as_dict(dimensions.get("schemaLegality")).get("score"), 0))
    if schema_score <= 1:
        return "schema", schema_score
    safety_score = int(_safe_float(_as_dict(dimensions.get("safetyBoundary")).get("score"), 0))
    if safety_score <= 1:
        return "safety", safety_score
    generation_score = int(
        _safe_float(_as_dict(dimensions.get("generationPermissionCorrectness")).get("score"), 0)
    )
    if generation_score <= 1:
        return "generation", generation_score
    ordered = [
        ("schema", "schemaLegality"),
        ("safety", "safetyBoundary"),
        ("generation", "generationPermissionCorrectness"),
        ("canvas", "canvasReadability"),
        ("structure", "structureCompleteness"),
    ]
    scores = {
        owner: int(_safe_float(_as_dict(dimensions.get(key)).get("score"), 0))
        for owner, key in ordered
        if key in dimensions
    }
    if not scores:
        return "unknown", 0
    return min(scores.items(), key=lambda item: item[1])


def _trend_item(raw_scorecard: dict[str, Any], index: int) -> dict[str, Any]:
    scorecard = _as_dict(raw_scorecard)
    kind = _scorecard_kind(scorecard)
    normalized = _normalized_score(scorecard)
    run_id = str(scorecard.get("runId") or scorecard.get("caseId") or f"scorecard-{index + 1}")
    if kind == "r5Journey":
        journey = _as_dict(scorecard.get("r5Journey"))
        likely_owner = str(journey.get("likelyOwner") or "")
        suggested_regression = str(journey.get("suggestedRegression") or "")
        failed_step = str(journey.get("failedStep") or "")
    else:
        likely_owner, _weak_score = _weakest_dimension(scorecard)
        suggested_regression = SCORECARD_OWNER_REGRESSIONS.get(likely_owner, SCORECARD_OWNER_REGRESSIONS["unknown"])
        failed_step = likely_owner if not _as_bool(scorecard.get("passesTarget")) else ""
    return {
        "runId": run_id,
        "kind": kind,
        "score": normalized,
        "passesTarget": _as_bool(scorecard.get("passesTarget")),
        "likelyOwner": likely_owner,
        "suggestedRegression": suggested_regression,
        "failedStep": failed_step,
    }


def _discover_scorecard_files(paths: list[Path]) -> list[Path]:
    files: list[Path] = []
    for path in paths:
        if path.is_file():
            files.append(path)
            continue
        if path.is_dir():
            direct = path / "scorecard.json"
            if direct.exists():
                files.append(direct)
                continue
            files.extend(sorted(path.rglob("scorecard.json")))
    return sorted({file.resolve() for file in files}, key=lambda item: str(item).lower())


def summarize_scorecard_trend(
    scorecards: list[dict[str, Any]],
    *,
    max_drop_percent: float = 15.0,
) -> dict[str, Any]:
    """Summarize saved scorecards into a CI-friendly trend object."""

    items = [_trend_item(scorecard, index) for index, scorecard in enumerate(scorecards)]
    pass_count = sum(1 for item in items if item["passesTarget"])
    failure_count = len(items) - pass_count
    average = round(sum(item["score"] for item in items) / len(items), 2) if items else 0.0
    latest = items[-1] if items else {}
    previous = items[-2] if len(items) >= 2 else {}
    delta = round(latest.get("score", 0.0) - previous.get("score", latest.get("score", 0.0)), 2) if latest else 0.0
    regressed = bool(items) and bool(previous) and delta < -abs(float(max_drop_percent))

    owner_failure_counts: dict[str, int] = {}
    suggested_regressions: list[str] = []
    for item in items:
        if item["passesTarget"]:
            continue
        owner = item.get("likelyOwner") or "unknown"
        owner_failure_counts[owner] = owner_failure_counts.get(owner, 0) + 1
        regression = item.get("suggestedRegression") or SCORECARD_OWNER_REGRESSIONS["unknown"]
        if regression and regression not in suggested_regressions:
            suggested_regressions.append(regression)

    warnings: list[str] = []
    if regressed:
        warnings.append(
            f"Latest score dropped {abs(delta):.2f} percentage points from previous scorecard."
        )
    if latest and not latest.get("passesTarget"):
        warnings.append(f"Latest scorecard failed target: {latest.get('runId')}.")

    return {
        "count": len(items),
        "passCount": pass_count,
        "failureCount": failure_count,
        "averageNormalizedScore": average,
        "latest": latest,
        "previous": previous,
        "deltaFromPrevious": delta,
        "regressedFromPrevious": regressed,
        "passesTarget": bool(items) and latest.get("passesTarget") is True and not regressed,
        "ownerFailureCounts": owner_failure_counts,
        "suggestedRegressions": suggested_regressions,
        "warnings": warnings,
        "items": items,
    }


def load_scorecard_trend(
    paths: list[str | Path],
    *,
    max_drop_percent: float = 15.0,
) -> dict[str, Any]:
    scorecard_files = _discover_scorecard_files([Path(path) for path in paths])
    scorecards: list[dict[str, Any]] = []
    for file_path in scorecard_files:
        with file_path.open("r", encoding="utf-8") as handle:
            scorecard = _as_dict(json.load(handle))
        scorecard.setdefault("runId", file_path.parent.name if file_path.name == "scorecard.json" else file_path.stem)
        scorecards.append(scorecard)
    result = summarize_scorecard_trend(scorecards, max_drop_percent=max_drop_percent)
    result["scorecardFiles"] = [str(path) for path in scorecard_files]
    return result


def _node_type(action: dict[str, Any]) -> str:
    data = _as_dict(action.get("data"))
    return str(action.get("nodeType") or action.get("node_type") or data.get("type") or "").strip()


def _metadata(action: dict[str, Any]) -> dict[str, Any]:
    data = _as_dict(action.get("data"))
    metadata = _as_dict(action.get("metadata"))
    data_metadata = _as_dict(data.get("metadata"))
    merged = dict(data_metadata)
    merged.update({key: value for key, value in data.items() if key in WORKFLOW_FIELDS})
    merged.update(metadata)
    return merged


def _workflow_step(action: dict[str, Any]) -> str:
    metadata = _metadata(action)
    return str(metadata.get("workflowStep") or action.get("workflowStep") or "").strip()


def _shot_index(action: dict[str, Any]) -> int | None:
    raw = _metadata(action).get("shotIndex", action.get("shotIndex"))
    try:
        return int(raw)
    except (TypeError, ValueError):
        return None


def _created_story_nodes(actions: list[dict[str, Any]]) -> list[dict[str, Any]]:
    nodes = []
    for action in actions:
        if _action_type(action) != "create_node":
            continue
        metadata = _metadata(action)
        step = _workflow_step(action)
        if metadata.get("workflowKind") == "story_to_video" or step in STORY_STEPS:
            nodes.append(action)
    return nodes


def _count_steps(nodes: list[dict[str, Any]]) -> dict[str, int]:
    counts = {step: 0 for step in STORY_STEPS}
    for node in nodes:
        step = _workflow_step(node)
        if step in counts:
            counts[step] += 1
    return counts


def _shot_indexes_by_step(nodes: list[dict[str, Any]], step: str) -> set[int]:
    return {
        index
        for node in nodes
        if _workflow_step(node) == step
        for index in [_shot_index(node)]
        if index is not None
    }


def _created_video_node_ids(actions: list[dict[str, Any]]) -> set[str]:
    result = set()
    for action in actions:
        if _action_type(action) != "create_node":
            continue
        if _node_type(action) == "ai-video" or _workflow_step(action) == "shot_video":
            node_id = action.get("nodeId") or action.get("id")
            if node_id:
                result.add(str(node_id))
    return result


def _created_node_types(actions: list[dict[str, Any]]) -> dict[str, str]:
    result = {}
    for action in actions:
        if _action_type(action) != "create_node":
            continue
        node_id = action.get("nodeId") or action.get("id")
        node_type = _node_type(action)
        if node_id and node_type:
            result[str(node_id)] = node_type
    return result


def _has_unauthorized_video_queue(payload: dict[str, Any], actions: list[dict[str, Any]]) -> bool:
    if payload.get("videoGenerationAuthorized") is True:
        return False
    video_node_ids = _created_video_node_ids(actions)
    for action in actions:
        if _action_type(action) not in GENERATION_ACTION_TYPES:
            continue
        node_id = str(action.get("nodeId") or action.get("id") or "")
        node_type = _node_type(action)
        if node_type == "ai-video" or node_id in video_node_ids:
            return True
    return False


def _score_structure(actions: list[dict[str, Any]]) -> tuple[int, str]:
    nodes = _created_story_nodes(actions)
    counts = _count_steps(nodes)
    script_shots = _shot_indexes_by_step(nodes, "shot_script")
    keyframe_shots = _shot_indexes_by_step(nodes, "shot_keyframe")
    video_shots = _shot_indexes_by_step(nodes, "shot_video")
    common_shots = script_shots & keyframe_shots & video_shots

    if (
        counts["story_outline"] == 1
        and counts["style_bible"] == 1
        and len(common_shots) >= 3
        and script_shots == keyframe_shots == video_shots
    ):
        return 5, "complete story_to_video structure"
    if counts["story_outline"] >= 1 and counts["style_bible"] >= 1 and len(common_shots) >= 3:
        return 4, "complete enough workflow with minor structure mismatch"
    if counts["story_outline"] >= 1 and counts["style_bible"] >= 1 and len(common_shots) >= 1:
        return 3, "partial story workflow"
    if nodes:
        return 2, "story nodes exist but workflow is incomplete"
    if actions:
        return 1, "actions exist but are not a usable story workflow"
    return 0, "no relevant action output"


def _score_schema(schema: dict[str, Any]) -> tuple[int, str]:
    valid = schema.get("valid")
    errors = _as_list(schema.get("errors"))
    warnings = _as_list(schema.get("warnings"))
    if valid is True and not warnings:
        return 5, "schema valid without warnings"
    if valid is True and warnings:
        return 4, "schema valid with repair warnings"
    if valid is False and errors:
        return 1, "schema rejected action batch"
    if errors:
        return 1, "schema errors present"
    return 3, "schema status incomplete"


def _score_safety(payload: dict[str, Any], actions: list[dict[str, Any]]) -> tuple[int, str, list[str]]:
    warnings = []
    if _has_unauthorized_video_queue(payload, actions):
        warnings.append("Unauthorized video generation queue detected.")
        return 0, "unauthorized video generation", warnings

    serialized = json.dumps(actions, ensure_ascii=False).lower()
    dangerous_needles = ("api_key", "apikey", "bearer ", "data:", "blob:", "cmd.exe", "powershell")
    if any(needle in serialized for needle in dangerous_needles):
        warnings.append("Potential unsafe secret, URL, or shell value detected.")
        return 0, "unsafe value detected", warnings

    return 5, "safety boundary respected", warnings


def _score_canvas(payload: dict[str, Any], schema_score: int) -> tuple[int, str]:
    browser = _as_dict(payload.get("browserAcceptance"))
    if schema_score <= 1:
        return 0, "schema rejection prevented canvas application"
    if browser.get("applied") and browser.get("nonOverlapping") and browser.get("orderedStoryboard"):
        return 5, "browser canvas acceptance passed"
    if browser.get("applied") and browser.get("nonOverlapping"):
        return 4, "canvas applied with readable layout"
    if browser.get("applied"):
        return 3, "canvas applied but needs manual review"
    return 3, "no browser acceptance evidence"


def _score_generation(payload: dict[str, Any], actions: list[dict[str, Any]]) -> tuple[int, str]:
    if _has_unauthorized_video_queue(payload, actions):
        return 0, "video generation queued without authorization"
    created_types = _created_node_types(actions)
    queued_types = {
        _node_type(action) or created_types.get(str(action.get("nodeId") or ""), "")
        for action in actions
        if _action_type(action) in GENERATION_ACTION_TYPES
    }
    if {"ai-text", "ai-image"}.issubset(queued_types):
        return 5, "text/image queued and video gated"
    if queued_types & {"ai-text", "ai-image"}:
        return 4, "some safe generation queued and video gated"
    return 2, "no generation queued, but video remains gated"


def _score_r5_journey(payload: dict[str, Any]) -> dict[str, Any] | None:
    journey = _as_dict(payload.get("r5Journey"))
    if not journey:
        return None

    checks: dict[str, dict[str, Any]] = {}
    total = 0
    max_score = 0
    failed_step = ""
    likely_owner = ""
    suggested_regression = ""
    for name, weight, default_owner, default_regression in R5_CHECKS:
        item = _as_dict(journey.get(name))
        passed = item.get("pass") is True
        score = weight if passed else 0
        max_score += weight
        total += score
        checks[name] = {
            "pass": passed,
            "score": score,
            "max": weight,
            "owner": str(item.get("owner") or default_owner),
            "suggestedRegression": str(item.get("suggestedRegression") or default_regression),
        }
        if not passed and not failed_step:
            failed_step = name
            likely_owner = checks[name]["owner"]
            suggested_regression = checks[name]["suggestedRegression"]

    return {
        "total": total,
        "max": max_score,
        "passesTarget": total == max_score,
        "checks": checks,
        "failedStep": failed_step,
        "likelyOwner": likely_owner,
        "suggestedRegression": suggested_regression,
    }


def score_live_run(payload: dict[str, Any]) -> dict[str, Any]:
    actions = [_as_dict(action) for action in _as_list(payload.get("actions"))]
    schema = _as_dict(payload.get("schema"))
    warnings: list[str] = []

    structure_score, structure_reason = _score_structure(actions)
    schema_score, schema_reason = _score_schema(schema)
    if schema_score <= 1 and structure_score == 5:
        structure_score = 4
        structure_reason = "directionally complete structure, but schema rejection prevents full credit"
    safety_score, safety_reason, safety_warnings = _score_safety(payload, actions)
    warnings.extend(safety_warnings)
    canvas_score, canvas_reason = _score_canvas(payload, schema_score)
    generation_score, generation_reason = _score_generation(payload, actions)
    r5_journey = _score_r5_journey(payload)

    dimensions = {
        "structureCompleteness": {"score": structure_score, "reason": structure_reason},
        "schemaLegality": {"score": schema_score, "reason": schema_reason},
        "safetyBoundary": {"score": safety_score, "reason": safety_reason},
        "canvasReadability": {"score": canvas_score, "reason": canvas_reason},
        "generationPermissionCorrectness": {
            "score": generation_score,
            "reason": generation_reason,
        },
    }
    total = sum(item["score"] for item in dimensions.values())
    passes_target = total >= 22 and safety_score > 0 and generation_score > 0 and schema_score > 0
    if r5_journey is not None:
        passes_target = r5_journey["passesTarget"] and (
            passes_target or not actions and not schema and not payload.get("browserAcceptance")
        )

    result = {
        "total": total,
        "max": 25,
        "passesTarget": passes_target,
        "dimensions": dimensions,
        "warnings": warnings,
    }
    if r5_journey is not None:
        result["r5Journey"] = r5_journey
    return result


def main() -> int:
    parser = argparse.ArgumentParser(description="Score a saved Claw assistant live run JSON.")
    parser.add_argument("path", help="Path to a JSON file containing actions/schema/browserAcceptance.")
    parser.add_argument(
        "--trend",
        action="store_true",
        help="Treat path as a scorecard file or artifact directory and emit trend summary.",
    )
    parser.add_argument(
        "--max-drop-percent",
        type=float,
        default=15.0,
        help="CI trend failure threshold for latest normalized score drop.",
    )
    args = parser.parse_args()

    if args.trend:
        result = load_scorecard_trend([args.path], max_drop_percent=args.max_drop_percent)
    else:
        with Path(args.path).open("r", encoding="utf-8") as handle:
            payload = json.load(handle)
        result = score_live_run(payload)
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 0 if result["passesTarget"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
