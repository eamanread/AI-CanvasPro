import json
import os
import sys
import threading


class VimaxBridgeService:
    """ViMax config + 拍法库 (skills) provider.

    Phase C / C5.2: the external venv runner bridge (which Popen-spawned
    integrations/vimax/huanying_runner.py for plan/render/portraits) was RETIRED
    after real-machine verification (C4.3) - the in-process native brain
    (NativeOrchestratorService) is now the SOLE runtime. This class survives ONLY
    as two things nothing else owns:
      - the grsai credential + skills-dir resolver shared by the broker and the
        native orchestrator (single source, H6);
      - the 拍法库 skills roster + usage counter behind /api/v2/vimax/skills.
    The Popen/venv/job-table machinery and the plan/render/portraits/status
    methods were removed; rollback = git revert the C5.2 commit.
    """

    def __init__(self, user_dir_getter=None, skills_dir_getter=None, credentials_getter=None):
        self._user_dir_getter = user_dir_getter or (lambda: os.path.join(os.getcwd(), "user"))
        self._skills_dir_getter = skills_dir_getter or self._default_skills_dir
        self._credentials_getter = credentials_getter or self._default_credentials
        self._lock = threading.Lock()

    # --- configuration helpers (shared by broker + native orchestrator) --------

    def _default_skills_dir(self):
        return os.path.join(self._user_dir_getter(), "skills")

    def _default_credentials(self):
        """Read the grsai chat credentials from user/config.json
        (single source, H6). Returns {} when unconfigured."""
        config_path = os.path.join(self._user_dir_getter(), "config.json")
        try:
            with open(config_path, "r", encoding="utf-8") as handle:
                config = json.load(handle)
        except (OSError, ValueError):
            return {}
        registry = config.get("modelRegistry") or {}
        providers = config.get("providers") or {}
        text_models = registry.get("text") or []
        for model in text_models:
            base = str(model.get("baseUrl") or "")
            if "grsai" not in base:
                continue
            api_key = model.get("apiKey") or (providers.get("grsai") or {}).get("apiKey") or ""
            if not api_key:
                continue
            base_url = base.split("/chat/completions")[0] if base else "https://grsai.dakka.com.cn/v1"
            return {"apiKey": api_key, "baseUrl": base_url, "chatModel": model.get("modelId") or "gemini-3.1-pro"}
        return {}

    # --- skills library (S3) ---------------------------------------------------

    def _load_skills_index(self):
        # The canonical roster parser lives in integrations/vimax
        # (stdlib-only - safe to import from Huanying's python too).
        import importlib

        vimax_pkg = os.path.join(
            os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
            "integrations", "vimax",
        )
        if vimax_pkg not in sys.path:
            sys.path.insert(0, vimax_pkg)
        return importlib.import_module("skills_index")

    def skills(self):
        skills_dir = self._skills_dir_getter()
        if not os.path.isdir(skills_dir):
            return {"success": True, "skills": [], "warning": "skills dir not found (run install / seed user/skills)"}
        try:
            si = self._load_skills_index()
            roster = si.load_roster(skills_dir)
        except Exception as error:  # noqa: BLE001
            return {"success": False, "skills": [], "error": f"skills index failed: {error}"}
        usage = self._read_usage()
        out = []
        for skill in roster:
            name = skill.get("name", "")
            cover = os.path.splitext(os.path.basename(skill.get("path", "")))[0] + ".webp"
            cover_path = os.path.join(skills_dir, cover)
            out.append({
                "name": name,
                # S3: summary from skill_description, never raw md (avoids
                # leaking the json block's auth_key urls).
                "summary": (skill.get("description") or "")[:200],
                "coverUrl": cover if os.path.isfile(cover_path) else "",
                "uses": (usage.get(name) or {}).get("uses", 0),
            })
        # Hot skills first (S4 usage), then name.
        out.sort(key=lambda s: (-int(s.get("uses", 0)), s["name"]))
        return {"success": True, "skills": out}

    # --- skill usage counting (S4; the bridge is the sole writer) --------------

    def _usage_path(self):
        return os.path.join(self._skills_dir_getter(), "usage.json")

    def _read_usage(self):
        try:
            with open(self._usage_path(), "r", encoding="utf-8") as handle:
                data = json.load(handle)
            return data if isinstance(data, dict) else {}
        except (OSError, ValueError):
            return {}

    def _record_skill_usage(self, skill_refs, now):
        refs = [str(r) for r in (skill_refs or []) if r]
        if not refs:
            return
        # Sole writer = this method, always under _lock (ThreadingTCPServer
        # = one thread per request; no cross-process writer). Corruption ->
        # rebuild from empty (counts are not critical data).
        with self._lock:
            usage = self._read_usage()
            for name in refs:
                entry = usage.get(name) if isinstance(usage.get(name), dict) else {}
                entry["uses"] = int(entry.get("uses", 0)) + 1
                entry["lastUsed"] = now
                usage[name] = entry
            try:
                os.makedirs(os.path.dirname(self._usage_path()), exist_ok=True)
                tmp = self._usage_path() + ".tmp"
                with open(tmp, "w", encoding="utf-8") as handle:
                    json.dump(usage, handle, ensure_ascii=False, indent=2)
                os.replace(tmp, self._usage_path())
            except OSError:
                pass
