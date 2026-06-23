# Assistant Skill Registry Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Huanying assistant skill registry that injects capability-oriented domain skills into the Claw prompt so the assistant knows how to judge and perform canvas work, not only which actions are forbidden.

**Architecture:** Add a backend-only registry that loads JSON skills from `config/assistant-skills/`, matches them against the current user message and context, and injects selected skills as `assistantSkills` in the existing Claw prompt payload. The registry is advisory only: all actions still pass through `claw_action_schema`, preview/executor, undo/history, and existing confirmation rules.

**Tech Stack:** Python standard library, existing `ClawBridgeService`, existing `unittest` test style, JSON skill configuration.

---

## Reference Standard

Use public skill writing patterns as inspiration, but do not copy their text. The important pattern is: define judgment, context, decision order, quality gates, anti-patterns, and examples before listing constraints.

- `canvas-design`: use design philosophy, space, form, and composition to define good visual work.
- `impeccable`: read product/design context before producing work.
- `frontend-design` and product frontend skills: establish purpose, user fit, tone, constraints, hierarchy, and quality gates before output.

For Huanying, this means every built-in skill must include:

- user satisfaction criteria
- required context
- decision guide
- quality rubric
- anti-patterns
- allowed and forbidden actions
- compact body for prompt length pressure

## File Structure

- Create: `services/claw_skill_registry_service.py`
  - Loads and validates skill JSON files.
  - Matches skills by triggers and optional context hints.
  - Serializes selected skills for prompt injection.
  - Falls back safely when files are missing or invalid.

- Create: `claw_skill_registry_service_test.py`
  - Unit tests for loading, validation, matching, ordering, compact output, and prompt-safe serialization.

- Modify: `services/claw_bridge_service.py`
  - Accepts an optional skill registry in `__init__`.
  - Injects `assistantSkills` into `_build_prompt_payload()`.
  - Preserves compact skills in `_build_prompt_argument()` compaction paths.

- Modify: `claw_bridge_service_test.py`
  - Tests normal skill injection.
  - Tests compact prompt injection.
  - Tests unmatched messages do not inject unrelated skills.

- Create: `config/assistant-skills/canvas_layout.json`
  - Teaches high-quality canvas organization.

- Create: `config/assistant-skills/storyboard_director.json`
  - Teaches shot planning and storyboard structure.

- Create: `config/assistant-skills/variant_branches.json`
  - Teaches creative variant branch design.

- Create: `config/assistant-skills/workflow_template.json`
  - Teaches workflow/template extraction boundaries.

- Modify: `docs/CLAW_CODE_ASSISTANT_IMPLEMENTATION_HANDOFF.md`
  - Add current progress, test commands, and "user owns 8777 service start/restart" reminder.

- Modify: `docs/CLAW_CODE_ASSISTANT_WOW_FEATURE_ROADMAP.md`
  - Mark Skill Registry implementation progress and explain how it supports phase 2+ work.

---

### Task 1: Registry Service Tests

**Files:**
- Create: `claw_skill_registry_service_test.py`

- [ ] **Step 1: Write loading and matching tests**

Create tests that build a temporary `assistant-skills` directory with JSON files and assert:

```python
def test_loads_enabled_skills_and_ignores_disabled(self):
    registry = ClawSkillRegistryService(skill_dir=temp_dir)
    skills = registry.load_skills()
    self.assertEqual([skill["id"] for skill in skills], ["canvas_layout"])
```

```python
def test_match_selects_canvas_layout_by_trigger(self):
    registry = ClawSkillRegistryService(skill_dir=temp_dir)
    result = registry.match("帮我整理画布", {"canvas": {"nodeCount": 3}})
    self.assertEqual(result["items"][0]["id"], "canvas_layout")
```

```python
def test_match_orders_by_priority_and_limits_count(self):
    result = registry.match("整理画布并拆分镜做变体", {}, max_items=2)
    self.assertEqual(len(result["items"]), 2)
    self.assertEqual(result["items"][0]["id"], "canvas_layout")
```

- [ ] **Step 2: Run tests and verify RED**

Run:

```bash
python -m unittest claw_skill_registry_service_test.py
```

Expected: fail because `services.claw_skill_registry_service` does not exist.

- [ ] **Step 3: Add compact and safety tests**

Add tests asserting:

```python
self.assertIn("qualityRubric", result["items"][0])
self.assertIn("decisionGuide", result["items"][0])
self.assertIn("antiPatterns", result["items"][0])
self.assertNotIn("apiKey", json.dumps(result, ensure_ascii=False))
```

And compact mode:

```python
result = registry.match("帮我整理画布", {}, compact=True)
self.assertEqual(result["items"][0]["instructions"], "compact canvas rules")
```

### Task 2: Registry Service Implementation

**Files:**
- Create: `services/claw_skill_registry_service.py`

- [ ] **Step 1: Implement minimal service**

Implement:

```python
class ClawSkillRegistryService:
    DEFAULT_MAX_ITEMS = 3

    def __init__(self, *, skill_dir=None):
        self._skill_dir = skill_dir or self.default_skill_dir()

    @classmethod
    def default_skill_dir(cls):
        return os.path.abspath(
            os.path.join(os.path.dirname(__file__), "..", "config", "assistant-skills")
        )
```

Required public methods:

```python
def load_skills(self):
    ...

def match(self, message, context=None, *, compact=False, max_items=None):
    ...
```

- [ ] **Step 2: Validation behavior**

Validation must:

