# ViMax B3 — Steer / 增量 (native plan lane) — Design

Date: 2026-06-14
Status: approved (brainstorming) → ready for implementation plan
Branch: feature/codex-work-20260609

## 1. Goal

Turn the native plan lane (B2) from "poll to done, map at confirm" into
**visible, steerable, incremental** planning:

- As the in-process brain streams stage events (story → characters → scene),
  land canvas nodes **incrementally** ("思考可见 / 逐步落画布") — no confirm gate
  (a plan is free; the cost gate stays on 成片/定妆).
- A **single high-leverage steer point**: pause after character extraction,
  before storyboard decomposition. The user reviews/edits the cast, then
  replies 「继续」 (or 「取消」); the storyboard decomposes against the edited cast.
- Land **richer cards**: a story card + an editable cast sheet (comment card)
  in addition to the per-shot storyboard cards from B2.

Non-goals (explicitly deferred): full pause-at-every-stage / arbitrary
injection; auto-incremental landing of 成片/定妆 (those stay external + behind
the confirm cost gate, consuming the working_dir the native plan persists).

## 2. Decisions (locked in brainstorming)

| Fork | Decision |
|---|---|
| Landing model | **Incremental auto-land** — each step lands immediately, trusted, no confirm gate |
| Steer scope | **Single pause** after characters; resume via 「继续」 |
| Cast representation | **Comment-card cast sheet** (one `comment` node, pinned `\|`-delimited cast text); edits parsed back on 「继续」 |
| Implementation | **Two-phase brain split** (no blocked threads); orchestrator gains a `paused` job state + `resume` |

## 3. Empirical findings that ground the design

- `components/CommentNoteNode.js` renders **`data.content` → innerText**
  (placeholder "双击写下注释"), is contenteditable, and writes edits back to
  `data.content` on blur. `content` is in claw's `_safe_metadata` whitelist and
  `comment` is in `SAFE_NODE_TYPES` → a comment card with `data.content` renders,
  edits, and survives claw. (Locked with a claw test, B0-style; not via the
  flaky browser.)
- `src/core/storyboardScriptFactory.js`: a `storyboard-script` node has a
  **FIXED shot-column schema** (镜号/时长/景别/场景/画面描述/角色/角色描述/角色动作/
  情绪/角色图/参考/图片提示词/视频提示词/对白/音效); `getStoryboardScriptDisplayColumns`
  renders only those. Arbitrary cast columns (角色名/静态特征/…) would be stored
  but never displayed → a B0-style empty table. **So storyboard-script CANNOT be
  reused as a generic cast grid** — the cast uses a comment card instead.
- Trust is conferred at **execute** time:
  `executeActions({executionId})` → if `executionId ∈ state.vimaxExecutionIds`
  → `source: "vimax-director"` (trusted) → claw. So per-stage incremental
  landing with trusted lineage is achievable by registering a trusted
  executionId per stage and calling `validateActions` + `executeActions`
  programmatically (no confirm drawer required).

## 4. Architecture / data flow

```
导演:idea  (HY_VIMAX_NATIVE configured → native lane)
  └─ orchestrator.plan()  → phase1 worker thread
       ├─ emit step story        ─┐  panel lands each step as it arrives,
       ├─ emit step characters   ─┤  via a per-stage TRUSTED executionId →
       └─ status := "paused"     ─┘  validateActions + executeActions → claw
                                       story      → comment card (data.content)
                                       characters → cast sheet (comment card, |-delimited text)
  panel: stash pendingVimaxNativeResume{jobId,flowId}; reply
         "改好 cast 卡后回复『继续』(或『取消』)"
  └─ 「继续」 → read cast sheet data.content → castContentToCharacters() → editedCast
       └─ api.vimaxNativeResume(jobId, editedCharacters)
            └─ orchestrator.resume() → phase2 worker thread
                 ├─ write_script(story)
                 ├─ per scene: emit step scene → panel lands storyboard-script
                 │   cards + ai-image prep (B2 trusted landing, per-scene)
                 ├─ persist working_dir USING editedCast
                 └─ status := "done"  (+ pendingVimaxRender if 成片/wantsFilm)
```

A `paused` job is NOT `running` (frees the concurrency slot) and IS reaped by
the TTL sweeper if abandoned.

