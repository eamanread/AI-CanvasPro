import assert from "node:assert/strict";
import test from "node:test";

import {
  buildAssistantModelRegistry,
  filterConfiguredTextModelOptions,
  filterSelectableTextModelOptions,
  isConfiguredTextModelOption,
  isSelectableTextModelOption,
} from "./assistantModelRegistry.js";

test("assistantModelRegistry: selects configured canvas agent before pi fallback", () => {
  const registry = buildAssistantModelRegistry({
    providers: {
      canvas_agent: {
        apiUrl: "https://agent.test/v1",
        apiKey: "secret",
        model: "agent-model",
      },
      pi_canvas_agent: {
        proxyBaseUrl: "http://pi.test/v1",
        proxyToken: "proxy",
        model: "pi-model",
      },
    },
  });

  assert.equal(registry.defaultAgentModel().provider, "canvas_agent");
  assert.equal(registry.defaultAgentModel().supportsTools, true);
});

test("assistantModelRegistry: falls back to pi canvas agent when canvas agent is blank", () => {
  const registry = buildAssistantModelRegistry({
    providers: {
      canvas_agent: { apiUrl: "", apiKey: "", model: "blank" },
      pi_canvas_agent: {
        proxyBaseUrl: "http://pi.test/v1",
        proxyToken: "proxy",
        model: "pi-model",
      },
    },
  });

  assert.equal(registry.defaultAgentModel().provider, "pi_canvas_agent");
  assert.equal(registry.defaultAgentModel().requiresProxy, true);
});

test("assistantModelRegistry: defaults to configured text model when no agent provider is configured", () => {
  const registry = buildAssistantModelRegistry({
    providers: {
      grsai: {
        apiUrl: "https://grsai.example/v1",
        apiKey: "configured-text-key",
        model: "grsai-chat",
        displayName: "GRS text model",
      },
      pi_canvas_agent: {
        proxyBaseUrl: "",
        proxyToken: "",
        model: "",
      },
    },
  });

  assert.equal(registry.defaultModel.provider, "grsai");
  assert.equal(registry.defaultModel.model, "grsai-chat");
  assert.equal(registry.defaultModel.configured, true);
});

test("assistantModelRegistry: prefers non-failed configured text model over failed text model", () => {
  const registry = buildAssistantModelRegistry({
    modelRegistry: {
      text: [
        {
          id: "mdl_text_failed",
          nodeType: "text",
          modelName: "Failed text",
          modelId: "failed-model",
          apiKey: "failed-secret",
          baseUrl: "https://failed.example/v1",
          status: "failed",
          adapterType: "openai_compatible",
        },
        {
          id: "mdl_text_unverified",
          nodeType: "text",
          modelName: "Unverified text",
          modelId: "gpt-5.5",
          apiKey: "text-secret",
          baseUrl: "https://right.example/v1",
          status: "unverified",
          adapterType: "openai_compatible",
        },
      ],
    },
  });

  assert.equal(registry.defaultModel.id, "mdl_text_unverified");
  assert.equal(registry.defaultModel.model, "gpt-5.5");
});

test("assistantModelRegistry: prefers configured settings text model over legacy agent provider", () => {
  const registry = buildAssistantModelRegistry({
    modelRegistry: {
      text: [
        {
          id: "mdl_text_gpt_55",
          nodeType: "text",
          modelName: "GPT 5.5",
          modelId: "gpt-5.5",
          apiKey: "text-secret",
          baseUrl: "https://text.example/v1/chat/completions",
          status: "unverified",
          adapterType: "openai_compatible",
        },
      ],
    },
    providers: {
      pi_canvas_agent: {
        proxyBaseUrl: "http://pi.test/v1",
        proxyToken: "proxy",
        model: "pi-model",
      },
    },
  });

  assert.equal(registry.defaultModel.provider, "model_registry");
  assert.equal(registry.defaultModel.id, "mdl_text_gpt_55");
  assert.equal(registry.defaultModel.model, "gpt-5.5");
  assert.equal(registry.defaultAgentModel().provider, "pi_canvas_agent");
  assert.equal(JSON.stringify(registry.options).includes("text-secret"), false);
});

