import test from "node:test";
import assert from "node:assert/strict";

const originalFetch = globalThis.fetch;

function createJsonResponse(data, expectedUrl, expectedMethod = "GET", verifyBody = null) {
  globalThis.fetch = async (url, options = {}) => {
    assert.equal(String(url), expectedUrl);
    assert.equal(String(options?.method || "GET"), expectedMethod);
    if (typeof verifyBody === "function") {
      verifyBody(options?.body);
    }
    return {
      ok: true,
      status: 200,
      headers: { get: () => "application/json" },
      json: async () => data,
      text: async () => JSON.stringify(data),
    };
  };
}

test("dreaminaCliApi: fetch status with refresh", async () => {
  try {
    createJsonResponse({ installed: true, loggedIn: true }, "/api/v2/dreamina/status?refresh=1");
    const { fetchDreaminaCliStatusFromServer } = await import("./dreaminaCliApi.js");

    const status = await fetchDreaminaCliStatusFromServer({ refresh: true });

    assert.equal(status.installed, true);
    assert.equal(status.loggedIn, true);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("dreaminaCliApi: headless login helpers are not exported", async () => {
  const api = await import("./dreaminaCliApi.js");

  assert.equal(Object.hasOwn(api, "startDreaminaHeadlessLoginFromServer"), false);
  assert.equal(Object.hasOwn(api, "startDreaminaHeadlessReloginFromServer"), false);
});

test("dreaminaCliApi: start web login posts web mode and force flag", async () => {
  try {
    createJsonResponse(
      { success: true, runtime: { loginMode: "web" } },
      "/api/v2/dreamina/login/web",
      "POST",
      (body) => {
        const payload = JSON.parse(String(body || "{}"));
        assert.equal(payload.mode, "web");
        assert.equal(payload.force, true);
      },
    );
    const { startDreaminaWebLoginFromServer } = await import("./dreaminaCliApi.js");

    const result = await startDreaminaWebLoginFromServer({ force: true });

    assert.equal(result.success, true);
    assert.equal(result.runtime.loginMode, "web");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("dreaminaCliApi: import login response posts JSON payload", async () => {
  try {
    createJsonResponse(
      { success: true, runtime: { phase: "starting" } },
      "/api/v2/dreamina/login/import",
      "POST",
      (body) => {
        const payload = JSON.parse(String(body || "{}"));
        assert.equal(typeof payload.loginResponse, "object");
        assert.equal(payload.loginResponse.submit_id, "abc123");
      },
    );
    const { importDreaminaLoginResponseFromServer } = await import("./dreaminaCliApi.js");

    const result = await importDreaminaLoginResponseFromServer({ submit_id: "abc123", ok: true });

    assert.equal(result.success, true);
    assert.equal(result.runtime.phase, "starting");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("dreaminaCliApi: logout posts to logout endpoint", async () => {
  try {
    createJsonResponse({ success: true }, "/api/v2/dreamina/logout", "POST");
    const { logoutDreaminaFromServer } = await import("./dreaminaCliApi.js");

    const result = await logoutDreaminaFromServer();

    assert.equal(result.success, true);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("dreaminaCliApi: cancel login posts to cancel endpoint", async () => {
  try {
    createJsonResponse({ success: true }, "/api/v2/dreamina/login/cancel", "POST");
    const { cancelDreaminaLoginFromServer } = await import("./dreaminaCliApi.js");

    const result = await cancelDreaminaLoginFromServer();

    assert.equal(result.success, true);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
