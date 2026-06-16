import test from "node:test";
import assert from "node:assert/strict";

import { generateImageWithRegistryModel } from "./modelRegistryRuntime.js";

const originalFetch = globalThis.fetch;
const originalWindow = globalThis.window;
const originalLocalStorage = globalThis.localStorage;

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
});

test("modelRegistryRuntime: batchSize falls back to extra submits when provider returns fewer images than requested", async () => {
  const submitBodies = [];
  const savedUrls = [];

  globalThis.window = {
    currentProjectId: "proj-test",
    location: { href: "http://localhost/" },
  };
  globalThis.localStorage = createStorage();

  globalThis.fetch = async (url, options = {}) => {
    const requestUrl = String(url || "");

    if (requestUrl === "/api/v2/proxy/image") {
      const body = JSON.parse(String(options.body || "{}"));
      submitBodies.push(body);
      return makeJsonResponse({
        results: [
          {
            url: `https://img.example.com/registry-batch-${submitBodies.length}.png`,
          },
        ],
      });
    }

    if (requestUrl === "/api/v2/save_output_from_url") {
      const body = JSON.parse(String(options.body || "{}"));
      const sourceUrl = String(body.url || "");
      savedUrls.push(sourceUrl);
      const fileName = sourceUrl.split("/").pop();
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

  assert.equal(result.isBatch, true);
  assert.equal(result.images.length, 2);
  assert.deepEqual(
    submitBodies.map((body) => body.n),
    [2, 1]
  );
  assert.deepEqual(savedUrls, [
    "https://img.example.com/registry-batch-1.png",
    "https://img.example.com/registry-batch-2.png",
  ]);
});
