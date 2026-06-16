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

test("modelRegistryRuntime: gpt-image-2 uses GRSai draw completions and result polling", async () => {
  const proxyBodies = [];

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

    if (requestUrl === "/api/v2/proxy/image") {
      proxyBodies.push(body);
      if (body.apiUrl === "https://api.grsai.example.com/v1/draw/completions") {
        assert.equal(body.model, "gpt-image-2");
        assert.equal(body.imageSize, "4K");
        return makeJsonResponse({
          code: 0,
          msg: "success",
          data: {
            task_id: "task-gpt-image-2",
            status: "pending",
          },
        });
      }

      if (body.apiUrl === "https://api.grsai.example.com/v1/draw/result") {
        assert.equal(body.id, "task-gpt-image-2");
        return makeJsonResponse({
          code: 0,
          msg: "success",
          data: {
            id: "task-gpt-image-2",
            status: "success",
            results: [
              {
                url: "https://img.example.com/gpt-image-2.png",
              },
            ],
          },
        });
      }

      throw new Error(`unexpected proxy image apiUrl: ${body.apiUrl}`);
    }

    if (requestUrl.startsWith("/api/v2/proxy/task?")) {
      throw new Error(`unexpected task proxy url: ${requestUrl}`);
    }

    if (requestUrl === "/api/v2/save_output_from_url") {
      assert.equal(body.url, "https://img.example.com/gpt-image-2.png");
      return makeJsonResponse({ path: "output/gpt-image-2.png" });
    }

    throw new Error(`unexpected fetch url: ${requestUrl}`);
  };

  const result = await generateImageWithRegistryModel({
    apiUrl: "https://api.grsai.example.com/v1",
    apiKey: "k_grsai",
    model: "grsai/gpt-image-2",
    adapterType: "openai_compatible",
    prompt: "cat",
    inputUrls: [],
    batchSize: 1,
    imageSize: "4K",
  });

  assert.equal(result.localPath, "output/gpt-image-2.png");
  assert.deepEqual(
    proxyBodies.map((body) => body.apiUrl),
    [
      "https://api.grsai.example.com/v1/draw/completions",
      "https://api.grsai.example.com/v1/draw/result",
    ]
  );
});
