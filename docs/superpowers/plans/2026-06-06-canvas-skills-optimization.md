# Canvas Skills Optimization Implementation Plan

> For agentic workers: REQUIRED SUB-SKILL: use superpowers:subagent-driven-development, or use superpowers:executing-plans when implementing inline. Execute this document phase by phase. Do not skip RED/GREEN verification. Do not start coding until the user confirms this implementation document.

Goal: 基于 docs/superpowers/specs/2026-06-06-canvas-skills-optimization-design.md，把 Canvas Skills 优化落成可开发、可测试、可回滚、可验收的工程方案，让 Agent 面板高效、准确、安全地调用画布节点、资产、工作流和真实生成链路。

Architecture: 新模块集中在 modules/assistant/canvasSkills/。原有 modules/assistant/assistantCanvas*.js 先作为兼容层保留，并逐步委托到新模块。Agent 面板只通过 manifest、schema、runtime、adapter、trace、asset service 调用画布功能；执行必须复用现有节点创建、节点更新、生成、资产、工作流 API，禁止绕过正常用户操作链路直接写“伪节点”。

Tech Stack: JavaScript ESM, Node built-in test runner, PowerShell wrapper, existing Huanying browser runtime, existing API config/model registry/image generation APIs, existing R5 regression wrapper.

Status: 待实施。2026-06-06 本次开发尝试产生的代码已先回退；本文件用于下一次确认后再开始编码。

---

## 1. 本次先回退的范围

已删除本次实现尝试新增内容：

- tools/assistant_real_api_smoke.test.mjs
- modules/assistant/canvasSkills/

已恢复到本次实现尝试前形态：

- modules/assistant/assistantCanvasSkillRegistry.js
- modules/assistant/assistantCanvasParameterMapper.js
- modules/assistant/assistantCanvasParameterMapper.test.js

已运行回退验证：

    & 'D:\Aic\node.exe' --test --test-concurrency=1 modules\assistant\assistantCanvasSkillRegistry.test.js modules\assistant\assistantCanvasParameterMapper.test.js modules\assistant\assistantCanvasSkillExecutor.test.js

当前验证结果：10 个测试通过。

下一次正式开发前必须再次确认：

    Test-Path tools\assistant_real_api_smoke.test.mjs
    Test-Path modules\assistant\canvasSkills

期望两个结果均为 False。

---

## 2. 落地原则

必须遵守：

- Agent 调用画布时必须走现有画布、节点、资产、工作流 API，效果要等价于用户在 UI 中操作。
- Skills 是独立模块，但本版本仍放在当前项目内发布，降低打包和部署风险。
- 先做真实 API early smoke，再做大范围迁移，提前发现配置、模型、额度、接口兼容问题。
- Schema 是 Agent 写节点参数的唯一可信来源；Agent 只能写 supported 字段。
- planned、deprecated、internal、未知字段、密钥字段都不能写入节点数据。
- 真实 API smoke 默认只要求“文本模型可对话 + 图片生成请求已提交”，不等最终出图。
- Early baseline smoke 必须验证真实 Agent Chat API / Streaming 文本链路，再执行图片节点创建和提交；不能只直连图片接口。
- Early baseline smoke 只允许新增 tools/ 下的独立脚本和测试，禁止在 Phase 1 创建 modules/assistant/canvasSkills/，避免把“旧链路基线验证”污染成新模块验证。
- Trace、卡片、日志只保存脱敏摘要，不保存密钥、原始请求头、长 base64、签名 URL、完整敏感 prompt。
- Skills 加载失败时，聊天保持可用，但画布操作禁用，并提示：画布 Skills 未加载，当前只能聊天，不能操作画布。

本版本不做：

- 不做真实视频生成 smoke。
- 不把 API Key 作为 smoke CLI 参数传入。
- 不做语义向量资产搜索的硬依赖。
- 不强制等待最终图片文件。
- 不一次性删除原有 assistantCanvas*.js 兼容文件。
- 不把资产重复检测升级到感知哈希或 embedding 去重；本版先做轻量去重。

---

## 3. 目标目录结构

    modules/assistant/canvasSkills/
      index.js
      manifest.js
      loader.js
      registry.js
      executor.js
      runtime.js

      schemas/
        index.js
        field.js
        imageNode.schema.js
        textNode.schema.js
        videoNode.schema.js
        workflow.schema.js
        asset.schema.js
        schemaValidator.js
        schemaIntrospection.js

      adapters/
        nodeLifecycleAdapter.js
        rendererBridgeAdapter.js
        workflowAdapter.js
        assetStoreAdapter.js
        promptPresetAdapter.js
        modelRegistryAdapter.js

      tracing/
        skillTraceRecorder.js
        skillTraceRedactor.js
        skillTraceCards.js

      assets/
        assetCatalog.js
        assetSearchIndex.js
        assetImportService.js
        assetDuplicateDetector.js
        assetReferenceHealth.js

      smoke/
        realApiSmokeRunner.js
        realApiSmokeReporter.js
        realApiSmokeArtifacts.js
        realApiSmokeSecretScan.js

      docs/
        README.md
        manifest.contract.md
        schema.contract.md
        smoke-test.contract.md

兼容层保留并逐步委托：

- modules/assistant/assistantCanvasSkillRegistry.js
- modules/assistant/assistantCanvasSkillExecutor.js
- modules/assistant/assistantCanvasParameterMapper.js
- modules/assistant/assistantCanvasReferenceBinder.js
- modules/assistant/assistantCanvasAssetSkills.js
- modules/assistant/assistantCanvasWorkflowSkills.js
- modules/app/appAssistantPanel.autoload.js

Phase 1 特例：Early baseline smoke 是迁移前的旧链路验证，只能创建：

- tools/assistant_real_api_smoke.test.mjs
- tools/assistant_real_api_smoke.mjs
- tools/run_canvas_agent_real_api_smoke.ps1

Phase 1 不能创建 modules/assistant/canvasSkills/ 下的任何文件。smoke reporter、artifact、secret scan 逻辑先内聚在 tools/assistant_real_api_smoke.mjs 内，Phase 8 再迁移或委托到 modules/assistant/canvasSkills/smoke/。

Browser smoke 复用现有 live harness 选择器，优先在 tools/assistant_panel_live_screenshot_check.mjs 的 selector 体系上扩展，不重新造一套不一致的浏览器定位规则：

- launcher: #fabBtn, .hy-canvas-agent-launcher
- panel: .hy-canvas-agent-panel
- input: .hy-canvas-agent-panel .hy-canvas-agent-input
- send: [data-canvas-agent-control='send']
- model: [data-canvas-agent-control='model']
- cards: .hy-canvas-agent-card
- receipt: .hy-canvas-agent-receipt

Browser smoke 必须通过 window.__huanyingCanvasAgentAssistant.state.debugSnapshot() 和图状态检查真实执行结果，不能只靠截图存在判断通过。

---

## 4. 调用链

    用户输入
      -> appAssistantPanel
      -> Agent Chat API / Streaming
      -> actions / skill calls
      -> canvasSkills loader
      -> manifest + registry
      -> node schemas
      -> runtime adapters
      -> canvasSkills executor
      -> 现有节点创建/更新/生成 API
      -> 现有资产 API
      -> 现有工作流 API
      -> redacted skill traces
      -> 回复下方执行明细卡片

关键要求：Executor 只做编排，不私自绕过现有画布 API。创建节点走 createNodeAtCursor，生成走已挂载节点实例的 _onGenerate 或 onGenerate，资产保存走 saveAssetToServer，工作流应用走 applyWorkflowToCanvas。

---

## 5. 核心数据契约

### 5.1 Skill Manifest

文件：modules/assistant/canvasSkills/manifest.js

必须包含：

- schemaVersion: canvas-skills-manifest-v1
- moduleId: huanying.canvasSkills
- version: 1.0.0
- capabilities: node, generation, reference, workflow, asset, trace, smoke
- skills 列表覆盖：imageNode、textNode、videoNode、node.bindReferences、workflow.apply/save/update、asset.list/use/add

技能 ID 必须稳定：

