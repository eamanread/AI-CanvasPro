"""Validate Pi Canvas Agent offline streaming fixtures."""

from __future__ import annotations

from dataclasses import dataclass
import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
FIXTURES = ROOT / "docs" / "pi_canvas_agent_fixtures"
LIVE_FIXTURES = ROOT / "docs" / "assistant_live_cases"
STORY_STEPS = {
    "story_outline",
    "style_bible",
    "shot_script",
    "shot_keyframe",
    "shot_video",
}
GENERATION_ACTIONS = {"queue_generation_task", "run_prompt_preset_generation"}
VIRAL_LAB_REQUIRED_FIELDS = (
    "viralReferenceId",
    "viralSourceType",
    "viralHook",
    "viralPacing",
    "viralStructure",
    "viralRemakeAngle",
    "viralRisk",
)
KNOWLEDGE_CARD_REQUIRED_FIELDS = (
    "sourceTitle",
    "fileId",
    "projectId",
    "citation",
    "citationDisplay",
)
WORKFLOW_TEMPLATE_REQUIRED_FIELDS = (
    "templateId",
    "scope",
    "version",
    "author",
    "tags",
)
TEAM_WORKFLOW_TEMPLATE_REQUIRED_FIELDS = (
    "templateId",
    "scope",
    "teamId",
    "version",
)
TEAM_WORKFLOW_TEMPLATE_ACTIONS = {
    "submit_workflow_template_review",
    "review_workflow_template",
    "publish_workflow_template",
    "deprecate_workflow_template",
    "rollback_workflow_template",
    "record_workflow_template_reuse",
}
MULTI_AGENT_ALLOWED_ACTIONS = {
    "storyboard": {"create_node", "connect_nodes", "update_node_data", "rename_node"},
    "prompt": {"update_node_data", "rename_node", "create_node"},
    "layout": {"layout_nodes", "move_nodes", "create_group", "rename_node", "focus_nodes", "set_viewport"},
    "generation": {"queue_generation_task", "run_prompt_preset_generation"},
    "qa": set(),
}


@dataclass(frozen=True)
class RequiredFixture:
    fixture_id: str
    path: Path


REQUIRED_FIXTURES = (
    RequiredFixture("story_to_video", FIXTURES / "story_to_video_stream.ndjson"),
    RequiredFixture("text_to_image", FIXTURES / "text_to_image_stream.ndjson"),
    RequiredFixture("image_to_video", FIXTURES / "image_to_video_stream.ndjson"),
    RequiredFixture("text_to_image_video", FIXTURES / "text_to_image_video_stream.ndjson"),
    RequiredFixture("image_variants", FIXTURES / "image_variants_stream.ndjson"),
    RequiredFixture("storyboard_shot_edit", FIXTURES / "storyboard_shot_edit_stream.ndjson"),
    RequiredFixture("prompt_preset_generation", FIXTURES / "prompt_preset_generation_stream.ndjson"),
    RequiredFixture("viral_lab", FIXTURES / "viral_lab_stream.ndjson"),
    RequiredFixture("knowledge_card", FIXTURES / "knowledge_card_stream.ndjson"),
    RequiredFixture("workflow_template", FIXTURES / "workflow_template_stream.ndjson"),
    RequiredFixture("team_workflow_template", FIXTURES / "team_workflow_template_stream.ndjson"),
    RequiredFixture("multi_agent_story_workflow", FIXTURES / "multi_agent_story_workflow_stream.ndjson"),
    RequiredFixture("variant_branches", FIXTURES / "variant_branches_stream.ndjson"),
    RequiredFixture(
        "invalid_delta_actions_do_not_execute",
        LIVE_FIXTURES / "r5-invalid-delta-actions-do-not-execute.json",
    ),
    RequiredFixture("generation_permission_gate", LIVE_FIXTURES / "r5-generation-permission-gate.json"),
    RequiredFixture("history_restore_pending_actions", LIVE_FIXTURES / "r5-history-restore-pending-actions.json"),
    RequiredFixture(
        "r5_basic_create_connect_layout_focus",
        LIVE_FIXTURES / "r5-basic-create-connect-layout-focus.json",
    ),
)


def load_frames(path: Path) -> list[dict]:
    if path.suffix.lower() == ".json":
        return load_json_frames(path)

    frames: list[dict] = []
    for line in path.read_text(encoding="utf-8").splitlines():
        if line.strip():
            frame = json.loads(line)
            if not isinstance(frame, dict):
                raise AssertionError(f"{path}: frame must be an object")
            frames.append(frame)
    return frames


def load_json_frames(path: Path) -> list[dict]:
    payload = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(payload, dict):
        raise AssertionError(f"{path}: JSON fixture must be an object")
    if isinstance(payload.get("streamFrames"), list):
        return [
            frame
            for frame in payload["streamFrames"]
            if isinstance(frame, dict)
        ]
    actions = payload.get("actions")
    if isinstance(actions, list):
        return [
            {
                "type": "message.done",
                "reply": str(payload.get("reply") or payload.get("caseId") or path.stem),
                "actions": actions,
                "requiresConfirmation": bool(payload.get("requiresConfirmation")),
            }
        ]
    raise AssertionError(f"{path}: JSON fixture must contain streamFrames or actions")