test("assistantModelRegistry: gates reference image count by model capability", () => {
  const registry = buildAssistantModelRegistry({
    providers: {
      vision_model: {
        apiUrl: "https://vision.test/v1",
        apiKey: "secret",
        model: "gpt-4o-vision",
        maxReferenceImages: 2,
      },
    },
  });

  assert.equal(registry.canUseReferenceImages("vision_model", 2), true);
  assert.equal(registry.canUseReferenceImages("vision_model", 3), false);
});

test("assistantModelRegistry: recommends models by assistant intent", () => {
  const registry = buildAssistantModelRegistry({
    providers: {
      pi_canvas_agent: {
        proxyBaseUrl: "http://pi.test/v1",
        proxyToken: "proxy",
        model: "pi-model",
      },
      video_provider: {
        apiUrl: "https://video.test/v1",
        apiKey: "secret",
        model: "seedance-video",
      },
    },
  });

  assert.deepEqual(
    registry.modelsForIntent("story_short").map((model) => model.provider),
    ["pi_canvas_agent", "video_provider"]
  );
});

test("assistantModelRegistry: configured text model helpers keep only active text-node models", () => {
  const registry = buildAssistantModelRegistry({
    modelRegistry: {
      text: [
        {
          id: "text-alpha",
          nodeType: "text",
          modelName: "Alpha Text",
          modelId: "alpha-chat",
          apiKey: "alpha-secret",
          baseUrl: "https://alpha.example/v1",
          status: "unverified",
        },
        {
          id: "text-failed",
          nodeType: "text",
          modelName: "Failed Text",
          modelId: "failed-chat",
          apiKey: "failed-secret",
          baseUrl: "https://failed.example/v1",
          status: "failed",
        },
        {
          id: "text-deleted",
          nodeType: "text",
          modelName: "Deleted Text",
          modelId: "deleted-chat",
          apiKey: "deleted-secret",
          baseUrl: "https://deleted.example/v1",
          status: "deleted",
        },
      ],
    },
    providers: {
      canvas_agent: {
        apiUrl: "https://agent.example/v1",
        apiKey: "agent-secret",
        model: "agent-pro",
      },
      image_provider: {
        apiUrl: "https://image.example/v1",
        apiKey: "image-secret",
        model: "gpt-image",
      },
    },
  });

  const filtered = filterConfiguredTextModelOptions(registry.options);

  assert.equal(isConfiguredTextModelOption(filtered[0]), true);
  assert.deepEqual(filtered.map((model) => model.displayName), ["Alpha Text", "Failed Text"]);
  assert.deepEqual(registry.configuredTextModels().map((model) => model.id), ["text-alpha", "text-failed"]);
  assert.equal(registry.defaultModel.id, "text-alpha");
});

test("assistantModelRegistry: routes by pluggable capability requirements", () => {
  const registry = buildAssistantModelRegistry({
    providers: {
      planner_fast: {
        apiUrl: "https://planner-fast.test/v1",
        apiKey: "secret",
        model: "agent-mini-fast",
        capabilities: ["text", "action_planning", "low_latency"],
      },
      planner_quality: {
        apiUrl: "https://planner-quality.test/v1",
        apiKey: "secret",
        model: "agent-pro",
        capabilities: ["text", "action_planning", "high_quality"],
        priority: 10,
      },
      image_provider: {
        apiUrl: "https://image.test/v1",
        apiKey: "secret",
        model: "gpt-image",
        capabilities: ["image_generation", "vision"],
      },
    },
  });

  assert.equal(registry.routeForCapabilities(["action_planning", "high_quality"]).provider, "planner_quality");
  assert.equal(registry.routeForCapabilities(["action_planning", "low_latency"]).provider, "planner_fast");
  assert.equal(registry.routeForCapabilities(["image_generation"]).provider, "image_provider");
  assert.equal(registry.routeForCapabilities(["video_generation"]), null);
});

test("assistantModelRegistry: exposes safe model routing table", () => {
  const registry = buildAssistantModelRegistry({
    providers: {
      planner: {
        apiUrl: "https://planner.test/v1",
        apiKey: "secret-token-value",
        model: "agent-pro",
        capabilities: ["text", "action_planning", "high_quality"],
      },
    },
  });

  const table = registry.routingTable();

  assert.equal(table.schemaVersion, "canvas-agent-model-routing-v1");
  assert.equal(table.routes.action_planning[0].provider, "planner");
  assert.equal(table.routes.high_quality[0].model, "agent-pro");
  assert.equal(JSON.stringify(table).includes("secret-token-value"), false);
});

