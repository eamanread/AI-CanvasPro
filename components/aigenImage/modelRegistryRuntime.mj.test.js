import test from "node:test";
import assert from "node:assert/strict";

import { generateImageWithRegistryModel } from "./modelRegistryRuntime.js";

const originalFetch = globalThis.fetch;
const originalWindow = globalThis.window;
const originalLocalStorage = globalThis.localStorage;
const originalSetTimeout = globalThis.setTimeout;

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
  };
}

test.after(() => {
  globalThis.fetch = originalFetch;
  globalThis.window = originalWindow;
  globalThis.localStorage = originalLocalStorage;
  globalThis.setTimeout = originalSetTimeout;
});

test("modelRegistryRuntime: mj_imagine uses Midjourney submit and fetch endpoints", async () => {
  const requests = [];

  globalThis.window = {
    currentProjectId: "proj-test",
    location: { href: "http://localhost/" },
  };
  globalThis.localStorage = createStorage();
  globalThis.setTimeout = (callback, ms, ...args) =>
    originalSetTimeout(callback, Number(ms) > 100 ? 0 : ms, ...args);

  globalThis.fetch = async (url, options = {}) => {
    const requestUrl = String(url || "");
    const body = options.body ? JSON.parse(String(options.body || "{}")) : null;
    requests.push({ url: requestUrl, body });

    if (requestUrl === "/api/v2/proxy/image") {
      assert.equal(body.apiUrl, "https://yunwu.ai/mj/submit/imagine");
      assert.equal(body.apiKey, "k_mj");
      assert.equal(body.prompt, "cat");
      assert.equal(body.model, undefined);
      return makeJsonResponse({
        code: 1,
        description: "submitted",
        result: "mj-task-1",
      });
    }

    if (requestUrl.startsWith("/api/v2/proxy/task?")) {
      assert.ok(
        requestUrl.includes(
          encodeURIComponent("https://yunwu.ai/mj/task/mj-task-1/fetch")
        )
      );
      return makeJsonResponse({
        code: 1,
        result: {
          status: "SUCCESS",
          imageUrl: "https://img.example.com/mj-result.png",
        },
      });
    }

    if (requestUrl === "/api/v2/save_output_from_url") {
      assert.equal(body.url, "https://img.example.com/mj-result.png");
      return makeJsonResponse({ path: "output/mj-result.png" });
    }

    throw new Error(`unexpected fetch url: ${requestUrl}`);
  };

  const result = await generateImageWithRegistryModel({
    apiUrl: "https://yunwu.ai/v1",
    apiKey: "k_mj",
    model: "mj_imagine",
    adapterType: "openai_compatible",
    prompt: "cat",
    inputUrls: [],
    batchSize: 1,
  });

  assert.equal(result.localPath, "output/mj-result.png");
  assert.equal(result.sourceUrl, "https://img.example.com/mj-result.png");
  assert.ok(requests.some((request) => request.url.startsWith("/api/v2/proxy/task?")));
});
