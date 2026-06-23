import assert from "node:assert/strict";
import test from "node:test";

import { ApiError } from "./api/errors/ApiError.js";
import { requester } from "./api/requester.js";

function createStorage() {
  const store = new Map();
  return {
    getItem(key) {
      return store.has(key) ? store.get(key) : null;
    },
    setItem(key, value) {
      store.set(key, String(value));
    },
    removeItem(key) {
      store.delete(key);
    },
  };
}

test("requester: local api requests automatically include X-AIC-Install-Id", async () => {
  const originalFetch = globalThis.fetch;
  const originalLocalStorage = globalThis.localStorage;
  const originalInstallId = globalThis.__aicInstallId;
  let capturedHeaders = null;

  globalThis.localStorage = createStorage();
  delete globalThis.__aicInstallId;
  globalThis.fetch = async (_url, options = {}) => {
    capturedHeaders = options.headers;
    return {
      ok: true,
      status: 200,
      headers: { get: () => "application/json" },
      json: async () => ({ success: true }),
      text: async () => JSON.stringify({ success: true }),
      blob: async () => new Blob(),
    };
  };

  try {
    await requester({
      url: "/api/v2/proxy/completions",
      buildUrl: false,
      method: "POST",
      provider: "local",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt: "hello" }),
    });

    assert.ok(capturedHeaders["X-AIC-Install-Id"]);
    assert.equal(
      globalThis.localStorage.getItem("aic-install-id"),
      capturedHeaders["X-AIC-Install-Id"],
    );
  } finally {
    globalThis.fetch = originalFetch;
    globalThis.localStorage = originalLocalStorage;
    globalThis.__aicInstallId = originalInstallId;
  }
});

test("requester: local generation json bodies include installId fallback", async () => {
  const originalFetch = globalThis.fetch;
  const originalLocalStorage = globalThis.localStorage;
  const originalInstallId = globalThis.__aicInstallId;
  let capturedHeaders = null;
  let capturedBody = null;

  globalThis.localStorage = createStorage();
  globalThis.localStorage.setItem("aic-install-id", "aic-fixed");
  delete globalThis.__aicInstallId;
  globalThis.fetch = async (_url, options = {}) => {
    capturedHeaders = options.headers;
    capturedBody = options.body;
    return {
      ok: true,
      status: 200,
      headers: { get: () => "application/json" },
      json: async () => ({ success: true }),
      text: async () => JSON.stringify({ success: true }),
      blob: async () => new Blob(),
    };
  };

  try {
    await requester({
      url: "/api/v2/proxy/image",
      buildUrl: false,
      method: "POST",
      provider: "grsai",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        prompt: "hello",
        model: "nano-banana-pro-vt",
        apiUrl: "https://example.test/v1/draw/nano-banana",
        apiKey: "demo-key",
      }),
    });

    assert.equal(capturedHeaders["X-AIC-Install-Id"], "aic-fixed");
    assert.deepEqual(JSON.parse(capturedBody), {
      prompt: "hello",
      model: "nano-banana-pro-vt",
      apiUrl: "https://example.test/v1/draw/nano-banana",
      apiKey: "demo-key",
      installId: "aic-fixed",
    });
  } finally {
    globalThis.fetch = originalFetch;
    globalThis.localStorage = originalLocalStorage;
    globalThis.__aicInstallId = originalInstallId;
  }
});

