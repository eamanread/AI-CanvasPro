# P0-P2 Completion Implementation Plan (Slices 241-248)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the audited P0-P2 gaps: skill runtime enforcement, success-metric instrumentation, Replay minimal closure, developer JSON panel, real-LLM E2E acceptance, real durations + structured targets, readonly DAG preview, history pagination, shared model-rule module, and no-count group references.

**Architecture:** Backend enforcement lives in `CanvasAgentActionSchema` (skills already on disk there); frontend carries `intent.matchedSkills` through the execution store so the orchestrator can send them to validate. Metrics are pure derivation over the existing execution store snapshot. Replay/regenerate reuse the orchestrator's existing executeActions/timeline machinery. All UI lands in the existing expanded-drawer detail area.

**Tech Stack:** Vanilla ES modules + `node --test`; Python stdlib + `unittest`; Playwright (`@playwright/test` chromium) for live acceptance against real 8777.

**Conventions (apply to every task):**
- TDD: write the failing test first, see it fail, implement, see it pass.
- Run JS tests with `node --test <file>`; Python with `python <test_file>.py`.
- Commit after each task with the message given in the task.
- PRD/handoff updates happen once, in Task 13 — do NOT edit the PRD in earlier tasks.
- `modules/app/appAssistantPanel.js` is ~6700 lines: always Grep for the stated anchor first, never read whole-file.

---

### Task 1: Backend skill constraint enforcement (P0-1a)

**Files:**
- Modify: `services/canvas_agent_action_schema.py` (method `validate_actions`, line ~33)
- Modify: `services/canvas_agent_route_service.py` (`_handle_actions_validate`, line ~226)
- Test: `canvas_agent_action_schema_test.py` (exists, append)

- [ ] **Step 1: Write the failing test**