- imageNode.createDraft
- imageNode.update
- imageNode.bindReferences
- imageNode.applyPreset
- imageNode.generate
- textNode.createDraft
- textNode.update
- textNode.bindReferences
- textNode.applyPreset
- textNode.generate
- videoNode.createDraft
- videoNode.update
- videoNode.bindReferences
- videoNode.applyPreset
- videoNode.generate
- node.bindReferences
- workflow.apply
- workflow.save
- workflow.update
- asset.list
- asset.use
- asset.add

导出函数和对象必须稳定：

    export const CANVAS_SKILLS_MANIFEST = { ... }
    export const CANVAS_SKILL_IDS = { imageCreateDraft: "imageNode.createDraft", ... }
    export function createCanvasSkillRegistry(manifest = CANVAS_SKILLS_MANIFEST) { ... }
    export function findCanvasSkill(skillId, manifest = CANVAS_SKILLS_MANIFEST) { ... }

兼容要求：assistantCanvasSkillRegistry.js 继续导出 CANVAS_SKILL_IDS、createAssistantCanvasSkillRegistry、shouldConfirmCanvasSkillBatch、skillIdForAiAction 等旧名字。

### 5.2 Field Schema

字段必须包含：

- key
- label
- type
- status: supported、planned、deprecated、internal
- nodeTypes
- aliases
- mapsTo
- agentWritable
- uiReusable
- redaction
- min / max / defaultValue when applicable
- description

Agent 写入规则：

- supported 且 agentWritable 不为 false：可以写入 patch。
- planned：只提示“识别但暂不支持写入”，不能进 patch。
- deprecated：可读兼容，默认不能生成新写入。
- internal：不能写，不能暴露给 Agent 生成。
- unknown：不能写，返回 warning。
- secret-like：不能写，结果里不能出现原始值。

### 5.3 Validation Result

验证器返回结构：

    {
      patch: { prompt: "用户输入的提示词", modelId: "image-model-id", batchSize: 4 },
      acceptedFields: ["prompt", "modelId", "batchSize"],
      rejectedFields: ["seed", "apiKey"],
      warnings: [
        "Field seed is planned for ai-image and was not written.",
        "Field apiKey is secret-like and was not written."
      ]
    }

Schema/validator 必须导出：

    export function getCanvasNodeSchema(nodeType) { ... }
    export function listWritableFields(nodeType) { ... }
    export function validateNodeParameters({ nodeType, action, existingData, modelRegistry }) { ... }
    export function introspectSupportedFields({ nodeType, nodeDefaults, mapperSnapshot, uiControlSnapshot, modelRegistry }) { ... }

模型字段校验规则：

- model、modelName、modelDisplayName 只能作为输入别名，最终 patch 只能写 modelId/provider。
- modelId 必须通过 modelRegistryAdapter 校验为已配置模型。
- image node 只能使用 image-capable 且当前图片节点生成链路可用的模型。
- text node 只能使用 text-capable、configured、且不是 image/video/tool generation 模型的文本模型。
- video node 只能使用 video-capable 且当前视频节点链路可用的模型。
- 未配置、节点类型不匹配、不可生成的模型必须 rejected warning，不能写入 patch。

Schema 维护规则：

- supported 字段不能只靠人工清单；必须由现有 mapper、节点默认配置、UI 控件默认值、模型注册表共同 seed/introspect，再人工确认。
- planned 字段来自产品需求，识别但不可写。
- 每个节点 schema 测试必须包含“真实 mapper 行为和 schema 支持字段一致”的漂移检测。
- 如果自动抽取发现字段不在人工 schema 中，测试必须失败并输出字段名，开发者必须选择 supported/planned/deprecated/internal 之一。

### 5.4 Runtime Result

Executor 返回结构：

    {
      success: true,
      appliedCount: 3,
      createdNodeIds: ["ai-image-1"],
      updatedNodeIds: ["ai-image-1"],
      createdEdgeIds: ["assistant-ref-role-ai-image-1-0"],
      queuedGenerationNodeIds: ["ai-image-1"],
      startedGenerationNodeIds: ["ai-image-1"],
      failedGenerationNodeIds: [],
      skippedVideoGenerationNodeIds: [],
      generationTasks: [],
      canvasSkillReceipts: [
        { skillId: "imageNode.createDraft", ok: true, nodeId: "ai-image-1" },
        { skillId: "imageNode.bindReferences", ok: true, nodeId: "ai-image-1", referenceCount: 2 },
        { skillId: "imageNode.generate", ok: true, nodeId: "ai-image-1", taskId: "task-xxx" }
      ],
      skillTraces: [],
      warnings: [],
      actionNodeIdMap: { img: "ai-image-1" }
    }

### 5.5 Trace Card

Trace card 保存脱敏摘要：

    {
      id: "trace-xxx",
      messageId: "assistant-message-xxx",
      skillId: "imageNode.createDraft",
      title: "创建图片节点",
      status: "success",
      nodeId: "ai-image-1",
      nodeType: "ai-image",
      modelDisplayName: "即梦图片模型",
      paramsSummary: {
        promptPreview: "一只赛博朋克风格的猫...",
        aspectRatio: "16:9",
        quality: "high",
        batchSize: 4
      },
      referencesSummary: { total: 2, uploaded: 1, canvasNodes: 1, assets: 0 },
      durationMs: 320,
      warnings: [],
      startedAt: "2026-06-06T12:00:00.000Z",
      endedAt: "2026-06-06T12:00:00.320Z"
    }

### 5.6 Asset Record

资产记录推荐结构：

    {
      id: "asset-xxx",
      name: "红衣女主角",
      category: "character",
      tags: ["女主", "红衣", "古风"],
      sourceType: "canvas_result",
      sourceNodeId: "image-123",
      resultId: "result-456",
      fileName: "role.png",
      url: "/assets/role.png",
      thumbnailUrl: "/assets/thumb-role.png",
      promptPreview: "脱敏后的提示词摘要",
      modelDisplayName: "即梦图片模型",
      createdAt: "2026-06-06T12:00:00.000Z",
      updatedAt: "2026-06-06T12:00:00.000Z",
      lastUsedAt: "",
      favorite: false,
      pinned: false,
      duplicateKey: "canvas_result:image-123:result-456",
      contentHash: "",
      perceptualHash: "",
      embeddingId: "",
      semanticIndexStatus: "not_indexed",
      referenceHealth: "ok"
    }

### 5.7 Real API Smoke Artifact

真实 API 冒烟产物结构：

    {
      schemaVersion: "canvas-agent-real-api-smoke-v1",
      mode: "Module",
      status: "passed",
      failureCategory: "",
      timeoutMs: 90000,
      textModel: { provider: "model_registry", id: "text-model-1", displayName: "Text Model A", configured: true },
      imageModel: { provider: "registry-openai", id: "image-model-1", displayName: "Image Model A", configured: true },
      createdNodeId: "ai-image-1",
      submission: { accepted: true, taskId: "task-xxx", nodeState: "submitted" },
      warnings: [],
      secretScan: { status: "passed", totalFindings: 0 }
    }

---

## 6. 分阶段实施计划

## Phase 0: Baseline And Guardrails

目标：确认回退后的代码是干净基线，避免在错误状态上继续开发。

Files:

- Read: docs/superpowers/specs/2026-06-06-canvas-skills-optimization-design.md
- Read: docs/agent_canvas_skills.md
- Read: modules/assistant/assistantCanvasSkillExecutor.js
- Read: modules/app/appAssistantPanel.autoload.js
- No production code edits.

Steps:

- [ ] 运行残留检查。

        Test-Path tools\assistant_real_api_smoke.test.mjs
        Test-Path modules\assistant\canvasSkills

  Expected: both return False.

- [ ] 运行当前兼容层回归。

        & 'D:\Aic\node.exe' --test --test-concurrency=1 modules\assistant\assistantCanvasSkillRegistry.test.js modules\assistant\assistantCanvasParameterMapper.test.js modules\assistant\assistantCanvasSkillExecutor.test.js

  Expected: all tests pass.

Acceptance: 无新增实现残留，兼容层测试通过。

Rollback: 本 phase 不改代码，无需 rollback。

---

## Phase 1: Early Real API Baseline Smoke On Current Path

目标：在迁移新模块前，用现有 Agent 面板和现有运行链路做最小真实 API 冒烟，提前验证真实配置、文本模型、图片模型、额度、接口兼容性。

Files:

