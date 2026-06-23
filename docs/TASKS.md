## Tasks

### T001 Slash Preset Regression
- status: done
- priority: P0
- depends_on: []
- acceptance:
  - Typing `/` in AI text node prompt shows the preset menu.
  - Typing `/` in AI image node prompt shows the preset menu.
  - Selecting a preset removes the slash trigger and inserts the preset content into generation flow.
  - Slash menu styling and active-state behavior are consistent with node UI styling.

### T002 Image/Text Tool Model Config Audit
- status: done
- priority: P0
- depends_on: []
- acceptance:
  - Enumerate every image/text tool path that bypasses registry/global model configuration.
  - Identify whether each bypass is in UI selection, payload building, or task recovery.
  - Produce a concrete repair plan with file-level changes, migration notes, and verification strategy.

### T003 Special Provider Config Restoration
- status: done
- priority: P0
- depends_on: []
- acceptance:
  - RunningHUB special API config is restored as a dedicated settings card below Dreamina config.
  - Other non-standard providers that still depend on legacy provider-level config have dedicated cards in the same special section.
  - Saving these cards persists back into `/api/config.providers`.

### T004 Image Tool Registry Runtime Migration
- status: done
- priority: P0
- depends_on: ["T002"]
- acceptance:
  - A shared tool model resolver exists for image/text tools and prefers `selectedModelId` over legacy provider/model inference.
  - Free-angle image tool uses the node-selected registry image model when available.
  - Missing or deleted registry models are blocked with a consistent node-level message instead of silently falling back to legacy inference.

### T005 Remaining Text/Image Tool UI Cleanup
- status: done
- priority: P1
- depends_on: ["T004"]
- acceptance:
  - Free-angle and other text/image tools no longer expose or depend on hidden legacy-only model menus when node runtime is registry-backed.
  - Text/image tool capability panels derive from resolved runtime model metadata instead of raw model string prefix checks where feasible.
- validation:
  - `node --test modules\toolModelUiStateService.test.js`
  - `node --test modules\ImageFreeAngleController.registry.test.js`

### T006 Slash Preset Submenu And Custom Manager Completion
- status: done
- priority: P0
- depends_on: []
- acceptance:
  - AI image node slash menu can select a second-level system preset with the mouse.
  - AI text node slash menu can select a second-level system preset with the mouse.
  - Keyboard navigation can open a preset group and select a second-level preset.
  - Selecting a preset group only opens its submenu and never triggers generation.
  - Clicking the custom preset entry opens `/dev/preset-manager.html?nodeType=<current-node-type>`.
  - Selecting a leaf preset removes the `/` trigger, syncs node `prompt`, closes the menu, and calls `onGenerate(template)`.
  - Custom TXT presets remain leaf-only and no preset data schema changes are introduced.

### T007 Image Generation Batch Size Completion
- status: done
- priority: P0
- depends_on: []
- acceptance:
  - AI image node batch menu selections `2` and `4` persist to node store data before generation payload build.
  - Legacy image generation writes all returned batch images back to the node instead of keeping only the first image.
  - Registry-backed image generation passes the requested batch count to the submit body.
  - Registry-backed image generation performs additional submits when a provider returns fewer images than requested.
  - Related unit tests cover UI batch sync, task result writeback, and registry batch fallback.

### T008 Image Toolbar Special Workflow And Expand Tool Boundary
- status: done
- priority: P1
- depends_on: ["T005"]
- acceptance:
  - Image expand either consumes `toolModelResolutionService` for registry-backed generation or is explicitly labeled as a legacy/special workflow path that does not claim to use the node-selected registry model.
  - One-click 360 panorama and other fixed RunningHUB workflow tools use the special RunningHUB provider configuration section and do not expose UI implying they are standard registry image models.
  - Fixed-workflow tools have a documented boundary between provider-level workflow config and registry model config.
  - Existing image toolbar actions continue to work for legacy RunningHUB workflow users.
- validation:
  - `node --test modules\imageToolModelPicker.test.js modules\imageToolGenerationRuntime.test.js modules\runningHubWorkflowToolCatalog.test.js modules\imageToolbarActionInventory.test.js modules\ImageExpandController.registry.test.js api\aiImageApi.registryOpenAi.test.js`
  - `node --test modules\toolModelResolutionService.test.js modules\toolModelUiStateService.test.js modules\ImageFreeAngleController.registry.test.js`
  - `node --test api\aiImageApi.routing.test.js api\aiImageApi.registryOpenAi.test.js api\configApi.specialProviders.test.js`
  - `node --test components\aigenImage\modelRegistryRuntime.batchSize.test.js components\aigenImage\taskOrchestrationModule.registry.test.js`
  - `node --check api\aiImageApi.js`
  - `node --check components\nodeToolbar\imageToolbar.js`
  - Full `npm.cmd test` does not complete within 600 seconds; isolated timeout is `components\AIGenAudioNode.test.js`, outside the T008 image-toolbar scope.

