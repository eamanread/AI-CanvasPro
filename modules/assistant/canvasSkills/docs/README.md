# Canvas Skills Module

`modules/assistant/canvasSkills/` is the Agent panel's loadable canvas capability module. It centralizes skill ids, schemas, runtime adapters, tracing, asset helpers, and smoke-test helpers.

## Entry Points

- `index.js`: public module exports.
- `manifest.js`: stable skill ids and capability manifest.
- `registry.js`: action-to-skill mapping and confirmation helpers.
- `loader.js`: ready/degraded runtime loading.
- `runtime.js`: adapter assembly around existing canvas APIs.
- `executor.js`: re-export of the schema-backed assistant canvas executor.
- `schemas/`: image/text/video field contracts and validation.
- `tracing/`: redaction, trace recording, and `skill_trace` card creation.
- `assets/`: category/search/import/dedupe/reference-health helpers.
- `smoke/`: module/browser real API smoke support.

## Runtime Boundary

The executor is orchestration only. It should reuse existing application behavior:

- Create drafts through `createNodeAtCursor`.
- Update nodes through graph store update APIs.
- Submit generation through mounted renderer instances with `_onGenerate` or `onGenerate`.
- Apply workflows through existing workflow service/canvas adapters.
- Persist assets through the existing asset manager or `saveAssetToServer` compatible APIs.

Do not add direct parallel writes that bypass normal user flows.

## Degraded Mode

`loadCanvasSkillsRuntime()` returns chat-only degraded mode when required canvas dependencies are absent. The degraded runtime keeps `executeActions` callable but returns `success: false` with the notice used by the Agent panel.

## Tests

Focused module tests:

```powershell
& 'D:\Aic\node.exe' --test --test-concurrency=1 modules\assistant\canvasSkills\manifest.test.js modules\assistant\canvasSkills\loader.test.js modules\assistant\canvasSkills\runtime.test.js modules\assistant\canvasSkills\executor.test.js
```

Schema, trace, asset, and smoke tests are documented in the adjacent contract files.