- Create: tools/assistant_real_api_smoke.test.mjs
- Create: tools/assistant_real_api_smoke.mjs
- Create: tools/run_canvas_agent_real_api_smoke.ps1
- Do not modify in this phase: tools/run_canvas_agent_r5_regression.ps1. R5 integration happens in Phase 8.

Key dependencies:

- api/canvasAgentApi.js
- modules/assistant/assistantStreamingClient.js
- modules/assistant/assistantProtocol.js
- modules/assistant/assistantContextBuilder.js
- api/configApi.js
- modules/assistant/assistantModelRegistry.js
- modules/modelRegistryService.js
- api/aiImageApi.js
- modules/assistant/assistantCanvasSkillExecutor.js
- modules/app/appAssistantPanel.autoload.js
- Existing renderer generation entrypoints: _onGenerate / onGenerate

Test first:

- [ ] Create test `realApiSmoke: selects first configured text-node model`.

        const model = selectSmokeTextModel({
          registryModels: [
            { id: "img-1", nodeType: "image", configured: true },
            { id: "text-1", nodeType: "text", configured: true, capabilities: ["text"] }
          ]
        });
        assert.equal(model.id, "text-1");

- [ ] Create test `realApiSmoke: missing text model returns CONFIG_MISSING_TEXT_MODEL`.

        const result = await runRealApiSmoke({ mode: "Module", adapters: fakeAdapters({ textModels: [] }) });
        assert.equal(result.status, "failed");
        assert.equal(result.failureCategory, "CONFIG_MISSING_TEXT_MODEL");

- [ ] Create test `realApiSmoke: selects first usable image-node model`.

        const model = selectSmokeImageModel({
          imageModels: [
            { id: "img-unconfigured", nodeType: "image", configured: false },
            { id: "img-1", nodeType: "image", configured: true, usableByImageNode: true }
          ]
        });
        assert.equal(model.id, "img-1");

- [ ] Create test `realApiSmoke: calls chatStream before image submission`.

        const calls = [];
        const result = await runRealApiSmoke({
          mode: "Module",
          prompt: "生成一张冒烟测试图片",
          adapters: fakeAdapters({
            onChatStream() {
              calls.push("chatStream");
              return [
                { type: "message.delta", delta: "我来创建图片节点。" },
                { type: "action.proposed", actions: [{ type: "create_node", nodeType: "ai-image", prompt: "smoke image" }] },
                { type: "message.done", reply: "已提交。", actions: [{ type: "create_node", nodeType: "ai-image", prompt: "smoke image" }] }
              ];
            },
            onSubmitGeneration() {
              calls.push("submitGeneration");
              return { taskId: "task-1", nodeState: "submitted" };
            }
          })
        });
        assert.deepEqual(calls, ["chatStream", "submitGeneration"]);
        assert.equal(result.textModel.connected, true);
        assert.equal(result.submission.accepted, true);

- [ ] Create test `realApiSmoke: accepted image submission supports task id and submitted states`.

        for (const state of ["submitted", "queued", "running", "generating"]) {
          assert.equal(isAcceptedSmokeSubmission({ nodeState: state }), true);
        }
        assert.equal(isAcceptedSmokeSubmission({ taskId: "task-1" }), true);

- [ ] Create test `realApiSmoke: artifact redactor removes Authorization, Bearer, apiKey, token query string, long base64`.

        const redacted = redactSmokeArtifact({
          headers: { Authorization: "Bearer sk-test-secret" },
          apiKey: "sk-test-secret",
          url: "https://x.test/file.png?token=abc&X-Amz-Signature=def",
          image: "data:image/png;base64," + "a".repeat(2000)
        });
        assert.doesNotMatch(JSON.stringify(redacted), /sk-test-secret|Bearer|X-Amz-Signature|a{1000}/);

RED command:

    & 'D:\Aic\node.exe' --test --test-concurrency=1 tools\assistant_real_api_smoke.test.mjs

Implementation:

- [ ] Implement normalized failure categories: CONFIG_MISSING_TEXT_MODEL, CONFIG_MISSING_IMAGE_MODEL, AUTH_FAILED, QUOTA_EXHAUSTED, PROVIDER_REJECTED, NODE_CREATE_FAILED, GENERATION_SUBMIT_FAILED, TIMEOUT, SECRET_SCAN_FAILED, UNKNOWN.
- [ ] Select text model from first valid configured text-node model only.
- [ ] Select image model from first valid configured image-node model/catalog model only.
- [ ] Do not accept raw key/token CLI input.
- [ ] Implement `selectSmokeTextModel`, `selectSmokeImageModel`, `isAcceptedSmokeSubmission`, `redactSmokeArtifact`, `scanSmokeArtifactForSecrets`, `runRealApiSmoke`.
- [ ] `runRealApiSmoke` must call Agent Chat API / Streaming through createCanvasAgentApi().chatStream when available; if stream route is unavailable, it may fall back to chat(), but artifact must record fallback: true.
- [ ] The text model pass condition is not only “model exists”; it must receive either message.delta/message.done, a normalized reply, or a proposed action from the real Agent response.
- [ ] If text model call fails before any normalized response, map failure to AUTH_FAILED, QUOTA_EXHAUSTED, PROVIDER_REJECTED, TIMEOUT, or UNKNOWN.
- [ ] Module-mode smoke sequence:
  1. Load existing config snapshot or fetch /api/config.
  2. Select text model.
  3. Select image model.
  4. Build a minimal Agent request using buildAssistantCanvasContext and buildAssistantRequest from existing assistant protocol.
  5. Send a real Agent chatStream/chat request with the selected text model and smallest prompt.
  6. Parse reply/actions and require at least one normalized reply, action.proposed, or message.done.
  7. Convert the returned image intent/action through current assistantCanvasSkillExecutor path; if the model returns no image action, create the minimal image action only as a smoke fallback and record fallbackImageAction: true.
  8. Create editable image draft through the current runtime adapter.
  9. Submit image generation through current node generation path.
  10. Accept task id, queued/submitted/running/generating node state, or queued receipt.
  11. Write artifact under output/regression/real-api-smoke/early-baseline/.
  12. Run scoped secret scan.
- [ ] Implement PowerShell wrapper with default Mode Module. In Phase 1, only Module is executable; Browser and All are added in Phase 8 after browser runner and canvasSkills runtime exist.
- [ ] Keep all Phase 1 smoke helper implementation in tools/assistant_real_api_smoke.mjs; do not import from modules/assistant/canvasSkills because that module does not exist yet in this phase.

GREEN command:

    & 'D:\Aic\node.exe' --test --test-concurrency=1 tools\assistant_real_api_smoke.test.mjs

Manual smoke when real config is available:

    powershell -ExecutionPolicy Bypass -File tools\run_canvas_agent_real_api_smoke.ps1 -Mode Module

Pass means one of:

- task id exists: taskId, jobId, requestId, rhTaskId, dreaminaSubmitId, asyncTaskId.
- node state is submitted, queued, running, or generating.
- execution receipt reports queued/submitted generation node id.

Default timeout: 90 seconds.

Acceptance: Missing config gives exact category; success artifact is redacted; standalone smoke exits non-zero on failure; no final image wait required.
Extra acceptance: Artifact proves the order `textModel.chat -> imageNode.createDraft -> imageNode.generate`; if text call is skipped, status must be failed unless an explicit unit-test fixture is used.

Rollback: Delete only smoke files introduced in this phase; do not touch existing Agent panel behavior.

---

## Phase 2: Independent Canvas Skills Skeleton

目标：建立独立模块边界，但暂不大规模改变行为。

Files:

- Create: modules/assistant/canvasSkills/index.js
- Create: modules/assistant/canvasSkills/manifest.js
- Create: modules/assistant/canvasSkills/registry.js
- Create: modules/assistant/canvasSkills/runtime.js
- Create: modules/assistant/canvasSkills/loader.js
- Create: modules/assistant/canvasSkills/manifest.test.js
- Create: modules/assistant/canvasSkills/loader.test.js
- Modify: modules/assistant/assistantCanvasSkillRegistry.js

Test first:

- [ ] Create test `canvasSkills manifest: exposes schema version and stable skill ids`.

        assert.equal(CANVAS_SKILLS_MANIFEST.schemaVersion, "canvas-skills-manifest-v1");
        assert.equal(CANVAS_SKILL_IDS.imageCreateDraft, "imageNode.createDraft");
        assert.equal(CANVAS_SKILL_IDS.videoGenerate, "videoNode.generate");
        assert.ok(createCanvasSkillRegistry().get("asset.add"));