### T009 Windows Onefile GitHub Release Packaging
- status: done
- priority: P0
- depends_on: []
- acceptance:
  - A concrete implementation plan exists at `docs/superpowers/plans/2026-04-30-windows-onefile-github-release.md`.
  - PyInstaller `--onefile` build produces a single Windows exe plus sha256 and manifest files.
  - The packaged app separates bundled read-only resources from stable writable user data.
  - Existing API request and response fields for config, settings, projects, presets, uploads, outputs, assets, workflows, and generation payloads remain compatible.
  - `/api/v2/runtime/info` preserves existing fields and adds packaged runtime diagnostics.
  - Virtual paths beginning with `output/`, `data/uploads/`, `data/assets/`, and `data/workflows/` remain serveable after onefile packaging.
  - GitHub Actions uploads the exe as a workflow artifact.
  - Pushing a `v*` tag publishes the exe, sha256, and manifest as GitHub Release assets.
- validation:
  - `python -m py_compile services\runtime_paths.py services\library_file_route_service.py services\http_route_dispatcher.py packaging\windows_onefile_launcher.py tools\build_windows_onefile.py server.py`
  - `python -m unittest server_runtime_paths_test.py library_file_route_service_test.py http_route_dispatcher_test.py`
  - `python tools\build_windows_onefile.py`
  - `powershell -ExecutionPolicy Bypass -File tools\smoke_windows_onefile.ps1`
  - Manifest audit confirmed denied roots are not listed in bundled runtime files or directories.

### T010 Registry MJ Image Generation Failure
- status: done
- priority: P0
- depends_on: []
- acceptance:
  - Registry image models configured as `mj_imagine` submit through a Midjourney proxy submit endpoint instead of posting to a raw `/v1` base URL.
  - Midjourney proxy task responses using `result` and `result.imageUrl` are parsed and persisted like other registry image outputs.
  - OpenAI-compatible image models configured with a `/v1` base URL are normalized to `/v1/images/generations`.
  - Object-shaped remote API errors no longer surface as `[object Object]`.
  - Existing registry image batch, installId passthrough, model validation, and `aiImageApi` route behavior remain covered by tests.
- validation:
  - `node --test modules\modelValidationService.test.js modules\modelValidationService.mj.test.js modules\registryImageRequestAdapter.test.js`
  - `node --test components\aigenImage\modelRegistryRuntime.installId.test.js components\aigenImage\modelRegistryRuntime.batchSize.test.js components\aigenImage\modelRegistryRuntime.mj.test.js api\aiImageApi.registryOpenAi.test.js api\errors\ApiError.message.test.js`
  - `node --check modules\registryImageRequestAdapter.js; node --check modules\modelValidationService.js; node --check components\aigenImage\modelRegistryRuntime.js; node --check api\errors\ApiError.js`

### T011 Local Subscription Persistence After Restart
- status: done
- priority: P0
- depends_on: []
- acceptance:
  - Local CDKEY activation remains active after app restart or OS reboot when the original bound network adapter is still present.
  - Subscription status can recover a persisted installId from the local license file when user settings or browser localStorage are missing.
  - A copied license remains blocked when none of the current device MAC addresses match the bound MAC.
  - Existing activation payload fields and subscription status response fields remain compatible.
- validation:
  - `python -m py_compile services\local_subscription_client.py services\subscription_client.py services\subscription_gate_service.py services\http_route_dispatcher.py server.py`
  - `python -m unittest local_subscription_client_test.py subscription_client_test.py subscription_gate_service_test.py server_subscription_proxy_test.py http_route_dispatcher_test.py`
  - `node --test modules\subscriptionAccess.test.js modules\subscriptionAccess.fields.test.js requester.subscription.test.js components\aigenImage\modelRegistryRuntime.installId.test.js`
  - `python tools\build_windows_onefile.py`
  - `powershell -ExecutionPolicy Bypass -File tools\smoke_windows_onefile.ps1`
  - Onefile runtime `/api/v2/subscription/status` returns active without an explicit installId when a valid local `license.json` exists.

### T012 Registry gpt-image-2 Image Generation Success-Message Failure
- status: done
- priority: P0
- depends_on: []
- acceptance:
  - Registry-backed image nodes using `grsai/gpt-image-2` submit through the GRSai `/v1/draw/completions` endpoint.
  - Registry-backed `gpt-image-2` task polling uses `/v1/draw/result` and can persist the returned image.
  - Success acknowledgements such as `msg: "success"` are not surfaced as image-generation failure reasons.
- validation:
  - `node --test modules\modelValidationService.test.js modules\modelValidationService.mj.test.js modules\registryImageRequestAdapter.test.js components\aigenImage\modelRegistryRuntime.installId.test.js components\aigenImage\modelRegistryRuntime.batchSize.test.js components\aigenImage\modelRegistryRuntime.mj.test.js components\aigenImage\modelRegistryRuntime.gptImage2.test.js api\aiImageApi.registryOpenAi.test.js api\errors\ApiError.message.test.js`
  - `node --test api\aiImageApi.routing.test.js`
  - `node --check modules\registryImageRequestAdapter.js`
  - `node --check modules\modelValidationService.js`
  - `node --check components\aigenImage\modelRegistryRuntime.js`