def _action_type(action: dict) -> str:
    return str(action.get("type") or action.get("action") or action.get("actionType") or action.get("operation") or "").strip()


def _data(action: dict) -> dict:
    value = action.get("data")
    return value if isinstance(value, dict) else {}


def _metadata(action: dict) -> dict:
    data = _data(action)
    metadata = action.get("metadata") if isinstance(action.get("metadata"), dict) else {}
    data_metadata = data.get("metadata") if isinstance(data.get("metadata"), dict) else {}
    merged = dict(data_metadata)
    merged.update(data)
    merged.update(metadata)
    return merged


def _node_type(action: dict) -> str:
    data = _data(action)
    return str(action.get("nodeType") or action.get("node_type") or data.get("nodeType") or data.get("type") or "").strip()


def _workflow_step(action: dict) -> str:
    metadata = _metadata(action)
    return str(action.get("workflowStep") or metadata.get("workflowStep") or "").strip()


def _workflow_kind(action: dict) -> str:
    metadata = _metadata(action)
    return str(action.get("workflowKind") or metadata.get("workflowKind") or "").strip()


def _shot_index(action: dict) -> int | None:
    metadata = _metadata(action)
    raw = action.get("shotIndex", metadata.get("shotIndex"))
    try:
        return int(raw)
    except (TypeError, ValueError):
        return None


def _node_id(action: dict) -> str:
    return str(action.get("nodeId") or action.get("targetNodeId") or action.get("id") or "").strip()


def _requires_confirmation(action: dict) -> bool:
    metadata = _metadata(action)
    return action.get("requiresConfirmation") is True or metadata.get("requiresConfirmation") is True


def _variant_count(action: dict) -> int:
    variants = action.get("variants")
    if isinstance(variants, list) and variants:
        return len([item for item in variants if isinstance(item, dict)])
    raw = action.get("branchCount", action.get("count", 0))
    try:
        return int(raw)
    except (TypeError, ValueError):
        return 0


def _storyboard_edit_scope(action: dict) -> str:
    metadata = _metadata(action)
    return str(action.get("storyboardEditScope") or metadata.get("storyboardEditScope") or "").strip()


def _target_shot_index(action: dict) -> int | None:
    metadata = _metadata(action)
    raw = action.get("targetShotIndex", metadata.get("targetShotIndex"))
    try:
        return int(raw)
    except (TypeError, ValueError):
        return None


def _preset_id(action: dict) -> str:
    data = _data(action)
    return str(action.get("presetId") or action.get("preset") or data.get("presetId") or data.get("preset") or "").strip()


def _preset_name(action: dict) -> str:
    data = _data(action)
    return str(action.get("presetName") or data.get("presetName") or action.get("name") or action.get("title") or "").strip()


def _prompt_preset_actions(actions: list[dict]) -> list[dict]:
    return [
        action
        for action in actions
        if _action_type(action) == "run_prompt_preset_generation"
    ]


def _prompt_preset_template_leaks(actions: list[dict]) -> int:
    count = 0
    for action in _prompt_preset_actions(actions):
        data = _data(action)
        if action.get("template") or data.get("template"):
            count += 1
    return count


def _viral_lab_nodes(actions: list[dict]) -> list[dict]:
    return [
        action
        for action in actions
        if _action_type(action) == "create_node" and _workflow_kind(action) == "viral_lab"
    ]


def _knowledge_card_nodes(actions: list[dict]) -> list[dict]:
    return [
        action
        for action in actions
        if _action_type(action) == "create_node" and _workflow_kind(action) == "knowledge_card"
    ]


def _workflow_template_actions(actions: list[dict]) -> list[dict]:
    return [
        action
        for action in actions
        if _action_type(action) in {"create_workflow_template", "apply_workflow_template"} | TEAM_WORKFLOW_TEMPLATE_ACTIONS
    ]


def _viral_lab_missing_metadata_fields(nodes: list[dict]) -> list[str]:
    if not nodes:
        return []
    merged = {}
    for node in nodes:
        merged.update(_metadata(node))
    return [
        field
        for field in VIRAL_LAB_REQUIRED_FIELDS
        if not str(merged.get(field) or "").strip()
    ]


def _knowledge_card_missing_citation_fields(nodes: list[dict]) -> list[str]:
    if not nodes:
        return []
    missing: set[str] = set()
    for node in nodes:
        metadata = _metadata(node)
        for field in KNOWLEDGE_CARD_REQUIRED_FIELDS:
            if not str(metadata.get(field) or "").strip():
                missing.add(field)
    return sorted(missing)


def _workflow_template_missing_metadata_fields(actions: list[dict]) -> list[str]:
    create_actions = [
        action for action in actions if _action_type(action) == "create_workflow_template"
    ]
    if not create_actions:
        return []
    missing: set[str] = set()
    for action in create_actions:
        metadata = _metadata(action)
        for field in WORKFLOW_TEMPLATE_REQUIRED_FIELDS:
            value = action.get(field, metadata.get(field))
            if field == "tags":
                if not isinstance(value, list) or not value:
                    missing.add(field)
            elif not str(value or "").strip():
                missing.add(field)
    return sorted(missing)