- [ ] Create test `legacy registry delegates to canvasSkills registry`.

        const legacy = createAssistantCanvasSkillRegistry();
        const modern = createCanvasSkillRegistry();
        assert.deepEqual([...legacy.keys()].sort(), [...modern.keys()].sort());

- [ ] Create test `loader returns chat-only degraded runtime when canvas dependencies are missing`.

        const runtime = loadCanvasSkillsRuntime({ adapters: {} });
        assert.equal(runtime.ready, false);
        assert.equal(runtime.chatOnly, true);
        assert.equal(runtime.notice, "画布 Skills 未加载，当前只能聊天，不能操作画布。");
        const result = await runtime.executeActions({ actions: [{ type: "create_node", nodeType: "ai-image" }] });
        assert.equal(result.success, false);
        assert.equal(result.appliedCount, 0);

RED command:

    & 'D:\Aic\node.exe' --test --test-concurrency=1 modules\assistant\canvasSkills\manifest.test.js modules\assistant\canvasSkills\loader.test.js

Implementation:

- [ ] Move constants and registry logic into canvasSkills/manifest.js and canvasSkills/registry.js.
- [ ] Keep assistantCanvasSkillRegistry.js as compatibility layer.
- [ ] Implement loadCanvasSkillsRuntime with ready and degraded results.
- [ ] Export from canvasSkills/index.js:

        export { CANVAS_SKILLS_MANIFEST, CANVAS_SKILL_IDS } from "./manifest.js";
        export { createCanvasSkillRegistry } from "./registry.js";
        export { loadCanvasSkillsRuntime } from "./loader.js";
        export { createCanvasSkillsRuntime } from "./runtime.js";

Ready result:

    { ready: true, chatOnly: false, notice: "", manifest, registry, schemas, executeActions }

Degraded result:

    {
      ready: false,
      chatOnly: true,
      notice: "画布 Skills 未加载，当前只能聊天，不能操作画布。",
      manifest,
      registry,
      executeActions: async () => ({ success: false, appliedCount: 0, warnings: [notice] })
    }

GREEN command:

    & 'D:\Aic\node.exe' --test --test-concurrency=1 modules\assistant\canvasSkills\manifest.test.js modules\assistant\canvasSkills\loader.test.js modules\assistant\assistantCanvasSkillRegistry.test.js

Acceptance: 新模块可独立 import；老文件 import 不断；Loader 失败不影响聊天；degraded runtime 不伪造画布成功。

Rollback: Revert compatibility layer to Phase 0 implementation; delete modules/assistant/canvasSkills/; run Phase 0 focused tests.

---

## Phase 3: Node Parameter Schema And Validator

目标：让 Agent 精确知道图片、文本、视频节点支持哪些参数，不能再靠猜。

Files:

- Create: modules/assistant/canvasSkills/schemas/field.js
- Create: modules/assistant/canvasSkills/schemas/imageNode.schema.js
- Create: modules/assistant/canvasSkills/schemas/textNode.schema.js
- Create: modules/assistant/canvasSkills/schemas/videoNode.schema.js
- Create: modules/assistant/canvasSkills/schemas/index.js
- Create: modules/assistant/canvasSkills/schemas/schemaValidator.js
- Create: modules/assistant/canvasSkills/schemas/schemaIntrospection.js
- Create: modules/assistant/canvasSkills/schemas/schemaValidator.test.js
- Create: modules/assistant/canvasSkills/schemas/schemaIntrospection.test.js
- Modify if needed: modules/assistant/assistantCanvasParameterMapper.test.js

Supported fields:

- Image: prompt, modelId, provider, aspectRatio, imageSize, quality, batchSize, references, presetId, presetName, template, inputs.
- Text: prompt, modelId, provider, references, presetId, presetName, template, inputs.
- Video: prompt, modelId, provider, duration, fps, resolution, references, presetId, presetName, template, inputs.

Planned fields:

- Image: negativePrompt, seed, steps, guidanceScale, sampler, style, lora, controlNet, referenceWeights, background, safetyLevel.
- Text: temperature, topP, maxTokens, systemPrompt, responseFormat, tools, memoryPolicy.
- Video: cameraMotion, motionStrength, firstFrame, lastFrame, negativePrompt, seed, aspectRatio, style, audio, loop, transition.

Secret/internal blocklist:

- apiKey, api_key, authorization, headers, token, proxyToken, secret, password, credential, cookie.

Test first:

- [ ] Create test `schemaValidator: supported image fields become patch`.

        const result = validateNodeParameters({
          nodeType: "ai-image",
          action: { prompt: "cat", modelId: "img-1", aspectRatio: "16:9", batchSize: 4 },
          modelRegistry: fakeModelRegistry({ image: [{ id: "img-1", configured: true }] })
        });
        assert.deepEqual(result.patch, { prompt: "cat", modelId: "img-1", aspectRatio: "16:9", batchSize: 4 });
        assert.deepEqual(result.rejectedFields, []);

- [ ] Create test `schemaValidator: supported text and video fields become patch`.

        const textResult = validateNodeParameters({
          nodeType: "ai-text",
          action: { prompt: "写分镜", modelId: "text-1", presetName: "分镜" },
          modelRegistry: fakeModelRegistry({ text: [{ id: "text-1", configured: true }] })
        });
        assert.equal(textResult.patch.modelId, "text-1");
        assert.equal(textResult.patch.presetName, "分镜");
        const videoResult = validateNodeParameters({
          nodeType: "ai-video",
          action: { prompt: "镜头推进", modelId: "video-1", duration: 5, fps: 24, resolution: "1080p" },
          modelRegistry: fakeModelRegistry({ video: [{ id: "video-1", configured: true }] })
        });
        assert.equal(videoResult.patch.duration, 5);
        assert.equal(videoResult.patch.fps, 24);

- [ ] Create test `schemaValidator: planned fields warn only and never enter patch`.

        const result = validateNodeParameters({
          nodeType: "ai-image",
          action: { prompt: "cat", seed: 123, negativePrompt: "rain" },
          modelRegistry: fakeModelRegistry()
        });
        assert.equal(result.patch.seed, undefined);
        assert.equal(result.patch.negativePrompt, undefined);
        assert.match(result.warnings.join("\n"), /seed.*planned|negativePrompt.*planned/);

- [ ] Create test `schemaValidator: secret fields do not leak in JSON stringify`.

        const result = validateNodeParameters({
          nodeType: "ai-image",
          action: { apiKey: "sk-secret-1234567890", headers: { Authorization: "Bearer hidden" } },
          modelRegistry: fakeModelRegistry()
        });
        assert.doesNotMatch(JSON.stringify(result), /sk-secret|Bearer hidden/);
        assert.deepEqual(result.acceptedFields, []);

- [ ] Create test `schemaValidator: unknown fields are rejected with warnings`.

        const result = validateNodeParameters({
          nodeType: "ai-text",
          action: { prompt: "write", inventedFlag: true },
          modelRegistry: fakeModelRegistry()
        });
        assert.equal(result.patch.inventedFlag, undefined);
        assert.deepEqual(result.rejectedFields, ["inventedFlag"]);

- [ ] Create test `schemaValidator: model aliases resolve only to configured same-node model`.

        const result = validateNodeParameters({
          nodeType: "ai-image",
          action: { modelName: "Text Model A" },
          modelRegistry: fakeModelRegistry({
            text: [{ id: "text-1", displayName: "Text Model A", configured: true }],
            image: [{ id: "img-1", displayName: "Image Model A", configured: true }]
          })
        });
        assert.equal(result.patch.modelId, undefined);
        assert.match(result.warnings.join("\n"), /model.*not usable.*ai-image|model.*node type/i);

- [ ] Create test `schemaIntrospection: mapper-supported fields must be classified in schema`.

        const drift = introspectSupportedFields({
          nodeType: "ai-image",
          mapperSnapshot: { writableKeys: ["prompt", "modelId", "batchSize", "newUiField"] },
          uiControlSnapshot: { writableKeys: ["quality"] },
          nodeDefaults: { prompt: "", modelId: "", batchSize: 1, quality: "standard" }
        }).unclassifiedFields;
        assert.deepEqual(drift, ["newUiField"]);

