# Implementation Plan Review: Upstream-First Director / Storyboard

**Reviewed document:** `D:\Aic\huanying-source-windows-20260430-122116\docs\superpowers\plans\2026-06-08-upstream-first-director-storyboard-implementation.md`

**Review date:** 2026-06-08

**Review basis:** Product plan, upstream source inventory, local rollback baseline, and user clarification that group/selected execution is only in scope when required by Director/Storyboard upstream interactions.

---

## Findings

### Fixed P1: Plan must not recreate the previous custom execution-engine scope

**Issue:** Any executable plan for this area can accidentally drift back to the previous `canvasExecutionEngine` / `groupRuntime` direction.

**Fix applied:** The plan now has explicit Execution Rules, Task 1 scope guard tests, Task 9 residue scan, and a group/selected run gate. `modules\groupExecution.js` is not part of baseline tasks.

### Fixed P1: Storyboard dependency closure must be explicit, not implied

**Issue:** Upstream `StoryboardScriptNode.js` imports many modules that are missing locally. A plan that only says "copy StoryboardScriptNode" would fail at runtime or encourage local stubs.

**Fix applied:** The plan lists every currently observed missing dependency, exact upstream source path, local target path, and import adaptation. Task 4 adds a dependency closure test that fails on unresolved relative imports.

### Fixed P1: Director stage should not be overwritten blindly

**Issue:** Local `panorama-scene` factory output already matches upstream default JSON. Blindly copying local Director files could regress local service/path adaptations.

**Fix applied:** Director is now a calibration task: copy missing CSS, verify default JSON equivalence, and syntax-check existing local Director files instead of overwriting them.

### Fixed P2: Product tests need to protect identity separation

**Issue:** The plan needed tests that preserve old `storyboard`, new `storyboard-script`, and assistant `storyboard_director` separation.

**Fix applied:** `upstreamDirectorStoryboardProduct.test.js` checks registry/meta/menu separation and ensures `storyboard_director` remains only in assistant config.

### Fixed P2: Browser smoke must cover no automatic provider generation

**Issue:** Video toolbar Storyboard creation should create a connected script node, not start video generation.

**Fix applied:** Browser smoke checklist now requires "No provider video generation starts automatically" after the video toolbar action.

---

## Residual Risks

- Fixed after review: Task 4 now requires copying the full upstream `manifests\*` tree as a hard baseline, not an optional fallback.
- Fixed after review: The plan now has Compact-File Patch Preflight Gates with exact locator anchors for `main.js`, `index.html`, `src\core\interaction.js`, `modules\interaction\EdgeController.js`, `components\nodeToolbar\videoToolbarHtml.js`, `components\nodeToolbar\videoToolbar.js`, and `modules\nodeMeta.js`; missing anchors require stopping for inspection.
- Fixed after review: Browser smoke now requires screenshot artifact paths for Director, Storyboard Script, and video-toolbar Storyboard creation.
- The plan is executable but not yet run as implementation; browser smoke remains future verification after code changes.

---

## Review Result

No unresolved implementation-plan findings remain after the hard manifest baseline, compact-file locator gates, and screenshot artifact requirements were added. The plan is ready for task-by-task execution.
