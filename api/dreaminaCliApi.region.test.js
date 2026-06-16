import test from "node:test";
import assert from "node:assert/strict";

const originalFetch = globalThis.fetch;

function createJsonResponse(data, expectedUrl, expectedMethod, verifyBody) {
  globalThis.fetch = async (url, options = {}) => {
    assert.equal(String(url), expectedUrl);
    assert.equal(String(options?.method || "GET"), expectedMethod);
    verifyBody?.(options?.body);
    return {
      ok: true,
      status: 200,
      headers: { get: () => "application/json" },
      json: async () => data,
      text: async () => JSON.stringify(data),
    };
  };
}

test("dreaminaCliApi: start web login posts selected overseas region", async () => {
  try {
    createJsonResponse(
      { success: true, runtime: { loginMode: "web", loginRegion: "overseas" } },
      "/api/v2/dreamina/login/web",
      "POST",
      (body) => {
        const payload = JSON.parse(String(body || "{}"));
        assert.equal(payload.mode, "web");
        assert.equal(payload.force, false);
        assert.equal(payload.region, "overseas");
      },
    );

    const { startDreaminaWebLoginFromServer } = await import("./dreaminaCliApi.js");
    const result = await startDreaminaWebLoginFromServer({ region: "overseas" });

    assert.equal(result.success, true);
    assert.equal(result.runtime.loginRegion, "overseas");
  } finally {
    globalThis.fetch = originalFetch;
  }
});