RED command:

    & 'D:\Aic\node.exe' --test --test-concurrency=1 modules\assistant\canvasSkills\schemas\schemaValidator.test.js modules\assistant\canvasSkills\schemas\schemaIntrospection.test.js

Implementation:

- [ ] Implement getCanvasNodeSchema(nodeType).
- [ ] Implement listWritableFields(nodeType).
- [ ] Implement alias resolution, e.g. model and modelName to modelId.
- [ ] Implement validateModelField({ nodeType, modelId/modelName/model, modelRegistry }) and call it before modelId enters patch.
- [ ] Implement schemaIntrospection that compares mapperSnapshot, uiControlSnapshot, nodeDefaults, and model registry capability metadata against schema states.
- [ ] Normalize number ranges: batchSize integer 1-8, duration positive number, fps positive number.
- [ ] Reject unknown/planned/internal/secret fields with warnings.
- [ ] Redact warning payloads; warnings may include field names but not values.
- [ ] Mark newly discovered unclassified fields as test failures, not silent warnings.

GREEN command:

    & 'D:\Aic\node.exe' --test --test-concurrency=1 modules\assistant\canvasSkills\schemas\schemaValidator.test.js modules\assistant\canvasSkills\schemas\schemaIntrospection.test.js

Acceptance: Schema covers image/text/video minimum fields; planned fields recognized but not written; secret-shaped values cannot appear in validation result; schema drift from current mapper/UI defaults fails tests until classified; modelId is written only when configured and node-type compatible.

Rollback: Remove schemas/ directory; keep Phase 2 manifest/loader if already green.

---

## Phase 4: Schema-Backed Mapper And Executor Integration

目标：让旧 action 与新 skill call 的参数都经过 schema，不再由散落 allowlist 决定。

Files:

- Modify: modules/assistant/assistantCanvasParameterMapper.js
- Modify: modules/assistant/assistantCanvasParameterMapper.test.js
- Modify: modules/assistant/assistantCanvasSkillExecutor.js
- Create or modify: modules/assistant/canvasSkills/executor.js
- Modify: modules/assistant/assistantCanvasSkillExecutor.test.js

Test first:

- [ ] Mapper rejects planned image fields seed and negativePrompt.
- [ ] Mapper does not write planned text sampling controls temperature and maxTokens.
- [ ] Executor keeps editable AI draft clean when model invents shell, inventedFlag, secret fields.
- [ ] Mapper rejects modelId that is not configured for the target node type.
- [ ] Existing create/update/generate executor tests continue passing.

Required test shape:

    test("assistantCanvasParameterMapper: rejects model id from the wrong node type", () => {
      const result = mapAssistantNodeParameters({
        nodeType: "ai-image",
        action: { modelId: "text-1" },
        modelRegistry: fakeModelRegistry({
          text: [{ id: "text-1", configured: true }],
          image: [{ id: "img-1", configured: true }]
        })
      });
      assert.equal(result.patch.modelId, undefined);
      assert.match(result.warnings.join("\n"), /model.*ai-image|not usable/i);
    });

RED/GREEN command:

    & 'D:\Aic\node.exe' --test --test-concurrency=1 modules\assistant\assistantCanvasParameterMapper.test.js modules\assistant\assistantCanvasSkillExecutor.test.js modules\assistant\canvasSkills\schemas\schemaValidator.test.js

Implementation:

- [ ] Import validateNodeParameters into mapper.
- [ ] Mapper merges existing safe defaults only after schema validation.
- [ ] Preserve compatibility behavior for model, modelId, modelName, but store only supported schema target fields.
- [ ] Thread modelRegistry/modelRegistryAdapter into mapper and executor so model validation uses real configured models, not a hard-coded allowlist.
- [ ] Executor calls mapper for create/update/generate action payloads.
- [ ] Executor emits warnings into canvasSkillReceipts and trace input.

Acceptance: Existing safe behavior remains; planned fields are no longer silently written; unknown direct fields and secret fields are blocked.

Rollback: Restore previous mapper/executor compatibility layer from Phase 0; keep schema read-only if isolated.

---

## Phase 5: Runtime Adapters And App Loading

目标：将 Canvas Skills runtime 接入 Agent 面板 autoload，使面板通过 runtime 操作画布；缺依赖时自动降级。

Files:

- Create: modules/assistant/canvasSkills/adapters/nodeLifecycleAdapter.js
- Create: modules/assistant/canvasSkills/adapters/rendererBridgeAdapter.js
- Create: modules/assistant/canvasSkills/adapters/workflowAdapter.js
- Create: modules/assistant/canvasSkills/adapters/assetStoreAdapter.js
- Create: modules/assistant/canvasSkills/adapters/promptPresetAdapter.js
- Create: modules/assistant/canvasSkills/adapters/modelRegistryAdapter.js
- Modify: modules/assistant/canvasSkills/runtime.js
- Modify: modules/assistant/canvasSkills/loader.js
- Modify: modules/app/appAssistantPanel.autoload.js
- Modify: modules/app/appAssistantPanel.autoload.test.js

Adapter rules:

- Node creation uses createNodeAtCursor from live canvas node flows.
- Node generation uses renderer instance _onGenerate / onGenerate.
- Workflow uses applyWorkflowToCanvas, saveNewWorkflowFromCanvas, saveUpdatedWorkflowFromCanvas.
- Asset save uses saveAssetToServer and existing asset manager/store.
- Prompt preset uses existing applyPromptPresetToPromptEl behavior.
- Model registry reads existing project config/model registry only.

Test first:

- [ ] Runtime creates image draft through existing node flow.
- [ ] Runtime submits generation through mounted renderer instance.
- [ ] Autoload injects runtime into assistant action execution.
- [ ] Autoload shows chat-only notice when canvas skills cannot load.
- [ ] Degraded runtime blocks canvas execution but api.chat/api.chatStream remains usable.
- [ ] appAssistantPanel passes `canvasSkillsRuntime.chatOnly === true` into UI state and shows exactly `画布 Skills 未加载，当前只能聊天，不能操作画布。`.

Required degraded-load test shape:

    test("appAssistantPanel.autoload: degraded canvas skills keeps chat available and blocks canvas execution", async () => {
      const runtime = loadCanvasSkillsRuntime({ adapters: {} });
      const controller = installAppAssistantPanel({
        canvasSkillsRuntime: runtime,
        api: fakeChatApi({ reply: "我可以继续聊天，但不能操作画布。" })
      });
      assert.equal(controller.state.debugSnapshot().canvasSkills.chatOnly, true);
      await controller.state.sendMessage("你好");
      const result = await runtime.executeActions({ actions: [{ type: "create_node", nodeType: "ai-image" }] });
      assert.equal(result.success, false);
      assert.match(result.warnings.join("\n"), /画布 Skills 未加载/);
    });

RED/GREEN command:

    & 'D:\Aic\node.exe' --test --test-concurrency=1 modules\assistant\canvasSkills\loader.test.js modules\app\appAssistantPanel.autoload.test.js

Acceptance: Agent 面板正常加载时 runtime 可用；缺少 node flow / renderer bridge 时不崩溃、不伪成功；用户看到明确提示。
Extra acceptance: debugSnapshot exposes `canvasSkills: { ready, chatOnly, notice }`; degraded notice is rendered as a transient 3-second notice, not as a persistent chat message or fake execution receipt.

Rollback: Revert appAssistantPanel.autoload.js integration only; runtime module 可保留但不接入 UI。

---

## Phase 6: Execution Trace Recorder, Redactor, Cards

目标：用户能看到“Agent 做了什么”，并且不会泄露密钥或敏感长内容。

Files:

- Create: modules/assistant/canvasSkills/tracing/skillTraceRedactor.js
- Create: modules/assistant/canvasSkills/tracing/skillTraceRecorder.js
- Create: modules/assistant/canvasSkills/tracing/skillTraceCards.js
- Create: modules/assistant/canvasSkills/tracing/skillTraceRedactor.test.js
- Create: modules/assistant/canvasSkills/tracing/skillTraceRecorder.test.js
- Create: modules/app/appAssistantPanel.skillTraceCards.test.js
- Modify: modules/app/appAssistantPanel.js
- Modify: modules/assistant/assistantConversationStore.js
- Modify: modules/assistant/assistantAuditExport.js