def _team_workflow_template_actions(actions: list[dict]) -> list[dict]:
    return [
        action
        for action in actions
        if _action_type(action) in TEAM_WORKFLOW_TEMPLATE_ACTIONS
    ]


def _team_workflow_template_missing_audit_fields(actions: list[dict]) -> list[str]:
    if not actions:
        return []
    missing: set[str] = set()
    for action in actions:
        metadata = _metadata(action)
        for field in TEAM_WORKFLOW_TEMPLATE_REQUIRED_FIELDS:
            value = action.get(field, metadata.get(field))
            if not str(value or "").strip():
                missing.add(field)
        action_type = _action_type(action)
        if action_type == "review_workflow_template" and not str(
            action.get("reviewer") or action.get("reviewedBy") or metadata.get("reviewer") or metadata.get("reviewedBy") or ""
        ).strip():
            missing.add("reviewer")
        if action_type == "publish_workflow_template" and not str(
            action.get("reviewStatus") or metadata.get("reviewStatus") or ""
        ).strip():
            missing.add("reviewStatus")
        if action_type == "record_workflow_template_reuse" and not str(
            action.get("reuseCount") or metadata.get("reuseCount") or action.get("userId") or metadata.get("userId") or ""
        ).strip():
            missing.add("reuseCount")
        if action_type == "rollback_workflow_template" and not str(
            action.get("rollbackToVersion") or metadata.get("rollbackToVersion") or ""
        ).strip():
            missing.add("rollbackToVersion")
    return sorted(missing)


def _agent_role(action: dict) -> str:
    metadata = _metadata(action)
    return str(action.get("agentRole") or metadata.get("agentRole") or "").strip()


def _agent_permissions(action: dict) -> list[str]:
    metadata = _metadata(action)
    value = action.get("agentPermissions", metadata.get("agentPermissions"))
    if not isinstance(value, list):
        return []
    return [str(item).strip() for item in value if str(item or "").strip()]


def _multi_agent_permission_violations(actions: list[dict]) -> list[str]:
    violations = []
    for action in actions:
        role = _agent_role(action)
        if not role:
            continue
        action_type = _action_type(action)
        allowed = MULTI_AGENT_ALLOWED_ACTIONS.get(role)
        if allowed is None:
            violations.append(f"{role}:unknown-role")
            continue
        if action_type not in allowed:
            violations.append(f"{role}:{action_type}")
        declared_permissions = set(_agent_permissions(action))
        if declared_permissions and not declared_permissions.issubset(allowed):
            extra = sorted(declared_permissions - allowed)
            violations.append(f"{role}:extra-permissions:{','.join(extra)}")
        if role == "generation" and _node_type(action) == "ai-video" and not _requires_confirmation(action):
            violations.append("generation:unauthorized-video")
    return violations


def _contains_external_url(value) -> bool:
    if isinstance(value, dict):
        return any(_contains_external_url(item) for item in value.values())
    if isinstance(value, list):
        return any(_contains_external_url(item) for item in value)
    if isinstance(value, str):
        return "http://" in value.lower() or "https://" in value.lower()
    return False


def _contains_llm_wiki_write_intent(value) -> bool:
    if isinstance(value, dict):
        return any(_contains_llm_wiki_write_intent(item) for item in value.values())
    if isinstance(value, list):
        return any(_contains_llm_wiki_write_intent(item) for item in value)
    if isinstance(value, str):
        text = value.lower()
        return any(term in text for term in ("writeback", "write-back", "rescan", "deep research", "save to wiki"))
    return False


def _contains_team_template_write_intent(value) -> bool:
    if isinstance(value, dict):
        return any(_contains_team_template_write_intent(item) for item in value.values())
    if isinstance(value, list):
        return any(_contains_team_template_write_intent(item) for item in value)
    if isinstance(value, str):
        text = value.lower()
        return any(term in text for term in ("team library", "shared library", "write_file", "write file", "team_template"))
    return False


def _is_storyboard_shot_edit(action: dict) -> bool:
    if _action_type(action) not in {"update_node_data", "set_node_prompt", "rename_node"}:
        return False
    metadata = _metadata(action)
    return (
        _storyboard_edit_scope(action) == "single_shot"
        or _target_shot_index(action) is not None
        or _workflow_kind(action) == "story_to_video"
        or _shot_index(action) is not None
        or bool(metadata.get("storyboardId"))
    )


def _storyboard_shot_edit_actions(actions: list[dict]) -> list[dict]:
    return [action for action in actions if _is_storyboard_shot_edit(action)]


def _created_node_types(actions: list[dict]) -> dict[str, str]:
    result: dict[str, str] = {}
    for action in actions:
        if _action_type(action) != "create_node":
            continue
        node_id = _node_id(action)
        node_type = _node_type(action)
        if node_id and node_type:
            result[node_id] = node_type
    return result


