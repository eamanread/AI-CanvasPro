import assert from "node:assert/strict";
import test from "node:test";

const originalFetch = globalThis.fetch;

function mockJsonResponse(payload, expectedUrl, expectedMethod = "GET", inspectBody = null) {
  globalThis.fetch = async (url, options = {}) => {
    assert.equal(String(url), expectedUrl);
    assert.equal(String(options?.method || "GET"), expectedMethod);
    if (typeof inspectBody === "function") {
      inspectBody(options?.body);
    }
    return {
      ok: true,
      status: 200,
      headers: { get: () => "application/json" },
      json: async () => payload,
      text: async () => JSON.stringify(payload),
    };
  };
}

test("seedanceWebApi: fetch status uses seedance-web endpoint", async () => {
  try {
    mockJsonResponse(
      { success: true, status: { available: true } },
      "/api/v2/seedance-web/status"
    );
    const { fetchSeedanceWebStatusFromServer } = await import("./seedanceWebApi.js");
    const status = await fetchSeedanceWebStatusFromServer();
    assert.equal(status.available, true);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("seedanceWebApi: login posts force flag", async () => {
  try {
    mockJsonResponse(
      { success: true, runtime: { phase: "browser_started" } },
      "/api/v2/seedance-web/login",
      "POST",
      (body) => {
        const payload = JSON.parse(String(body || "{}"));
        assert.equal(payload.force, true);
      }
    );
    const { startSeedanceWebLoginFromServer } = await import("./seedanceWebApi.js");
    const runtime = await startSeedanceWebLoginFromServer({ force: true });
    assert.equal(runtime.phase, "browser_started");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("seedanceWebApi: logout posts to logout endpoint", async () => {
  try {
    mockJsonResponse(
      { success: true, status: { phase: "profile_preserved" } },
      "/api/v2/seedance-web/logout",
      "POST"
    );
    const { logoutSeedanceWebFromServer } = await import("./seedanceWebApi.js");
    const status = await logoutSeedanceWebFromServer();
    assert.equal(status.phase, "profile_preserved");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("seedanceWebApi: submit video task posts to seedance tasks endpoint", async () => {
  try {
    mockJsonResponse(
      { success: true, task: { taskCode: "SDW-1" } },
      "/api/v2/seedance-web/tasks",
      "POST",
      (body) => {
        const payload = JSON.parse(String(body || "{}"));
        assert.equal(payload.prompt, "dog");
      }
    );
    const { submitSeedanceWebVideoTask } = await import("./seedanceWebApi.js");

    const result = await submitSeedanceWebVideoTask({ prompt: "dog" });

    assert.equal(result.taskCode, "SDW-1");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("seedanceWebApi: query result reads seedance task", async () => {
  try {
    mockJsonResponse(
      { success: true, status: "completed", videos: [{ localPath: "demo.mp4" }] },
      "/api/v2/seedance-web/query_result?taskCode=SDW-1"
    );
    const { querySeedanceWebResult } = await import("./seedanceWebApi.js");

    const result = await querySeedanceWebResult("SDW-1");

    assert.equal(result.status, "completed");
    assert.equal(result.videos[0].localPath, "demo.mp4");
  } finally {
    globalThis.fetch = originalFetch;
  }
});
