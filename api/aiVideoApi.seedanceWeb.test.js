import test from "node:test";
import assert from "node:assert/strict";

import { generateVideo } from "./index.js";

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

test("aiVideoApi: overseas Dreamina video uses Seedance web task bridge", async () => {
  const originalFetch = globalThis.fetch;
  const originalLocalStorage = globalThis.localStorage;
  const calls = [];

  try {
    globalThis.localStorage = {
      getItem(key) {
        return key === "dreaminaLoginRegion" ? "overseas" : null;
      },
      setItem() {},
      removeItem() {},
    };
    globalThis.fetch = async (url, options = {}) => {
      const call = { url: String(url), options };
      calls.push(call);
      if (call.url === "/api/v2/seedance-web/tasks") {
        return makeJsonResponse({
          success: true,
          task: { taskCode: "SDW-VIDEO-1", status: "pending" },
        });
      }
      if (call.url === "/api/v2/seedance-web/query_result?taskCode=SDW-VIDEO-1") {
        return makeJsonResponse({
          success: true,
          taskCode: "SDW-VIDEO-1",
          status: "completed",
          videos: [
            {
              videoUrl: "/user_data/seedance_web/files/out.mp4",
              localPath: "user_data/seedance_web/files/out.mp4",
            },
          ],
        });
      }
      throw new Error("unexpected fetch url: " + call.url);
    };

    const taskMeta = [];
    const result = await generateVideo(
      {
        provider: "dreamina",
        model: "dreamina/seedance2.0fast",
        prompt: "a dog running",
        aspectRatio: "16:9",
        duration: 5,
      },
      {
        onTaskMeta: (meta) => taskMeta.push(meta),
      },
    );

    assert.equal(calls[0].url, "/api/v2/seedance-web/tasks");
    assert.ok(!calls.some((call) => call.url.includes("/api/v2/dreamina/")));
    assert.equal(taskMeta[0].provider, "seedance_web");
    assert.equal(taskMeta[0].taskId, "SDW-VIDEO-1");
    assert.equal(result.localPath, "user_data/seedance_web/files/out.mp4");
  } finally {
    globalThis.fetch = originalFetch;
    if (originalLocalStorage === undefined) {
      delete globalThis.localStorage;
    } else {
      globalThis.localStorage = originalLocalStorage;
    }
  }
});

test("aiVideoApi: direct video API also uses Seedance web bridge for overseas Dreamina", async () => {
  const originalFetch = globalThis.fetch;
  const originalLocalStorage = globalThis.localStorage;
  const calls = [];

  try {
    globalThis.localStorage = {
      getItem(key) {
        return key === "dreaminaLoginRegion" ? "overseas" : null;
      },
      setItem() {},
      removeItem() {},
    };
    globalThis.fetch = async (url, options = {}) => {
      const call = { url: String(url), options };
      calls.push(call);
      if (call.url === "/api/v2/seedance-web/tasks") {
        return makeJsonResponse({
          success: true,
          task: { taskCode: "SDW-DIRECT-1", status: "pending" },
        });
      }
      if (call.url === "/api/v2/seedance-web/query_result?taskCode=SDW-DIRECT-1") {
        return makeJsonResponse({
          success: true,
          taskCode: "SDW-DIRECT-1",
          status: "completed",
          videos: [{ localPath: "user_data/seedance_web/files/direct.mp4" }],
        });
      }
      throw new Error("unexpected fetch url: " + call.url);
    };

    const { generateVideo } = await import("./aiVideoApi.js");
    const result = await generateVideo({
      provider: "dreamina",
      model: "dreamina/seedance2.0fast",
      prompt: "a dog running",
      aspectRatio: "16:9",
      duration: 5,
    });

    assert.equal(calls[0].url, "/api/v2/seedance-web/tasks");
    assert.ok(!calls.some((call) => call.url.includes("/api/v2/dreamina/")));
    assert.equal(result.localPath, "user_data/seedance_web/files/direct.mp4");
  } finally {
    globalThis.fetch = originalFetch;
    if (originalLocalStorage === undefined) {
      delete globalThis.localStorage;
    } else {
      globalThis.localStorage = originalLocalStorage;
    }
  }
});