def _story_nodes(actions: list[dict]) -> list[dict]:
    return [
        action
        for action in actions
        if _action_type(action) == "create_node"
        and (_workflow_kind(action) == "story_to_video" or _workflow_step(action) in STORY_STEPS)
    ]


def _workflow_nodes(actions: list[dict]) -> list[dict]:
    return [
        action
        for action in actions
        if _action_type(action) == "create_node" and _workflow_kind(action)
    ]


def _workflow_kind_summary(story_nodes: list[dict], workflow_nodes: list[dict]) -> str:
    if story_nodes:
        return "story_to_video"
    kinds = {
        _workflow_kind(action)
        for action in workflow_nodes
        if _workflow_kind(action)
    }
    if len(kinds) == 1:
        return next(iter(kinds))
    return ""


def _count_story_step(nodes: list[dict], step: str) -> int:
    return sum(1 for node in nodes if _workflow_step(node) == step)


def _shot_indexes(nodes: list[dict], step: str) -> set[int]:
    return {
        index
        for node in nodes
        if _workflow_step(node) == step
        for index in [_shot_index(node)]
        if index is not None
    }


def _unauthorized_video_generation_count(actions: list[dict], *, video_authorized: bool = False) -> int:
    if video_authorized:
        return 0
    node_types = _created_node_types(actions)
    count = 0
    for action in actions:
        if _action_type(action) not in GENERATION_ACTIONS:
            continue
        node_id = _node_id(action)
        node_type = _node_type(action) or node_types.get(node_id, "")
        if node_type == "ai-video" and not _requires_confirmation(action):
            count += 1
    return count


def _endpoint(action: dict, *keys: str) -> str:
    data = _data(action)
    for key in keys:
        value = action.get(key) or data.get(key)
        if value:
            return str(value).strip()
    return ""


def _workflow_connect_edges(actions: list[dict], workflow_nodes: list[dict]) -> int:
    node_ids = {_node_id(action) for action in workflow_nodes if _node_id(action)}
    if not node_ids:
        return 0
    count = 0
    for action in actions:
        if _action_type(action) != "connect_nodes":
            continue
        source = _endpoint(action, "from", "sourceId", "source")
        target = _endpoint(action, "to", "targetId", "target")
        if source in node_ids and target in node_ids:
            count += 1
    return count


