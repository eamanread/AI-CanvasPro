import assert from "node:assert/strict";
import test from "node:test";

function makeJsonResponse(payload, status = 200) {
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

function mockFetchOnceJson(payload) {
  globalThis.fetch = async (url) => {
    if (String(url) !== "/api/config") {
      throw new Error(`unexpected fetch url: ${String(url)}`);
    }
    return makeJsonResponse(payload);
  };
}

test("configApi: grsai provider 配置优先于 apiUrlInput/apiKeyInput", async () => {
  const originalFetch = globalThis.fetch;

  try {
    mockFetchOnceJson({
      apiUrlInput: "https://grsai.example2.com/",
      apiKeyInput: "k_grsai2",
      providers: {
        grsai: {
          apiUrl: "https://api.grsai.example.com///",
          apiKey: "k_grsai",
        },
      },
      modelRegistry: {
        text: [],
        image: [],
        video: [],
        audio: [],
        other: [],
      },
    });

    const configApi = await import("./configApi.js");
    configApi.clearApiConfig();
    await configApi.ensureConfig();

    const grsai = configApi.getProviderConfig("grsai");
    assert.equal(grsai.apiUrl, "https://api.grsai.example.com");
    assert.equal(grsai.apiKey, "k_grsai");

    const snapshot = configApi.getApiConfigSnapshot();
    assert.ok(snapshot);
    assert.ok(snapshot.modelRegistry);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("configApi: grsai 无 provider 配置时回退 apiUrlInput/apiKeyInput，runninghubwf 复用 runninghub", async () => {
  const originalFetch = globalThis.fetch;

  try {
    mockFetchOnceJson({
      apiUrlInput: "https://api.grsai.example.com///",
      apiKeyInput: "k_grsai",
      providers: {
        ppio: {
          apiUrl: "https://ppio.example.com/",
          apiKey: "k_ppio",
        },
        runninghub: {
          apiUrl: "https://runninghub.example.com/",
          apiKey: "k_rhwf",
          modelApiKey: "k_rhmodel",
        },
      },
    });

    const configApi = await import("./configApi.js");
    configApi.clearApiConfig();
    await configApi.ensureConfig();

    const grsai = configApi.getProviderConfig("grsai");
    assert.equal(grsai.apiUrl, "https://api.grsai.example.com");
    assert.equal(grsai.apiKey, "k_grsai");

    const ppio = configApi.getProviderConfig("ppio");
    assert.equal(ppio.apiUrl, "https://ppio.example.com");
    assert.equal(ppio.apiKey, "k_ppio");

    const runninghub = configApi.getProviderConfig("runninghub");
    assert.equal(runninghub.apiKey, "k_rhwf");
    assert.equal(runninghub.modelApiKey, "k_rhmodel");

    const runninghubwf = configApi.getProviderConfig("runninghubwf");
    assert.equal(runninghubwf.apiUrl, "https://runninghub.example.com");
    assert.equal(runninghubwf.apiKey, "k_rhwf");
    assert.equal(runninghubwf.modelApiKey, "");
  } finally {
    globalThis.fetch = originalFetch;
  }
});
