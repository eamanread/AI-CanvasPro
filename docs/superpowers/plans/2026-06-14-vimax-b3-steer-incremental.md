# ViMax B3 (Steer / Incremental) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the native ViMax plan lane land story/cast/storyboard nodes incrementally as the brain streams, and let the user pause after characters to edit the cast before the storyboard decomposes against it.

**Architecture:** Two shippable increments. **B3a** (JS-only, lowest risk): the panel lands a story comment card + an editable cast-sheet comment card during the existing native step stream (trusted per-stage execution); storyboard still lands at done (B2's path). **B3b** (Python + JS): split the brain into two phases, give the orchestrator a `paused` state + `resume`, and wire the panel pause → 「继续」/「取消」 → decompose against the edited cast. Behind `HY_VIMAX_NATIVE`. Zero-spend (chat only; cost gate untouched).

**Tech Stack:** Python stdlib (`unittest`, venv-free) for brain/orchestrator/route/claw; ES modules + `node:test` for JS mappers/panel. Spec: `docs/superpowers/specs/2026-06-14-vimax-b3-steer-incremental-design.md`.

**Conventions used below:**
- `REPO` = `D:\Aic\huanying-source-windows-20260430-122116` (run commands from there unless noted).
- Python brain tests run from `integrations/vimax/` (`python -m unittest brain.<mod>`); orchestrator/route/claw tests run from repo root (`python -m unittest <mod>`).
- JS tests: `node --test <path>`.
- Commit messages end with `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.

---

## File structure

**B3a (no Python changes):**
- Create `modules/assistant/vimaxStoryCastCanvasActions.js` — pure mappers `mapVimaxStoryToCanvasActions`, `mapVimaxCastToCanvasActions`, parser `castContentToCharacters`.
- Create `modules/assistant/vimaxStoryCastCanvasActions.test.js` — node:test.
- Modify `claw_action_schema_test.py` — story/cast comment + `vimaxShotIdx:-1` survival.
- Modify `modules/assistant/vimaxCanvasReconcile.js` — fix the `lineageComplete` comment (no logic change needed).
- Modify `modules/assistant/vimaxCanvasReconcile.test.js` — story+cast+shot canvas profiles HEALTHY.
- Modify `modules/app/appAssistantPanel.js` — `landTrustedVimaxActions` helper + incremental story/cast landing in `applyVimaxNativePlanCommand`.
- Modify `modules/app/appAssistantPanel.vimaxNative.test.js` — story/cast land during poll, once-per-stage.

**B3b:**
- Modify `integrations/vimax/brain/planner.py` — split into `plan_story_and_characters` + `plan_from_characters`; `plan_shotplan` becomes a thin wrapper.
- Modify `integrations/vimax/brain/planner_test.py` — phase-split equivalence, M4, on_step per phase.
- Modify `modules/assistant/vimaxCanvasActions.js` — extract `shotActions(shot, flowId, skillRefs, anchorState)`; `mapVimaxShotplanToCanvasActions` delegates.
- Modify `modules/assistant/vimaxCanvasActions.test.js` — `shotActions` parity.
- Modify `services/vimax_native_orchestrator.py` — `paused` state, `resume()`, `cancel(paused)`, `paused_ttl`.
- Modify `vimax_native_orchestrator_test.py` — paused→resume lifecycle.
- Modify `services/vimax_route_service.py` + `services/http_route_dispatcher.py` + `api/canvasAgentApi.js` — `/native/resume`.
- Modify `vimax_route_service_test.py` + `http_route_dispatcher_test.py` — resume route.
- Modify `modules/app/appAssistantPanel.js` — pause prompt + 「继续」/「取消」 + per-scene incremental storyboard.
- Modify `modules/app/appAssistantPanel.vimaxNative.test.js` — pause/resume/cancel/empty-parse panel tests.

---

# Phase B3a — incremental story + cast cards

### Task A1: story + cast mappers and the cast parser (pure)

**Files:**
- Create: `modules/assistant/vimaxStoryCastCanvasActions.js`
- Test: `modules/assistant/vimaxStoryCastCanvasActions.test.js`

- [ ] **Step 1: Write the failing test**

```js
// modules/assistant/vimaxStoryCastCanvasActions.test.js
import assert from "node:assert/strict";
import test from "node:test";

import {
  mapVimaxStoryToCanvasActions,
  mapVimaxCastToCanvasActions,
  castContentToCharacters,
} from "./vimaxStoryCastCanvasActions.js";

const CHARS = [
  { idx: 0, identifierInScene: "Alice", isVisible: true, staticFeatures: "三十岁，卷发", dynamicFeatures: "红风衣" },
  { idx: 1, identifierInScene: "Bob", isVisible: false, staticFeatures: "矮个", dynamicFeatures: "礼帽" },
];

test("story mapper: one trusted comment card carrying the story text", () => {
  const { actions } = mapVimaxStoryToCanvasActions({ flowId: "f1", story: "雨夜告别。" });
  assert.equal(actions.length, 1);
  const a = actions[0];
  assert.equal(a.type, "create_node");
  assert.equal(a.nodeType, "comment");
  assert.equal(a.data.content, "雨夜告别。");
  assert.equal(a.data.vimaxRole, "story");
  assert.equal(a.data.vimaxFlowId, "f1");
  assert.equal(a.data.vimaxShotIdx, -1);
});

test("story mapper: empty flowId throws", () => {
  assert.throws(() => mapVimaxStoryToCanvasActions({ flowId: "", story: "x" }));
});

test("cast mapper: one comment card whose content round-trips through the parser", () => {
  const { actions } = mapVimaxCastToCanvasActions({ flowId: "f1", characters: CHARS });
  assert.equal(actions.length, 1);
  assert.equal(actions[0].nodeType, "comment");
  assert.equal(actions[0].data.vimaxRole, "cast");
  assert.equal(actions[0].data.vimaxShotIdx, -1);
  const parsed = castContentToCharacters(actions[0].data.content);
  assert.equal(parsed.length, 2);
  assert.deepEqual(parsed[0], { idx: 0, identifierInScene: "Alice", staticFeatures: "三十岁，卷发", dynamicFeatures: "红风衣", isVisible: true });
  assert.equal(parsed[1].identifierInScene, "Bob");
  assert.equal(parsed[1].isVisible, false);
});

test("parser: idx is block order (M4 stable) even if blocks are reordered/renumbered", () => {
  const content = [
    "角色表（说明行）",
    "【角色 5】Bob",
    "静态: 矮个",
    "动态: 礼帽",
    "出镜: 否",
    "【角色 2】Alice",
    "静态: 卷发",
    "动态: 红风衣",
    "出镜: 是",
  ].join("\n");
  const parsed = castContentToCharacters(content);
  assert.equal(parsed.length, 2);
  assert.equal(parsed[0].identifierInScene, "Bob");
  assert.equal(parsed[0].idx, 0, "block order, not the bracket number");
  assert.equal(parsed[1].identifierInScene, "Alice");
  assert.equal(parsed[1].idx, 1);
});

test("parser: a | inside a feature value is preserved (labeled-block, not delimiter)", () => {
  const content = ["【角色 0】Eve", "静态: red|black outfit, 20s|30s", "动态: scarf", "出镜: 是"].join("\n");
  const parsed = castContentToCharacters(content);
  assert.equal(parsed[0].staticFeatures, "red|black outfit, 20s|30s");
});

test("parser: blank/unparseable content yields empty (caller decides, no fallback here)", () => {
  assert.deepEqual(castContentToCharacters(""), []);
  assert.deepEqual(castContentToCharacters("just some prose with no blocks"), []);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test modules/assistant/vimaxStoryCastCanvasActions.test.js`
Expected: FAIL (module not found / functions undefined).

- [ ] **Step 3: Write the implementation**

```js
// modules/assistant/vimaxStoryCastCanvasActions.js
// B3: story comment card + editable cast-sheet comment card for the native plan
// lane. Pure. comment renders data.content (CommentNoteNode) and content +
// vimax lineage survive claw; storyboard-script CANNOT be a generic grid (fixed
// shot columns), so the cast uses a comment card with a LABELED-BLOCK format so
// a feature value may contain |, :, , freely.

function text(value) {
  return String(value ?? "").trim();
}

export function mapVimaxStoryToCanvasActions({ flowId, story } = {}) {
  const fid = text(flowId);
  if (!fid) throw new Error("story card needs a non-empty flowId");
  return {
    actions: [
      {
        type: "create_node",
        id: `vimax-${fid}-story`,
        nodeType: "comment",
        name: "故事",
        placement: { strategy: "new-lane", topic: "story" },
        data: { content: text(story), vimaxFlowId: fid, vimaxRole: "story", vimaxShotIdx: -1 },
      },
    ],
  };
}

const CAST_HEADER =
  "角色表（可编辑：每个【角色 N】下用 静态:/动态:/出镜: 三行；改完回复「继续」，删/加/改名都可以）";

function castToContent(characters) {
  const blocks = (Array.isArray(characters) ? characters : []).map((c, i) => {
    c = c && typeof c === "object" ? c : {};
    const name = text(c.identifierInScene || c.identifier);
    const visible = c.isVisible === false ? "否" : "是";
    return [`【角色 ${i}】${name}`, `静态: ${text(c.staticFeatures)}`, `动态: ${text(c.dynamicFeatures)}`, `出镜: ${visible}`].join("\n");
  });
  return [CAST_HEADER, "", ...blocks].join("\n");
}

export function mapVimaxCastToCanvasActions({ flowId, characters } = {}) {
  const fid = text(flowId);
  if (!fid) throw new Error("cast sheet needs a non-empty flowId");
  return {
    actions: [
      {
        type: "create_node",
        id: `vimax-${fid}-cast`,
        nodeType: "comment",
        name: "角色表",
        placement: { strategy: "new-lane", topic: "cast" },
        data: { content: castToContent(characters), vimaxFlowId: fid, vimaxRole: "cast", vimaxShotIdx: -1 },
      },
    ],
  };
}

const HEADER_RE = /^【\s*角色\s*\d*\s*】\s*(.*)$/;

function labelValue(line, label) {
  const m = line.match(new RegExp(`^${label}\\s*[:：]\\s*(.*)$`));
  return m ? m[1].trim() : null;
}

// Parse the labeled-block cast sheet back into a cast list. idx = block order
// (M4 stable; the bracket number is cosmetic). Tolerant: skips the doc header /
// any preamble before the first 【角色】 block, blank lines, and unknown lines.
export function castContentToCharacters(content) {
  const out = [];
  let cur = null;
  for (const raw of String(content ?? "").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const h = line.match(HEADER_RE);
    if (h) {
      cur = { idx: out.length, identifierInScene: h[1].trim(), staticFeatures: "", dynamicFeatures: "", isVisible: true };
      out.push(cur);
      continue;
    }
    if (!cur) continue; // preamble / doc header before the first block
    const s = labelValue(line, "静态");
    if (s !== null) { cur.staticFeatures = s; continue; }
    const d = labelValue(line, "动态");
    if (d !== null) { cur.dynamicFeatures = d; continue; }
    const v = labelValue(line, "出镜");
    if (v !== null) { cur.isVisible = !/^(否|no|false)$/i.test(v.trim()); continue; }
    // unknown line inside a block: ignore
  }
  return out;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --test modules/assistant/vimaxStoryCastCanvasActions.test.js`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add modules/assistant/vimaxStoryCastCanvasActions.js modules/assistant/vimaxStoryCastCanvasActions.test.js
git commit -m "feat(vimax): B3a story + cast-sheet mappers + labeled-block parser"
```

---

### Task A2: claw survival of story/cast comment + vimaxShotIdx:-1

**Files:**
- Test/Modify: `claw_action_schema_test.py`

- [ ] **Step 1: Write the failing test** (append a test class)

```python
# append to claw_action_schema_test.py
class VimaxStoryCastClawTest(unittest.TestCase):
    """B3a: story/cast comment cards land through real claw with content +
    vimax lineage preserved, and the vimaxShotIdx:-1 sentinel survives."""

    def _validate(self, action):
        from services.claw_action_schema import ClawActionSchema
        schema = ClawActionSchema()
        return schema.validate({"actions": [action]})

    def test_story_comment_survives_with_content_and_lineage(self):
        action = {
            "type": "create_node", "id": "vimax-f1-story", "nodeType": "comment",
            "name": "故事",
            "data": {"content": "雨夜告别。", "vimaxFlowId": "f1", "vimaxRole": "story", "vimaxShotIdx": -1},
        }
        result = self._validate(action)
        self.assertTrue(result.get("success") or result.get("valid"), result)
        out = result["actions"][0]
        data = out.get("data") or {}
        self.assertEqual(data.get("content"), "雨夜告别。")
        self.assertEqual(data.get("vimaxRole"), "story")
        self.assertEqual(data.get("vimaxShotIdx"), -1, "negative sentinel survives")

    def test_cast_comment_survives(self):
        action = {
            "type": "create_node", "id": "vimax-f1-cast", "nodeType": "comment",
            "name": "角色表",
            "data": {"content": "【角色 0】Alice\n静态: x\n动态: y\n出镜: 是",
                      "vimaxFlowId": "f1", "vimaxRole": "cast", "vimaxShotIdx": -1},
        }
        result = self._validate(action)
        self.assertTrue(result.get("success") or result.get("valid"), result)
        self.assertIn("【角色 0】Alice", (result["actions"][0].get("data") or {}).get("content", ""))
```

> NOTE for the implementer: confirm the real entrypoint. Open `claw_action_schema_test.py` and copy the EXACT validation call the existing `test_storyboard_script_create_is_accepted` uses (class/method name + how it calls validate + how it reads the validated action back). Mirror that call shape in `_validate` above instead of the assumed `ClawActionSchema().validate(...)` if it differs.

- [ ] **Step 2: Run to verify it fails (or passes trivially)**

Run: `python -m unittest claw_action_schema_test -v`
Expected: the two new tests run. If `comment` + `content` + `vimaxShotIdx:-1` already pass (they should — `comment` ∈ SAFE_NODE_TYPES, `content`/`vimaxShotIdx` whitelisted), this task is a LOCK (regression guard), not a fix. If they FAIL, fix `services/claw_action_schema.py` (ensure `content` retained for comment + `vimaxShotIdx` int passes negative) before proceeding.

- [ ] **Step 3: Run full claw suite**

Run: `python -m unittest claw_action_schema_test`
Expected: all pass.

- [ ] **Step 4: Commit**

```bash
git add claw_action_schema_test.py
git commit -m "test(vimax): B3a lock story/cast comment + vimaxShotIdx:-1 through real claw"
```

---

### Task A3: B4 reconcile tolerates story/cast nodes

**Files:**
- Modify: `modules/assistant/vimaxCanvasReconcile.js` (comment only)
- Test: `modules/assistant/vimaxCanvasReconcile.test.js`

- [ ] **Step 1: Write the failing test** (append)

```js
// append to modules/assistant/vimaxCanvasReconcile.test.js
import { mapVimaxStoryToCanvasActions, mapVimaxCastToCanvasActions } from "./vimaxStoryCastCanvasActions.js";

test("B4: a canvas with story + cast + shot nodes profiles HEALTHY", () => {
  const story = mapVimaxStoryToCanvasActions({ flowId: "fA", story: "s" }).actions;
  const cast = mapVimaxCastToCanvasActions({ flowId: "fA", characters: [{ idx: 0, identifierInScene: "A", isVisible: true }] }).actions;
  const shots = mapVimaxShotplanToCanvasActions({ shotplan: shotplan({ flowId: "fA", scenes: 1, shotsPerScene: 2 }) }).actions;
  const p = canvasActionProfile([...story, ...cast, ...shots]);
  assert.ok(p.lineageComplete, "story/cast (-1 sentinel) do not break lineageComplete");
  assert.ok(p.cardPrepPaired, "1:1:1 still holds (story/cast are not card/prep)");
  assert.ok(p.allNodeTypesSafe && p.hasTidy);
});
```

> `shotplan(...)` helper already exists in this test file (from B4). Reuse it.

- [ ] **Step 2: Run to verify it passes (expected) or reveals the gap**

Run: `node --test modules/assistant/vimaxCanvasReconcile.test.js`
Expected: PASS. The B4 verifier confirmed `isFiniteInt(-1)` is true so `lineageComplete` accepts story/cast, and `cardPrepPaired` already counts only `vimaxRole` card/prep. If it FAILS, scope the checks: in `canvasActionProfile`, only require finite `vimaxShotIdx` when `role === "card" || role === "prep"`.

- [ ] **Step 3: Fix the misleading comment** in `modules/assistant/vimaxCanvasReconcile.js`

Find the `lineageComplete` comment block (near `if (!data.vimaxFlowId || !role || !isFiniteInt(data.vimaxShotIdx))`) and update it to:

```js
    // Trusted lineage: every node must carry flowId + role. Shot nodes
    // (card/prep) also carry a finite vimaxShotIdx; non-shot comment nodes
    // (role story/cast) use the -1 sentinel, which isFiniteInt accepts — so
    // they are intentionally lineage-complete and never perturb cardPrepPaired
    // (it counts only card/prep). (B3a)
```

- [ ] **Step 4: Run + commit**

Run: `node --test modules/assistant/vimaxCanvasReconcile.test.js`
Expected: PASS.

```bash
git add modules/assistant/vimaxCanvasReconcile.js modules/assistant/vimaxCanvasReconcile.test.js
git commit -m "test(vimax): B3a B4 reconcile tolerates story/cast comment nodes"
```

---

### Task A4: panel lands story + cast incrementally during the native poll

**Files:**
- Modify: `modules/app/appAssistantPanel.js` (`applyVimaxNativePlanCommand` + a new `landTrustedVimaxActions` helper)
- Test: `modules/app/appAssistantPanel.vimaxNative.test.js`

- [ ] **Step 1: Trace the trusted auto-apply path (no code yet)**

Read these to identify the exact programmatic "validate + trusted-execute now" entry the helper will call:
- `modules/app/appAssistantPanel.js:4294-4400` (the validate → `executeActions(executePayload)` apply path) and `:4500-4520` (`canAutoApply` / confirmation-not-required branch).
- `:6024-6048` (the runtime-config `executeActions` provider that sets `source: "vimax-director"` when `executionId ∈ state.vimaxExecutionIds`).
- `modules/assistant/assistantExecutionOrchestrator.js` (the method that runs a recorded execution through validate + the trusted provider).
- `finalizeVimaxPlan` (~`:3440`) for how B2 records a trusted execution (`recordAssistantExecutionFromResponse` + `state.vimaxExecutionIds.add`).

Decide the minimal trusted apply: the helper builds an execution whose `executionId` is added to `state.vimaxExecutionIds`, then runs validate + execute so claw stamps `source: "vimax-director"`. Confirm whether `recordAssistantExecutionFromResponse` + the orchestrator's apply (used by `finalizeVimaxPlan`/confirm) can be invoked auto (no drawer) for a free plan, OR whether the `4330/4375` validate+execute pair must be called with an `executionId` threaded into the execute payload. Write down the chosen call.

- [ ] **Step 2: Write the failing test**

```js
// append to modules/app/appAssistantPanel.vimaxNative.test.js
test("B3a: native plan lands story + cast cards DURING the poll (trusted), before done", async () => {
  const landed = []; // capture create_node actions that reached the canvas
  const graphStore = makeGraphStore();
  const api = {
    async vimaxNativeStatus() { return { configured: true }; },
    async vimaxNativePlan() { return { success: true, jobId: "nj" }; },
    async vimaxNativeJob() { return doneJob(); }, // doneJob() streams story+characters+scene + result
    async vimaxPlan() { return { success: true, jobId: "x" }; },
    async validateActions(payload) {
      // echo back the actions as "validated" so execute lands them
      return { success: true, actions: payload.actions };
    },
  };
  const state = createAssistantPanelState({
    api, graphStore,
    executeActions: (payload) => { for (const a of payload.actions || []) if (a.type === "create_node") landed.push(a); return {}; },
  });
  await state.sendMessage("导演:雨夜");
  const roles = landed.map((a) => a?.data?.vimaxRole).filter(Boolean);
  assert.ok(roles.includes("story"), "story card landed");
  assert.ok(roles.includes("cast"), "cast sheet landed");
  // trusted: each landed via an execution id registered in vimaxExecutionIds
  assert.ok(state.vimaxExecutionIds instanceof Set && state.vimaxExecutionIds.size >= 2);
});

test("B3a: story/cast land once even if a stage repeats across polls", async () => {
  let n = 0;
  const landed = [];
  const api = {
    async vimaxNativeStatus() { return { configured: true }; },
    async vimaxNativePlan() { return { success: true, jobId: "nj" }; },
    async vimaxNativeJob() {
      n += 1;
      if (n === 1) return { success: true, status: "running", progressTotal: 2,
        progress: [{ type: "step", stage: "story", payload: { story: "s" } },
                   { type: "step", stage: "characters", payload: { characters: [{ idx: 0, identifierInScene: "A", isVisible: true }] } }] };
      return doneJob();
    },
    async vimaxPlan() { return { success: true, jobId: "x" }; },
    async validateActions(p) { return { success: true, actions: p.actions }; },
  };
  const state = createAssistantPanelState({ api, graphStore: makeGraphStore(),
    executeActions: (p) => { for (const a of p.actions || []) if (a.type === "create_node") landed.push(a); return {}; } });
  await state.sendMessage("导演:雨夜");
  const storyCount = landed.filter((a) => a?.data?.vimaxRole === "story").length;
  const castCount = landed.filter((a) => a?.data?.vimaxRole === "cast").length;
  assert.equal(storyCount, 1, "story landed exactly once");
  assert.equal(castCount, 1, "cast landed exactly once");
});
```

> The existing test harness (`makeGraphStore`, `doneJob`, `createAssistantPanelState`) is already in this file from B2. `createAssistantPanelState` accepts an `executeActions` override (see `appAssistantPanel.js:2289`/`:5724`) — pass a capturing stub.

- [ ] **Step 3: Run to verify it fails**

Run: `node --test modules/app/appAssistantPanel.vimaxNative.test.js`
Expected: FAIL (story/cast not landed during poll — B2 only maps at done).

- [ ] **Step 4: Implement the helper + incremental landing**

In `appAssistantPanel.js`, add a helper (near `finalizeVimaxPlan`), using the call decided in Step 1:

```js
  // Land a small batch of vimax actions NOW, trusted (B3a incremental). Mints a
  // per-stage executionId, registers it (so claw stamps source vimax-director),
  // validates + executes once. Best-effort: a failure warns, never throws into
  // the poll loop. Returns true if landed.
  async function landTrustedVimaxActions(flowId, actions, label) {
    if (!Array.isArray(actions) || !actions.length) return false;
    if (typeof api?.validateActions !== "function") return false;
    const executionId = `vimax-native-${flowId}-${label}`;
    if (!(state.vimaxExecutionIds instanceof Set)) state.vimaxExecutionIds = new Set();
    state.vimaxExecutionIds.add(String(executionId));
    try {
      const validation = await api.validateActions({ actions, context: state.lastContext, executionId });
      if (!(validation && (validation.success || validation.valid) && Array.isArray(validation.actions))) return false;
      await executeActions({ actions: validation.actions, executionId, source: "vimax-director", graphStore,
        templateStore, canvasSkillsRuntime, agentMode: state.agentMode });
      return true;
    } catch (error) {
      state.lastReceipt = `ViMax(原生)落地提示：${safeTrim(error?.message) || error}`;
      return false;
    }
  }
```

> Wire to the actual trusted execute decided in Step 1. If the runtime provider (`:6027`) is the only path that stamps `source`, route through it (it already reads `state.vimaxExecutionIds`); the `source:"vimax-director"` field above is belt-and-suspenders.

In `applyVimaxNativePlanCommand`, inside the poll loop where new progress is scanned, track landed stages and land story/cast once:

```js
    const landedStages = new Set();
    // ... inside the while loop, after computing the latest receipt:
    for (const ev of (Array.isArray(status?.progress) ? status.progress : [])) {
      if (!ev || ev.type !== "step") continue;
      if (ev.stage === "story" && !landedStages.has("story")) {
        landedStages.add("story");
        await landTrustedVimaxActions(flowId, mapVimaxStoryToCanvasActions({ flowId, story: ev.payload?.story }).actions, "story");
      } else if (ev.stage === "characters" && !landedStages.has("cast")) {
        landedStages.add("cast");
        await landTrustedVimaxActions(flowId, mapVimaxCastToCanvasActions({ flowId, characters: ev.payload?.characters || [] }).actions, "cast");
      }
    }
```

Add the import at the top of `appAssistantPanel.js`:

```js
import { mapVimaxStoryToCanvasActions, mapVimaxCastToCanvasActions } from "../assistant/vimaxStoryCastCanvasActions.js";
```

> Storyboard still lands at done via the existing `finalizeVimaxPlan` (unchanged in B3a). The cast sheet the user sees now is informational/visible; editing it has no effect until B3b adds the pause.

- [ ] **Step 5: Run the test to verify it passes**

Run: `node --test modules/app/appAssistantPanel.vimaxNative.test.js`
Expected: PASS (all native tests, incl. the 2 new).

- [ ] **Step 6: Regression — full panel + mapper suites**

Run: `node --test modules/app/appAssistantPanel.*.test.js modules/assistant/vimax*.test.js`
Expected: PASS (B2's 13 native + 134 p1Ui + reconcile + mappers, no regression).

- [ ] **Step 7: Commit**

```bash
git add modules/app/appAssistantPanel.js modules/app/appAssistantPanel.vimaxNative.test.js
git commit -m "feat(vimax): B3a panel lands story + cast cards incrementally (trusted) during native poll"
```

---

# Phase B3b — the steer pause

### Task B1: extract `shotActions` from the storyboard mapper

**Files:**
- Modify: `modules/assistant/vimaxCanvasActions.js`
- Test: `modules/assistant/vimaxCanvasActions.test.js`

- [ ] **Step 1: Write the failing test** (append)

```js
// append to modules/assistant/vimaxCanvasActions.test.js
import { shotActions } from "./vimaxCanvasActions.js";

test("shotActions: one shot -> card + prep + edge with correct lineage/placement", () => {
  const anchor = { lastPrepInScene: new Map() };
  const acts = shotActions({ idx: 0, sceneIdx: 0, camIdx: 0, ffDesc: "wide", motionDesc: "pan" }, "f1", [], anchor);
  const types = acts.map((a) => `${a.type}:${a.nodeType || a.label || ""}`);
  assert.deepEqual(types, ["create_node:storyboard-script", "create_node:ai-image", "connect_nodes:prep"]);
  assert.equal(acts[0].placement.strategy, "new-lane", "first shot in a scene opens a lane");
  assert.equal(acts[1].data.autoStart, false, "prep never self-ignites");
  // anchor state advanced so the next shot in the scene goes right-of
  const acts2 = shotActions({ idx: 1, sceneIdx: 0, camIdx: 1, ffDesc: "close" }, "f1", [], anchor);
  assert.equal(acts2[0].placement.strategy, "right-of");
});

test("mapVimaxShotplanToCanvasActions still produces identical output (delegates to shotActions)", () => {
  const sp = { schemaVersion: "vimax-shotplan/v1", flowId: "f1", shots: [
    { idx: 0, sceneIdx: 0, camIdx: 0, ffDesc: "wide enough description", motionDesc: "pan" },
    { idx: 1, sceneIdx: 0, camIdx: 1, ffDesc: "close enough description", motionDesc: "push" },
  ] };
  const acts = mapVimaxShotplanToCanvasActions({ shotplan: sp }).actions;
  const created = acts.filter((a) => a.type === "create_node");
  assert.equal(created.length, 4); // 2 cards + 2 preps
  assert.equal(acts.filter((a) => a.type === "connect_nodes").length, 2);
  assert.ok(acts.some((a) => a.type === "tidy_canvas"));
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test modules/assistant/vimaxCanvasActions.test.js`
Expected: FAIL (`shotActions` not exported).

- [ ] **Step 3: Refactor** — in `modules/assistant/vimaxCanvasActions.js`, extract the per-shot body of the loop (the card create + prep create + connect, including `firstInScene`/`lastPrepInScene` handling) into an exported `shotActions(shot, flowId, skillRefs, anchorState)` where `anchorState = { lastPrepInScene: Map }`. The function returns `[cardAction, prepAction, edgeAction]` and mutates `anchorState.lastPrepInScene`. `mapVimaxShotplanToCanvasActions` becomes:

```js
export function mapVimaxShotplanToCanvasActions({ shotplan } = {}) {
  // ... existing schemaVersion/shots/flowId guards unchanged ...
  const skillRefs = Array.isArray(shotplan.skillRefs) ? shotplan.skillRefs.map(text).filter(Boolean) : [];
  const actions = [];
  const anchorState = { lastPrepInScene: new Map() };
  for (const shot of shotplan.shots) {
    const acts = shotActions(shot, flowId, skillRefs, anchorState);
    if (acts.length) actions.push(...acts);
  }
  actions.push({ type: "tidy_canvas", scope: "all" });
  return { actions };
}
```

Move the existing `intOrNull(shot.idx) === null` skip into `shotActions` (return `[]` for an unidentifiable shot). Keep `shotRow` as-is (called inside `shotActions`).

- [ ] **Step 4: Run to verify parity**

Run: `node --test modules/assistant/vimaxCanvasActions.test.js modules/assistant/vimaxCanvasActions.claw.test.js`
Expected: PASS (new `shotActions` tests + ALL pre-existing mapper tests unchanged — this proves byte-parity).

- [ ] **Step 5: Commit**

```bash
git add modules/assistant/vimaxCanvasActions.js modules/assistant/vimaxCanvasActions.test.js
git commit -m "refactor(vimax): B3b extract shotActions; mapper delegates (behavior unchanged)"
```

---

### Task B2: split the brain into two phases

**Files:**
- Modify: `integrations/vimax/brain/planner.py`
- Test: `integrations/vimax/brain/planner_test.py`

- [ ] **Step 1: Write the failing test** (append)

```python
# append to integrations/vimax/brain/planner_test.py
class TwoPhaseSplitTest(unittest.TestCase):
    """B3b: plan_story_and_characters + plan_from_characters compose to the same
    shotplan as plan_shotplan; the edited cast is phase2's single source (M4)."""

    def _client(self):
        # reuse the file's existing fake chat client; KeyedClient/QueueClient
        # whichever the suite already defines. Canned: story, chars, script,
        # storyboard, decompose. (Mirror an existing plan_shotplan test setup.)
        return make_fake_client()  # replace with the suite's existing fake builder

    def test_phase_split_matches_monolith(self):
        from brain import planner
        c1 = self._client(); c2 = self._client()
        whole = planner.plan_shotplan(c1, idea="雨夜", flow_id="f")
        p1 = planner.plan_story_and_characters(c2, idea="雨夜", flow_id="f")
        sp = planner.plan_from_characters(
            c2, story=p1["story"], characters=p1["characters"],
            effective_requirement=p1["effective_requirement"],
            resolved_refs=p1["resolved_refs"], flow_id="f")
        self.assertEqual(sp["schemaVersion"], whole["schemaVersion"])
        self.assertEqual(len(sp["shots"]), len(whole["shots"]))
        self.assertEqual([s["sceneIdx"] for s in sp["shots"]], [s["sceneIdx"] for s in whole["shots"]])

    def test_edited_cast_is_phase2_single_source_M4(self):
        from brain import planner
        c = self._client()
        p1 = planner.plan_story_and_characters(c, idea="x", flow_id="f")
        edited = [dict(ch, staticFeatures="EDITED-" + str(i)) for i, ch in enumerate(p1["characters"])]
        sp = planner.plan_from_characters(c, story=p1["story"], characters=edited,
                                          effective_requirement="", resolved_refs=[], flow_id="f")
        # shotplan.characters carries the EDITED cast (so 定妆/portrait_character_dicts use it)
        self.assertEqual(sp["characters"][0]["staticFeatures"], "EDITED-0")

    def test_on_step_emitted_per_phase(self):
        from brain import planner
        seen = []
        c = self._client()
        p1 = planner.plan_story_and_characters(c, idea="x", flow_id="f", on_step=lambda s, d: seen.append(s))
        planner.plan_from_characters(c, story=p1["story"], characters=p1["characters"],
                                     effective_requirement="", resolved_refs=[], flow_id="f",
                                     on_step=lambda s, d: seen.append(s))
        self.assertIn("story", seen)
        self.assertIn("characters", seen)
        self.assertIn("scene", seen)
```

> Replace `make_fake_client()` with the suite's existing fake-client builder (look at how the current `plan_shotplan` tests construct their client; reuse it verbatim).

- [ ] **Step 2: Run to verify it fails**

Run (from `integrations/vimax/`): `python -m unittest brain.planner_test -v`
Expected: FAIL (`plan_story_and_characters` / `plan_from_characters` not defined).

- [ ] **Step 3: Implement the split** in `integrations/vimax/brain/planner.py`. Replace the body of `plan_shotplan` with two new functions + a thin wrapper:

```python
def plan_story_and_characters(client, idea, user_requirement="", style="", flow_id="",
                              skill_refs=None, skills_dir="", on_step=None, should_cancel=None):
    """Phase 1: craft selection + story + characters. Emits on_step story/characters.
    Returns {story, characters, effective_requirement, resolved_refs}."""
    from shotplan_assembly import _select_craft
    _step = on_step if callable(on_step) else (lambda *a, **k: None)
    effective_req = user_requirement or ""
    resolved_refs = list(skill_refs or [])
    if skills_dir:
        craft, resolved_refs = _select_craft({
            "skillsDir": skills_dir, "skillRefs": skill_refs or [],
            "userRequirement": user_requirement or "", "idea": idea or "",
        })
        if craft:
            effective_req = f"{effective_req}\n\n参考以下影视拍法(融入分镜与镜头语言):\n{craft}"
    _check_cancel(should_cancel)
    story = develop_story(client, idea, effective_req)
    _step("story", {"story": story})
    _check_cancel(should_cancel)
    characters = extract_characters(client, story)
    _step("characters", {"characters": characters})
    return {"story": story, "characters": characters,
            "effective_requirement": effective_req, "resolved_refs": resolved_refs}


def plan_from_characters(client, story, characters, effective_requirement="", resolved_refs=None,
                         flow_id="", on_step=None, max_workers=1, should_cancel=None, started_at=None):
    """Phase 2: script + per-scene storyboard/decompose + assemble. Emits on_step
    scene per scene. `characters` is the SINGLE source for decompose AND
    assemble_shotplan (M4: shotplan.characters carries the approved cast)."""
    import time
    from shotplan_assembly import assemble_shotplan
    _step = on_step if callable(on_step) else (lambda *a, **k: None)
    t0 = started_at if started_at is not None else time.time()
    _check_cancel(should_cancel)
    scene_scripts = write_script(client, story, effective_requirement)
    scene_artifacts = []
    for scene_idx, scene_script in enumerate(scene_scripts):
        _check_cancel(should_cancel)
        shot_descriptions = plan_scene(client, scene_script, characters, effective_requirement,
                                       max_workers=max_workers, should_cancel=should_cancel)
        scene_artifacts.append({"script": scene_script, "shot_descriptions": shot_descriptions})
        _step("scene", {"sceneIdx": scene_idx, "script": scene_script, "shots": shot_descriptions})
    return assemble_shotplan(flow_id=flow_id, story=story, characters=characters,
                             scene_artifacts=scene_artifacts, skill_refs=list(resolved_refs or []),
                             elapsed_sec=time.time() - t0)


def plan_shotplan(client, idea, user_requirement="", style="", flow_id="", skill_refs=None,
                  skills_dir="", on_step=None, max_workers=1, should_cancel=None):
    """Thin wrapper: phase1 -> phase2. Unchanged behavior for the batch / B1 /
    golden-harness paths."""
    import time
    t0 = time.time()
    p1 = plan_story_and_characters(client, idea=idea, user_requirement=user_requirement, style=style,
                                   flow_id=flow_id, skill_refs=skill_refs, skills_dir=skills_dir,
                                   on_step=on_step, should_cancel=should_cancel)
    return plan_from_characters(client, story=p1["story"], characters=p1["characters"],
                                effective_requirement=p1["effective_requirement"],
                                resolved_refs=p1["resolved_refs"], flow_id=flow_id, on_step=on_step,
                                max_workers=max_workers, should_cancel=should_cancel, started_at=t0)
```

- [ ] **Step 4: Run — new tests + the full brain suite (parity)**

Run (from `integrations/vimax/`): `python -m unittest brain.planner_test brain.golden_compare_test`
Expected: PASS (new split tests + ALL existing `plan_shotplan`/parallel/cancel/on_step tests unchanged).

- [ ] **Step 5: Commit**

```bash
git add integrations/vimax/brain/planner.py integrations/vimax/brain/planner_test.py
git commit -m "feat(vimax): B3b split brain into plan_story_and_characters + plan_from_characters"
```

---

### Task B3: orchestrator paused state + resume()

**Files:**
- Modify: `services/vimax_native_orchestrator.py`
- Test: `vimax_native_orchestrator_test.py`

- [ ] **Step 1: Write the failing tests** (append, mirroring the file's existing `_svc`/`_wait`/`QueueClient`/`GatedClient` harness)

```python
# append to vimax_native_orchestrator_test.py
    def test_plan_pauses_after_characters(self):  # B3b
        svc = _svc(QueueClient(REPLIES), self.user_dir)
        started = svc.plan({"flowId": "p", "idea": "x", "steer": True})
        st = _wait_status(svc, started["jobId"], "paused")
        self.assertEqual(st["status"], "paused")
        stages = [e["stage"] for e in st["progress"] if e.get("type") == "step"]
        self.assertEqual(stages, ["story", "characters"], "stops before scene")

    def test_resume_decomposes_with_edited_cast_and_persists(self):  # B3b + M4
        svc = _svc(QueueClient(REPLIES), self.user_dir)
        started = svc.plan({"flowId": "p", "idea": "x", "steer": True})
        _wait_status(svc, started["jobId"], "paused")
        edited = [{"idx": 0, "identifierInScene": "Alice", "isVisible": True,
                   "staticFeatures": "EDITED", "dynamicFeatures": "d"}]
        out = svc.resume(started["jobId"], edited)
        self.assertTrue(out["success"])
        st = _wait(svc, started["jobId"])
        self.assertEqual(st["status"], "done", st.get("error"))
        self.assertEqual(st["result"]["characters"][0]["staticFeatures"], "EDITED")
        run_dir = os.path.join(self.user_dir, "vimax_runs", "p")
        with open(os.path.join(run_dir, "scene_0", "characters.json"), "r", encoding="utf-8") as h:
            self.assertEqual(json.load(h)[0]["static_features"], "EDITED", "working_dir uses edited cast")

    def test_resume_non_paused_errors(self):  # B3b review#7
        svc = _svc(QueueClient(REPLIES), self.user_dir)
        self.assertEqual(svc.resume("nope", [])["status"], "not-found")

    def test_cancel_of_paused_is_terminal(self):  # B3b review#5
        svc = _svc(QueueClient(REPLIES), self.user_dir)
        started = svc.plan({"flowId": "p", "idea": "x", "steer": True})
        _wait_status(svc, started["jobId"], "paused")
        svc.cancel(started["jobId"])
        self.assertEqual(svc.job_status(started["jobId"])["status"], "cancelled")
        self.assertEqual(svc.resume(started["jobId"], [])["status"], "not-paused")

    def test_resume_rechecks_concurrency_cap(self):  # B3b review#4
        gate = threading.Event()
        svc = NativeOrchestratorService(
            user_dir_getter=lambda: self.user_dir, credentials_getter=lambda: CREDS,
            client_factory=lambda: GatedClient(REPLIES, gate), max_concurrent_plans=1)
        a = svc.plan({"flowId": "A", "idea": "x"})          # running (blocked in develop_story)
        p = svc.plan({"flowId": "B", "idea": "x", "steer": True})
        # B can't even start phase1 while A holds the only slot -> busy
        self.assertFalse(p["success"]); self.assertEqual(p["status"], "busy")
        gate.set(); _wait(svc, a["jobId"])

    def test_paused_job_reaped_after_paused_ttl(self):  # B3b review#6
        now = [1000.0]
        svc = NativeOrchestratorService(
            user_dir_getter=lambda: self.user_dir, credentials_getter=lambda: CREDS,
            client_factory=lambda: QueueClient(REPLIES), paused_ttl_seconds=100, clock=lambda: now[0])
        started = svc.plan({"flowId": "p", "idea": "x", "steer": True})
        _wait_status(svc, started["jobId"], "paused")
        now[0] = 2000.0
        svc.plan({"flowId": "q", "idea": "x"})              # plan() reaps
        self.assertEqual(svc.job_status(started["jobId"])["status"], "not-found")
```

Add the `_wait_status` helper near `_wait` at the top of the file:

```python
def _wait_status(svc, job_id, target, timeout=5):
    t0 = time.time()
    while time.time() - t0 < timeout:
        st = svc.job_status(job_id)
        if st["status"] == target or st["status"] not in ("running",):
            return st
        time.sleep(0.01)
    return svc.job_status(job_id)
```

- [ ] **Step 2: Run to verify it fails**

Run: `python -m unittest vimax_native_orchestrator_test -v`
Expected: FAIL (no `steer`, no `paused`, no `resume`, no `paused_ttl`).

- [ ] **Step 3: Implement** in `services/vimax_native_orchestrator.py`:

(a) `__init__`: add `paused_ttl_seconds=7200` → `self._paused_ttl = float(paused_ttl_seconds)`.

(b) `plan(payload)`: read `steer = bool(payload.get("steer"))`. Store it on the job dict (`"steer": steer`). The worker `_run` branches on it.

(c) Split the worker: `_run` runs phase1; if `steer`, stash phase1 result + set `paused` and STOP; else continue to phase2 (current behavior). Replace the brain call:

```python
    def _run(self, job_id, payload, client):
        _ensure_brain_on_path()
        captured = {"characters": [], "scenes": {}}
        try:
            from brain import planner

            def on_step(stage, data):
                if stage == "characters":
                    captured["characters"] = data.get("characters") or []
                elif stage == "scene":
                    captured["scenes"][int(data.get("sceneIdx") or 0)] = data.get("shots") or []
                self._emit(job_id, {"type": "step", "stage": stage, "payload": data})

            p1 = planner.plan_story_and_characters(
                client, idea=payload.get("idea", ""), user_requirement=payload.get("userRequirement", ""),
                style=payload.get("style", ""), flow_id=payload.get("flowId", ""),
                skill_refs=payload.get("skillRefs") or [], skills_dir=self._skills_dir_getter() or "",
                on_step=on_step, should_cancel=lambda: self._is_cancelled(job_id))

            if payload.get("steer"):
                with self._lock:
                    j = self._jobs.get(job_id)
                    if j is not None and not j.get("cancel"):
                        j["phase1"] = p1
                        j["status"] = "paused"
                        j["pausedAt"] = self._clock()
                    elif j is not None and j.get("cancel"):
                        j["status"] = "cancelled"; j["finishedAt"] = self._clock()
                return  # wait for resume()

            self._run_phase2(job_id, payload, client, p1, captured)
        except planner.PlanCancelled:
            self._finish(job_id, "cancelled")
        except Exception as exc:  # noqa: BLE001
            self._finish(job_id, "failed", error=str(exc))

    def _run_phase2(self, job_id, payload, client, p1, captured):
        from brain import planner
        try:
            shotplan = planner.plan_from_characters(
                client, story=p1["story"], characters=p1["characters"],
                effective_requirement=p1.get("effective_requirement", ""),
                resolved_refs=p1.get("resolved_refs") or [], flow_id=payload.get("flowId", ""),
                on_step=self._scene_emitter(job_id, captured), max_workers=self._max_workers,
                should_cancel=lambda: self._is_cancelled(job_id))
            self._persist_working_dir(job_id, payload, shotplan, captured)
            self._finish(job_id, "done", result=shotplan)
        except planner.PlanCancelled:
            self._finish(job_id, "cancelled")
        except Exception as exc:  # noqa: BLE001
            self._finish(job_id, "failed", error=str(exc))

    def _scene_emitter(self, job_id, captured):
        def on_step(stage, data):
            if stage == "scene":
                captured["scenes"][int(data.get("sceneIdx") or 0)] = data.get("shots") or []
            self._emit(job_id, {"type": "step", "stage": stage, "payload": data})
        return on_step
```

(d) `resume(job_id, characters=None)`:

```python
    def resume(self, job_id, characters=None):
        client = self._build_client()
        if client is None:
            return {"success": False, "status": "not-configured", "error": "grsai credentials not configured"}
        with self._lock:
            self._reap_locked()
            j = self._jobs.get(job_id)
            if j is None:
                return {"success": False, "status": "not-found", "error": "job not found (server may have restarted; re-plan)"}
            if j["status"] != "paused":
                return {"success": False, "status": "not-paused", "error": f"job is {j['status']}, not paused"}
            running = sum(1 for x in self._jobs.values() if x["status"] == "running")
            if running >= self._max_concurrent_plans:
                return {"success": False, "status": "busy", "error": f"native plan concurrency limit reached ({running})"}
            p1 = dict(j.get("phase1") or {})
            if characters:
                p1["characters"] = characters
            payload = {"flowId": j["flowId"], "idea": ""}  # flowId is all phase2 needs from payload
            j["status"] = "running"
        threading.Thread(target=self._run_phase2, args=(job_id, payload, client, p1, {"characters": p1.get("characters") or [], "scenes": {}}), daemon=True).start()
        return {"success": True, "jobId": job_id, "status": "running"}
```

(e) `cancel(job_id)`: when the job is `paused`, set it terminal directly (no worker to observe the flag):

```python
    def cancel(self, job_id):
        with self._lock:
            j = self._jobs.get(job_id)
            if j is None:
                return {"success": True, "status": "not-found"}
            j["cancel"] = True
            if j["status"] == "paused":
                j["status"] = "cancelled"
                j["finishedAt"] = self._clock()
            return {"success": True, "status": "cancelling" if j["status"] != "cancelled" else "cancelled"}
```

(f) `_reap_locked`: also evict paused jobs past `paused_ttl`:

```python
    def _reap_locked(self):
        now = self._clock()
        drop = []
        for jid, j in self._jobs.items():
            if j["status"] in ("done", "failed", "cancelled") and j.get("finishedAt") and (now - j["finishedAt"]) > self._job_ttl:
                drop.append(jid)
            elif j["status"] == "paused" and j.get("pausedAt") and (now - j["pausedAt"]) > self._paused_ttl:
                drop.append(jid)
        for jid in drop:
            del self._jobs[jid]
```

(g) job dict creation in `plan()`: add `"steer": False, "phase1": None, "pausedAt": None`. Set `"steer"` from the payload.

> `paused` is already excluded from the running count (the count filters `status=="running"`); a paused job frees its slot. Keep that.

- [ ] **Step 4: Run to verify it passes**

Run: `python -m unittest vimax_native_orchestrator_test -v`
Expected: PASS (existing B1.3 tests + the 6 new B3b tests).

- [ ] **Step 5: Commit**

```bash
git add services/vimax_native_orchestrator.py vimax_native_orchestrator_test.py
git commit -m "feat(vimax): B3b orchestrator paused state + resume (concurrency/cancel/TTL)"
```

---

### Task B4: /native/resume route + dispatcher + api client

**Files:**
- Modify: `services/vimax_route_service.py`, `services/http_route_dispatcher.py`, `api/canvasAgentApi.js`
- Test: `vimax_route_service_test.py`, `http_route_dispatcher_test.py`

- [ ] **Step 1: Write the failing tests**

```python
# vimax_route_service_test.py — add to FakeNative + VimaxNativeRoutesTest
    def resume(self, job_id, characters=None):
        self.calls.append(("resume", job_id, characters))
        return {"success": True, "status": "running"}

    def test_native_resume_delegates(self):
        body = json.dumps({"jobId": "nj", "characters": [{"idx": 0}]}).encode()
        resp = self.svc.handle_post(None, "/api/v2/vimax/native/resume", body)
        self.assertEqual(resp["kind"], "json_ok")
        self.assertEqual(self.native.calls[0][0], "resume")
        self.assertEqual(self.native.calls[0][1], "nj")

    def test_native_resume_requires_jobid(self):
        resp = self.svc.handle_post(None, "/api/v2/vimax/native/resume", b"{}")
        self.assertEqual(resp["kind"], "json_err")
        self.assertEqual(resp["code"], 400)
```

```python
# http_route_dispatcher_test.py — add
    def test_vimax_native_resume_post_is_allowed(self):
        vimax_service = _StubRouteService(post_response={"kind": "json_ok", "data": {"success": True}})
        dispatcher = self._build_dispatcher(
            json_service=_StubRouteService(), library_service=_StubRouteService(),
            read_body=lambda _h: b"{}", vimax_service=vimax_service)
        handled = dispatcher.handle_post(handler=None, path="/api/v2/vimax/native/resume")
        self.assertTrue(handled)
        self.assertEqual(vimax_service.post_calls, [("/api/v2/vimax/native/resume", b"{}")])
```

- [ ] **Step 2: Run to verify it fails**

Run: `python -m unittest vimax_route_service_test http_route_dispatcher_test -v`
Expected: FAIL.

- [ ] **Step 3: Implement**

`services/vimax_route_service.py` handle_post, add alongside `/native/jobs/cancel`:

```python
        if base == "/api/v2/vimax/native/resume":
            if self.native is None:
                return self._json_err(503, "native orchestrator unavailable")
            data, error = self._parse_json_object(body)
            if error is not None:
                return error
            job_id = data.get("jobId") or ""
            if not job_id:
                return self._json_err(400, "jobId is required")
            return self._json_ok(self.native.resume(job_id, data.get("characters")))
```

`services/http_route_dispatcher.py` — add `"/api/v2/vimax/native/resume"` to `_VIMAX_POST_PATHS`.

`api/canvasAgentApi.js` — add after `vimaxNativeCancel`:

```js
    vimaxNativeResume(jobId, characters) {
      return postJson(fetchImpl, "/api/v2/vimax/native/resume", { jobId, characters });
    },
```

- [ ] **Step 4: Run to verify it passes**

Run: `python -m unittest vimax_route_service_test http_route_dispatcher_test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add services/vimax_route_service.py services/http_route_dispatcher.py api/canvasAgentApi.js vimax_route_service_test.py http_route_dispatcher_test.py
git commit -m "feat(vimax): B3b /native/resume route + dispatcher whitelist + api client"
```

---

### Task B5: panel pause → 「继续」/「取消」 + per-scene incremental storyboard

**Files:**
- Modify: `modules/app/appAssistantPanel.js`
- Test: `modules/app/appAssistantPanel.vimaxNative.test.js`

- [ ] **Step 1: Write the failing tests**

```js
// append to modules/app/appAssistantPanel.vimaxNative.test.js
import { castContentToCharacters } from "../assistant/vimaxStoryCastCanvasActions.js";

function pausedThenScenes(api, castNodeContentRef) {
  // helper that returns a native job which goes: story+characters -> paused,
  // then after resume -> scene -> done. (Implementer: model on doneJob.)
}

test("B3b: native plan with steer pauses and prompts; 继续 resumes with edited cast", async () => {
  let resumed = null;
  const graphStore = makeGraphStore([
    // the cast sheet the panel landed (edited by the user); role cast
    { id: "vimax-F-cast", data: { vimaxFlowId: "F", vimaxRole: "cast",
      content: "【角色 0】Alice\n静态: EDITED\n动态: d\n出镜: 是" } },
  ]);
  let phase = 0;
  const api = {
    async vimaxNativeStatus() { return { configured: true }; },
    async vimaxNativePlan() { return { success: true, jobId: "nj", flowId: "F" }; },
    async vimaxNativeJob() {
      return phase === 0
        ? { success: true, status: "paused", progressTotal: 2,
            progress: [{ type: "step", stage: "story", payload: { story: "s" } },
                       { type: "step", stage: "characters", payload: { characters: [{ idx: 0, identifierInScene: "Alice", isVisible: true }] } }] }
        : doneJob();
    },
    async vimaxNativeResume(jobId, characters) { resumed = { jobId, characters }; phase = 1; return { success: true, status: "running" }; },
    async vimaxPlan() { return { success: true, jobId: "x" }; },
    async validateActions(p) { return { success: true, actions: p.actions }; },
  };
  const state = createAssistantPanelState({ api, graphStore, executeActions: () => ({}) });
  // turn 1: 导演 -> pauses
  const r1 = await state.sendMessage("导演:雨夜");
  assert.ok(state.pendingVimaxNativeResume, "paused -> pending set");
  assert.match(state.lastReceipt, /继续/, "prompt mentions 继续");
  // turn 2: 继续 -> reads the (edited) cast sheet, resumes
  await state.sendMessage("继续");
  assert.ok(resumed, "resume called");
  assert.equal(resumed.characters[0].staticFeatures, "EDITED", "edited cast forwarded");
  assert.equal(state.pendingVimaxNativeResume, null, "pending cleared after resume");
});

test("B3b: 继续 with an unparseable cast sheet does NOT resume (no silent fallback)", async () => {
  let resumeCalls = 0;
  const graphStore = makeGraphStore([
    { id: "vimax-F-cast", data: { vimaxFlowId: "F", vimaxRole: "cast", content: "（用户把内容删光了）" } },
  ]);
  const api = {
    async vimaxNativeStatus() { return { configured: true }; },
    async vimaxNativePlan() { return { success: true, jobId: "nj", flowId: "F" }; },
    async vimaxNativeJob() { return { success: true, status: "paused", progressTotal: 2,
      progress: [{ type: "step", stage: "story", payload: { story: "s" } },
                 { type: "step", stage: "characters", payload: { characters: [{ idx: 0, identifierInScene: "A", isVisible: true }] } }] }; },
    async vimaxNativeResume() { resumeCalls += 1; return { success: true, status: "running" }; },
    async vimaxPlan() { return { success: true, jobId: "x" }; },
    async validateActions(p) { return { success: true, actions: p.actions }; },
  };
  const state = createAssistantPanelState({ api, graphStore, executeActions: () => ({}) });
  await state.sendMessage("导演:雨夜");
  await state.sendMessage("继续");
  assert.equal(resumeCalls, 0, "did not resume on empty parse");
  assert.ok(state.pendingVimaxNativeResume, "pending kept so user can fix + retry");
  assert.match(state.lastReceipt, /未从.*解析|检查/, "clarification posted");
});

test("B3b: 取消 cancels the paused job and clears pending", async () => {
  let cancelled = false;
  const api = {
    async vimaxNativeStatus() { return { configured: true }; },
    async vimaxNativePlan() { return { success: true, jobId: "nj", flowId: "F" }; },
    async vimaxNativeJob() { return { success: true, status: "paused", progressTotal: 1,
      progress: [{ type: "step", stage: "story", payload: { story: "s" } }] }; },
    async vimaxNativeCancel() { cancelled = true; return { success: true, status: "cancelled" }; },
    async vimaxPlan() { return { success: true, jobId: "x" }; },
    async validateActions(p) { return { success: true, actions: p.actions }; },
  };
  const state = createAssistantPanelState({ api, graphStore: makeGraphStore(), executeActions: () => ({}) });
  await state.sendMessage("导演:雨夜");
  await state.sendMessage("取消");
  assert.ok(cancelled);
  assert.equal(state.pendingVimaxNativeResume, null);
});

test("B3b: normal-prose 继续 is NOT hijacked when nothing is pending", async () => {
  const api = { async chat() { return { reply: "ok", actions: [] }; } };
  const state = createAssistantPanelState({ api, graphStore: makeGraphStore() });
  const r = await state.sendMessage("继续讲下去");
  assert.equal(r?.reply, "ok", "fell through to chat, not the resume handler");
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test modules/app/appAssistantPanel.vimaxNative.test.js`
Expected: FAIL.

- [ ] **Step 3: Implement**

In `applyVimaxNativePlanCommand`, send `steer: true` in the `api.vimaxNativePlan` payload, and when the poll sees `status === "paused"`, stash + prompt + stop:

```js
    if (status && status.status === "paused") {
      state.streaming = false;
      state.pendingVimaxNativeResume = { jobId: started.jobId, flowId };
      const reply = "已生成故事 + 角色表(已落画布)。改好角色表后回复「继续」开始分镜,或回复「取消」。";
      state.messages.push({ role: "assistant", content: reply, kind: "vimax_plan" });
      state.lastReceipt = reply;
      notifyUpdate(options);
      return { reply, vimaxFlowId: flowId };
    }
```

Add a 继续/取消 handler, dispatched BEFORE `parseVimaxCommand` in `sendMessage`, gated on `state.pendingVimaxNativeResume`:

```js
    if (state.pendingVimaxNativeResume && /^\s*(继续|取消)\s*$/.test(message)) {
      return await applyVimaxNativeResumeCommand(message, options);
    }
```

```js
  async function applyVimaxNativeResumeCommand(message, options) {
    const pending = state.pendingVimaxNativeResume;
    const isCancel = /取消/.test(message);
    state.messages.push({ role: "user", content: message });
    if (isCancel) {
      try { await api.vimaxNativeCancel(pending.jobId); } catch {}
      state.pendingVimaxNativeResume = null;
      state.lastReceipt = "已取消原生规划。";
      notifyUpdate(options);
      return { reply: state.lastReceipt };
    }
    // read the (edited) cast sheet node by lineage
    const castNode = (graphStore?.nodes || []).find(
      (n) => n?.data?.vimaxRole === "cast" && n?.data?.vimaxFlowId === pending.flowId);
    const edited = castContentToCharacters(castNode?.data?.content || "");
    if (!edited.length) {
      state.lastReceipt = "未从角色表解析出角色,请检查格式(每个【角色 N】下 静态:/动态:/出镜:)后再回复「继续」。";
      notifyUpdate(options);
      return { reply: state.lastReceipt }; // keep pending; do NOT resume
    }
    let started;
    try { started = await api.vimaxNativeResume(pending.jobId, edited); }
    catch (error) { state.lastReceipt = `继续失败:${safeTrim(error?.message) || error}`; notifyUpdate(options); return null; }
    if (!started || started.success === false) {
      const s = started?.status;
      state.pendingVimaxNativeResume = null;
      state.lastReceipt = s === "not-found" ? "任务已过期,请重新「导演:」规划。" : `继续失败:${safeTrim(started?.error) || s || "未知"}`;
      notifyUpdate(options);
      return null;
    }
    state.pendingVimaxNativeResume = null;
    // resume polling: lands scene storyboard incrementally, then finalize (B2)
    return await pollVimaxNativeToDone(pending.jobId, pending.flowId, options, /*command*/ state.lastVimaxCommand);
  }
```

> **Per-scene incremental storyboard**: factor the poll-after-start loop of `applyVimaxNativePlanCommand` into `pollVimaxNativeToDone(jobId, flowId, options, command)` so both the initial command and resume reuse it. In that loop, when a `scene` step arrives (`ev.stage === "scene"`), land its shots incrementally: convert each snake decompose dict to the camelCase shape `shotActions` expects and call `landTrustedVimaxActions(flowId, shotActions(camelShot, flowId, skillRefs, anchorState), \`scene-${sceneIdx}-shot-${localIdx}\`)`. Maintain a single `anchorState = { lastPrepInScene: new Map() }` across the loop and a running global idx. The snake→camel adapter:

```js
  function nativeSnakeShotToCamel(sd, sceneIdx, globalIdx) {
    return {
      idx: globalIdx, sceneIdx, localIdx: Number.isFinite(Number(sd?.idx)) ? Number(sd.idx) : globalIdx,
      camIdx: Number(sd?.cam_idx) || 0,
      ffDesc: sd?.ff_desc || "", motionDesc: sd?.motion_desc || "",
      visualDesc: sd?.visual_desc || "", audioDesc: sd?.audio_desc || "",
      lfDesc: sd?.lf_desc || "", variationType: sd?.variation_type || "",
    };
  }
```

> On `done`, still call `finalizeVimaxPlan({ flowId, command, message, result: status.result, native: true, ... })` for the 成片 staging + lineage record. Because storyboard cards already landed incrementally with id `vimax-${flowId}-shot-${idx}` (same id `shotActions` produces), `finalizeVimaxPlan`'s actions re-create the same ids — confirm the executor treats a repeat create as idempotent (upsert) OR have `finalizeVimaxPlan` in the native steer path skip storyboard creates and only do 成片 staging. Decide in-situ; the test `doneJob` path must end `done` with `pendingVimaxRender` staged when 成片.

- [ ] **Step 4: Run to verify it passes**

Run: `node --test modules/app/appAssistantPanel.vimaxNative.test.js`
Expected: PASS (B3b panel tests + all prior native tests).

- [ ] **Step 5: Regression**

Run: `node --test modules/app/appAssistantPanel.*.test.js modules/assistant/vimax*.test.js`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add modules/app/appAssistantPanel.js modules/app/appAssistantPanel.vimaxNative.test.js
git commit -m "feat(vimax): B3b panel pause + 继续/取消 steer + per-scene incremental storyboard"
```

---

### Task B6: full regression + memory + finish

- [ ] **Step 1: Python suites**

Run (repo root): `python -m unittest vimax_native_orchestrator_test vimax_route_service_test http_route_dispatcher_test claw_action_schema_test`
Run (from `integrations/vimax/`): `python -m unittest brain.planner_test brain.golden_compare_test`
Expected: all PASS.

- [ ] **Step 2: JS suites**

Run: `node --test modules/app/appAssistantPanel.*.test.js modules/assistant/vimax*.test.js`
Expected: all PASS.

- [ ] **Step 3: Update memory** — append B3a/B3b status to `vimax-integration-20260613.md` (the `B 剩余` section): B3a/B3b done; remaining = B5 (429 probe) + real-machine steer e2e.

- [ ] **Step 4: Use the finishing-a-development-branch skill** to decide merge/PR/cleanup.

---

## Self-review (run after writing; fixed inline)

- **Spec coverage:** incremental landing (A4 story/cast, B5 scene) ✓; single pause (B3 paused + B5 prompt) ✓; cast labeled-block + tolerant parse + no-silent-fallback (A1 + B5) ✓; two-phase brain + plan_shotplan wrapper (B2) ✓; resume concurrency/cancel/TTL (B3) ✓; route/api (B4) ✓; shotActions extraction (B1) ✓; M4 edited-cast single source incl shotplan.characters (B2 test + B3 working_dir test) ✓; B4 tolerates story/cast (A3) ✓; claw -1 + comment survival (A2) ✓; zero-spend (no image calls added; chat only) ✓; HY_VIMAX_NATIVE gating (unchanged; native lane only) ✓.
- **Placeholder scan:** the two "confirm in-situ" notes (A4 Step 1 trace of the trusted apply entry; B5 finalize-vs-incremental idempotency) are genuine integration decisions against obfuscated/large panel code, not lazy placeholders — each names the exact symbols/lines to read and the decision to make. All code-bearing steps carry real code.
- **Type/name consistency:** `shotActions(shot, flowId, skillRefs, anchorState)`, `landTrustedVimaxActions(flowId, actions, label)`, `castContentToCharacters(content)`, `mapVimaxStoryToCanvasActions/{mapVimaxCastToCanvasActions}({flowId,...})`, `plan_story_and_characters`/`plan_from_characters`, `resume(job_id, characters=None)`, `pendingVimaxNativeResume`, `/api/v2/vimax/native/resume`, `vimaxNativeResume` — used consistently across tasks. `vimaxRole` values: `story`/`cast`/`card`/`prep`. `vimaxShotIdx:-1` sentinel for non-shot nodes.