## 5. Components

### 5.1 Brain — two-phase split (`integrations/vimax/brain/planner.py`)
- `plan_story_and_characters(client, idea, user_requirement, style, skills_dir, skill_refs, on_step, should_cancel)` → `{story, characters, effectiveRequirement, resolvedRefs}`. Runs `_select_craft` + `develop_story` + `extract_characters`; emits `on_step("story")`, `on_step("characters")`. (effectiveRequirement/resolvedRefs are threaded to phase2 so skills injection stays byte-identical.)
- `plan_from_characters(client, story, characters, effective_requirement, resolved_refs, flow_id, on_step, max_workers, should_cancel)` → shotplan. Runs `write_script` + per-scene `plan_scene`(storyboard+decompose) + `assemble_shotplan`; emits `on_step("scene")` per scene.
- `plan_shotplan(...)` stays as a thin wrapper (`plan_story_and_characters` → `plan_from_characters`) so the batch / non-steer path, B1 tests, and the golden harness are unchanged.
- **M4**: `plan_from_characters` uses the passed `characters` as the single source for storyboard, decompose, `assemble_shotplan(characters=editedCast)` AND working_dir — so `ff_vis_char_idxs` always align with the approved cast, and because `shotplan.characters` carries the edited cast, **定妆** (`portrait_character_dicts` reads the shotplan) uses the approved cast too, never a stale one (review: cast-parse-and-m4). Removing a character the script referenced → decompose's `ff_vis_char_idxs` may point out of range → `filter_char_idxs` drops them (existing, acceptable; noted).

