import { afterEach, test } from "node:test";
import assert from "node:assert/strict";

import { clearApiConfig } from "./configApi.js";
import { buildGenerateImageRequest } from "./aiImageApi.js";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
  clearApiConfig();
});

function jsonResponse(payload, status = 200) {
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
    json: async () => payload,
    text: async () => JSON.stringify(payload),
  };
}

test("aiImageApi routes registry-openai payloads through configured model proxy request", async () => {
  globalThis.fetch = async (input) => {
    const url = String(input?.url || input || "");
    if (url === "/api/config" || url.endsWith("/api/config")) {
      return jsonResponse({
        providers: {},
        modelRegistry: {
          image: [
            {
              id: "img-model-1",
              nodeType: "image",
              modelName: "Seedream 4",
              modelId: "seedream-4-0",
              baseUrl: "https://image.example.com/v1/images/generations",
              apiKey: "k-registry",
              adapterType: "openai-compatible",
            },
          ],
        },
      });
    }
    return jsonResponse({ data: [] });
  };

  clearApiConfig();

  const request = await buildGenerateImageRequest({
    provider: "registry-openai",
    selectedModelId: "img-model-1",
    model: "seedream-4-0",
    prompt: "paint",
    inputUrls: [],
    aspectRatio: "16:9",
    imageSize: "2K",
    batchSize: 2,
  });

  assert.equal(request.url, "/api/v2/proxy/image");
  assert.equal(request.body.apiUrl, "https://image.example.com/v1/images/generations");
  assert.equal(request.body.apiKey, "k-registry");
  assert.equal(request.body.model, "seedream-4-0");
  assert.equal(request.body.n, 2);
  assert.equal(request.body.aspectRatio, "16:9");
  assert.equal(request.body.imageSize, "2K");
});