Trace retention:

- Normal conversation stores redacted trace summaries only。
- Raw prompts, raw provider responses, raw headers, file bytes, signed URLs are not persisted。
- Conversation deletion deletes trace cards with that conversation。
- Debug/export artifacts are redacted again before write。
- UI provides a clear local trace clear action if a separate debug log exists。

Test first:

- [ ] Redactor removes apiKey, Authorization, Bearer token, signed URL query, long base64.
- [ ] Trace recorder records start/end/status/duration/warnings.
- [ ] Trace card summarizes created node, bound references, selected model, generation count.
- [ ] Panel renders skill_trace card under assistant reply.
- [ ] Conversation store persists only redacted trace summaries.
- [ ] Conversation deletion removes skill_trace cards stored with that conversation.
- [ ] Clear local trace history action removes any debug trace log outside normal conversation messages.
- [ ] Audit export redacts again before writing.

Required trace tests:

    test("assistantConversationStore: deleting conversation removes skill trace cards", () => {
      const store = createAssistantConversationStore({ storage: memoryStorage() });
      const conv = store.create();
      store.appendMessage(conv.id, {
        role: "assistant",
        content: "已完成",
        cards: [{ type: "skill_trace", traceId: "trace-1", paramsSummary: { promptPreview: "cat" } }]
      });
      store.deleteConversation?.(conv.id);
      assert.equal(JSON.stringify(store.exportAll?.() || store.list?.() || [] ).includes("trace-1"), false);
    });

    test("skillTraceRecorder: clearLocalTraceHistory clears external debug log", () => {
      const recorder = createSkillTraceRecorder({ store: memoryTraceStore() });
      recorder.record({ id: "trace-1", skillId: "imageNode.createDraft" });
      recorder.clearLocalTraceHistory();
      assert.deepEqual(recorder.listLocalTraceHistory(), []);
    });

RED/GREEN command:

    & 'D:\Aic\node.exe' --test --test-concurrency=1 modules\assistant\canvasSkills\tracing\skillTraceRedactor.test.js modules\assistant\canvasSkills\tracing\skillTraceRecorder.test.js modules\app\appAssistantPanel.skillTraceCards.test.js modules\assistant\assistantConversationStore.test.js modules\assistant\assistantAuditExport.test.js

Implementation:

- [ ] Wrap skill execution with trace start/end.
- [ ] Convert receipts to trace records.
- [ ] Redact before storing.
- [ ] Add skill_trace card rendering in existing message card renderer.
- [ ] Keep confirmation cards separate from execution detail cards.
- [ ] Confirmation card remains expanded only when user must approve; execution detail card defaults collapsed.

Acceptance: 用户能看到创建节点、绑定引用、模型、生成数量、提交状态；详情可展开/收起；prompt 只显示短摘要；所有导出和存储都脱敏。

Rollback: Disable rendering of skill_trace card type; keep execution receipts unaffected.

---

## Phase 7: Enhanced Asset Library For @ 我的资产

目标：让 Agent 和 @ 我的资产 可读、可用、可新增，并支持分类、搜索、标签、批量导入、轻量去重、引用失效提示。

Files:

- Create: modules/assistant/canvasSkills/assets/assetCatalog.js
- Create: modules/assistant/canvasSkills/assets/assetSearchIndex.js
- Create: modules/assistant/canvasSkills/assets/assetDuplicateDetector.js
- Create: modules/assistant/canvasSkills/assets/assetImportService.js
- Create: modules/assistant/canvasSkills/assets/assetReferenceHealth.js
- Create: modules/assistant/canvasSkills/assets/assetCatalog.test.js
- Create: modules/assistant/canvasSkills/assets/assetSearchIndex.test.js
- Create: modules/assistant/canvasSkills/assets/assetImportService.test.js
- Modify: modules/assistant/assistantCanvasAssetSkills.js
- Modify: modules/assistant/assistantMentionResolver.js
- Modify: modules/assistant/assistantMentionContext.js
- Modify: modules/app/appAssistantPanel.js if needed for mention menus/cards

Default categories:

- character: 角色
- scene: 场景
- object: 物品
- clothing: 服装
- style: 风格
- custom: 自定义

Search rules:

- name contains query.
- tag contains query.
- category equals filter.
- source node id equals filter.
- pinned first, favorite second, recently used third.
- semantic fields exist but semanticIndexStatus stays not_indexed in this version.

Batch import rules:

- Canvas-result batch save first.
- Local multi-file import supports image assets first: PNG, JPEG, WebP, GIF. SVG 默认禁用；只有确认现有资产 pipeline 已有 sanitize/安全渲染能力后才允许开启。
- Local multi-file import 必须由用户通过文件选择器或拖拽授权触发，Agent 不能根据本地路径自行读取用户磁盘文件。
- Default max 50 files per batch and 25 MB per file unless existing app limit is stricter.
- Partial success: imported, skipped duplicate, failed, unsupported counted separately.
- Duplicate skipped by default.
- No implicit overwrite.
- Imported files must pass MIME sniffing and extension validation; mismatch returns per-file failure reason.
- The service must use the existing upload/save asset API or existing asset manager pipeline; do not invent a parallel local file store.

Test first:

- [ ] Category extensibility: default categories plus future custom category.
- [ ] Search by name/tag/category/source node.
- [ ] Local import reports partial success and skips duplicates.
- [ ] Local import rejects unapproved local path strings when no user File object or authorized drag payload exists.
- [ ] SVG import is rejected unless safe SVG support flag is true.
- [ ] MIME/extension mismatch is rejected with a per-file reason.
- [ ] Reference health warns deleted source node and broken thumbnail.
- [ ] @ 我的资产 empty state appears inside second-level menu, not top-level menu.

Required local-import tests:

    test("assetImportService: rejects path-only local import without user-selected File", async () => {
      const result = await importLocalAssets({ files: ["D:\\\\secret\\\\cat.png"] });
      assert.equal(result.imported.length, 0);
      assert.equal(result.failed[0].reason, "USER_FILE_AUTH_REQUIRED");
    });

    test("assetImportService: rejects svg unless safe pipeline flag is enabled", async () => {
      const result = await importLocalAssets({
        files: [fakeFile("logo.svg", "image/svg+xml", "<svg></svg>")],
        safeSvgEnabled: false
      });
      assert.equal(result.unsupported[0].reason, "SVG_NOT_ENABLED");
    });

RED/GREEN command:

    & 'D:\Aic\node.exe' --test --test-concurrency=1 modules\assistant\canvasSkills\assets\assetCatalog.test.js modules\assistant\canvasSkills\assets\assetSearchIndex.test.js modules\assistant\canvasSkills\assets\assetImportService.test.js modules\assistant\assistantCanvasAssetSkills.test.js modules\assistant\assistantMentionResolver.test.js modules\assistant\assistantMentionContext.test.js

Implementation:

- [ ] Normalize assets to the asset record contract.
- [ ] Add category/tag search services.
- [ ] Add lightweight duplicate detector using assetId, url, fileName, sourceNodeId + resultId, duplicateKey.
- [ ] Add import service for canvas-result batch save and local multi-file import.
- [ ] Require user-authorized File/Blob payloads for local import; reject raw local path strings.
- [ ] Gate SVG behind an explicit safeSvgEnabled capability from the existing asset pipeline.
- [ ] Use existing saveAssetToServer / asset manager APIs for persistence and thumbnail reuse.
- [ ] Add reference health service.
- [ ] Wire asset.list, asset.use, asset.add to new asset services.
- [ ] Ensure @ 我的资产 menu shows empty state inside the second-level menu.

Acceptance: @ 我的资产 can list categories even when empty; Agent can read/use/add assets through skills; search works; batch import result card shows imported/skipped/failed/unsupported counts; path-only local imports are blocked; SVG is blocked unless existing safe pipeline supports it; broken references warn but do not break chat.

Rollback: Revert mention resolver integration first; keep asset services isolated until UI stable.

---

## Phase 8: Full Real API Smoke And R5 Integration

目标：在新 canvasSkills runtime 下验证真实文本模型和图片提交链路，并可选接入 R5。

Files:

