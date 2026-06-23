# Canvas Skills Real API Smoke Contract

The real API smoke verifies that the Agent can use configured models and submit a real image generation request through the Canvas Skills path. It does not require final generated image pixels.

## Entrypoints

Standalone:

```powershell
powershell -ExecutionPolicy Bypass -File tools\run_canvas_agent_real_api_smoke.ps1 -Mode Module
powershell -ExecutionPolicy Bypass -File tools\run_canvas_agent_real_api_smoke.ps1 -Mode Browser
powershell -ExecutionPolicy Bypass -File tools\run_canvas_agent_real_api_smoke.ps1 -Mode All
```

R5 optional:

```powershell
powershell -ExecutionPolicy Bypass -File tools\run_canvas_agent_r5_regression.ps1 -Url http://127.0.0.1:8777 -Out output\regression\assistant-live-r5-real-smoke -RealApiSmoke -RealApiSmokeMode Module
powershell -ExecutionPolicy Bypass -File tools\run_canvas_agent_r5_regression.ps1 -Url http://127.0.0.1:8777 -Out output\regression\assistant-live-r5-real-smoke-strict -RealApiSmoke -RealApiSmokeMode All -FailOnSmokeFailure
```

## Credential Rule

Smoke reads only existing application/project configuration. Do not pass API keys, tokens, authorization headers, passwords, or credentials as CLI parameters.

## Pass Rule

Default pass requires:

1. A configured text-node model is selected.
2. Agent chat/stream connects through the text model before image submission.
3. A configured image-node model is selected.
4. An editable image node draft is created through Canvas Skills.
5. Image generation submission is accepted.

Accepted submission evidence can be any of:

- task id such as `taskId`, `jobId`, `requestId`, `rhTaskId`, `dreaminaSubmitId`, or `asyncTaskId`;
- image node state `submitted`, `queued`, `running`, or `generating`;
- Canvas Skills receipt with queued or started generation node ids.

## Browser Mode

Browser mode must open the real Agent panel, type into `.hy-canvas-agent-input`, click `[data-canvas-agent-control='send']`, observe streaming/done through `debugSnapshot`, and verify a `skill_trace` card or submitted image node state. Screenshot existence alone is not a pass.

When the live graph snapshot has not yet persisted the submitted node state, Browser mode may also accept `debugSnapshot().assistant.lastReceiptDetails.queuedGenerationNodeIds` or `startedGenerationNodeIds` as submission evidence, but only together with a `skill_trace` card and a completed stream.

## Failure Categories

- `CONFIG_MISSING_TEXT_MODEL`
- `CONFIG_MISSING_IMAGE_MODEL`
- `AUTH_FAILED`
- `QUOTA_EXHAUSTED`
- `PROVIDER_REJECTED`
- `NODE_CREATE_FAILED`
- `GENERATION_SUBMIT_FAILED`
- `TIMEOUT`
- `SECRET_SCAN_FAILED`
- `UNKNOWN`

## Artifact Contract

Artifact schema: `canvas-agent-real-api-smoke-v1`

Key fields:

- `mode`
- `status`
- `failureCategory`
- `timeoutMs`
- `textModel`
- `imageModel`
- `createdNodeId`
- `submission`
- `warnings`
- `secretScan`

Artifacts are redacted before write. `secretScan.status` must be `passed` for valid smoke artifacts. R5 artifact validation rejects optional `real-api-smoke.json` when its secret scan failed.

## Tests

```powershell
& 'D:\Aic\node.exe' --test --test-concurrency=1 tools\assistant_real_api_smoke.test.mjs tools\assistant_live_artifact_validator.test.mjs tools\run_canvas_agent_r5_regression.test.mjs
```