test("requester: subscription-required generation response triggers gate hook and throws ApiError", async () => {
  const originalFetch = globalThis.fetch;
  const originalLocalStorage = globalThis.localStorage;
  const originalInstallId = globalThis.__aicInstallId;
  const originalHandleSubscriptionRequired = globalThis.handleSubscriptionRequired;
  const calls = [];

  globalThis.localStorage = createStorage();
  globalThis.localStorage.setItem("aic-install-id", "aic-fixed");
  globalThis.handleSubscriptionRequired = (payload) => {
    calls.push(payload);
  };
  globalThis.fetch = async () => ({
    ok: true,
    status: 200,
    headers: { get: () => "application/json" },
    json: async () => ({
      success: false,
      code: "SUBSCRIPTION_REQUIRED",
      message: "需要订阅",
      requiredModelId: "runninghub/123",
      reasonCode: "NOT_ACTIVE",
      contactText: "联系管理员",
      contactUrl: "",
      nodeType: "image",
      activationSource: "manual",
      generationScope: "all",
    }),
    text: async () =>
      JSON.stringify({
        success: false,
        code: "SUBSCRIPTION_REQUIRED",
      }),
    blob: async () => new Blob(),
  });

  try {
    await assert.rejects(
      () =>
        requester({
          url: "/api/v2/proxy/image",
          buildUrl: false,
          method: "POST",
          provider: "runninghubwf",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ prompt: "hello" }),
        }),
      (error) => {
        assert.ok(error instanceof ApiError);
        assert.equal(error.code, "SUBSCRIPTION_REQUIRED");
        assert.equal(error.requiredModelId, "runninghub/123");
        assert.equal(error.reasonCode, "NOT_ACTIVE");
        assert.equal(error.nodeType, "image");
        return true;
      },
    );

    assert.equal(calls.length, 1);
    assert.equal(calls[0].requiredModelId, "runninghub/123");
    assert.equal(calls[0].modelId, "runninghub/123");
    assert.equal(calls[0].provider, "runninghubwf");
    assert.equal(calls[0].nodeType, "image");
    assert.equal(calls[0].activationSource, "manual");
    assert.equal(calls[0].generationScope, "all");
  } finally {
    globalThis.fetch = originalFetch;
    globalThis.localStorage = originalLocalStorage;
    globalThis.__aicInstallId = originalInstallId;
    globalThis.handleSubscriptionRequired = originalHandleSubscriptionRequired;
  }
});

test("requester: service-provided nodeType overrides /proxy/image fallback inference", async () => {
  const originalFetch = globalThis.fetch;
  const originalLocalStorage = globalThis.localStorage;
  const originalInstallId = globalThis.__aicInstallId;
  const originalHandleSubscriptionRequired = globalThis.handleSubscriptionRequired;
  const calls = [];

  globalThis.localStorage = createStorage();
  globalThis.localStorage.setItem("aic-install-id", "aic-fixed");
  globalThis.handleSubscriptionRequired = (payload) => {
    calls.push(payload);
  };
  globalThis.fetch = async () => ({
    ok: true,
    status: 200,
    headers: { get: () => "application/json" },
    json: async () => ({
      success: false,
      code: "SUBSCRIPTION_REQUIRED",
      message: "需要订阅",
      requiredModelId: "runninghub/1991510999935172610",
      reasonCode: "NOT_ACTIVE",
      nodeType: "audio",
    }),
    text: async () =>
      JSON.stringify({
        success: false,
        code: "SUBSCRIPTION_REQUIRED",
      }),
    blob: async () => new Blob(),
  });

  try {
    await assert.rejects(
      () =>
        requester({
          url: "/api/v2/proxy/image",
          buildUrl: false,
          method: "POST",
          provider: "runninghubwf",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ prompt: "hello" }),
        }),
      (error) => {
        assert.ok(error instanceof ApiError);
        assert.equal(error.nodeType, "audio");
        return true;
      },
    );

    assert.equal(calls.length, 1);
    assert.equal(calls[0].provider, "runninghubwf");
    assert.equal(calls[0].nodeType, "audio");
  } finally {
    globalThis.fetch = originalFetch;
    globalThis.localStorage = originalLocalStorage;
    globalThis.__aicInstallId = originalInstallId;
    globalThis.handleSubscriptionRequired = originalHandleSubscriptionRequired;
  }
});