- Create: modules/assistant/canvasSkills/smoke/realApiSmokeRunner.js
- Create: modules/assistant/canvasSkills/smoke/realApiSmokeReporter.js
- Create: modules/assistant/canvasSkills/smoke/realApiSmokeArtifacts.js
- Create: modules/assistant/canvasSkills/smoke/realApiSmokeSecretScan.js
- Modify: tools/assistant_real_api_smoke.mjs
- Modify: tools/run_canvas_agent_real_api_smoke.ps1
- Modify: tools/run_canvas_agent_r5_regression.ps1
- Modify: tools/assistant_panel_live_screenshot_check.mjs for Browser smoke mode if selectors/checks need extension
- Modify: tools/assistant_live_artifact_validator.test.mjs if artifact set schema changes
- Modify: docs/PI_CANVAS_AGENT_P0_P4_COMPLETION_AUDIT.md only if R5 artifact contract changes

R5 flags:

- RealApiSmoke
- RealApiSmokeMode Module|Browser|All
- FailOnSmokeFailure

Behavior:

- Standalone smoke: strict; failure exits non-zero.
- R5 with RealApiSmoke and without FailOnSmokeFailure: soft failure; artifact records failure but wrapper can continue.
- R5 with FailOnSmokeFailure: strict failure.

Test first:

- [ ] Create test `realApiSmokeRunner: module mode goes through canvasSkills runtime`.
- [ ] Create test `realApiSmokeRunner: browser mode submits prompt through Agent panel and observes skill trace card`.
- [ ] R5 real API smoke defaults to soft failure.
- [ ] R5 real API smoke can fail strictly.
- [ ] Secret scan covers smoke artifacts and fails on leaked authorization.
- [ ] Artifact set includes smoke result when flag enabled.

Required browser-mode test shape:

    test("realApiSmokeRunner: browser mode verifies panel-to-node submission", async () => {
      const result = await runRealApiSmoke({
        mode: "Browser",
        url: "http://127.0.0.1:8777",
        browserHarness: fakeBrowserHarness({
          selectors: getR5JourneySelectors(),
          debugSnapshots: [
            { assistant: { streaming: true } },
            { assistant: { streaming: false, messages: [{ role: "assistant", cards: [{ type: "skill_trace" }] }] }, graph: { nodes: [{ id: "img-1", type: "ai-image", generationStatus: "submitted" }] } }
          ]
        })
      });
      assert.equal(result.status, "passed");
      assert.equal(result.mode, "Browser");
      assert.equal(result.submission.accepted, true);
    });

RED command:

    & 'D:\Aic\node.exe' --test --test-concurrency=1 tools\assistant_real_api_smoke.test.mjs tools\assistant_live_artifact_validator.test.mjs

GREEN command:

    & 'D:\Aic\node.exe' --test --test-concurrency=1 tools\assistant_real_api_smoke.test.mjs tools\assistant_live_artifact_validator.test.mjs

Manual real config verification:

    powershell -ExecutionPolicy Bypass -File tools\run_canvas_agent_real_api_smoke.ps1 -Mode Module
    powershell -ExecutionPolicy Bypass -File tools\run_canvas_agent_real_api_smoke.ps1 -Mode All

R5 soft:

    powershell -ExecutionPolicy Bypass -File tools\run_canvas_agent_r5_regression.ps1 -Url http://127.0.0.1:8777 -Out output\regression\assistant-live-r5-real-smoke -RealApiSmoke -RealApiSmokeMode Module

R5 strict:

    powershell -ExecutionPolicy Bypass -File tools\run_canvas_agent_r5_regression.ps1 -Url http://127.0.0.1:8777 -Out output\regression\assistant-live-r5-real-smoke-strict -RealApiSmoke -RealApiSmokeMode All -FailOnSmokeFailure

Acceptance: Smoke uses existing project/application config; text model selected from first valid configured text-node model; image model selected from first valid configured image-node model; artifacts include redacted identity and submission status; secret scan total is zero; R5 artifact includes smoke result when flag enabled.
Extra acceptance: Browser mode opens the real Agent panel, types into `.hy-canvas-agent-input`, clicks `[data-canvas-agent-control='send']`, observes streaming/done through debugSnapshot, then verifies a skill_trace card or submitted image node state. Browser mode cannot pass from screenshot existence alone.

Rollback: Disable R5 flags by reverting wrapper changes; keep standalone smoke for diagnostics if stable.

---

## Phase 9: Documentation, Audit, And Release Gate

目标：把模块能力、开发验证、风险边界、手动 smoke 说明写清楚，确保下一位开发者和测试人员可以独立复现。

Files:

- Modify: docs/agent_canvas_skills.md
- Create: modules/assistant/canvasSkills/docs/README.md
- Create: modules/assistant/canvasSkills/docs/manifest.contract.md
- Create: modules/assistant/canvasSkills/docs/schema.contract.md
- Create: modules/assistant/canvasSkills/docs/smoke-test.contract.md
- Modify: docs/superpowers/specs/2026-06-06-canvas-skills-optimization-design.md only for factual correction after implementation evidence exists.
- Modify: docs/superpowers/plans/2026-06-06-canvas-skills-optimization.md to mark executed phases after implementation starts.

Documentation must include:

- Skill manifest and IDs.
- Node schema supported/planned/internal/deprecated policy.
- Real API smoke commands and pass/fail categories.
- Degraded load behavior.
- Trace redaction and retention.
- Asset categories/search/import/dedupe/reference health.
- R5 optional smoke behavior.
- Known limitations and next version candidates.

Final regression matrix:

Focused foundation:

    & 'D:\Aic\node.exe' --test --test-concurrency=1 tools\assistant_real_api_smoke.test.mjs modules\assistant\canvasSkills\manifest.test.js modules\assistant\canvasSkills\loader.test.js modules\assistant\canvasSkills\schemas\schemaValidator.test.js modules\assistant\assistantCanvasSkillRegistry.test.js modules\assistant\assistantCanvasParameterMapper.test.js modules\assistant\assistantCanvasSkillExecutor.test.js

Trace and asset:

    & 'D:\Aic\node.exe' --test --test-concurrency=1 modules\assistant\canvasSkills\tracing\skillTraceRedactor.test.js modules\assistant\canvasSkills\tracing\skillTraceRecorder.test.js modules\app\appAssistantPanel.skillTraceCards.test.js modules\assistant\canvasSkills\assets\assetCatalog.test.js modules\assistant\canvasSkills\assets\assetSearchIndex.test.js modules\assistant\canvasSkills\assets\assetImportService.test.js

Panel/model regression:

    & 'D:\Aic\node.exe' --test --test-concurrency=1 modules\app\appAssistantPanel.p1Ui.test.js modules\app\appAssistantPanel.autoload.test.js modules\app\appAssistantPanel.streaming.test.js modules\assistant\assistantModelRegistry.test.js modules\assistant\assistantMentionResolver.test.js modules\assistant\assistantMentionContext.test.js tools\assistant_panel_live_screenshot_check.test.mjs

Real config smoke:

    powershell -ExecutionPolicy Bypass -File tools\run_canvas_agent_real_api_smoke.ps1 -Mode Module

R5 optional strict release check, only when local 8777 is explicitly authorized and running:

    powershell -ExecutionPolicy Bypass -File tools\run_canvas_agent_r5_regression.ps1 -Url http://127.0.0.1:8777 -Out output\regression\assistant-live-final-canvas-skills -RealApiSmoke -RealApiSmokeMode All -FailOnSmokeFailure

Acceptance: Docs match implemented behavior; no doc claims final image output is required for default smoke; no doc suggests passing API keys through CLI; release evidence contains test command outputs and smoke artifacts.

---

## 7. Confirmation Policy For Plan/Act

| Operation | Plan mode | Act mode |
| --- | --- | --- |
| Single image node create/update/generate | No confirmation | No confirmation |
| Single text node create/update/generate | No confirmation | No confirmation |
| Single video node create/update | No confirmation | No confirmation |
| Single video generation submit | Requires confirmation | No confirmation |
| Multi-node one-shot generation | Requires confirmation | No confirmation |
| Asset list/use | No confirmation | No confirmation |
| Asset add/save | Requires explicit save intent | Requires explicit save intent |
| Workflow apply | No confirmation unless risky overwrite is implied | No confirmation |
| Workflow save/update | Confirmation for broad inferred scope | No confirmation unless explicit product gate remains |