test("assistantModelRegistry: exposes configured options and default model without secrets", () => {
  const registry = buildAssistantModelRegistry({
    providers: {
      pi_canvas_agent: {
        endpoint: "https://example.invalid/v1",
        apiKeyConfigured: true,
        defaultModel: "agent-high-quality",
        displayName: "Pi Canvas Agent",
      },
    },
  });

  assert.equal(registry.defaultModel.id, "agent-high-quality");
  assert.equal(registry.options[0].id, "agent-high-quality");
  assert.equal(registry.options[0].provider, "pi_canvas_agent");
  assert.equal(registry.options[0].configured, true);
  assert.deepEqual(registry.options[0].capabilities, [
    "text",
    "vision",
    "action_planning",
    "high_quality",
  ]);
  assert.equal(JSON.stringify(registry).includes("secret-token-value"), false);
});

test("assistantModelRegistry: keeps unconfigured provider disabled with a reason", () => {
  const registry = buildAssistantModelRegistry({
    providers: {
      pi_canvas_agent: {
        endpoint: "",
        apiKeyConfigured: false,
        defaultModel: "agent-high-quality",
      },
    },
  });

  assert.equal(registry.options[0].configured, false);
  assert.match(registry.options[0].disabledReason, /API Key|Endpoint|配置/);
  assert.equal(registry.configuredModels().length, 0);
});

test("assistantModelRegistry: failed text models stay selectable like the text node menu", () => {
  const registry = buildAssistantModelRegistry({
    modelRegistry: {
      text: [
        {
          id: "mdl_text_failed",
          nodeType: "text",
          modelName: "Gemini 3.1",
          modelId: "gemini-3.1-pro",
          apiKey: "secret",
          baseUrl: "https://grsai.example/v1",
          status: "failed",
          adapterType: "openai_compatible",
        },
      ],
    },
  });

  const option = registry.options.find((model) => model.id === "mdl_text_failed");
  assert.equal(isConfiguredTextModelOption(option), true);
  assert.equal(isSelectableTextModelOption(option), true);
  assert.deepEqual(
    registry.configuredTextModels().map((model) => model.id),
    ["mdl_text_failed"]
  );
  assert.equal(registry.defaultModel.id, "mdl_text_failed");
});

test("assistantModelRegistry: selectable filter mirrors text node rules for incomplete and deleted models", () => {
  const registry = buildAssistantModelRegistry({
    modelRegistry: {
      text: [
        {
          id: "text-ok",
          nodeType: "text",
          modelName: "Ready",
          modelId: "ready-chat",
          apiKey: "secret",
          baseUrl: "https://ready.example/v1",
          status: "unverified",
        },
        {
          id: "text-no-key",
          nodeType: "text",
          modelName: "Missing Key",
          modelId: "nokey-chat",
          baseUrl: "https://nokey.example/v1",
          status: "unverified",
        },
        {
          id: "text-deleted",
          nodeType: "text",
          modelName: "Deleted",
          modelId: "deleted-chat",
          apiKey: "secret",
          baseUrl: "https://deleted.example/v1",
          status: "deleted",
        },
        {
          id: "text-disabled",
          nodeType: "text",
          modelName: "Disabled",
          modelId: "disabled-chat",
          apiKey: "secret",
          baseUrl: "https://disabled.example/v1",
          status: "unverified",
          disabled: true,
        },
      ],
    },
  });

  const selectable = filterSelectableTextModelOptions(registry.options);
  assert.deepEqual(selectable.map((model) => model.id), ["text-ok", "text-no-key"]);
  const missingKey = selectable.find((model) => model.id === "text-no-key");
  assert.equal(missingKey.configured, false);
  assert.ok(missingKey.disabledReason.includes("API Key"));
  assert.deepEqual(
    filterConfiguredTextModelOptions(registry.options).map((model) => model.id),
    ["text-ok"]
  );
});

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