### 5.2 Orchestrator (`services/vimax_native_orchestrator.py`)
- `plan()` runs phase1 in a worker; on completion sets `status="paused"`, stashes `{story, characters, effectiveRequirement, resolvedRefs}` on the job; does NOT persist working_dir yet. Cancel during phase1 → cancelled (existing should_cancel path).
- `resume(job_id, characters=None)` → under the lock, first checks the job exists and `status=="paused"`; otherwise returns a clear error with the explicit reason (`status:"not-found"` for unknown/reaped, `status:"not-paused"` with the current status otherwise). Then **re-checks the running-concurrency cap** (excluding paused) exactly as `plan()` does — N paused jobs resuming together must not breach `max_concurrent_plans` (returns `status:"busy"` if at the cap). On success: stores the provided `characters` (or the stashed ones if omitted), sets `status="running"`, spawns the phase2 worker, returns `{success:true, status:"running"}`. (review#4, #7)
- **Cancel of a paused job**: a paused job has NO running worker to observe the `cancel` flag, so `cancel()` must, when `status=="paused"`, set `status="cancelled"` directly (terminal) — not just flip the flag. A later `resume` on it then returns `not-paused`. (review#5)
- **Paused TTL**: paused is a human-in-the-loop state; reaping it at the terminal `job_ttl` (30 min) could delete a job the user is still reviewing. Use a **separate, longer `paused_ttl`** (default e.g. 2 h). `_reap_locked` evicts terminal jobs past `job_ttl` AND paused jobs past `paused_ttl`. (review#6)
- A reaped/expired paused job, or a paused job lost to a **server restart** (jobs are in-memory), → `resume` returns `not-found`; recovery is a **fresh plan** (cheap — only story+characters were spent; no working_dir written yet). The panel surfaces this, not a silent hang. (review#6, #20)
- `paused` excluded from the running-concurrency count (frees the slot while the human reviews).
- `job_status` reports `status:"paused"`; the panel reads the editable cast from the landed cast-sheet node (not from job_status), but the status drives the 「继续」 prompt.

### 5.3 Routes / API
- `POST /api/v2/vimax/native/resume` → `route_service` → `orchestrator.resume(jobId, characters)`. Dispatcher whitelist (POST). `api.vimaxNativeResume(jobId, characters)`.

### 5.4 Mappers (pure, `modules/assistant/`)
- New `vimaxStoryCastCanvasActions.js` (pure):
  - `mapVimaxStoryToCanvasActions({flowId, story})` → `create_node comment {data:{content:story, vimaxFlowId, vimaxRole:"story", vimaxShotIdx:-1}}`, placement new-lane "story".
  - `mapVimaxCastToCanvasActions({flowId, characters})` → ONE `create_node comment` "cast sheet". `data.content` is a pinned, human-editable **labeled-block** format — a one-line header documenting it, then one block per character:
    ```
    【角色 0】Alice
    静态: 三十岁，卷发
    动态: 红风衣
    出镜: 是
    ```
    Labeled blocks (NOT a single-char delimiter) so a feature value may freely contain any character including `|`, `,`, `:` — review#10 showed a `|`-delimited line breaks on `red|black outfit` / `20s|30s`. Lineage `vimaxRole:"cast"`, `vimaxFlowId`, `vimaxShotIdx:-1`. Placement new-lane "cast".
  - `castContentToCharacters(content)` → cast list. Split into blocks on the `【角色 N】<name>` header line; within a block read the `静态:` / `动态:` / `出镜:` labeled lines (value = everything after the first colon, trimmed; unknown/extra lines ignored; 出镜 → false only for 否/no/false, else true). `{idx, identifierInScene, staticFeatures, dynamicFeatures, isVisible}` with `idx` = **block order** (M4 stable; the bracket number is cosmetic). Tolerant of reordered/added/removed blocks, blank lines, trailing whitespace, and missing labels (missing → "").
  - **Empty/unparseable → NO silent fallback** (huanying canvas-authority: never decompose against a cast the user didn't approve). If `castContentToCharacters` yields zero characters, the panel does NOT call resume — it posts a clarification ("未从定妆卡解析出角色,请检查格式后重试『继续』"), keeps `pendingVimaxNativeResume` set so the user can fix the card and retry. (review#9)
- Per-scene storyboard: extract the single-shot action builder from `vimaxCanvasActions.js` (`shotRow` + the card/prep/edge triple) into a reusable `shotActions(shot, flowId, skillRefs, anchorState)` so a scene's shots can be landed incrementally (B2's full-shotplan mapper keeps delegating to it; behavior unchanged).

### 5.5 Panel (`modules/app/appAssistantPanel.js`)
- `applyVimaxNativePlanCommand` becomes incremental: on each new step in the poll, build that step's actions and land them via a per-stage trusted execution (`landNativeStep(flowId, stage, payload)`): mint `executionId`, add to `state.vimaxExecutionIds`, `validateActions` + `executeActions(source vimax-director)`.
- On `status==="paused"`: stash `state.pendingVimaxNativeResume={jobId, flowId}`, post the 「继续」prompt, stop polling.
- New parse + handler: 「继续」/「取消」 — gated on `pendingVimaxNativeResume` being set (a separate gate from `parseVimaxCommand`, so a normal-prose 继续 is never hijacked; review#18). 「继续」 reads the cast sheet comment node's `data.content` (by `vimaxFlowId`+`vimaxRole:"cast"`), `castContentToCharacters`. **If parse yields zero characters → post the clarification, keep pending, do NOT resume** (review#9). Otherwise `api.vimaxNativeResume(jobId, editedCast)`, clear pending, resume polling phase2 (lands scene steps; finalize: pendingVimaxRender if 成片, working_dir note). 「取消」 → `api.vimaxNativeCancel` + clear pending. A `not-found`/`busy`/`not-paused` resume response is surfaced (re-plan / retry), never a silent hang.
- Trusted-lineage parity: each incremental landing is its own trusted execution; the final 成片 staging is unchanged (reads working_dir under the same flowId).

## 6. Cost & safety

- A plan (story + characters + storyboard) makes only **chat** calls (no image
  draws). Incremental auto-landing creates nodes only; **zero spend**. The cost
  gate (sign → cap → draw, 确认成片/确认定妆) is untouched.
- Every landed node goes through claw with trusted `vimax-director` lineage —
  no untrusted/forge path (the B0 lesson). prep nodes stay `autoStart:false`.
- A plan **cancelled during phase1 or abandoned at the pause** (paused, never
  resumed, eventually reaped) has **no working_dir persisted** (it's only written
  in phase2). So 成片/定妆 (external, read on-disk artifacts) cannot run for it —
  correct behavior: the user never approved the cast, so no render-ready state
  exists; recovery is a fresh plan. (review#20)
- Per-stage trusted executionIds accumulate in `state.vimaxExecutionIds`. At ~2–3
  ids/flow this is minor (verifier: the trust gate already blocks replay of any
  id not in the set), but the 「继续」/done handlers clear this flow's ids when the
  plan terminates, to keep the set bounded across a long session. (review, minor)

## 7. Testing

- Brain: `plan_story_and_characters` + `plan_from_characters` compose to the
  same shotplan as `plan_shotplan` (fake client); M4 (edited cast → decompose
  ff_vis_char_idxs align); on_step emission per phase.
- Mappers: cast sheet round-trip (`content text ↔ characters`, idx stable,
  出镜↔isVisible, tolerant parse of malformed/blank/header lines, empty→fallback);
  story + cast comment card claw survival (real claw, B0-style); extracted
  `shotActions` parity (B2 mapper output unchanged).
- Orchestrator: paused→resume lifecycle (fake client) — plan() → paused with
  cast; resume(editedCast) → done; resume non-paused → error; cancel while
  paused; paused job reaped past TTL; working_dir written from editedCast.
- Routes/dispatcher: native/resume delegation + whitelist; api method.
- Panel: incremental landing per step (each a trusted execution); paused →
  prompt + pending; 继续 reads cast sheet → resume → scene cards land; 取消 →
  cancel + clear; 成片 staging after resume; persistError surfaced.
- Reconcile (B4): the incrementally-landed canvas (story + cast + storyboard)
  passes the health invariants (extend the profile if new node roles need it).

## 8. Rollout

Behind the existing `HY_VIMAX_NATIVE` flag (native lane only). External lane
and all non-native flows are untouched. No new env flags.

## 9. Open implementation notes

- B4 `canvasActionProfile` already tolerates story/cast comment nodes IF they
  carry the `vimaxShotIdx:-1` sentinel: `lineageComplete` passes
  (`isFiniteInt(-1)` is true, flowId+role present) and `cardPrepPaired` already
  counts only `vimaxRole==="card"|"prep"`, so story/cast (roles "story"/"cast")
  don't perturb it (review verifier confirmed). Required work is therefore small:
  (a) add a B4 test for a canvas with story+cast+shot nodes asserting HEALTHY,
  (b) fix the misleading `lineageComplete` comment to note non-shot roles are
  intentionally lineage-complete via the -1 sentinel. Do NOT add role-branching
  logic that isn't needed.
- `vimaxShotIdx:-1` sentinel for non-shot nodes (story/cast): the review
  EMPIRICALLY confirmed claw passes -1 (whitelisted field, no value validation;
  tested -1 round-trips). Lock it with a claw test (`vimaxShotIdx:-1` survives),
  alongside the story/cast comment claw-survival test.

## 10. Implementation sequencing (for writing-plans)

Decompose into two shippable increments (incremental validation; each is
independently testable + revertible):

- **B3a — incremental landing (no steer yet).** Two-phase brain split +
  `shotActions` extraction + story/cast/scene mappers + panel lands each step as
  it streams (trusted per-stage execution). Orchestrator may run phase1→phase2
  straight through (auto-resume internally) so nothing pauses yet. Delivers
  "思考可见 / 逐步落画布" with the lowest risk. B4 test for the richer canvas.
- **B3b — the steer pause.** Orchestrator `paused` state + `resume` (+ the §5.2
  concurrency/cancel/TTL rules) + `/native/resume` route + api + the panel
  pause prompt + 「继续」/「取消」 + `castContentToCharacters` (labeled-block parse,
  no-silent-fallback) + the M4 tests.

## 11. Design-review provenance

A 4-dimension adversarial review (run before implementation) returned 20
findings; 7 were a review misframe (flagging not-yet-built spec items —
`resume()`/two-phase split/mappers "don't exist" — as defects; expected, that IS
the work). The genuine refinements adopted above: resume concurrency re-check
(#4), cancel-of-paused → terminal (#5), separate longer paused TTL + restart/
abandon → re-plan (#6, #20), labeled-block cast format to escape `|`-collision
(#10), no-silent-fallback on empty cast parse (#9), explicit resume error states
(#7), bounded executionId set, and the B4/claw test clarifications (#8/#12/#16/
#17/#19 → "sentinel already works; add tests, don't over-engineer").