Implementation locations:

- modules/assistant/assistantActionPreviewModel.js
- modules/assistant/assistantInteractionCards.js
- modules/assistant/canvasSkills/registry.js
- modules/app/appAssistantPanel.js

Tests:

    & 'D:\Aic\node.exe' --test --test-concurrency=1 modules\assistant\assistantActionPreviewModel.test.js modules\assistant\assistantInteractionCards.test.js modules\app\appAssistantPanel.test.js modules\app\appAssistantPanel.p1Ui.test.js

---

## 8. Security And Secret Scan Gate

Redaction targets:

- API keys: apiKey, api_key, sk-*, provider-specific key shapes.
- Authorization headers: Authorization, Bearer *.
- Tokens: token, proxyToken, accessToken, refreshToken.
- Cookies and credentials.
- Signed URL query params: token, key, secret, signature, X-Amz-Signature, access_token.
- Long base64 payloads.
- Raw request/response headers.
- Raw provider response bodies beyond safe summary.

Secret scan scope for real API smoke:

    output/regression/real-api-smoke/

Secret scan scope for R5 smoke:

    output/regression/<r5-output>/p0-p4-live-artifact-set.json
    output/regression/<r5-output>/p0-p4-completion-audit-result.json
    output/regression/<r5-output>/**/real-api-smoke*.json
    output/regression/<r5-output>/**/skill-trace*.json

Failure rule:

- Standalone smoke exits non-zero with SECRET_SCAN_FAILED.
- R5 soft mode records failed smoke artifact but does not fail wrapper.
- R5 strict mode fails wrapper.

---

## 9. Rollout Strategy

Checkpoint order:

1. Baseline current compatibility layer.
2. Early real API smoke on current path.
3. Independent module skeleton.
4. Manifest/registry compatibility.
5. Schema/validator.
6. Schema-backed mapper.
7. Runtime adapters and degraded load.
8. Trace cards.
9. Asset enhancements.
10. Module/browser real API smoke.
11. Optional R5 integration.
12. Docs and full regression.

Stop conditions:

- Early real API smoke cannot find configured text or image model.
- Smoke leaks secrets in artifact.
- Schema-backed mapper breaks existing executor tests.
- Runtime creates nodes without existing node flow.
- Agent panel claims canvas work succeeded while runtime is degraded.
- R5 previously complete journey regresses.

Rollback levels:

| Level | Trigger | Action |
| --- | --- | --- |
| L1 | New module unit tests fail only | Keep old compatibility path active; fix module in isolation |
| L2 | Panel autoload fails | Revert autoload integration; keep module files unreferenced |
| L3 | Mapper/executor regression | Restore old mapper/executor compatibility layer; keep schema read-only |
| L4 | Real API smoke leaks secret | Disable smoke artifact export; fix redactor/scanner before retry |
| L5 | R5 regression fails | Disable R5 smoke flag integration; preserve standalone smoke |

---

## 10. Future Optimization Candidates Found During Design

1. Schema auto-extraction: 从真实节点配置、模型注册表、UI 控件自动抽取 supported 字段，减少手工 schema 漂移。
2. Image/video model capability matrix: 明确每个模型支持的比例、画质、批量数量、参考图数量、输入格式，Agent 可自动选最合适模型。
3. Skill dry-run preview: Agent 执行前可生成“将调用哪些 Skills、会影响哪些节点”的 dry-run 结果。
4. Trace timeline view: 在调试区按时间轴展示每次 skill 调用、耗时、重试、失败原因。
5. Asset perceptual dedupe: 为图片资产增加 content hash/perceptual hash，降低重复资产污染。
6. Reference health auto-repair: 当资产缩略图坏了或源节点被删，提供重新绑定或重新生成缩略图入口。
7. Skill permission profile: 在 act 模式之外增加更细的权限档位，例如只读、可新增、可改已有、可生成、可删除。
8. Provider quota preflight: smoke 前读取 provider/代理可用性和额度提示，失败时给更清楚的用户指引。
9. Canvas Skills pluginization: 当前目录边界稳定后，可升级为真正可加载插件包。

---

## 11. Implementation Checklist

- [x] Phase 0 baseline verified.
- [x] Phase 1 early real API smoke test written RED.
- [x] Phase 1 early real API smoke proves text model chat/stream before image submission.
- [x] Phase 1 creates only tools/ files and does not create canvasSkills module files.
- [x] Phase 1 early real API smoke implemented GREEN.
- [x] Phase 2 module skeleton tests written RED.
- [x] Phase 2 manifest/loader/registry implemented GREEN.
- [x] Phase 3 schema tests written RED.
- [x] Phase 3 schema introspection/drift tests written RED.
- [x] Phase 3 model registry compatibility tests written RED.
- [x] Phase 3 schemas/validator implemented GREEN.
- [x] Phase 4 mapper/executor tests written RED.
- [x] Phase 4 schema-backed mapper/executor implemented GREEN.
- [x] Phase 5 runtime adapter/autoload tests written RED.
- [x] Phase 5 runtime adapter/autoload implemented GREEN.
- [x] Phase 6 trace redactor/card tests written RED.
- [x] Phase 6 trace deletion and local debug trace clear tests written RED.
- [x] Phase 6 trace recorder/cards implemented GREEN.
- [x] Phase 7 asset service tests written RED.
- [x] Phase 7 user-authorized local import and SVG safety tests written RED.
- [x] Phase 7 asset catalog/search/import/dedupe/health implemented GREEN.
- [x] Phase 8 smoke/R5 tests written RED.
- [x] Phase 8 browser smoke verifies panel input, streaming/done, skill_trace card or submitted node state.
- [x] Phase 8 standalone and optional R5 smoke implemented GREEN.
- [x] Phase 9 docs updated against real implementation evidence.
- [x] Scoped secret scan passes.
- [x] Full assistant panel/model regression passes.
- [x] Real API smoke passes with real config or records exact failure category.
- [x] Release notes explicitly list known limitations.

---

## 12. Self-Review

Design coverage:

- Real API smoke: covered in Phase 1 and Phase 8.
- Early baseline smoke: covered before module migration, and Phase 1 is constrained to tools/ so it cannot accidentally validate the new canvasSkills module.
- Text model connectivity: Phase 1 and Phase 8 require real Agent chatStream/chat before image draft/generation submission.
- Model selection from configured text/image node models: covered in Phase 1, Phase 3 validator model checks, and Phase 8.
- Failure categories and 90s timeout: covered in sections 5, 6 Phase 1, and Phase 8.
- Independent module: covered in Phase 2.
- Node schemas: covered in Phase 3, including schema introspection/drift tests against mapper/UI/defaults.
- Schema-backed mapper: covered in Phase 4.
- Runtime and degraded load: covered in Phase 5.
- Execution detail cards: covered in Phase 6, including deletion/clear-history privacy behavior.
- Trace retention/redaction: covered in Phase 6 and section 8.
- Asset categories/search/import/dedupe/reference health: covered in Phase 7, including user-authorized local import and SVG safety boundary.
- R5 integration: covered in Phase 8 with explicit RED/GREEN tests and browser smoke requirements.
- Final docs/audit/regression: covered in Phase 9.

Placeholder scan:

No intentional placeholder remains. Future items are explicitly marked as future optimization candidates, not current-version requirements.

Type consistency:

- CANVAS_SKILLS_MANIFEST
- CANVAS_SKILL_IDS
- createCanvasSkillRegistry
- createAssistantCanvasSkillRegistry
- loadCanvasSkillsRuntime
- createCanvasSkillsRuntime
- validateNodeParameters
- introspectSupportedFields
- validateModelField
- redactSkillTrace
- createSkillTraceCard
- runRealApiSmoke
- selectSmokeTextModel
- selectSmokeImageModel
- isAcceptedSmokeSubmission
- scanSmokeArtifactForSecrets

Execution handoff:

Implementation should start only after this document is reviewed and confirmed. Recommended execution mode after confirmation:

1. Subagent-Driven: one fresh implementation subagent per phase, with review between phases.
2. Inline Execution: implement in this session with explicit checkpoint after each phase.

Do not start Phase 1 coding until the user confirms this implementation document.
