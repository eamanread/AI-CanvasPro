import assert from "node:assert/strict";
import test from "node:test";

import { generateImageWithRegistryModel } from "./modelRegistryRuntime.js";

const originalFetch = globalThis.fetch;
const originalWindow = globalThis.window;
const originalLocalStorage = globalThis.localStorage;
const originalInstallId = globalThis.__aicInstallId;
const originalSetTimeout = globalThis.setTimeout;
const originalClearTimeout = globalThis.clearTimeout;

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

function makeJsonResponse(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: {
      get(name) {
        return String(name || "").toLowerCase() === "content-type"
          ? "application/json"
          : null;
      },
    },
    async json() {
      return body;
    },
    async text() {
      return JSON.stringify(body);
    },
    async blob() {
      return new Blob();
    },
  };
}

test.after(() => {
  globalThis.fetch = originalFetch;
  globalThis.window = originalWindow;
  globalThis.localStorage = originalLocalStorage;
  globalThis.__aicInstallId = originalInstallId;
  globalThis.setTimeout = originalSetTimeout;
  globalThis.clearTimeout = originalClearTimeout;
});

test("modelRegistryRuntime: 注册模型图片节点提交本地代理时自动透传 installId", async () => {
  let submitHeaders = null;
  let submitBody = null;

  globalThis.window = {
    currentProjectId: "proj-test",
    location: { href: "http://localhost/" },
    showToast: () => {},
  };
  globalThis.localStorage = createStorage();
  globalThis.localStorage.setItem("aic-install-id", "aic-fixed");
  globalThis.__aicInstallId = "aic-fixed";

  globalThis.fetch = async (url, options = {}) => {
    const requestUrl = String(url || "");

    if (requestUrl === "/api/v2/proxy/image") {
      submitHeaders = options.headers;
      submitBody = JSON.parse(String(options.body || "{}"));
      return makeJsonResponse({
        results: [{ url: "https://img.example.com/registry-direct.png" }],
      });
    }

    if (requestUrl === "/api/v2/save_output_from_url") {
      const body = JSON.parse(String(options.body || "{}"));
      assert.equal(body.url, "https://img.example.com/registry-direct.png");
      return makeJsonResponse({ path: "output/registry-direct.png" });
    }

    throw new Error(`unexpected fetch url: ${requestUrl}`);
  };

  const result = await generateImageWithRegistryModel({
    apiUrl: "https://registry.example.com/v1/draw/completions",
    apiKey: "k_registry",
    model: "gpt-image-2",
    prompt: "hello",
    inputUrls: [],
    batchSize: 1,
  });

  assert.equal(submitHeaders["X-AIC-Install-Id"], "aic-fixed");
  assert.equal(submitBody.installId, "aic-fixed");
  assert.equal(submitBody.model, "gpt-image-2");
  assert.equal(submitBody.n, 1);
  assert.equal("batchSize" in submitBody, false);
  assert.equal(result.localPath, "output/registry-direct.png");
});

test("modelRegistryRuntime: openai-compatible 图片模型多图提交透传 n 且提交超时为 600s", async () => {
  let submitBody = null;
  const timeoutValues = [];
  let timerId = 0;

  globalThis.window = {
    currentProjectId: "proj-test",
    location: { href: "http://localhost/" },
    showToast: () => {},
  };
  globalThis.localStorage = createStorage();
  globalThis.localStorage.setItem("aic-install-id", "aic-fixed");
  globalThis.__aicInstallId = "aic-fixed";
  globalThis.setTimeout = (_fn, ms) => {
    timeoutValues.push(Number(ms));
    timerId += 1;
    return timerId;
  };
  globalThis.clearTimeout = () => {};

  globalThis.fetch = async (url, options = {}) => {
    const requestUrl = String(url || "");

    if (requestUrl === "/api/v2/proxy/image") {
      submitBody = JSON.parse(String(options.body || "{}"));
      return makeJsonResponse({
        results: [
          { url: "https://img.example.com/registry-direct-2-a.png" },
          { url: "https://img.example.com/registry-direct-2-b.png" },
        ],
      });
    }

    if (requestUrl === "/api/v2/save_output_from_url") {
      const body = JSON.parse(String(options.body || "{}"));
      const fileName = String(body.url || "").split("/").pop();
      return makeJsonResponse({ path: `output/${fileName}` });
    }

    throw new Error(`unexpected fetch url: ${requestUrl}`);
  };

  const result = await generateImageWithRegistryModel({
    apiUrl: "https://registry.example.com/v1/images/generations",
    apiKey: "k_registry",
    model: "gpt-image-2",
    adapterType: "openai_compatible",
    prompt: "hello",
    inputUrls: [],
    batchSize: 2,
  });

  assert.equal(submitBody.n, 2);
  assert.equal("batchSize" in submitBody, false);
  assert.ok(timeoutValues.includes(600_000));
  assert.equal(result.isBatch, true);
  assert.deepEqual(
    result.images.map((item) => item.localPath),
    ["output/registry-direct-2-a.png", "output/registry-direct-2-b.png"]
  );
});

test("modelRegistryRuntime: success 包裹下 data 字符串 taskId 也会继续轮询生成", async () => {
  let submitBody = null;
  let queryBody = null;

  globalThis.window = {
    currentProjectId: "proj-test",
    location: { href: "http://localhost/" },
    showToast: () => {},
  };
  globalThis.localStorage = createStorage();
  globalThis.localStorage.setItem("aic-install-id", "aic-fixed");
  globalThis.__aicInstallId = "aic-fixed";

  globalThis.fetch = async (url, options = {}) => {
    const requestUrl = String(url || "");

    if (requestUrl === "/api/v2/proxy/image") {
      const body = JSON.parse(String(options.body || "{}"));

      if (String(body.apiUrl || "").endsWith("/v1/draw/completions")) {
        submitBody = body;
        return makeJsonResponse({
          code: 0,
          msg: "success",
          data: "task-registry-string-123",
        });
      }

      if (String(body.apiUrl || "").endsWith("/v1/draw/result")) {
        queryBody = body;
        return makeJsonResponse({
          code: 0,
          msg: "success",
          data: {
            id: "task-registry-string-123",
            status: "succeeded",
            results: [{ url: "https://img.example.com/registry-polled-3.png" }],
          },
        });
      }
    }

    if (requestUrl === "/api/v2/save_output_from_url") {
      return makeJsonResponse({ path: "output/registry-polled-3.png" });
    }

    throw new Error(`unexpected fetch url: ${requestUrl}`);
  };

  const result = await generateImageWithRegistryModel({
    apiUrl: "https://registry.example.com/v1/draw/completions",
    apiKey: "k_registry",
    model: "gpt-image-2",
    adapterType: "openai_compatible",
    prompt: "hello",
    inputUrls: [],
    batchSize: 1,
  });

  assert.equal(submitBody.n, 1);
  assert.equal(queryBody.id, "task-registry-string-123");
  assert.equal(result.localPath, "output/registry-polled-3.png");
});
