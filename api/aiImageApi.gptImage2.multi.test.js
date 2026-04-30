import assert from "node:assert/strict";
import test from "node:test";

import { clearApiConfig } from "./configApi.js";
import { generateImage } from "./aiImageApi.js";

const originalFetch = globalThis.fetch;
const originalWindow = globalThis.window;
const originalLocalStorage = globalThis.localStorage;
const originalInstallId = globalThis.__aicInstallId;
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
  globalThis.__aicInstallId = originalInstallId;
  globalThis.setTimeout = originalSetTimeout;
});

test("aiImageApi: gpt-image-2 轮询结果里的 task.images[].url 数组会完整落盘", async () => {
  const savedUrls = [];

  globalThis.window = {
    currentProjectId: "proj-test",
    location: { href: "http://localhost/" },
  };
  globalThis.localStorage = createStorage();
  globalThis.localStorage.setItem("aic-install-id", "aic-fixed");
  globalThis.__aicInstallId = "aic-fixed";
  globalThis.setTimeout = (fn, ms, ...args) =>
    originalSetTimeout(fn, Number(ms) > 5000 ? Number(ms) : 0, ...args);

  globalThis.fetch = async (url, options = {}) => {
    const requestUrl = String(url || "");

    if (requestUrl === "/api/config") {
      return makeJsonResponse({
        providers: {
          grsai: {
            apiUrl: "https://api.grsai.example.com",
            apiKey: "k_grsai",
          },
        },
      });
    }

    if (requestUrl === "/api/v2/proxy/image") {
      const body = JSON.parse(String(options.body || "{}"));
      assert.equal(body.installId, "aic-fixed");
      assert.equal(options.headers["X-AIC-Install-Id"], "aic-fixed");

      if (String(body.apiUrl || "").endsWith("/v1/draw/completions")) {
        assert.equal(body.model, "gpt-image-2");
        return makeJsonResponse({
          status: "pending",
          data: { task_id: "task-grsai-gpt-image-2-multi-1" },
        });
      }

      if (String(body.apiUrl || "").endsWith("/v1/draw/result")) {
        return makeJsonResponse({
          status: "pending",
          source: "body-probe",
        });
      }

      throw new Error(`unexpected proxy image apiUrl: ${body.apiUrl}`);
    }

    if (requestUrl.startsWith("/api/v2/proxy/task?")) {
      assert.match(
        decodeURIComponent(requestUrl),
        /\/v1\/(?:tasks\/|draw\/result)/i,
      );
      return makeJsonResponse({
        status: "success",
        task: {
          images: [
            {
              url: [
                "https://img.example.com/gpt-image-2-a.png",
                "https://img.example.com/gpt-image-2-b.png",
              ],
            },
          ],
        },
      });
    }

    if (requestUrl === "/api/v2/save_output_from_url") {
      const body = JSON.parse(String(options.body || "{}"));
      const sourceUrl = String(body.url || "");
      savedUrls.push(sourceUrl);
      if (sourceUrl.endsWith("gpt-image-2-a.png")) {
        return makeJsonResponse({ path: "output/gpt-image-2-a.png" });
      }
      if (sourceUrl.endsWith("gpt-image-2-b.png")) {
        return makeJsonResponse({ path: "output/gpt-image-2-b.png" });
      }
      throw new Error(`unexpected save url: ${sourceUrl}`);
    }

    throw new Error(`unexpected fetch url: ${requestUrl}`);
  };

  clearApiConfig();

  const result = await generateImage({
    provider: "grsai",
    model: "grsai/gpt-image-2",
    prompt: "p",
    inputUrls: [],
    batchSize: 1,
  });

  assert.equal(result.isBatch, true);
  assert.equal(result.images.length, 2);
  assert.deepEqual(
    result.images.map((item) => item.localPath),
    ["output/gpt-image-2-a.png", "output/gpt-image-2-b.png"],
  );
  assert.deepEqual(savedUrls, [
    "https://img.example.com/gpt-image-2-a.png",
    "https://img.example.com/gpt-image-2-b.png",
  ]);
});
