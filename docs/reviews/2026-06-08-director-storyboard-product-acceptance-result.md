# Director / Storyboard Product Acceptance Result

Date: 2026-06-08
Project: `D:\Aic\huanying-source-windows-20260430-122116`
Example prompt used for smoke context: `翡翠楼夜宴`

## Implemented

- 3D Director character placement assets restored locally under `assets/characters/quaternius/universal-base`.
- 3D Director scene image fusion state, upload/remove actions, toolbar affordance, and runtime bridge fields are implemented.
- Storyboard Script text model selector now follows local text-generation registry semantics: any text model with `id` + `modelId` is selectable, while execution readiness still requires full API configuration.
- Storyboard Script side-plus now supports left input and right output affordances, including stable DOM selectors: `.side-plus-btn[data-side="left"]` and `.side-plus-btn[data-side="right"]`.
- Browser smoke script added at `tools/smoke/director-storyboard-product-smoke.mjs`.

## Verification

### Syntax Checks

Command:

```powershell
$files = @(
  'modules\panoramaSceneNode\sceneNode.js',
  'modules\panoramaSceneNode\sceneNodeActions.js',
  'modules\panoramaSceneNode\scene3dBridge.js',
  'components\panoramaScene\PanoramaSceneToolbar.js',
  'components\StoryboardScriptNode.js',
  'src\core\storyboardScriptFactory.js',
  'modules\modelRegistryFilters.js',
  'components\aigenText\modelRegistryRuntime.js',
  'modules\interaction\EdgeController.js',
  'src\core\renderer.js'
)
foreach ($file in $files) { & 'D:\Aic\node.exe' --check $file }
& 'D:\Aic\node.exe' --check tools\smoke\director-storyboard-product-smoke.mjs
```

Result: passed, no syntax errors.

### New Product Tests

Command:

```powershell
& 'D:\Aic\node.exe' --test panoramaCharacterAssets.test.js panoramaSceneImageFusion.test.js storyboardScriptTextModelRegistry.test.js storyboardScriptSidePlusProduct.test.js
```

Result: `20 pass / 0 fail`.

Covered:

- character GLTF bundle exists and references only copied local files;
- 3D scene image fusion default / panorama / reference-plane normalization;
- scene image actions, runtime bridge, toolbar affordances;
- text model selectable-vs-configured registry semantics;
- Storyboard Script registry imports and default state;
- Storyboard Script left/right side-plus data contract and stable selectors.

### Existing Migration Tests

Command:

```powershell
& 'D:\Aic\node.exe' --test upstreamDirectorStoryboardProduct.test.js upstreamScopeGuard.test.js storyboardScriptUpstreamFactory.test.js storyboardScriptDependencyClosure.test.js storyboardScriptToolbarAction.upstream.test.js storyboardScriptInteractionGlue.test.js appLifecycleBootWiring.test.js
```

Result: `34 pass / 0 fail`.

Covered:

- upstream director/storyboard entries remain visible and distinct;
- upstream-backed files and CSS are present;
- Storyboard Script factory/schema/prompt normalization remains compatible;
- video toolbar can create connected Storyboard Script node;
- interaction glue still accepts upstream side-plus inputs.

### Assistant / Canvas Regression

Command:

```powershell
& 'D:\Aic\node.exe' --test indexEncoding.test.js modules\assistant\canvasSkills\manifest.test.js modules\assistant\assistantCanvasSkillExecutor.test.js modules\assistant\canvasSkills\runtime.test.js modules\assistant\assistantCanvasWorkflowSkills.test.js
```

Result: `17 pass / 0 fail`.

### HTTP Asset Probe

Command:

```powershell
Invoke-WebRequest -UseBasicParsing -Uri 'http://127.0.0.1:8777/assets/characters/quaternius/universal-base/Superhero_Male_FullBody.gltf'
Invoke-WebRequest -UseBasicParsing -Uri 'http://127.0.0.1:8777/assets/characters/quaternius/universal-base/Superhero_Female_FullBody.gltf'
```

Result: male GLTF `200`, female GLTF `200`.

### Browser Product Smoke

Command:

```powershell
& 'D:\Aic\node.exe' tools\smoke\director-storyboard-product-smoke.mjs
```

Result: `pass: true`.

Evidence file: `docs/reviews/artifacts/2026-06-08-director-storyboard-product-acceptance/product-smoke-result.json`
Screenshot: `docs/reviews/artifacts/2026-06-08-director-storyboard-product-acceptance/storyboard-side-plus.png`

Smoke highlights:

- `appLoaded: true`;
- 3D Director menu entry present: `leftMenuHasDirector: true`;
- Storyboard Script menu entry present: `leftMenuHasStoryboardScript: true`;
- male and female GLTF probes both `200`;
- Storyboard Script node injected through real ESM app store path;
- Storyboard Script DOM found with class `v2-node node storyboard-script-wrapper selected v2-selected`;
- side-plus buttons visible on both sides:
  - left: `.side-plus-btn side-plus-btn--left`, `data-side="left"`;
  - right: `.side-plus-btn side-plus-btn--right`, `data-side="right"`.

## Acceptance Status

- 3D character placement: passed. Evidence: asset test `3 pass / 0 fail`, HTTP GLTF probes `200 / 200`.
- 3D scene image fusion: passed in automated acceptance. Evidence: scene image fusion tests `6 pass / 0 fail`; runtime/toolbar/action source checks included. Browser smoke verified app load and director entry, but did not manually upload a real scene image file.
- Storyboard Script model selector: passed. Evidence: registry tests confirm selectable untested text models with `modelId`, strict execution readiness remains separate, and Storyboard Script uses registry runtime helpers.
- Storyboard Script left/right side-plus: passed. Evidence: focused test confirms left/right contract and outgoing `ai-text`, `ai-image`, `ai-video`; browser smoke confirms visible left/right buttons.

## Residual Risks

- CodeGraph status: locked. Fresh MCP status check returned `Error: Tool execution failed: database is locked`, so final acceptance evidence relies on source inspection, Node tests, HTTP probes, and browser smoke rather than CodeGraph.
- Browser smoke observed one non-blocking `404`: `http://127.0.0.1:8777/images/volcengine.svg`. Smoke still passed because this icon 404 did not block app load, character assets, Storyboard Script DOM, or side-plus rendering.
- The local page shows a server disconnect warning in the body text, but the static app at `http://127.0.0.1:8777/` loaded and the tested product paths passed.
- Full manual 3D scene image upload/fusion operation remains recommended as a final human QA pass with a real image file, because automated browser smoke intentionally avoids file chooser interaction.