test("requester: text generation response still triggers subscription gate when body is JSON text", async () => {
  const originalFetch = globalThis.fetch;
  const originalLocalStorage = globalThis.localStorage;
  const originalInstallId = globalThis.__aicInstallId;
  const originalHandleSubscriptionRequired = globalThis.handleSubscriptionRequired;
  const calls = [];

  globalThis.localStorage = createStorage();
  globalThis.localStorage.setItem("aic-install-id", "aic-fixed");
  globalThis.handleSubscriptionRequired = (payload) => {
    calls.push(payload);
  };
  globalThis.fetch = async () => ({
    ok: true,
    status: 200,
    headers: { get: () => "text/plain" },
    json: async () => ({
      success: false,
      code: "SUBSCRIPTION_REQUIRED",
    }),
    text: async () =>
      JSON.stringify({
        success: false,
        code: "SUBSCRIPTION_REQUIRED",
        message: "请先完成授权激活后再继续生成（未激活）",
        requiredModelId: "nano-banana-2",
        reasonCode: "NOT_ACTIVE",
        nodeType: "image",
        provider: "grsai",
      }),
    blob: async () => new Blob(),
  });

  try {
    await assert.rejects(
      () =>
        requester({
          url: "/api/v2/proxy/image",
          buildUrl: false,
          method: "POST",
          provider: "registry-openai",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ prompt: "hello" }),
          responseType: "text",
        }),
      (error) => {
        assert.ok(error instanceof ApiError);
        assert.equal(error.code, "SUBSCRIPTION_REQUIRED");
        assert.equal(error.message, "请先完成授权激活后再继续生成（未激活）");
        assert.equal(error.provider, "grsai");
        assert.equal(error.nodeType, "image");
        return true;
      },
    );

    assert.equal(calls.length, 1);
    assert.equal(calls[0].provider, "grsai");
    assert.equal(calls[0].nodeType, "image");
    assert.equal(calls[0].reasonCode, "NOT_ACTIVE");
  } finally {
    globalThis.fetch = originalFetch;
    globalThis.localStorage = originalLocalStorage;
    globalThis.__aicInstallId = originalInstallId;
    globalThis.handleSubscriptionRequired = originalHandleSubscriptionRequired;
  }
});

test("requester: service-provided provider overrides /proxy/image fallback inference", async () => {
  const originalFetch = globalThis.fetch;
  const originalLocalStorage = globalThis.localStorage;
  const originalInstallId = globalThis.__aicInstallId;
  const originalHandleSubscriptionRequired = globalThis.handleSubscriptionRequired;
  const calls = [];

  globalThis.localStorage = createStorage();
  globalThis.localStorage.setItem("aic-install-id", "aic-fixed");
  globalThis.handleSubscriptionRequired = (payload) => {
    calls.push(payload);
  };
  globalThis.fetch = async () => ({
    ok: true,
    status: 200,
    headers: { get: () => "application/json" },
    json: async () => ({
      success: false,
      code: "SUBSCRIPTION_REQUIRED",
      message: "需要订阅",
      requiredModelId: "runninghub/123",
      reasonCode: "NOT_ACTIVE",
      provider: "runninghubwf",
    }),
    text: async () =>
      JSON.stringify({
        success: false,
        code: "SUBSCRIPTION_REQUIRED",
      }),
    blob: async () => new Blob(),
  });

  try {
    await assert.rejects(
      () =>
        requester({
          url: "/api/v2/proxy/image",
          buildUrl: false,
          method: "POST",
          provider: "proxy",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ prompt: "hello" }),
        }),
      (error) => {
        assert.ok(error instanceof ApiError);
        assert.equal(error.provider, "runninghubwf");
        return true;
      },
    );

    assert.equal(calls.length, 1);
    assert.equal(calls[0].provider, "runninghubwf");
  } finally {
    globalThis.fetch = originalFetch;
    globalThis.localStorage = originalLocalStorage;
    globalThis.__aicInstallId = originalInstallId;
    globalThis.handleSubscriptionRequired = originalHandleSubscriptionRequired;
  }
});