- accept only JSON object skill files
- require `id`, `name`, `enabled`, `priority`, `triggers`, `body`, `compactBody`
- ignore disabled skills
- ignore invalid files without raising
- sort by `priority` descending, then `id`
- preserve `allowedActions`, `forbiddenActions`, `requiredContext`, `qualityRubric`, `decisionGuide`, `antiPatterns`, `examples`

- [ ] **Step 3: Run registry tests**

Run:

```bash
python -m unittest claw_skill_registry_service_test.py
```

Expected: all registry tests pass.

### Task 3: Built-in Skill JSON Files

**Files:**
- Create: `config/assistant-skills/canvas_layout.json`
- Create: `config/assistant-skills/storyboard_director.json`
- Create: `config/assistant-skills/variant_branches.json`
- Create: `config/assistant-skills/workflow_template.json`

- [ ] **Step 1: Write `canvas_layout.json`**

The skill body must teach the assistant:

- organize by user focus first: selected nodes, then layout hints, then diagnostics, then visible nodes
- infer semantic lanes from node type, title, metadata, edges, and generation state
- prefer left-to-right flow for generation chains
- use storyboard grid for shots
- keep assets, prompts, generated outputs, failed/problem nodes visually separate
- preserve user-created content and never generate/delete while only arranging

- [ ] **Step 2: Write `storyboard_director.json`**

The skill body must teach:

- convert script/idea into 3-8 shots
- each shot needs title, visual, camera, style, prompt, continuity
- video nodes may be prepared but video generation needs authorization
- layout follows shot index

- [ ] **Step 3: Write `variant_branches.json`**

The skill body must teach:

- create 3-5 meaningful creative directions
- each branch states the creative difference, risk, and source nodes
- prepare branches only; do not auto-generate

- [ ] **Step 4: Write `workflow_template.json`**

The skill body must teach:

- extract inputs, processing steps, outputs, reusable parameters
- template creation is high risk and requires confirmation
- first version is project scope only

### Task 4: Bridge Injection Tests

**Files:**
- Modify: `claw_bridge_service_test.py`

- [ ] **Step 1: Write failing test for matching skill injection**

Add a test with a temporary registry containing `canvas_layout`. The runner parses the CLI prompt argument and asserts:

```python
self.assertTrue(prompt["assistantSkills"]["applied"])
self.assertEqual(prompt["assistantSkills"]["items"][0]["id"], "canvas_layout")
self.assertIn("用户满意标准", prompt["assistantSkills"]["items"][0]["instructions"])
self.assertIn("layout_nodes", prompt["assistantSkills"]["items"][0]["allowedActions"])
```

- [ ] **Step 2: Write failing test for unmatched message**

Assert message `"你好"` produces:

```python
self.assertFalse(prompt["assistantSkills"]["applied"])
self.assertEqual(prompt["assistantSkills"]["items"], [])
```

- [ ] **Step 3: Write failing compact test**

Set `ClawBridgeService.MAX_PROMPT_ARGUMENT_CHARS` low enough to force compaction and assert injected skill instructions use `compactBody`.

### Task 5: Bridge Integration

**Files:**
- Modify: `services/claw_bridge_service.py`

- [ ] **Step 1: Constructor injection**

Add:

```python
from services.claw_skill_registry_service import ClawSkillRegistryService
```

Update constructor:

```python
def __init__(self, *, runtime_service, command_runner=None, action_schema=None, skill_registry=None):
    self._skill_registry = skill_registry or ClawSkillRegistryService()
```

- [ ] **Step 2: Prompt payload injection**

Update `_build_prompt_payload()` to accept `skill_registry=None` and `compact_skills=False`, then add:

```python
"assistantSkills": skill_registry.match(
    payload.get("message"),
    context,
    compact=compact_skills,
) if skill_registry else {"applied": False, "items": []},
```

- [ ] **Step 3: Command path**

Make `_build_prompt_argument()` and `_build_command()` accept `skill_registry=None`; call them from `chat()` with `self._skill_registry`.

- [ ] **Step 4: Compaction path**

When `_build_prompt_argument()` retries with compact context or compact action protocol, pass `compact_skills=True` so large skill bodies become compact skill bodies.

### Task 6: Verification and Docs

**Files:**
- Modify: `docs/CLAW_CODE_ASSISTANT_IMPLEMENTATION_HANDOFF.md`
- Modify: `docs/CLAW_CODE_ASSISTANT_WOW_FEATURE_ROADMAP.md`

- [ ] **Step 1: Run focused tests**

Run:

```bash
python -m unittest claw_skill_registry_service_test.py claw_bridge_service_test.py
```

Expected: all tests pass.

- [ ] **Step 2: Run schema regression**

Run:

```bash
python -m unittest claw_action_schema_test.py claw_bridge_service_test.py
```

Expected: all tests pass.

- [ ] **Step 3: Update handoff**

Add:

- Skill Registry file list
- how skills are matched
- how skills are injected
- how compaction works
- what tests were run
- reminder: do not start/check/restart `8777`; user starts it manually and reports back

- [ ] **Step 4: Update roadmap**

Mark Skill Registry as in progress/completed according to verification, and state it improves phase 2 canvas layout, phase 3 workflow, phase 4 storyboard, and phase 5 variants by giving the assistant domain-specific judgment.

## Self-Review

- Spec coverage: covers registry loading, skill matching, injection, compaction, built-in domain skills, tests, and docs.
- Placeholder scan: no TBD/TODO placeholders.
- Safety boundary: registry only affects prompt guidance; action execution remains schema/executor governed.
- Service constraint: no step starts, checks, or restarts `8777`; live service validation waits for user restart.
