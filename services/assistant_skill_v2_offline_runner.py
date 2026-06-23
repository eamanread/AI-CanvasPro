import json
import os

from services.claw_skill_registry_service import ClawSkillRegistryService


def _read_json(path):
    try:
        with open(path, "r", encoding="utf-8-sig") as file:
            value = json.load(file)
        return value if isinstance(value, list) else []
    except Exception:
        return []


def _read_json_object(path):
    try:
        with open(path, "r", encoding="utf-8-sig") as file:
            value = json.load(file)
        return value if isinstance(value, dict) else {}
    except Exception:
        return {}


def _skill_constraint_cases(root, skill_id):
    directory = os.path.join(root, skill_id)
    skill_def = _read_json_object(os.path.join(directory, "skill.json"))
    allowed = {str(a).strip() for a in skill_def.get("allowedActions") or [] if str(a).strip()}
    forbidden = {str(a).strip() for a in skill_def.get("forbiddenActions") or [] if str(a).strip()}
    cases = []

    quality_rules = skill_def.get("qualityRules")
    has_quality_rules = bool(quality_rules) and isinstance(quality_rules, (list, dict))
    cases.append(
        {
            "id": f"{skill_id}_quality_rules",
            "skill": skill_id,
            "input": "",
            "expectedSkill": skill_id,
            "matchedSkills": [],
            "status": "passed" if has_quality_rules else "failed",
            "message": "" if has_quality_rules else f"{skill_id}: qualityRules missing or empty",
        }
    )

    quality_checks = [
        check for check in (skill_def.get("qualityChecks") or [])
        if isinstance(check, dict) and str(check.get("type") or "").strip()
    ]

    examples = _read_json(os.path.join(directory, "examples.json"))
    for index, example in enumerate(examples):
        if not isinstance(example, dict):
            continue
        errors = []
        example_actions = [str(a or "").strip() for a in (example.get("actions") or []) if str(a or "").strip()]
        for check in quality_checks:
            check_type = str(check.get("type") or "").strip()
            check_action = str(check.get("action") or "").strip()
            if check_type == "requiresActionType" and check_action and check_action not in example_actions:
                errors.append(f"{skill_id}: qualityChecks requiresActionType {check_action} not satisfied by example")
            elif check_type == "forbidsActionType" and check_action and check_action in example_actions:
                errors.append(f"{skill_id}: qualityChecks forbidsActionType {check_action} violated by example")
            elif check_type == "maxActions":
                try:
                    limit = int(check.get("value"))
                except (TypeError, ValueError):
                    continue
                if len(example_actions) > limit:
                    errors.append(f"{skill_id}: qualityChecks maxActions {limit} exceeded ({len(example_actions)})")
        for action_type in example.get("actions") or []:
            text_type = str(action_type or "").strip()
            if not text_type:
                continue
            if text_type in forbidden:
                errors.append(f"{skill_id}: example action {text_type} listed in forbiddenActions")
            elif allowed and text_type not in allowed:
                errors.append(f"{skill_id}: example action {text_type} outside allowedActions")
        cases.append(
            {
                "id": f"{skill_id}_example_{index + 1}",
                "skill": skill_id,
                "input": str(example.get("input") or ""),
                "expectedSkill": skill_id,
                "matchedSkills": [],
                "status": "passed" if not errors else "failed",
                "message": "; ".join(errors),
            }
        )
    return cases


def _case_id(skill_id, index, case):
    text = str(case.get("id") or "").strip() if isinstance(case, dict) else ""
    return text or f"{skill_id}_{index + 1}"


def _expected_skill(case, fallback):
    if not isinstance(case, dict):
        return str(fallback or "").strip()
    return str(case.get("expectSkill") or case.get("mustUseSkill") or case.get("expectedSkill") or fallback or "").strip()


def _input_text(case):
    return str(case.get("input") or case.get("message") or "").strip() if isinstance(case, dict) else ""


def _test_files(skill_root):
    root = os.path.abspath(skill_root or ClawSkillRegistryService.default_v2_skill_dir())
    if not os.path.isdir(root):
        return root, []
    files = []
    for name in sorted(os.listdir(root)):
        directory = os.path.join(root, name)
        if not os.path.isdir(directory):
            continue
        path = os.path.join(directory, "tests.json")
        if os.path.exists(path):
            files.append((name, path))
    return root, files


def run_v2_skill_offline_tests(*, skill_root=None, max_items=3):
    root, files = _test_files(skill_root)
    registry = ClawSkillRegistryService(skill_dir=root, v2_skill_dir=root)
    cases = []

    for skill_id, path in files:
        cases.extend(_skill_constraint_cases(root, skill_id))
        for index, case in enumerate(_read_json(path)):
            if not isinstance(case, dict):
                continue
            input_text = _input_text(case)
            expected = _expected_skill(case, skill_id)
            result = registry.match(input_text, {}, max_items=max_items)
            matched = [
                str(item.get("id") or "").strip()
                for item in result.get("items", [])
                if isinstance(item, dict)
            ]
            passed = bool(expected and expected in matched)
            cases.append(
                {
                    "id": _case_id(skill_id, index, case),
                    "skill": skill_id,
                    "input": input_text,
                    "expectedSkill": expected,
                    "matchedSkills": matched,
                    "status": "passed" if passed else "failed",
                    "message": ""
                    if passed
                    else f"expected {expected or '<missing>'} in matched skills {matched}",
                }
            )

    failed = [case for case in cases if case["status"] != "passed"]
    return {
        "success": not failed,
        "root": root,
        "total": len(cases),
        "passed": len(cases) - len(failed),
        "failed": len(failed),
        "cases": cases,
    }
