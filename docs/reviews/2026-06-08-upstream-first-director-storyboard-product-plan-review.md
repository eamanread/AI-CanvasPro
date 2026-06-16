# Product Plan Review: Upstream-First Director / Storyboard

**Reviewed document:** `D:\Aic\huanying-source-windows-20260430-122116\docs\superpowers\specs\2026-06-08-upstream-first-director-storyboard-product-plan.md`

**Review date:** 2026-06-08

**Review basis:** Upstream source under `output\upstream\AI-CanvasPro`, local rollback baseline, and `2026-06-08-upstream-first-director-storyboard-design.md`.

---

## Findings

### Fixed P1: Group run / selected run scope was easy to over-include

**Issue:** The upstream feature diff mentions group execution and selected-node execution, but the user clarified these are only in scope if required by Director or Storyboard upstream interactions.

**Fix applied:** Product plan now has an explicit Group Run / Selected Run Boundary and Scope Guard Acceptance. Baseline migration excludes `canvasExecutionEngine`, `groupRuntime`, `workflow:execute-group`, and `modules\groupExecution.js` unless a required upstream dependency is proven.

### Fixed P1: Product data model needed exact upstream defaults

**Issue:** A product plan without exact node types, default sizes, default names, and schema fields would leave implementers room to invent local defaults.

**Fix applied:** Product plan now includes upstream-derived defaults for `panorama-scene` and `storyboard-script`, including `1024 x 576`, `3D???`, `????`, `storyboardScript.version = 1`, `viewMode = list`, `mediaMode = image`, and `storyboard-script.v1` canonical JSON.

### Fixed P2: Storyboard identity boundary needed to be stricter

**Issue:** Existing local `storyboard` node, new upstream `storyboard-script` node, and assistant skill `storyboard_director` can be confused.

**Fix applied:** Product plan now states that these three concepts coexist and must not be merged, aliased incorrectly, or used as replacements for each other.

### Fixed P2: Visual implementation could drift from upstream

**Issue:** Product text that says "style the node" could be read as permission to redesign the UI.

**Fix applied:** Product plan now names the exact upstream CSS files and states no local restyling is allowed unless it is a documented path/loading fix or conflict resolution.

### Fixed P2: Acceptance criteria initially needed scope guards

**Issue:** Acceptance criteria focused on positive feature behavior but did not explicitly reject the previous non-upstream-first execution-engine scope.

**Fix applied:** Scope Guard Acceptance now requires no custom execution-engine baseline and no group runtime/event reintroduction.

---

## Residual Risks

- Storyboard Script has a large upstream dependency chain. The implementation plan must avoid stubs and must test local import closure.
- Local `main.js`, `src\core\interaction.js`, and `modules\interaction\EdgeController.js` are compact/minified; implementation must patch them minimally and verify syntax immediately.
- Director code already exists locally and matches upstream defaults, but CSS is missing locally; runtime visual smoke is still required after implementation.

---

## Review Result

No unresolved product-plan findings remain after the fixes listed above. The product plan is ready to drive a new upstream-first executable development document.