Append to `canvas_agent_action_schema_test.py` (match the file's existing class/fixture style — read its first 40 lines first; the test below assumes a plain `CanvasAgentActionSchema()` constructor which the existing tests use):

```python
    def test_blocks_actions_forbidden_by_matched_skills(self):
        import json, os, tempfile
        schema = CanvasAgentActionSchema()
        with tempfile.TemporaryDirectory() as tmp:
            skill_dir = os.path.join(tmp, "canvas_layout")
            os.makedirs(skill_dir)
            with open(os.path.join(skill_dir, "skill.json"), "w", encoding="utf-8") as handle:
                json.dump({
                    "id": "canvas_layout",
                    "allowedActions": ["layout_nodes", "focus_nodes"],
                    "forbiddenActions": ["queue_generation_task"],
                }, handle)
            schema._skill_dir = tmp

            blocked = schema.validate_actions(
                [{"type": "queue_generation_task", "nodeId": "n1", "nodeType": "ai-image"}],
                matched_skills=["canvas_layout"],
            )
            self.assertFalse(blocked.get("valid", True))
            self.assertTrue(blocked.get("blockedBySkill"))
            self.assertTrue(any("queue_generation_task" in str(e) for e in blocked.get("errors", [])))

            outside_allowed = schema.validate_actions(
                [{"type": "create_node", "nodeType": "text"}],
                matched_skills=["canvas_layout"],
            )
            self.assertFalse(outside_allowed.get("valid", True))
            self.assertTrue(outside_allowed.get("blockedBySkill"))

            ok = schema.validate_actions(
                [{"type": "layout_nodes", "nodeIds": ["n1"]}],
                matched_skills=["canvas_layout"],
            )
            self.assertNotEqual(ok.get("blockedBySkill"), True)

            unknown_skill = schema.validate_actions(
                [{"type": "create_node", "nodeType": "text"}],
                matched_skills=["no_such_skill"],
            )
            self.assertNotEqual(unknown_skill.get("blockedBySkill"), True)
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python canvas_agent_action_schema_test.py`
Expected: FAIL/ERROR — `validate_actions() got an unexpected keyword argument 'matched_skills'`

- [ ] **Step 3: Implement enforcement in the schema service**

In `services/canvas_agent_action_schema.py`, change the signature and add the skill gate at the very top of `validate_actions` (before existing forbidden checks):

```python
    _SKILL_DIR = "config/assistant-skills-v2"

    def _skill_constraints_for(self, matched_skills):
        import json, os
        constraints = []
        skill_dir = getattr(self, "_skill_dir", self._SKILL_DIR)
        for skill_id in matched_skills or []:
            safe_id = str(skill_id or "").strip()
            if not safe_id or "/" in safe_id or "\\" in safe_id or ".." in safe_id:
                continue
            path = os.path.join(skill_dir, safe_id, "skill.json")
            try:
                with open(path, "r", encoding="utf-8") as handle:
                    data = json.load(handle)
            except (OSError, ValueError):
                continue
            if isinstance(data, dict):
                constraints.append({
                    "id": safe_id,
                    "allowed": [str(a) for a in data.get("allowedActions") or [] if str(a).strip()],
                    "forbidden": [str(a) for a in data.get("forbiddenActions") or [] if str(a).strip()],
                })
        return constraints

    def _skill_violations(self, actions, matched_skills):
        constraints = self._skill_constraints_for(matched_skills)
        if not constraints:
            return []
        allowed_union = set()
        forbidden = set()
        has_allowed = False
        for entry in constraints:
            if entry["allowed"]:
                has_allowed = True
                allowed_union.update(entry["allowed"])
            forbidden.update(entry["forbidden"])
        errors = []
        for index, action in enumerate(actions):
            if not isinstance(action, dict):
                continue
            action_type = str(action.get("type") or action.get("action") or "").strip()
            if not action_type:
                continue
            if action_type in forbidden:
                errors.append(f"action[{index}] {action_type} is forbidden by matched skill constraints")
            elif has_allowed and action_type not in allowed_union:
                errors.append(f"action[{index}] {action_type} is outside the allowedActions of matched skills")
        return errors
```

Signature change plus gate (`matched_skills` keyword added; gate inserted right after the `isinstance(actions, list)` check):

```python
    def validate_actions(self, actions, context=None, *, video_authorized=False, matched_skills=None):
        if not isinstance(actions, list):
            return self._invalid(["actions must be a list"])

        skill_errors = self._skill_violations(actions, matched_skills)
        if skill_errors:
            result = self._invalid(skill_errors)
            result["blockedBySkill"] = True
            return result
```

- [ ] **Step 4: Forward matchedSkills through the route**

In `services/canvas_agent_route_service.py` `_handle_actions_validate`, change the `validate_actions(...)` call:

```python
        return self._json_ok(
            self._action_schema.validate_actions(
                actions,
                context=data.get("context"),
                video_authorized=bool(data.get("videoAuthorized")),
                matched_skills=data.get("matchedSkills"),
            )
        )
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `python canvas_agent_action_schema_test.py && python canvas_agent_route_service_test.py`
Expected: both OK (route tests must not regress; the new kwarg has a default).

- [ ] **Step 6: Commit**

```bash
git add services/canvas_agent_action_schema.py services/canvas_agent_route_service.py canvas_agent_action_schema_test.py
git commit -m "feat: enforce matched-skill allowed/forbidden actions in validate route (slice 241)"
```

---

### Task 2: matchedSkills persistence + orchestrator blocked_by_skill (P0-1b)

**Files:**
- Modify: `modules/assistant/assistantExecutionStore.js` (`sanitizeExecution`, ~line 162)
- Modify: `services/canvas_agent_execution_service.py` (`_sanitize_execution`, ~line 152)
- Modify: `modules/app/appAssistantPanel.js` (`recordAssistantExecutionFromResponse`, anchor `intentId: safeTrim(execution.intentId || intent.id)`)
- Modify: `modules/assistant/assistantExecutionOrchestrator.js` (`run()` validate payload + validation-failure branch)
- Tests: `modules/assistant/assistantExecutionStore.test.js`, `modules/assistant/assistantExecutionOrchestrator.test.js`, `canvas_agent_execution_service_test.py`

- [ ] **Step 1: Write failing store tests (JS + Python)**

Append to `modules/assistant/assistantExecutionStore.test.js`:

```js
test("assistantExecutionStore: persists matchedSkills from the v2 intent", () => {
  const storage = memoryStorage();
  const store = createAssistantExecutionStore({ storage, projectId: "project-skills" });
  store.createExecution({
    id: "exec-skills",
    title: "Skill run",
    status: "draft",
    matchedSkills: ["canvas_layout", "", "asset_usage", 42],
  });
  assert.deepEqual(store.getExecution("exec-skills").matchedSkills, ["canvas_layout", "asset_usage", "42"]);
  const restored = createAssistantExecutionStore({ storage, projectId: "project-skills" });
  assert.deepEqual(restored.getExecution("exec-skills").matchedSkills, ["canvas_layout", "asset_usage", "42"]);
});
```

Append to `canvas_agent_execution_service_test.py`:

```python
    def test_persists_matched_skills(self):
        service = self._service()
        service.upsert_execution({
            "id": "exec-skills", "projectId": "project-a", "status": "draft",
            "matchedSkills": ["canvas_layout", "", "asset_usage"],
        })
        stored = service.get_execution("exec-skills")
        self.assertEqual(stored["matchedSkills"], ["canvas_layout", "asset_usage"])
```

- [ ] **Step 2: Run both, verify failures** (`matchedSkills` undefined / KeyError)

- [ ] **Step 3: Implement persistence**

`assistantExecutionStore.js` — inside the object returned by `sanitizeExecution`, after `planId`:

```js
    matchedSkills: safeArray(raw.matchedSkills).map(safeString).filter(Boolean),
```

`canvas_agent_execution_service.py` — inside `_sanitize_execution` return dict, after `"planId"`:

```python
            "matchedSkills": [str(s).strip() for s in cls._safe_list(value.get("matchedSkills")) if str(s).strip()],
```

`appAssistantPanel.js` `recordAssistantExecutionFromResponse` — after the `intentId:` line in the execution payload object:

```js
      matchedSkills: Array.isArray(intent.matchedSkills) ? intent.matchedSkills : [],
```

- [ ] **Step 4: Write failing orchestrator test**

Append to `modules/assistant/assistantExecutionOrchestrator.test.js` (uses the existing `createUndoStoreWithPlan` helper for unique event ids; add `matchedSkills` via a fresh store):

```js
test("assistantExecutionOrchestrator: skill-blocked validation writes blocked_by_skill and fails closed", async () => {
  let eventCounter = 0;
  const store = createAssistantExecutionStore({
    storage: memoryStorage(),
    projectId: "project-skill-block",
    clock: () => "2026-06-10T00:00:00.000Z",
    idFactory: (prefix) => `${prefix}-${(eventCounter += 1)}`,
  });
  store.createExecution({
    id: "exec-skill-block",
    title: "Blocked run",
    status: "draft",
    matchedSkills: ["canvas_layout"],
    drawerState: { visible: true, line1: "Blocked run", line2: "Waiting" },
    plan: { steps: [{ id: "s1", title: "Generate" }] },
    actionsByStep: { s1: [{ id: "a1", type: "queue_generation_task", nodeId: "n1", nodeType: "ai-image" }] },
  });
  const validatePayloads = [];
  const orchestrator = createAssistantExecutionOrchestrator({
    executionStore: store,
    validateActions: async (payload) => {
      validatePayloads.push(payload);
      return { valid: false, blockedBySkill: true, errors: ["action[0] queue_generation_task is forbidden by matched skill constraints"] };
    },
    executeActions: async () => {
      throw new Error("must not execute blocked action");
    },
  });

  const result = await orchestrator.run("exec-skill-block", { agentMode: "act" });

  assert.equal(result.status, "failed");
  assert.deepEqual(validatePayloads[0].matchedSkills, ["canvas_layout"]);
  const stored = store.getExecution("exec-skill-block");
  const blocked = stored.timeline.find((event) => event.status === "blocked_by_skill");
  assert.ok(blocked);
  assert.equal(blocked.canRetry, false);
  assert.match(blocked.humanSummary, /技能约束/);
});
```

- [ ] **Step 5: Run, verify failure** (no `matchedSkills` in payload; event status is `failed`)

- [ ] **Step 6: Implement orchestrator changes**

In `assistantExecutionOrchestrator.js` `run()`:
(a) add to the `validateActions({...})` payload: `matchedSkills: safeArray(execution.matchedSkills),`
(b) in the validation-failure branch (`validation?.valid === false || validation?.success === false`), replace the `appendTimeline(...)` event construction with:

```js
          const blockedBySkill = validation?.blockedBySkill === true;
          const failedEvent = await appendTimeline(id, {
            stepId: item.stepId,
            actionId: item.actionId,
            status: blockedBySkill ? "blocked_by_skill" : "failed",
            humanSummary: blockedBySkill
              ? `已被技能约束拦截：${actionLabel(item.action)}`
              : timelineSummary(item.action, "failed"),
            error: message,
            canRetry: !blockedBySkill,
            developer: { actionJson: item.action, validation },
          });
```

(the surrounding dependency/fail-closed flow is unchanged — blocked actions still mark the execution failed and never execute).

- [ ] **Step 7: Run JS + Python suites**

Run: `node --test modules/assistant/assistantExecutionStore.test.js modules/assistant/assistantExecutionOrchestrator.test.js modules/app/appAssistantPanel.test.js && python canvas_agent_execution_service_test.py`
Expected: all pass.

- [ ] **Step 8: Commit**

```bash
git add modules/assistant/assistantExecutionStore.js modules/assistant/assistantExecutionStore.test.js modules/assistant/assistantExecutionOrchestrator.js modules/assistant/assistantExecutionOrchestrator.test.js modules/app/appAssistantPanel.js services/canvas_agent_execution_service.py canvas_agent_execution_service_test.py
git commit -m "feat: carry matchedSkills through executions and fail closed on skill-blocked actions (slice 241)"
```

---

### Task 3: Offline runner deep assertions (P0-1c)

**Files:**
- Modify: `services/assistant_skill_v2_offline_runner.py`
- Test: `assistant_skill_v2_offline_runner_test.py` (exists, append)

Shape facts: each skill dir has `examples.json` = `[{"input": "...", "matchedSkill": "<id>", "actions": ["layout_nodes", ...]}]` and `skill.json` with `allowedActions`/`forbiddenActions`/`qualityRules`.

- [ ] **Step 1: Write the failing test**

Read `assistant_skill_v2_offline_runner_test.py` first to copy its fixture-building helper, then append a test that builds a temp skill whose `examples.json` references an action type listed in its own `forbiddenActions`, runs the runner, and asserts the case is reported failed with a message containing `forbiddenActions`. Also assert a consistent skill passes. Concrete skeleton (adapt fixture helper name to the file):

```python
    def test_examples_must_respect_allowed_and_forbidden_actions(self):
        # build temp skill dir: skill.json allowed=[layout_nodes] forbidden=[queue_generation_task]
        # examples.json: [{"input": "整理画布", "matchedSkill": "demo", "actions": ["queue_generation_task"]}]
        # tests.json: [{"input": "整理画布", "expectSkill": "demo"}]
        result = run_offline_tests(skill_dir=tmp_root)
        self.assertFalse(result["success"])
        self.assertTrue(any("forbiddenActions" in str(f) for f in result["failures"]))
```

- [ ] **Step 2: Run, verify it fails** (runner currently only checks skill hit; no `failures` about forbiddenActions)

- [ ] **Step 3: Implement** — in the runner's per-skill loop, after the existing hit checks, load `examples.json` and `skill.json` and add:

```python
        allowed = set(a for a in skill_def.get("allowedActions") or [])
        forbidden = set(a for a in skill_def.get("forbiddenActions") or [])
        for example in examples:
            for action_type in example.get("actions") or []:
                if action_type in forbidden:
                    failures.append(f"{skill_id}: example action {action_type} listed in forbiddenActions")
                elif allowed and action_type not in allowed:
                    failures.append(f"{skill_id}: example action {action_type} outside allowedActions")
        if not isinstance(skill_def.get("qualityRules"), (list, dict)) or not skill_def.get("qualityRules"):
            failures.append(f"{skill_id}: qualityRules missing or empty")
```

(fit names to the runner's actual structure — it already iterates skill dirs and aggregates results.)

- [ ] **Step 4: Run runner against real skills**

Run: `python assistant_skill_v2_offline_runner_test.py && python tools/run_assistant_skill_v2_offline_tests.py`
Expected: tests pass AND the 4 built-in skills pass the new assertions (if a built-in skill fails, fix its `examples.json`/`skill.json` data — that is the point of the check).

- [ ] **Step 5: Commit**

```bash
git add services/assistant_skill_v2_offline_runner.py assistant_skill_v2_offline_runner_test.py config/assistant-skills-v2/
git commit -m "feat: offline runner asserts examples respect skill action constraints (slice 241)"
```

---

### Task 4: Success metrics module (P0-2)

**Files:**
- Create: `modules/assistant/assistantExecutionMetrics.js`
- Create: `modules/assistant/assistantExecutionMetrics.test.js`
- Modify: `modules/app/appAssistantPanel.js` (debug snapshot object, anchor `modelOptions: filterSelectableTextModelOptions(`)

- [ ] **Step 1: Write the failing test** (`modules/assistant/assistantExecutionMetrics.test.js`)

```js
import assert from "node:assert/strict";
import test from "node:test";
import { computeExecutionMetrics } from "./assistantExecutionMetrics.js";

test("assistantExecutionMetrics: derives PRD success metrics from a store snapshot", () => {
  const metrics = computeExecutionMetrics({
    executions: [
      {
        id: "e1", status: "completed", agentMode: "act", matchedSkills: ["canvas_layout"],
        timeline: [
          { status: "completed", durationMs: 120 },
          { status: "completed", durationMs: 80 },
        ],
      },
      {
        id: "e2", status: "failed", matchedSkills: [],
        timeline: [
          { status: "failed", canRetry: true },
          { status: "completed", durationMs: 50, developer: { retriedFromEventId: "x" } },
        ],
      },
      {
        id: "e3", status: "completed", matchedSkills: ["asset_usage"],
        timeline: [{ status: "blocked_by_skill" }, { status: "completed", durationMs: 30 }],
      },
    ],
  });

  assert.equal(metrics.totalExecutions, 3);
  assert.equal(metrics.skillHitRate, 2 / 3);
  assert.equal(metrics.actionCompletedCount, 4);
  assert.equal(metrics.actionFailedCount, 1);
  assert.equal(metrics.actionBlockedBySkillCount, 1);
  assert.equal(metrics.actionValidityRate, 4 / 6);
  assert.equal(metrics.failedExecutionsWithRecovery, 1);
  assert.equal(metrics.failureRecoveryRate, 1);
  assert.equal(metrics.executionFindabilityRate, 1);
  assert.equal(metrics.avgActionDurationMs, (120 + 80 + 50 + 30) / 4);
});

test("assistantExecutionMetrics: empty snapshot returns zeroed metrics", () => {
  const metrics = computeExecutionMetrics({ executions: [] });
  assert.equal(metrics.totalExecutions, 0);
  assert.equal(metrics.skillHitRate, 0);
  assert.equal(metrics.actionValidityRate, 0);
});
```

- [ ] **Step 2: Run, verify failure** (module missing)

- [ ] **Step 3: Implement `modules/assistant/assistantExecutionMetrics.js`**

```js
function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

const TERMINAL_ACTION_STATUSES = new Set(["completed", "failed", "blocked_by_skill"]);

export function computeExecutionMetrics(snapshot = {}) {
  const executions = safeArray(snapshot.executions);
  const total = executions.length;
  let withSkill = 0;
  let actionCompleted = 0;
  let actionFailed = 0;
  let actionBlocked = 0;
  let durationSum = 0;
  let durationCount = 0;
  let failedExecutions = 0;
  let failedWithRecovery = 0;
  let findable = 0;
  for (const execution of executions) {
    if (safeArray(execution?.matchedSkills).length) {
      withSkill += 1;
    }
    if (execution?.id) {
      findable += 1;
    }
    const events = safeArray(execution?.timeline);
    let sawFailed = false;
    let sawRecovery = false;
    for (const event of events) {
      const status = String(event?.status || "");
      if (status === "completed") {
        actionCompleted += 1;
        const duration = Number(event?.durationMs || 0);
        if (duration > 0) {
          durationSum += duration;
          durationCount += 1;
        }
        if (sawFailed) {
          sawRecovery = true;
        }
      } else if (status === "failed") {
        actionFailed += 1;
        sawFailed = true;
      } else if (status === "blocked_by_skill") {
        actionBlocked += 1;
      } else if (sawFailed && (status === "skipped" || status === "undone")) {
        sawRecovery = true;
      }
    }
    if (execution?.status === "failed" || sawFailed) {
      failedExecutions += 1;
      if (sawRecovery) {
        failedWithRecovery += 1;
      }
    }
  }
  const terminalActions = actionCompleted + actionFailed + actionBlocked;
  return {
    totalExecutions: total,
    skillHitRate: total ? withSkill / total : 0,
    actionCompletedCount: actionCompleted,
    actionFailedCount: actionFailed,
    actionBlockedBySkillCount: actionBlocked,
    actionValidityRate: terminalActions ? actionCompleted / terminalActions : 0,
    failedExecutionsCount: failedExecutions,
    failedExecutionsWithRecovery: failedWithRecovery,
    failureRecoveryRate: failedExecutions ? failedWithRecovery / failedExecutions : 0,
    executionFindabilityRate: total ? findable / total : 1,
    avgActionDurationMs: durationCount ? durationSum / durationCount : 0,
  };
}
```

- [ ] **Step 4: Wire into the panel debug snapshot** — import `computeExecutionMetrics` in `appAssistantPanel.js`, and in the debug snapshot object (Grep anchor `modelOptions: filterSelectableTextModelOptions(`) add the sibling field:

```js
        executionMetrics: computeExecutionMetrics(
          typeof executionStore?.snapshot === "function" ? executionStore.snapshot() : { executions: [] }
        ),
```

Add a focused assertion to the existing debug-snapshot test in `appAssistantPanel.p1Ui.test.js` (test name contains "debug snapshot is sanitized"): `assert.ok(snapshot.executionMetrics);` and `assert.equal(typeof snapshot.executionMetrics.totalExecutions, "number");`.

- [ ] **Step 5: Run** `node --test modules/assistant/assistantExecutionMetrics.test.js modules/app/appAssistantPanel.p1Ui.test.js` — all pass.

- [ ] **Step 6: Commit**

```bash
git add modules/assistant/assistantExecutionMetrics.js modules/assistant/assistantExecutionMetrics.test.js modules/app/appAssistantPanel.js modules/app/appAssistantPanel.p1Ui.test.js
git commit -m "feat: derive PRD success metrics from execution store, expose in debug snapshot (slice 242)"
```

---

### Task 5: Real durations + structured target (P1-6, pulled forward — Replay and the dev panel display them)

**Files:**
- Modify: `modules/assistant/assistantExecutionOrchestrator.js` (`createAssistantExecutionOrchestrator` options + `run()` completed/failed events)
- Modify: `modules/assistant/assistantExecutionStore.js` (`sanitizeTimelineEvent` — add `target`)
- Modify: `services/canvas_agent_execution_service.py` (`_sanitize_timeline_event` — add `target`)
- Tests: orchestrator/store JS tests + Python service test

- [ ] **Step 1: Failing tests**

Orchestrator test (append):

```js
test("assistantExecutionOrchestrator: measures real action duration and writes structured target", async () => {
  const store = createUndoStoreWithPlan();
  let tick = 1000;
  const orchestrator = createAssistantExecutionOrchestrator({
    executionStore: store,
    now: () => (tick += 250),
    validateActions: async (payload) => ({ valid: true, actions: payload.actions }),
    executeActions: async (payload) =>
      payload.actions[0].id === "act-create"
        ? { appliedCount: 1, createdNodeIds: ["text-1"] }
        : { appliedCount: 1, createdEdgeIds: ["edge-1"] },
  });

  await orchestrator.run("exec-orchestrator", { agentMode: "act" });

  const stored = store.getExecution("exec-orchestrator");
  const createEvent = stored.timeline.find((e) => e.actionId === "act-create" && e.status === "completed");
  assert.ok(createEvent.durationMs >= 250);
  assert.deepEqual(createEvent.target, {
    actionType: "create_node",
    nodeType: "",
    nodeIds: ["text-1"],
    stepId: "step-create",
  });
});
```

Store test (append):

```js
test("assistantExecutionStore: timeline events keep structured target", () => {
  const store = createAssistantExecutionStore({ storage: memoryStorage(), projectId: "project-target" });
  store.createExecution({ id: "exec-target", status: "completed" });
  store.appendTimelineEvent("exec-target", {
    id: "evt-target",
    status: "completed",
    target: { actionType: "create_node", nodeType: "ai-image", nodeIds: ["n1"], stepId: "s1", extra: "drop-me" },
  });
  const event = store.getExecution("exec-target").timeline.find((item) => item.id === "evt-target");
  assert.deepEqual(event.target, { actionType: "create_node", nodeType: "ai-image", nodeIds: ["n1"], stepId: "s1" });
});
```

Python test (append, same temp-dir reload pattern as `test_persists_timeline_inverse_patch_and_drops_invalid_ops`): append a timeline event with `"target": {"actionType": "create_node", "nodeType": "text", "nodeIds": ["n1"], "stepId": "s1"}`, reload, assert it round-trips and unknown keys are dropped.

- [ ] **Step 2: Run all three, verify failures.**

- [ ] **Step 3: Implement**

Orchestrator: new option `now = () => Date.now()`; in `run()` wrap each action:

```js
        const actionStartedAt = now();
```
(immediately before the `validateActions` call), and on the completed event add:

```js
          durationMs: Math.max(0, now() - actionStartedAt),
          target: {
            actionType: safeString(item.action.type),
            nodeType: generationActionNodeType(item.action) === safeString(item.action.type) ? "" : generationActionNodeType(item.action),
            nodeIds: nodeIdsFromResult(result),
            stepId: item.stepId,
          },
```
On both validation-failed and execute-failed events add `durationMs: Math.max(0, now() - actionStartedAt),`.

Store sanitize (`sanitizeTimelineEvent`), after `durationMs`:

```js
    ...(isPlainObject(raw.target)
      ? {
          target: {
            actionType: safeString(raw.target.actionType),
            nodeType: safeString(raw.target.nodeType),
            nodeIds: safeArray(raw.target.nodeIds).map(safeString).filter(Boolean),
            stepId: safeString(raw.target.stepId),
          },
        }
      : {}),
```

Python `_sanitize_timeline_event`, mirroring (key omitted when absent):

```python
            **({"target": {
                "actionType": str(value["target"].get("actionType") or ""),
                "nodeType": str(value["target"].get("nodeType") or ""),
                "nodeIds": [str(n).strip() for n in cls._safe_list(value["target"].get("nodeIds")) if str(n).strip()],
                "stepId": str(value["target"].get("stepId") or ""),
            }} if isinstance(value.get("target"), dict) else {}),
```

- [ ] **Step 4: Run** orchestrator + store JS tests, `python canvas_agent_execution_service_test.py`, then the full assistant/app sweep. All pass (existing deepEqual event assertions are safe because `target` is only added when present and orchestrator-produced events in old tests… NOTE: old orchestrator tests using `deepEqual(stored.timeline.at(-1), {...})` cover skipped/waiting events which gain no target/duration — but completed events now always carry duration+target; if any old deepEqual covers a completed event, update that expectation to include the new fields).

- [ ] **Step 5: Commit**

```bash
git add modules/assistant/assistantExecutionOrchestrator.js modules/assistant/assistantExecutionOrchestrator.test.js modules/assistant/assistantExecutionStore.js modules/assistant/assistantExecutionStore.test.js services/canvas_agent_execution_service.py canvas_agent_execution_service_test.py
git commit -m "feat: real per-action durations and structured timeline targets (slice 243)"
```

---

### Task 6: Replay + regenerate-step (P0-3)

**Files:**
- Modify: `modules/assistant/assistantExecutionOrchestrator.js` (new `replay`, `regenerateStep`)
- Modify: `modules/app/appAssistantPanel.js` (detail-area buttons)
- Tests: orchestrator test file + `appAssistantPanel.p1Ui.test.js`

- [ ] **Step 1: Failing orchestrator tests**

```js
test("assistantExecutionOrchestrator: replay re-executes structural actions and skips generation", async () => {
  let eventCounter = 0;
  const store = createAssistantExecutionStore({
    storage: memoryStorage(),
    projectId: "project-replay",
    clock: () => "2026-06-10T00:00:00.000Z",
    idFactory: (prefix) => `${prefix}-${(eventCounter += 1)}`,
  });
  store.createExecution({
    id: "exec-replay",
    title: "Replay run",
    status: "completed",
    drawerState: { visible: true, line1: "Replay run", line2: "执行完成" },
    plan: { steps: [{ id: "s1", title: "Create" }, { id: "s2", title: "Generate" }] },
    actionsByStep: {
      s1: [{ id: "a1", type: "create_node", nodeId: "n1", title: "Create text" }],
      s2: [{ id: "a2", type: "queue_generation_task", nodeId: "img-1", nodeType: "ai-image", title: "Generate image" }],
    },
  });
  const executed = [];
  const orchestrator = createAssistantExecutionOrchestrator({
    executionStore: store,
    validateActions: async (payload) => ({ valid: true, actions: payload.actions }),
    executeActions: async (payload) => {
      executed.push(payload.actions[0].id);
      return { appliedCount: 1, createdNodeIds: [payload.actions[0].nodeId] };
    },
  });

  const result = await orchestrator.replay("exec-replay", { agentMode: "act" });

  assert.equal(result.status, "replayed");
  assert.equal(result.replayedCount, 1);
  assert.equal(result.skippedGenerationCount, 1);
  assert.deepEqual(executed, ["a1"]);
  const stored = store.getExecution("exec-replay");
  assert.ok(stored.timeline.some((e) => e.status === "replayed" && e.actionId === "a1"));
  assert.ok(stored.timeline.some((e) => e.status === "replay_skipped_generation" && e.actionId === "a2"));
  assert.equal(stored.status, "completed");
});

test("assistantExecutionOrchestrator: regenerateStep runs one generation action without moving the cursor", async () => {
  let eventCounter = 0;
  const store = createAssistantExecutionStore({
    storage: memoryStorage(),
    projectId: "project-regenerate",
    clock: () => "2026-06-10T00:00:00.000Z",
    idFactory: (prefix) => `${prefix}-${(eventCounter += 1)}`,
  });
  store.createExecution({
    id: "exec-regen",
    title: "Regenerate run",
    status: "completed",
    orchestratorState: { nextActionIndex: 2, pausedAtActionId: "", running: false },
    plan: { steps: [{ id: "s1", title: "Create" }, { id: "s2", title: "Generate" }] },
    actionsByStep: {
      s1: [{ id: "a1", type: "create_node", nodeId: "n1" }],
      s2: [{ id: "a2", type: "queue_generation_task", nodeId: "img-1", nodeType: "ai-image" }],
    },
  });
  const executed = [];
  const orchestrator = createAssistantExecutionOrchestrator({
    executionStore: store,
    validateActions: async (payload) => ({ valid: true, actions: payload.actions }),
    executeActions: async (payload) => {
      executed.push(payload.actions[0].id);
      return { appliedCount: 1, queuedGenerationNodeIds: ["img-1"] };
    },
  });

  const result = await orchestrator.regenerateStep("exec-regen", { actionId: "a2", eventId: "evt-x" });

  assert.equal(result.status, "regenerated");
  assert.deepEqual(executed, ["a2"]);
  const stored = store.getExecution("exec-regen");
  const regen = stored.timeline.find((e) => e.status === "completed" && e.developer?.regeneratedFromEventId === "evt-x");
  assert.ok(regen);
  assert.equal(stored.orchestratorState.nextActionIndex, 2);
  assert.equal(stored.status, "completed");
});

test("assistantExecutionOrchestrator: regenerating a video step requires fresh authorization", async () => {
  let eventCounter = 0;
  const store = createAssistantExecutionStore({
    storage: memoryStorage(),
    projectId: "project-regen-video",
    clock: () => "2026-06-10T00:00:00.000Z",
    idFactory: (prefix) => `${prefix}-${(eventCounter += 1)}`,
  });
  store.createExecution({
    id: "exec-regen-video",
    title: "Video regen",
    status: "completed",
    plan: { steps: [{ id: "s1", title: "Video" }] },
    actionsByStep: { s1: [{ id: "a1", type: "queue_generation_task", nodeId: "v1", nodeType: "ai-video" }] },
  });
  const orchestrator = createAssistantExecutionOrchestrator({
    executionStore: store,
    validateActions: async (payload) => ({ valid: true, actions: payload.actions }),
    executeActions: async () => {
      throw new Error("must not run unauthorized video");
    },
  });

  const result = await orchestrator.regenerateStep("exec-regen-video", { actionId: "a1" });

  assert.equal(result.status, "waiting_video_authorization");
  assert.ok(
    store.getExecution("exec-regen-video").timeline.some((e) => e.status === "waiting_video_authorization")
  );
});
```

- [ ] **Step 2: Run, verify failures** (`replay`/`regenerateStep` not functions).

- [ ] **Step 3: Implement in the orchestrator**

```js
const STRUCTURAL_REPLAY_TYPES = new Set([
  "create_node",
  "connect_nodes",
  "layout_nodes",
  "move_nodes",
  "create_group",
]);
const GENERATION_ACTION_TYPES = new Set(["queue_generation_task", "run_prompt_preset_generation"]);
```

```js
  async function replay(executionId, options = {}) {
    const id = safeString(executionId);
    const execution = executionStore.getExecution(id);
    if (!execution) {
      throw new Error(`Execution not found: ${id}`);
    }
    if (activeExecutionId === id) {
      return { status: "replay_unavailable", reason: "execution_running" };
    }
    const compiled = compilePlanActions(execution);
    let replayedCount = 0;
    let skippedGenerationCount = 0;
    for (const item of compiled) {
      const actionType = safeString(item.action.type);
      if (GENERATION_ACTION_TYPES.has(actionType)) {
        skippedGenerationCount += 1;
        await appendTimeline(id, {
          stepId: item.stepId,
          actionId: item.actionId,
          status: "replay_skipped_generation",
          humanSummary: `回放跳过生成步骤：${actionLabel(item.action)}`,
          canRetry: false,
          canUndo: false,
          developer: { actionJson: item.action, replay: true },
        });
        continue;
      }
      if (!STRUCTURAL_REPLAY_TYPES.has(actionType)) {
        continue;
      }
      const actionStartedAt = now();
      let result;
      try {
        result = await executeActions({
          ...options,
          actions: [item.action],
          executionId: id,
          stepId: item.stepId,
          actionId: item.actionId,
        });
      } catch (error) {
        await appendTimeline(id, {
          stepId: item.stepId,
          actionId: item.actionId,
          status: "failed",
          humanSummary: `回放失败：${actionLabel(item.action)}`,
          error: errorMessage(error) || "Replay failed",
          canRetry: false,
          canUndo: false,
          durationMs: Math.max(0, now() - actionStartedAt),
          developer: { actionJson: item.action, replay: true },
        });
        return { status: "replay_failed", replayedCount, skippedGenerationCount };
      }
      replayedCount += 1;
      const inverse = inverseForActionResult(item.action, result, nodeSignatureProvider, null);
      await appendTimeline(id, {
        stepId: item.stepId,
        actionId: item.actionId,
        status: "replayed",
        humanSummary: `已回放：${actionLabel(item.action)}`,
        nodeIds: nodeIdsFromResult(result),
        canRetry: false,
        canUndo: Boolean(inverse),
        ...(inverse ? { inverse } : {}),
        durationMs: Math.max(0, now() - actionStartedAt),
        developer: { actionJson: item.action, result, replay: true },
      });
    }
    await setExecutionStatus(id, execution.status, {
      drawerState: { ...execution.drawerState, visible: true, line2: `已回放 ${replayedCount} 步结构动作` },
    });
    return { status: "replayed", replayedCount, skippedGenerationCount };
  }

  async function regenerateStep(executionId, options = {}) {
    const id = safeString(executionId);
    const execution = executionStore.getExecution(id);
    if (!execution) {
      throw new Error(`Execution not found: ${id}`);
    }
    if (activeExecutionId === id) {
      return { status: "regenerate_unavailable", reason: "execution_running" };
    }
    const compiled = compilePlanActions(execution);
    const index = actionIndexById(compiled, options.actionId);
    const item = compiled[index];
    if (!item) {
      return { status: "regenerate_unavailable", reason: "missing_action" };
    }
    if (isVideoGenerationAction(item.action) && options.videoAuthorized !== true) {
      await appendTimeline(id, {
        stepId: item.stepId,
        actionId: item.actionId,
        status: "waiting_video_authorization",
        humanSummary: "需要先授权视频生成",
        canRetry: true,
        canUndo: false,
        developer: { actionJson: item.action, regenerate: true },
      });
      return { status: "waiting_video_authorization", requiresVideoAuthorization: true };
    }
    const actionStartedAt = now();
    let result;
    try {
      result = await executeActions({
        ...options,
        actions: [item.action],
        executionId: id,
        stepId: item.stepId,
        actionId: item.actionId,
      });
    } catch (error) {
      await appendTimeline(id, {
        stepId: item.stepId,
        actionId: item.actionId,
        status: "failed",
        humanSummary: timelineSummary(item.action, "failed"),
        error: errorMessage(error) || "Regenerate failed",
        canRetry: true,
        canUndo: false,
        durationMs: Math.max(0, now() - actionStartedAt),
        developer: { actionJson: item.action, regenerate: true, regeneratedFromEventId: safeString(options.eventId) },
      });
      return { status: "regenerate_failed" };
    }
    await appendTimeline(id, {
      stepId: item.stepId,
      actionId: item.actionId,
      status: "completed",
      humanSummary: timelineSummary(item.action, "completed"),
      nodeIds: nodeIdsFromResult(result),
      canRetry: true,
      canUndo: false,
      durationMs: Math.max(0, now() - actionStartedAt),
      developer: { actionJson: item.action, result, regenerate: true, regeneratedFromEventId: safeString(options.eventId) },
    });
    return { status: "regenerated" };
  }
```

Export both in the returned object. Note: `replay` and `regenerateStep` deliberately do not touch `orchestratorState`.

- [ ] **Step 4: Failing UI test** (append to `appAssistantPanel.p1Ui.test.js`)

```js
test("appAssistantPanel Phase 4 UI: completed execution offers replay and per-step regenerate", async () => {
  const document = createFakeDocument();
  const calls = [];
  const executionStore = createAssistantExecutionStore({
    storage: memoryStorage(),
    projectId: "project-replay-ui",
    clock: () => "2026-06-10T00:00:00.000Z",
  });
  executionStore.createExecution({
    id: "exec-replay-ui",
    title: "Replay 任务",
    status: "completed",
    drawerState: { visible: true, line1: "Replay 任务", line2: "执行完成" },
    plan: { steps: [{ id: "s1", title: "Create" }, { id: "s2", title: "Generate" }] },
    actionsByStep: {
      s1: [{ id: "a1", type: "create_node", nodeId: "n1" }],
      s2: [{ id: "a2", type: "queue_generation_task", nodeId: "img-1", nodeType: "ai-image" }],
    },
  });
  executionStore.appendTimelineEvent("exec-replay-ui", {
    id: "evt-gen-done",
    stepId: "s2",
    actionId: "a2",
    status: "completed",
    humanSummary: "已生成图片",
    nodeIds: ["img-1"],
    canRetry: true,
    developer: { actionJson: { id: "a2", type: "queue_generation_task", nodeId: "img-1", nodeType: "ai-image" } },
  });
  const executionOrchestrator = {
    async replay(executionId, options) {
      calls.push(["replay", executionId, options]);
      return { status: "replayed", replayedCount: 1, skippedGenerationCount: 1 };
    },
    async regenerateStep(executionId, options) {
      calls.push(["regenerateStep", executionId, options]);
      return { status: "regenerated" };
    },
  };
  const panel = createAppAssistantPanel({ document, executionStore, executionOrchestrator, executionSyncClient: false });

  panel.init();
  panel.open();
  panel.root.querySelector(".hy-canvas-agent-execution-expand").click();

  const replayButton = panel.root.querySelector(".hy-canvas-agent-execution-replay");
  assert.ok(replayButton);
  assert.equal(replayButton.textContent, "回放结构");
  replayButton.click();
  await panel.flush();
  assert.deepEqual(calls[0].slice(0, 2), ["replay", "exec-replay-ui"]);

  const eventRow = panel.root
    .querySelectorAll(".hy-canvas-agent-execution-event")
    .find((row) => row.getAttribute("data-event-id") === "evt-gen-done");
  eventRow.click();
  const regenButton = panel.root.querySelector(".hy-canvas-agent-execution-detail-regenerate");
  assert.ok(regenButton);
  assert.equal(regenButton.textContent, "重新生成此步");
  regenButton.click();
  await panel.flush();
  assert.equal(calls[1][0], "regenerateStep");
  assert.equal(calls[1][2].actionId, "a2");
  assert.equal(calls[1][2].eventId, "evt-gen-done");
});
```

- [ ] **Step 5: Implement panel UI**

In `renderExecutionDrawer` expanded branch:
(a) after the queue strip, when `safeTrim(execution.status) === "completed" && typeof resolvedExecutionOrchestrator?.replay === "function" && isRunnableExecution(execution)` append a `.hy-canvas-agent-execution-replay` button labeled `回放结构` calling `schedule(() => replayExecution(execution.id))`;
(b) in detail actions, when the selected event is a completed generation event (`["queue_generation_task","run_prompt_preset_generation"].includes(safeTrim(timelineEventActionJson(selectedEvent)?.type))` and `selectedEvent.status === "completed"`) and `resolvedExecutionOrchestrator?.regenerateStep` exists, append `.hy-canvas-agent-execution-detail-regenerate` labeled `重新生成此步`.

Handlers (place next to `undoTimelineEvent`):

```js
  async function replayExecution(executionId) {
    const id = safeTrim(executionId);
    if (!id || typeof resolvedExecutionOrchestrator?.replay !== "function") {
      return null;
    }
    setBusy(true);
    try {
      return await resolvedExecutionOrchestrator.replay(id, { agentMode: state.agentMode });
    } finally {
      setBusy(false);
      render();
    }
  }

  async function regenerateTimelineEvent(executionId, event = {}) {
    const id = safeTrim(executionId);
    const actionId = safeTrim(event?.actionId);
    if (!id || !actionId || typeof resolvedExecutionOrchestrator?.regenerateStep !== "function") {
      return null;
    }
    setBusy(true);
    try {
      return await resolvedExecutionOrchestrator.regenerateStep(id, {
        actionId,
        eventId: safeTrim(event?.id),
        agentMode: state.agentMode,
        videoAuthorized: state.videoGenerationAuthorized === true && state.strongConfirmationApproved === true,
      });
    } finally {
      setBusy(false);
      render();
    }
  }
```

- [ ] **Step 6: Run** orchestrator + p1Ui suites; all pass. **Commit:**

```bash
git add modules/assistant/assistantExecutionOrchestrator.js modules/assistant/assistantExecutionOrchestrator.test.js modules/app/appAssistantPanel.js modules/app/appAssistantPanel.p1Ui.test.js
git commit -m "feat: replay structural actions and per-step regenerate with video re-authorization (slice 244)"
```

---

### Task 7: Developer JSON panel (P1-4)

**Files:**
- Modify: `modules/app/appAssistantPanel.js`
- Test: `modules/app/appAssistantPanel.p1Ui.test.js`

- [ ] **Step 1: Failing test**

```js
test("appAssistantPanel Phase 4 UI: developer toggle reveals selected event JSON", async () => {
  const document = createFakeDocument();
  const executionStore = createAssistantExecutionStore({
    storage: memoryStorage(),
    projectId: "project-dev-panel",
    clock: () => "2026-06-10T00:00:00.000Z",
  });
  executionStore.createExecution({
    id: "exec-dev",
    title: "Dev 任务",
    status: "completed",
    drawerState: { visible: true, line1: "Dev 任务", line2: "执行完成" },
    plan: { steps: [{ id: "s1", title: "Create" }] },
    actionsByStep: { s1: [{ id: "a1", type: "create_node", nodeId: "n1" }] },
  });
  executionStore.appendTimelineEvent("exec-dev", {
    id: "evt-dev",
    stepId: "s1",
    actionId: "a1",
    status: "completed",
    humanSummary: "已生成节点",
    nodeIds: ["n1"],
    developer: { actionJson: { id: "a1", type: "create_node", nodeId: "n1" } },
  });
  const panel = createAppAssistantPanel({ document, executionStore, executionSyncClient: false });

  panel.init();
  panel.open();
  panel.root.querySelector(".hy-canvas-agent-execution-expand").click();
  panel.root.querySelector(".hy-canvas-agent-execution-event").click();

  assert.equal(panel.root.querySelector(".hy-canvas-agent-execution-dev-json"), null);
  const devToggle = panel.root.querySelector(".hy-canvas-agent-execution-dev-toggle");
  assert.ok(devToggle);
  devToggle.click();
  await panel.flush();

  const devJson = panel.root.querySelector(".hy-canvas-agent-execution-dev-json");
  assert.ok(devJson);
  assert.match(devJson.textContent, /create_node/);
  assert.match(devJson.textContent, /actionJson/);

  panel.root.querySelector(".hy-canvas-agent-execution-dev-toggle").click();
  await panel.flush();
  assert.equal(panel.root.querySelector(".hy-canvas-agent-execution-dev-json"), null);
});
```

- [ ] **Step 2: Run, verify failure.**

- [ ] **Step 3: Implement** — panel-scope `let executionDeveloperMode = false;` (next to `executionHistoryVisible`). In the expanded detail header (right after the `详情` section title is appended to `eventDetail`), add:

```js
      const devToggle = createElement(
        documentRef,
        "button",
        "hy-canvas-agent-execution-dev-toggle",
        executionDeveloperMode ? "开发者：开" : "开发者"
      );
      devToggle.type = "button";
      devToggle.addEventListener("click", () => {
        executionDeveloperMode = !executionDeveloperMode;
        render();
      });
      eventDetail.appendChild(devToggle);
```

And after the detail actions block:

```js
      if (executionDeveloperMode && selectedEvent) {
        const devJson = createElement(
          documentRef,
          "pre",
          "hy-canvas-agent-execution-dev-json",
          JSON.stringify(
            {
              id: selectedEvent.id,
              status: selectedEvent.status,
              durationMs: selectedEvent.durationMs,
              target: selectedEvent.target,
              inverse: selectedEvent.inverse,
              developer: selectedEvent.developer,
            },
            null,
            2
          )
        );
        eventDetail.appendChild(devJson);
      }
```

Add CSS in the style block (Grep anchor `.hy-canvas-agent-execution-history-item{`): `.hy-canvas-agent-execution-dev-json{grid-column:1/-1;max-height:180px;overflow:auto;font-size:10px;line-height:1.4;color:#9fb3a0;background:rgba(10,12,14,.7);border-radius:8px;padding:8px;white-space:pre-wrap}` and `.hy-canvas-agent-execution-dev-toggle{margin-left:6px;height:20px;border:1px solid rgba(255,255,255,.12);border-radius:6px;background:rgba(255,255,255,.06);color:#cfd8c9;font-size:10px;padding:0 6px;cursor:pointer}`.

- [ ] **Step 4: Run p1Ui suite; pass. Commit:**

```bash
git add modules/app/appAssistantPanel.js modules/app/appAssistantPanel.p1Ui.test.js
git commit -m "feat: developer JSON panel for selected timeline events (slice 245)"
```

---

### Task 8: Readonly DAG preview (P2-7)

**Files:**
- Modify: `modules/app/appAssistantPanel.js` (plan area in `renderExecutionDrawer`)
- Test: `modules/app/appAssistantPanel.p1Ui.test.js`

- [ ] **Step 1: Failing test**

```js
test("appAssistantPanel Phase 4 UI: plan area shows readonly dependency DAG", async () => {
  const document = createFakeDocument();
  const executionStore = createAssistantExecutionStore({
    storage: memoryStorage(),
    projectId: "project-dag",
    clock: () => "2026-06-10T00:00:00.000Z",
  });
  executionStore.createExecution({
    id: "exec-dag",
    title: "DAG 任务",
    status: "paused",
    drawerState: { visible: true, line1: "DAG 任务", line2: "已暂停" },
    plan: {
      steps: [
        { id: "s1", title: "故事大纲" },
        { id: "s2", title: "分镜 01", dependsOn: ["s1"] },
        { id: "s3", title: "关键帧图 01", dependsOn: ["s2"] },
      ],
    },
    actionsByStep: {
      s1: [{ id: "a1", type: "create_node", nodeId: "n1" }],
      s2: [{ id: "a2", type: "create_node", nodeId: "n2" }],
      s3: [{ id: "a3", type: "create_node", nodeId: "n3" }],
    },
  });
  const panel = createAppAssistantPanel({ document, executionStore, executionSyncClient: false });

  panel.init();
  panel.open();
  panel.root.querySelector(".hy-canvas-agent-execution-expand").click();

  const dag = panel.root.querySelector(".hy-canvas-agent-execution-dag");
  assert.ok(dag);
  const rows = panel.root.querySelectorAll(".hy-canvas-agent-execution-dag-edge");
  assert.deepEqual(rows.map((row) => row.textContent), ["故事大纲 → 分镜 01", "分镜 01 → 关键帧图 01"]);
});
```

Also assert absence when no dependencies: reuse any existing no-dependsOn fixture test by adding one line `assert.equal(panel.root.querySelector(".hy-canvas-agent-execution-dag"), null);` to the plan-toggle test.

- [ ] **Step 2: Run, verify failure.**

- [ ] **Step 3: Implement** — after the plan steps loop (before `detail.appendChild(plan)`):

```js
      const dependencyEdges = [];
      steps.forEach((step) => {
        const stepTitle = safeTrim(step?.title || step?.name || step?.id);
        (Array.isArray(step?.dependsOn) ? step.dependsOn : []).forEach((dependencyId) => {
          const fromTitle = planStepTitleById(detailExecution, dependencyId) || safeTrim(dependencyId);
          if (fromTitle && stepTitle) {
            dependencyEdges.push(`${fromTitle} → ${stepTitle}`);
          }
        });
      });
      if (dependencyEdges.length) {
        const dag = createElement(documentRef, "div", "hy-canvas-agent-execution-dag");
        dag.appendChild(createElement(documentRef, "div", "hy-canvas-agent-execution-section-title", "依赖关系"));
        dependencyEdges.forEach((edge) => {
          dag.appendChild(createElement(documentRef, "div", "hy-canvas-agent-execution-dag-edge", edge));
        });
        plan.appendChild(dag);
      }
```

CSS: `.hy-canvas-agent-execution-dag{margin-top:8px;padding-top:8px;border-top:1px dashed rgba(255,255,255,.1)}.hy-canvas-agent-execution-dag-edge{font-size:10px;color:#9fb3a0;margin:0 0 4px}`.

- [ ] **Step 4: Run p1Ui suite; pass. Commit:**

```bash
git add modules/app/appAssistantPanel.js modules/app/appAssistantPanel.p1Ui.test.js
git commit -m "feat: readonly dependency DAG preview in plan area (slice 246)"
```

---

### Task 9: History pagination (P2-8)

**Files:**
- Modify: `modules/app/appAssistantPanel.js` (history list, anchor `.slice(0, 10);` ~line 5577; toggle handler resets)
- Test: `modules/app/appAssistantPanel.p1Ui.test.js`

- [ ] **Step 1: Failing test**

```js
test("appAssistantPanel Phase 4 UI: execution history paginates with load-more", async () => {
  const document = createFakeDocument();
  const executionStore = createAssistantExecutionStore({
    storage: memoryStorage(),
    projectId: "project-history-page",
    clock: () => "2026-06-10T00:00:00.000Z",
    maxExecutions: 60,
  });
  for (let index = 1; index <= 13; index += 1) {
    executionStore.createExecution({
      id: `exec-h-${index}`,
      title: `历史任务 ${index}`,
      status: "completed",
      drawerState: { visible: false, line1: `历史任务 ${index}`, line2: "执行完成" },
    });
  }
  const panel = createAppAssistantPanel({ document, executionStore, executionSyncClient: false });

  panel.init();
  panel.open();
  panel.root.querySelector(".hy-canvas-agent-execution-history-toggle").click();
  await panel.flush();

  assert.equal(panel.root.querySelectorAll(".hy-canvas-agent-execution-history-item").length, 10);
  const more = panel.root.querySelector(".hy-canvas-agent-execution-history-more");
  assert.ok(more);
  assert.equal(more.textContent, "加载更多");

  more.click();
  await panel.flush();
  assert.equal(panel.root.querySelectorAll(".hy-canvas-agent-execution-history-item").length, 13);
  assert.equal(panel.root.querySelector(".hy-canvas-agent-execution-history-more"), null);
});
```

- [ ] **Step 2: Run, verify failure** (only 10 items, no more-button).

- [ ] **Step 3: Implement** — panel-scope `let executionHistoryLimit = 10;`. In the history toggle click handler, reset `executionHistoryLimit = 10;` when opening. In `renderExecutionHistoryEntry`, replace `.slice(0, 10);` with `.slice(0, executionHistoryLimit);` keeping a pre-slice count:

```js
      const filteredItems = /* existing sorted+search-filtered array before slicing */;
      const items = filteredItems.slice(0, executionHistoryLimit);
      // ...existing item rendering...
      if (filteredItems.length > executionHistoryLimit) {
        const more = createElement(documentRef, "button", "hy-canvas-agent-execution-history-more", "加载更多");
        more.type = "button";
        more.addEventListener("click", () => {
          executionHistoryLimit += 10;
          render();
        });
        list.appendChild(more);
      }
```

CSS: `.hy-canvas-agent-execution-history-more{border:1px dashed rgba(255,255,255,.16);border-radius:10px;background:transparent;color:#9fb3a0;font-size:11px;padding:7px 9px;cursor:pointer}`.

- [ ] **Step 4: Run p1Ui suite (history search test must still pass). Commit:**

```bash
git add modules/app/appAssistantPanel.js modules/app/appAssistantPanel.p1Ui.test.js
git commit -m "feat: execution history pagination with load-more (slice 246)"
```

---

### Task 10: Shared model-selection rules (P2-9)

**Files:**
- Modify: `modules/assistant/assistantModelRegistry.js` (`registryTextModels`, ~line 125)
- Test: `modules/assistant/assistantModelRegistry.test.js`

- [ ] **Step 1: Failing test**

```js
test("assistantModelRegistry: raw registry filtering reuses the text node selectable rule", () => {
  const registry = buildAssistantModelRegistry({
    modelRegistry: {
      text: [
        { id: "t-ok", nodeType: "text", modelName: "OK", modelId: "ok-chat", apiKey: "k", baseUrl: "https://x/v1", status: "unverified" },
        { id: "t-deleted", nodeType: "text", modelName: "Gone", modelId: "gone-chat", apiKey: "k", baseUrl: "https://x/v1", status: "deleted" },
        { id: "t-disabled", nodeType: "text", modelName: "Off", modelId: "off-chat", apiKey: "k", baseUrl: "https://x/v1", disabled: true },
        { id: "", nodeType: "text", modelName: "NoId", modelId: "noid-chat" },
      ],
    },
  });
  assert.deepEqual(
    registry.options.filter((o) => o.provider === "model_registry").map((o) => o.id),
    ["t-ok"]
  );
});
```

- [ ] **Step 2: Run, verify failure** (deleted/disabled/no-id entries currently still produce options).

- [ ] **Step 3: Implement** — single source of truth: import the text node rule and filter RAW entries before normalizing.

```js
import { isSelectableApiModel } from "../modelRegistryFilters.js";
```

```js
function registryTextModels(config = {}) {
  const registry = config?.modelRegistry && typeof config.modelRegistry === "object" ? config.modelRegistry : {};
  const textModels = Array.isArray(registry.text) ? registry.text : [];
  return textModels
    .filter((model) => model && typeof model === "object")
    .filter((model) => isSelectableApiModel(model))
    .map((model, index) => normalizeRegistryTextModel(model, index));
}
```

Keep `isSelectableTextModelOption` (option-level) as-is — panel tests pass pre-built option objects. Add a comment on both pointing at `modules/modelRegistryFilters.js` as the canonical rule.

- [ ] **Step 4: Run** `node --test modules/assistant/assistantModelRegistry.test.js modules/app/appAssistantPanel.p1Ui.test.js modules/app/appAssistantPanel.autoload.test.js` — if any existing fixture relied on deleted entries appearing in `registry.options`, update that fixture's expectation (deleted entries are now absent entirely; menu behavior is unchanged).

- [ ] **Step 5: Commit:**

```bash
git add modules/assistant/assistantModelRegistry.js modules/assistant/assistantModelRegistry.test.js
git commit -m "refactor: panel model registry reuses text node selectable rule as single source (slice 247)"
```

---

### Task 11: No-count group references (P2-10)

**Files:**
- Modify: `modules/app/appAssistantPanel.js` (`queueControlRecentMultiReferenceCount` ~line 1447 and `parseQueueRecentMultiReferenceMoveCommand` ~line 1490 — READ both functions first; align identifier names to the actual body)
- Test: `modules/app/appAssistantPanel.p1Ui.test.js`

- [ ] **Step 1: Failing test** — copy the existing `recent three queue references move as a group without LLM` test (Grep for it), duplicate with: three explicit queue-control commands to build recent references, then send `把刚才那几个移动到第一个排队任务`; assert `queueControl.action === "reorder"` and the same `orderedIds` grouping as the three-reference test. Name it `recent group reference without count moves all recent references`.

- [ ] **Step 2: Run, verify failure** (no local queueControl result for 那几个).

- [ ] **Step 3: Implement** — in `queueControlRecentMultiReferenceCount(text)` add before the numeric checks:

```js
  if (/(那几个|这几个|那一组|这一组|那组|这组)/.test(text) || /\b(those|them)\b/i.test(text)) {
    return -1;
  }
```

In `parseQueueRecentMultiReferenceMoveCommand`, where the count is consumed (`const referenceCount = queueControlRecentMultiReferenceCount(text);`), treat `-1` as "all recent": `const effectiveCount = referenceCount === -1 ? recentReferences.length : referenceCount;` and require `effectiveCount >= 2` (single recent reference falls through to the existing single-reference parser). Use the function's actual local variable name for the recent-reference list.

- [ ] **Step 4: Run the focused pattern then the full p1Ui suite. Commit:**

```bash
git add modules/app/appAssistantPanel.js modules/app/appAssistantPanel.p1Ui.test.js
git commit -m "feat: no-count group references move all recent queue references (slice 247)"
```

---

### Task 12: Live E2E acceptance — real LLM to executed timeline (P1-5)

**Files:**
- Create: `tools/run_canvas_agent_llm_e2e.mjs`

This is an on-demand live script (NOT part of `node --test`). It requires real `8777` running current code with the gemini-3.1 model configured. Pattern-match `tools/run_canvas_agent_ui_acceptance.mjs` for the Playwright launch options and check/exit helpers.

- [ ] **Step 1: Write the script**

```js
// Canvas Agent live E2E: real LLM (model_registry gemini-3.1-pro) -> v2 contract ->
// panel send -> drawer confirm -> executed timeline -> nodes on canvas.
// Usage: node tools/run_canvas_agent_llm_e2e.mjs [baseUrl]
import { chromium } from "@playwright/test";

const BASE = process.argv[2] || "http://127.0.0.1:8777";
const results = [];
function check(name, ok, detail = "") {
  results.push([name, ok]);
  console.log((ok ? "PASS " : "FAIL ") + name + (ok ? "" : ` | ${detail}`));
}

const browser = await chromium.launch({
  headless: false,
  executablePath: "C:/Users/Administrator/AppData/Local/ms-playwright/chromium-1217/chrome-win64/chrome.exe",
  args: ["--no-sandbox", "--window-position=40,40"],
});
const page = await browser.newPage({ viewport: { width: 1480, height: 920 } });
try {
  await page.goto(BASE + "/", { waitUntil: "domcontentloaded", timeout: 45000 });
  await page.waitForFunction(() => Boolean(window.__huanyingCanvasAgentAssistant), null, { timeout: 45000 });
  await page.evaluate(() => window.__huanyingCanvasAgentAssistant.open());
  await page.waitForTimeout(400);

  const sendResult = await page.evaluate(async () => {
    const controller = window.__huanyingCanvasAgentAssistant;
    const gemini = controller.state.modelOptions.find((model) => /gemini/i.test(model.displayName || model.model || ""));
    if (gemini) controller.state.selectedModel = gemini;
    const nodesBefore = (controller.state.graphStore?.nodes || []).length;
    await controller.state.sendMessage("根据“雨夜侦探发现线索”做 2 个分镜，每个分镜创建一个文本节点写出画面描述，不要生成图片或视频");
    return { nodesBefore, selected: controller.state.selectedModel?.model || "" };
  });
  check("send dispatched with gemini model", /gemini/i.test(sendResult.selected), JSON.stringify(sendResult));

  await page.waitForFunction(() => {
    const drawer = document.querySelector(".hy-canvas-agent-execution-drawer");
    return drawer && drawer.hidden !== true;
  }, null, { timeout: 120000 });
  check("v2 response produced a drawer execution", true);

  const confirm = await page.evaluate(() => {
    const button = document.querySelector(".hy-canvas-agent-execution-action");
    return button ? button.textContent : "";
  });
  if (confirm === "确认") {
    await page.click(".hy-canvas-agent-execution-action");
  }
  await page.waitForFunction(() => {
    const drawer = document.querySelector(".hy-canvas-agent-execution-drawer");
    return drawer && /执行完成|failed|失败/.test(drawer.textContent || "");
  }, null, { timeout: 120000 });

  const outcome = await page.evaluate(() => {
    const controller = window.__huanyingCanvasAgentAssistant;
    const snapshot = controller.state.executionStore.snapshot();
    const execution = snapshot.executions[snapshot.executions.length - 1];
    return {
      status: execution?.status,
      matchedSkills: execution?.matchedSkills || [],
      completedEvents: (execution?.timeline || []).filter((event) => event.status === "completed").length,
      withDuration: (execution?.timeline || []).filter((event) => Number(event.durationMs) > 0).length,
      nodesAfter: (controller.state.graphStore?.nodes || []).length,
    };
  });
  check("execution completed", outcome.status === "completed", JSON.stringify(outcome));
  check("actions executed with real durations", outcome.completedEvents >= 1 && outcome.withDuration >= 1, JSON.stringify(outcome));
  check("canvas gained nodes", outcome.nodesAfter > sendResult.nodesBefore, JSON.stringify(outcome));
  console.log("matchedSkills:", JSON.stringify(outcome.matchedSkills));
} finally {
  await browser.close();
}
const failed = results.filter(([, ok]) => !ok);
console.log(`\nLIVE LLM E2E: ${results.length - failed.length} pass / ${failed.length} fail`);
process.exit(failed.length ? 1 : 0);
```

- [ ] **Step 2: Run against real 8777**

Run: `node tools/run_canvas_agent_llm_e2e.mjs`
Expected: 5/5 PASS. If the model replies Plan-mode-only or the confirm label differs, adapt the confirm step (Act mode may auto-run; the completion wait already covers both). If it fails on a real defect, fix the defect (that is the point), re-run.

- [ ] **Step 3: Commit:**

```bash
git add tools/run_canvas_agent_llm_e2e.mjs
git commit -m "feat: live LLM-to-canvas E2E acceptance script (slice 248)"
```

---

### Task 13: Full regression, PRD v3.87, handoff record, final commit

- [ ] **Step 1: Full regression**

```bash
node --test modules/app/*.test.js modules/assistant/*.test.js modules/assistant/canvasSkills/*.test.js integrations/pi_canvas_agent/src/*.test.js
python canvas_agent_execution_service_test.py
python canvas_agent_route_service_test.py
python canvas_agent_action_schema_test.py
python http_route_dispatcher_test.py
python assistant_skill_v2_offline_runner_test.py
```
Expected: all pass (JS list expands the glob in bash; on PowerShell use `$(ls ...)` equivalents already used in this repo's history).

- [ ] **Step 2: Update PRD to v3.87** — follow the established pattern (write a UTF-8 python script via the Write tool, run it, delete it): bump 版本 to v3.87; new 状态 head describing slices 241-248 (skill enforcement, matchedSkills, offline deep assertions, metrics, durations+target, replay/regenerate, dev JSON panel, DAG preview, history pagination, shared model rule, no-count group refs, live LLM E2E); add 2.2 rows for each slice with honest 仍缺口 columns (e.g. replay 不重建生成结果、metrics 无后端聚合、DAG 是文本列表不是图形); update the 2.4 rows for Undo/Replay(回放最小闭环已落地), 完整历史入口(分页已加), 时间线能力(真实耗时+target 已落地), and the post-2.6 priority paragraph; append the section-24 bullet.

- [ ] **Step 3: Append handoff record `## 227`** to `docs/CLAW_CODE_ASSISTANT_IMPLEMENTATION_HANDOFF.md` with the RED/GREEN evidence, live E2E results, and remaining boundaries.

- [ ] **Step 4: Final commit**

```bash
git add -A
git commit -m "feat: complete P0-P2 audit items - skill enforcement, metrics, replay, dev panel, DAG, pagination (slices 241-248)"
```

---

## Self-Review Notes

- **Spec coverage:** P0-1 → Tasks 1-3; P0-2 → Task 4; P0-3 → Task 6; P1-4 → Task 7; P1-5 → Task 12; P1-6 → Task 5; P2-7 → Task 8; P2-8 → Task 9; P2-9 → Task 10; P2-10 → Task 11; docs/regression → Task 13. Order note: Task 5 (P1-6) runs before Replay/dev-panel because both display durations/targets.
- **Type consistency:** `validate_actions(..., matched_skills=None)` matches Task 1↔2; `now()` option introduced in Task 5 is used by Task 6 replay/regenerate code; `executionHistoryLimit`/`executionDeveloperMode` are panel-scope `let`s alongside `executionHistoryVisible`.
- **Known adaptation points (explicitly delegated to the executor, with file+line anchors given):** offline runner internals (Task 3), recent-reference local variable names (Task 11), old deepEqual expectations gaining duration/target fields (Task 5 Step 4).