def check_fixture(path: Path) -> dict:
    frames = load_frames(path)
    if not frames:
        raise AssertionError(f"{path}: fixture has no frames")
    if frames[0].get("type") != "message.start":
        raise AssertionError(f"{path}: first frame must be message.start")
    if frames[-1].get("type") != "message.done":
        raise AssertionError(f"{path}: last frame must be message.done")

    actions = frames[-1].get("actions")
    if not isinstance(actions, list):
        raise AssertionError(f"{path}: final actions must be a list")
    frame_text = json.dumps(frames, ensure_ascii=False)
    delta_action_frames = sum(
        1
        for frame in frames[:-1]
        if frame.get("type") == "message.delta" and isinstance(frame.get("actions"), list)
    )
    if delta_action_frames and actions:
        raise AssertionError(f"{path}: message.delta actions must be ignored and not mixed with final actions")
    story_nodes = _story_nodes(actions)
    workflow_nodes = _workflow_nodes(actions)
    layouts = sorted(
        {
            str(action.get("layout") or "").strip()
            for action in actions
            if _action_type(action) == "layout_nodes" and str(action.get("layout") or "").strip()
        }
    )
    script_shots = _shot_indexes(story_nodes, "shot_script")
    keyframe_shots = _shot_indexes(story_nodes, "shot_keyframe")
    video_shots = _shot_indexes(story_nodes, "shot_video")
    result = {
        "fixture": str(path.relative_to(ROOT)).replace("\\", "/"),
        "frames": len(frames),
        "actions": len(actions),
        "finalActions": len(actions),
        "deltaActionFrames": delta_action_frames,
        "deltaActionsIgnored": delta_action_frames > 0 and len(actions) == 0,
        "workflowKind": _workflow_kind_summary(story_nodes, workflow_nodes),
        "workflowCreateNodes": len(workflow_nodes),
        "workflowConnectEdges": _workflow_connect_edges(actions, workflow_nodes),
        "storyOutlineNodes": _count_story_step(story_nodes, "story_outline"),
        "styleBibleNodes": _count_story_step(story_nodes, "style_bible"),
        "shotScriptNodes": len(script_shots),
        "shotKeyframeNodes": len(keyframe_shots),
        "shotVideoPrepNodes": len(video_shots),
        "unauthorizedVideoGenerationActions": _unauthorized_video_generation_count(actions),
        "generationActions": sum(1 for action in actions if _action_type(action) in GENERATION_ACTIONS),
        "deleteActions": sum(1 for action in actions if _action_type(action).startswith("delete")),
        "handledConnections": sum(
            1
            for action in actions
            if _action_type(action) == "connect_nodes"
            and (action.get("sourceHandle") or action.get("targetHandle"))
        ),
        "variantBranchActions": sum(1 for action in actions if _action_type(action) == "duplicate_nodes"),
        "variantBranchCount": max(
            [_variant_count(action) for action in actions if _action_type(action) == "duplicate_nodes"] or [0]
        ),
        "layouts": layouts,
    }
    shot_edit_actions = _storyboard_shot_edit_actions(actions)
    target_shot_indexes = {
        index
        for action in shot_edit_actions
        for index in [_target_shot_index(action)]
        if index is not None
    }
    edited_shot_indexes = sorted(
        {
            index
            for action in shot_edit_actions
            for index in [_shot_index(action)]
            if index is not None
        }
    )
    scope_values = {
        _storyboard_edit_scope(action)
        for action in shot_edit_actions
        if _storyboard_edit_scope(action)
    }
    target_shot_index = next(iter(target_shot_indexes)) if len(target_shot_indexes) == 1 else None
    result.update(
        {
            "storyboardShotEditActions": len(shot_edit_actions),
            "storyboardShotEditScope": next(iter(scope_values)) if len(scope_values) == 1 else "",
            "storyboardTargetShotIndex": target_shot_index,
            "storyboardEditedShotIndexes": edited_shot_indexes,
            "storyboardNonTargetEditActions": sum(
                1
                for action in shot_edit_actions
                for shot_index in [_shot_index(action)]
                if target_shot_index is not None and shot_index is not None and shot_index != target_shot_index
            ),
        }
    )
    prompt_preset_actions = _prompt_preset_actions(actions)
    created_node_types = _created_node_types(actions)
    result.update(
        {
            "promptPresetGenerationActions": len(prompt_preset_actions),
            "promptPresetTextImageActions": sum(
                1
                for action in prompt_preset_actions
                if (_node_type(action) or created_node_types.get(_node_id(action), "")) in {"ai-text", "ai-image"}
            ),
            "promptPresetVideoActions": sum(
                1
                for action in prompt_preset_actions
                if (_node_type(action) or created_node_types.get(_node_id(action), "")) == "ai-video"
            ),
            "promptPresetActionsMissingIdOrName": sum(
                1
                for action in prompt_preset_actions
                if not (_preset_id(action) or _preset_name(action))
            ),
            "promptPresetTemplateLeaks": _prompt_preset_template_leaks(actions),
        }
    )
    viral_lab_nodes = _viral_lab_nodes(actions)
    viral_lab_node_ids = {_node_id(action) for action in viral_lab_nodes if _node_id(action)}
    result.update(
        {
            "viralLabCreateNodes": len(viral_lab_nodes),
            "viralLabMissingMetadataFields": _viral_lab_missing_metadata_fields(viral_lab_nodes),
            "viralLabReferenceAnalysisNodes": sum(
                1 for action in viral_lab_nodes if _workflow_step(action) == "reference_analysis"
            ),
            "viralLabRemakeWorkflowNodes": sum(
                1 for action in viral_lab_nodes if _workflow_step(action) != "reference_analysis"
            ),
            "viralLabTextImageGenerationActions": sum(
                1
                for action in actions
                if _action_type(action) in GENERATION_ACTIONS
                and _node_id(action) in viral_lab_node_ids
                and (_node_type(action) or created_node_types.get(_node_id(action), "")) in {"ai-text", "ai-image"}
            ),
            "viralLabVideoGenerationActions": sum(
                1
                for action in actions
                if _action_type(action) in GENERATION_ACTIONS
                and _node_id(action) in viral_lab_node_ids
                and (_node_type(action) or created_node_types.get(_node_id(action), "")) == "ai-video"
            ),
            "viralLabExternalUrlMentions": sum(1 for action in actions if _contains_external_url(action)),
        }
    )
    knowledge_card_nodes = _knowledge_card_nodes(actions)
    knowledge_card_node_ids = {_node_id(action) for action in knowledge_card_nodes if _node_id(action)}
    result.update(
        {
            "knowledgeCardCreateNodes": len(knowledge_card_nodes),
            "knowledgeCardMissingCitationFields": _knowledge_card_missing_citation_fields(knowledge_card_nodes),
            "knowledgeCardWriteActions": sum(
                1 for action in actions if _workflow_kind(action) == "knowledge_card" and _contains_llm_wiki_write_intent(action)
            ),
            "knowledgeCardGenerationActions": sum(
                1
                for action in actions
                if _action_type(action) in GENERATION_ACTIONS and _node_id(action) in knowledge_card_node_ids
            ),
            "knowledgeCardExternalUrlMentions": sum(
                1 for action in knowledge_card_nodes if _contains_external_url(action)
            ),
        }
    )
    workflow_template_actions = _workflow_template_actions(actions)
    team_workflow_template_actions = _team_workflow_template_actions(actions)
    result.update(
        {
            "workflowTemplateCreateActions": sum(
                1 for action in workflow_template_actions if _action_type(action) == "create_workflow_template"
            ),
            "workflowTemplateApplyActions": sum(
                1 for action in workflow_template_actions if _action_type(action) == "apply_workflow_template"
            ),
            "workflowTemplateMissingMetadataFields": _workflow_template_missing_metadata_fields(workflow_template_actions),
            "workflowTemplateGenerationActions": sum(
                1
                for action in actions
                if _action_type(action) in GENERATION_ACTIONS
                and (
                    _workflow_kind(action) == "workflow_template"
                    or bool(str(action.get("templateId") or _metadata(action).get("templateId") or "").strip())
                )
            ),
            "workflowTemplateDeleteActions": sum(
                1 for action in actions if _action_type(action).startswith("delete")
            ),
            "workflowTemplateTeamWriteActions": sum(
                1 for action in workflow_template_actions if _contains_team_template_write_intent(action)
            ),
            "workflowTemplateCreateRequiresConfirmation": any(
                _action_type(action) == "create_workflow_template" and _requires_confirmation(action)
                for action in workflow_template_actions
            ),
            "workflowTemplateApplyRequiresConfirmation": any(
                _action_type(action) == "apply_workflow_template" and _requires_confirmation(action)
                for action in workflow_template_actions
            ),
            "teamWorkflowTemplateReviewActions": sum(
                1 for action in team_workflow_template_actions if _action_type(action) == "review_workflow_template"
            ),
            "teamWorkflowTemplatePublishActions": sum(
                1 for action in team_workflow_template_actions if _action_type(action) == "publish_workflow_template"
            ),
            "teamWorkflowTemplateReuseActions": sum(
                1 for action in team_workflow_template_actions if _action_type(action) == "record_workflow_template_reuse"
            ),
            "teamWorkflowTemplateDeprecateActions": sum(
                1 for action in team_workflow_template_actions if _action_type(action) == "deprecate_workflow_template"
            ),
            "teamWorkflowTemplateRollbackActions": sum(
                1 for action in team_workflow_template_actions if _action_type(action) == "rollback_workflow_template"
            ),
            "teamWorkflowTemplateMissingAuditFields": _team_workflow_template_missing_audit_fields(team_workflow_template_actions),
            "teamWorkflowTemplateRequiresConfirmation": bool(team_workflow_template_actions)
            and all(_requires_confirmation(action) for action in team_workflow_template_actions),
        }
    )
    agent_roles = {
        _agent_role(action)
        for action in actions
        if _agent_role(action)
    }
    has_readonly_qa_handoff = "QA" in frame_text and "read-only" in frame_text
    if has_readonly_qa_handoff:
        agent_roles.add("qa")
    result.update(
        {
            "multiAgentWorkflow": bool(agent_roles),
            "multiAgentRoles": sorted(agent_roles),
            "multiAgentRoleCount": len(agent_roles),
            "multiAgentPermissionViolations": _multi_agent_permission_violations(actions),
            "multiAgentQaReadOnly": has_readonly_qa_handoff or ("qa" in agent_roles
            and all(
                _action_type(action) in MULTI_AGENT_ALLOWED_ACTIONS["qa"]
                for action in actions
                if _agent_role(action) == "qa"
            )),
        }
    )
    return result


