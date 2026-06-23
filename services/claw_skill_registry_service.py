import json
import os


SAFE_SKILL_FIELDS = (
    "id",
    "name",
    "version",
    "type",
    "allowedActions",
    "forbiddenActions",
    "requiredContext",
    "qualityRules",
    "qualityRubric",
    "decisionGuide",
    "antiPatterns",
    "examples",
    "riskLevel",
    "requiresConfirmation",
)


class ClawSkillRegistryService:
    DEFAULT_MAX_ITEMS = 3
    REQUIRED_FIELDS = ("id", "name", "enabled", "priority", "triggers", "body", "compactBody")
    V2_REQUIRED_FIELDS = ("id", "name", "enabled", "priority", "triggers")

    def __init__(self, *, skill_dir=None, v2_skill_dir=None):
        self._skill_dir = skill_dir or self.default_skill_dir()
        self._v2_skill_dir = (
            v2_skill_dir
            if v2_skill_dir is not None
            else (self.default_v2_skill_dir() if skill_dir is None else None)
        )
        self._warnings = []

    @classmethod
    def default_skill_dir(cls):
        return os.path.abspath(
            os.path.join(os.path.dirname(__file__), "..", "config", "assistant-skills")
        )

    @classmethod
    def default_v2_skill_dir(cls):
        return os.path.abspath(
            os.path.join(os.path.dirname(__file__), "..", "config", "assistant-skills-v2")
        )

    def warnings(self):
        return list(self._warnings)

    def _warn(self, message):
        self._warnings.append(str(message or ""))

    def _read_json_file(self, path, *, label):
        try:
            with open(path, "r", encoding="utf-8-sig") as file:
                return json.load(file)
        except Exception as exc:
            self._warn(f"failed to load {label} {os.path.basename(path)}: {exc}")
            return None

    @staticmethod
    def _migrate_legacy_fields(skill):
        next_skill = dict(skill)
        if "qualityRules" not in next_skill and "qualityRubric" in next_skill:
            next_skill["qualityRules"] = next_skill["qualityRubric"]
        return next_skill

    def _read_skill_file(self, path):
        data = self._read_json_file(path, label="skill")
        if data is None:
            return None
        if not isinstance(data, dict):
            self._warn(f"ignored non-object skill {os.path.basename(path)}")
            return None
        missing = [field for field in self.REQUIRED_FIELDS if field not in data]
        if missing:
            self._warn(f"ignored invalid skill {os.path.basename(path)}: missing {', '.join(missing)}")
            return None
        if not data.get("enabled"):
            return None
        return self._migrate_legacy_fields(data)

    def _read_v2_skill_directory(self, directory):
        skill_json = os.path.join(directory, "skill.json")
        data = self._read_json_file(skill_json, label="v2 skill")
        if data is None:
            return None
        if not isinstance(data, dict):
            self._warn(f"ignored non-object v2 skill {os.path.basename(directory)}")
            return None
        missing = [field for field in self.V2_REQUIRED_FIELDS if field not in data]
        if missing:
            self._warn(f"ignored invalid v2 skill {os.path.basename(directory)}: missing {', '.join(missing)}")
            return None
        if not data.get("enabled"):
            return None
        skill = self._migrate_legacy_fields(data)
        instructions_path = os.path.join(directory, "instructions.md")
        if os.path.exists(instructions_path):
            try:
                with open(instructions_path, "r", encoding="utf-8-sig") as file:
                    instructions = file.read().strip()
            except Exception as exc:
                self._warn(f"failed to load v2 instructions {os.path.basename(directory)}: {exc}")
                instructions = ""
            skill["body"] = instructions
            skill["compactBody"] = instructions
        else:
            skill.setdefault("body", "")
            skill.setdefault("compactBody", skill.get("body") or "")
        examples_path = os.path.join(directory, "examples.json")
        if os.path.exists(examples_path):
            examples = self._read_json_file(examples_path, label="v2 examples")
            if examples is not None:
                skill["examples"] = examples
        return skill

    def load_skills(self):
        self._warnings = []
        skills_by_id = {}
        if not os.path.isdir(self._skill_dir):
            self._warn(f"skill directory not found: {self._skill_dir}")
        else:
            for name in sorted(os.listdir(self._skill_dir)):
                if not name.lower().endswith(".json"):
                    continue
                skill = self._read_skill_file(os.path.join(self._skill_dir, name))
                if skill is not None:
                    skills_by_id[str(skill.get("id") or "")] = skill
        if self._v2_skill_dir and os.path.isdir(self._v2_skill_dir):
            for name in sorted(os.listdir(self._v2_skill_dir)):
                directory = os.path.join(self._v2_skill_dir, name)
                if not os.path.isdir(directory):
                    continue
                skill = self._read_v2_skill_directory(directory)
                if skill is not None:
                    skills_by_id[str(skill.get("id") or "")] = skill
        skills = [skill for skill_id, skill in skills_by_id.items() if skill_id]
        skills.sort(key=lambda item: (-int(item.get("priority") or 0), str(item.get("id") or "")))
        return skills

    @staticmethod
    def _trigger_matches_text(trigger, text):
        # Mirrors triggerMatchesText in integrations/pi_canvas_agent/src/piClient.ts/js.
        normalized = str(trigger or "").casefold().strip()
        if not normalized:
            return False
        if normalized in text:
            return True
        stopwords = {"this", "that", "the", "a", "an", "my", "your", "for", "to", "of"}
        words = [word for word in normalized.split() if word and word not in stopwords]
        if len(words) > 1 and all(word in text for word in words):
            return True
        has_cjk = any("一" <= ch <= "鿿" for ch in normalized)
        if has_cjk and len(normalized) >= 4:
            half = (len(normalized) + 1) // 2
            head, tail = normalized[:half], normalized[half:]
            if head and tail and head in text and tail in text:
                return True
        return False

    @classmethod
    def _matches(cls, skill, message, context):
        inject_mode = str(skill.get("injectMode") or "when_matched")
        if inject_mode == "always":
            return True
        text = str(message or "").casefold()
        for trigger in skill.get("triggers") or []:
            if cls._trigger_matches_text(trigger, text):
                return True
        context_text = json.dumps(context or {}, ensure_ascii=False).casefold()
        for trigger in skill.get("contextTriggers") or []:
            if str(trigger or "").casefold() in context_text:
                return True
        return False

    @staticmethod
    def _serialize_skill(skill, *, compact=False):
        serialized = {}
        for field in SAFE_SKILL_FIELDS:
            if field in skill:
                serialized[field] = skill[field]
        serialized["instructions"] = str(
            skill.get("compactBody") if compact else skill.get("body") or ""
        )
        return serialized

    def match(self, message, context=None, *, compact=False, max_items=None):
        limit = self.DEFAULT_MAX_ITEMS if max_items is None else max(0, int(max_items))
        items = []
        for skill in self.load_skills():
            if not self._matches(skill, message, context or {}):
                continue
            items.append(self._serialize_skill(skill, compact=compact))
            if len(items) >= limit:
                break
        return {
            "applied": bool(items),
            "items": items,
        }
