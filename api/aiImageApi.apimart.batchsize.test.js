import test from "node:test";
import assert from "node:assert/strict";

function makeJsonResponse(data, status = 200) {
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
    json: async () => data,
    text: async () => JSON.stringify(data),
  };
}

function installFetchMockForConfig(config) {
  globalThis.fetch = async (url) => {
    const requestUrl = String(url);
    if (requestUrl !== "/api/config") {
      throw new Error(`unexpected fetch url: ${requestUrl}`);
    }
    return makeJsonResponse(config);
  };
}

test("aiImageApi: apimart request forwards batchSize to n", async () => {
  const originalFetch = globalThis.fetch;
  try {
    installFetchMockForConfig({
      providers: {
        apimart: {
          apiUrl: "https://api.apimart.ai/",
          apiKey: "k_apimart",
        },
      },
    });

    const { clearApiConfig } = await import("./configApi.js");
    clearApiConfig();

    const { buildGenerateImageRequest } = await import("./aiImageApi.js");
    const request = await buildGenerateImageRequest({
      provider: "apimart",
      model: "apimart/nano-banana-2",
      prompt: "test prompt",
      batchSize: 2,
      inputUrls: [],
    });

    assert.equal(request.url, "/api/v2/proxy/image");
    assert.equal(request.body.n, 2);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("aiImageApi: apimart model-only request also forwards batchSize to n", async () => {
  const originalFetch = globalThis.fetch;
  try {
    installFetchMockForConfig({
      providers: {
        apimart: {
          apiUrl: "https://api.apimart.ai/",
          apiKey: "k_apimart",
        },
      },
    });

    const { clearApiConfig } = await import("./configApi.js");
    clearApiConfig();

    const { buildGenerateImageRequest } = await import("./aiImageApi.js");
    const request = await buildGenerateImageRequest({
      model: "apimart/nano-banana-2",
      prompt: "test prompt",
      batchSize: 2,
      inputUrls: [],
    });

    assert.equal(request.url, "/api/v2/proxy/image");
    assert.equal(request.body.n, 2);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