def validate_required_fixture(fixture: RequiredFixture) -> dict:
    if not fixture.path.exists():
        raise AssertionError(f"Required fixture missing: {fixture.path}")
    result = check_fixture(fixture.path)
    if fixture.fixture_id == "story_to_video":
        if result["storyOutlineNodes"] != 1:
            raise AssertionError(f"{fixture.path}: expected exactly one story outline node")
        if result["styleBibleNodes"] != 1:
            raise AssertionError(f"{fixture.path}: expected exactly one style bible node")
        if not 3 <= result["shotScriptNodes"] <= 8:
            raise AssertionError(f"{fixture.path}: expected 3-8 shot script nodes")
        if result["shotKeyframeNodes"] != result["shotScriptNodes"]:
            raise AssertionError(f"{fixture.path}: every shot script needs one keyframe")
        if result["shotVideoPrepNodes"] != result["shotScriptNodes"]:
            raise AssertionError(f"{fixture.path}: every shot keyframe needs one video prep node")
        if result["unauthorizedVideoGenerationActions"]:
            raise AssertionError(f"{fixture.path}: video generation must not auto-run")
        if "storyboard_grid" not in result["layouts"]:
            raise AssertionError(f"{fixture.path}: story_to_video must request storyboard_grid layout")
    if fixture.fixture_id == "variant_branches":
        if result["variantBranchActions"] != 1:
            raise AssertionError(f"{fixture.path}: expected exactly one duplicate_nodes action")
        if not 3 <= result["variantBranchCount"] <= 5:
            raise AssertionError(f"{fixture.path}: expected 3-5 variant branches")
        if result["generationActions"]:
            raise AssertionError(f"{fixture.path}: variant branches must not queue generation")
        if result["deleteActions"]:
            raise AssertionError(f"{fixture.path}: variant branches must not delete source nodes")
    if fixture.fixture_id == "storyboard_shot_edit":
        if result["storyboardShotEditActions"] <= 0:
            raise AssertionError(f"{fixture.path}: expected shot edit actions")
        if result["storyboardShotEditScope"] != "single_shot":
            raise AssertionError(f"{fixture.path}: expected single_shot edit scope")
        if result["storyboardTargetShotIndex"] is None:
            raise AssertionError(f"{fixture.path}: expected targetShotIndex")
        if result["storyboardEditedShotIndexes"] != [result["storyboardTargetShotIndex"]]:
            raise AssertionError(f"{fixture.path}: must only edit the target shot")
        if result["storyboardNonTargetEditActions"]:
            raise AssertionError(f"{fixture.path}: must not edit unrelated shots")
        if result["generationActions"]:
            raise AssertionError(f"{fixture.path}: shot edits must not queue generation by default")
        if result["deleteActions"]:
            raise AssertionError(f"{fixture.path}: shot edits must not delete nodes")
    if fixture.fixture_id == "prompt_preset_generation":
        if result["promptPresetGenerationActions"] <= 0:
            raise AssertionError(f"{fixture.path}: expected prompt preset generation actions")
        if result["promptPresetTextImageActions"] != result["promptPresetGenerationActions"]:
            raise AssertionError(f"{fixture.path}: prompt preset fixture must use text/image presets only")
        if result["promptPresetVideoActions"]:
            raise AssertionError(f"{fixture.path}: video presets must not run automatically")
        if result["promptPresetActionsMissingIdOrName"]:
            raise AssertionError(f"{fixture.path}: preset actions must carry presetId or presetName")
        if result["promptPresetTemplateLeaks"]:
            raise AssertionError(f"{fixture.path}: preset actions must not expose template bodies")
        if result["unauthorizedVideoGenerationActions"]:
            raise AssertionError(f"{fixture.path}: video generation must not auto-run")
    if fixture.fixture_id == "viral_lab":
        if result["workflowKind"] != "viral_lab":
            raise AssertionError(f"{fixture.path}: expected workflowKind viral_lab")
        if result["viralLabCreateNodes"] < 4:
            raise AssertionError(f"{fixture.path}: expected a structured viral_lab remake workflow")
        if result["viralLabMissingMetadataFields"]:
            raise AssertionError(
                f"{fixture.path}: missing viral_lab metadata {result['viralLabMissingMetadataFields']}"
            )
        if result["viralLabReferenceAnalysisNodes"] != 1:
            raise AssertionError(f"{fixture.path}: expected exactly one reference analysis node")
        if result["viralLabRemakeWorkflowNodes"] < 3:
            raise AssertionError(f"{fixture.path}: expected remake workflow nodes")
        if result["viralLabTextImageGenerationActions"] <= 0:
            raise AssertionError(f"{fixture.path}: expected safe text/image generation actions")
        if result["viralLabVideoGenerationActions"]:
            raise AssertionError(f"{fixture.path}: video generation must not run automatically")
        if result["viralLabExternalUrlMentions"]:
            raise AssertionError(f"{fixture.path}: viral_lab fixtures must not rely on external URLs")
        if result["deleteActions"]:
            raise AssertionError(f"{fixture.path}: viral_lab must not delete source material")
        if result["unauthorizedVideoGenerationActions"]:
            raise AssertionError(f"{fixture.path}: video generation must not auto-run")
        if "branch_flow" not in result["layouts"]:
            raise AssertionError(f"{fixture.path}: viral_lab must request branch_flow layout")
    if fixture.fixture_id == "knowledge_card":
        if result["workflowKind"] != "knowledge_card":
            raise AssertionError(f"{fixture.path}: expected workflowKind knowledge_card")
        if result["knowledgeCardCreateNodes"] <= 0:
            raise AssertionError(f"{fixture.path}: expected cited knowledge cards")
        if result["knowledgeCardMissingCitationFields"]:
            raise AssertionError(
                f"{fixture.path}: missing knowledge_card citation metadata {result['knowledgeCardMissingCitationFields']}"
            )
        if result["knowledgeCardWriteActions"]:
            raise AssertionError(f"{fixture.path}: knowledge_card must not write/rescan/deep-research")
        if result["knowledgeCardGenerationActions"]:
            raise AssertionError(f"{fixture.path}: knowledge_card must not queue generation")
        if result["knowledgeCardExternalUrlMentions"]:
            raise AssertionError(f"{fixture.path}: knowledge_card must not cite external URLs")
        if result["deleteActions"]:
            raise AssertionError(f"{fixture.path}: knowledge_card must not delete nodes")
    if fixture.fixture_id == "workflow_template":
        if result["workflowTemplateCreateActions"] != 1:
            raise AssertionError(f"{fixture.path}: expected one workflow template create action")
        if result["workflowTemplateApplyActions"] != 1:
            raise AssertionError(f"{fixture.path}: expected one workflow template apply action")
        if result["workflowTemplateMissingMetadataFields"]:
            raise AssertionError(
                f"{fixture.path}: missing workflow template metadata {result['workflowTemplateMissingMetadataFields']}"
            )
        if result["workflowTemplateGenerationActions"]:
            raise AssertionError(f"{fixture.path}: workflow_template must not queue generation")
        if result["workflowTemplateDeleteActions"]:
            raise AssertionError(f"{fixture.path}: workflow_template must not delete nodes")
        if result["workflowTemplateTeamWriteActions"]:
            raise AssertionError(f"{fixture.path}: workflow_template must not write team libraries")
        if not result["workflowTemplateCreateRequiresConfirmation"]:
            raise AssertionError(f"{fixture.path}: create_workflow_template requires confirmation")
        if not result["workflowTemplateApplyRequiresConfirmation"]:
            raise AssertionError(f"{fixture.path}: apply_workflow_template requires confirmation")
    if fixture.fixture_id == "team_workflow_template":
        if result["teamWorkflowTemplatePublishActions"] != 1:
            raise AssertionError(f"{fixture.path}: expected one team template publish action")
        if result["teamWorkflowTemplateReviewActions"] != 1:
            raise AssertionError(f"{fixture.path}: expected one team template review action")
        if result["teamWorkflowTemplateReuseActions"] != 1:
            raise AssertionError(f"{fixture.path}: expected one team template reuse stat action")
        if result["teamWorkflowTemplateDeprecateActions"] != 1:
            raise AssertionError(f"{fixture.path}: expected one team template deprecate action")
        if result["teamWorkflowTemplateRollbackActions"] != 1:
            raise AssertionError(f"{fixture.path}: expected one team template rollback action")
        if result["teamWorkflowTemplateMissingAuditFields"]:
            raise AssertionError(
                f"{fixture.path}: missing team workflow template audit fields {result['teamWorkflowTemplateMissingAuditFields']}"
            )
        if result["workflowTemplateTeamWriteActions"]:
            raise AssertionError(f"{fixture.path}: team workflow template must not write files/shared libraries")
        if result["workflowTemplateGenerationActions"]:
            raise AssertionError(f"{fixture.path}: team workflow template must not queue generation")
        if result["workflowTemplateDeleteActions"]:
            raise AssertionError(f"{fixture.path}: team workflow template must not delete nodes")
        if not result["teamWorkflowTemplateRequiresConfirmation"]:
            raise AssertionError(f"{fixture.path}: team workflow template governance requires confirmation")
    if fixture.fixture_id == "multi_agent_story_workflow":
        if not result["multiAgentWorkflow"]:
            raise AssertionError(f"{fixture.path}: expected multi-agent workflow metadata")
        if result["multiAgentRoleCount"] < 5:
            raise AssertionError(f"{fixture.path}: expected storyboard, prompt, layout, generation, and QA roles")
        if result["multiAgentPermissionViolations"]:
            raise AssertionError(
                f"{fixture.path}: multi-agent permission violations {result['multiAgentPermissionViolations']}"
            )
        if not result["multiAgentQaReadOnly"]:
            raise AssertionError(f"{fixture.path}: QA agent must stay read-only")
        if result["unauthorizedVideoGenerationActions"]:
            raise AssertionError(f"{fixture.path}: video generation must not auto-run")
        if result["deleteActions"]:
            raise AssertionError(f"{fixture.path}: multi-agent workflow must not delete nodes")
    one_sentence_contracts = {
        "text_to_image": {"nodes": 2, "edges": 1, "generation": 1, "layout": "single_chain"},
        "image_to_video": {"nodes": 2, "edges": 1, "generation": 0, "layout": "single_chain"},
        "text_to_image_video": {"nodes": 3, "edges": 2, "generation": 1, "layout": "single_chain"},
        "image_variants": {"nodes": 4, "edges": 3, "generation": 3, "layout": "branch_flow"},
    }
    if fixture.fixture_id in one_sentence_contracts:
        contract = one_sentence_contracts[fixture.fixture_id]
        if result["workflowKind"] != fixture.fixture_id:
            raise AssertionError(f"{fixture.path}: expected workflowKind {fixture.fixture_id}")
        if result["workflowCreateNodes"] != contract["nodes"]:
            raise AssertionError(f"{fixture.path}: expected {contract['nodes']} workflow nodes")
        if result["workflowConnectEdges"] != contract["edges"]:
            raise AssertionError(f"{fixture.path}: expected {contract['edges']} workflow edges")
        if result["generationActions"] != contract["generation"]:
            raise AssertionError(f"{fixture.path}: expected {contract['generation']} text/image generation actions")
        if result["unauthorizedVideoGenerationActions"]:
            raise AssertionError(f"{fixture.path}: video generation must not auto-run")
        if contract["layout"] not in result["layouts"]:
            raise AssertionError(f"{fixture.path}: expected {contract['layout']} layout")
    return {"id": fixture.fixture_id, **result}


def main() -> int:
    paths = [fixture.path for fixture in REQUIRED_FIXTURES] + [
        path
        for path in sorted(FIXTURES.glob("*.ndjson"))
        if path not in {fixture.path for fixture in REQUIRED_FIXTURES}
    ]
    if not paths:
        raise AssertionError(f"No Pi Canvas Agent fixtures found in {FIXTURES}")
    required_results = [validate_required_fixture(fixture) for fixture in REQUIRED_FIXTURES]
    extra_results = [
        check_fixture(path)
        for path in paths
        if path not in {fixture.path for fixture in REQUIRED_FIXTURES}
    ]
    results = required_results + extra_results
    print(json.dumps({"success": True, "results": results}, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
