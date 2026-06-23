import test from "node:test";
import assert from "node:assert/strict";

import { runSeedanceWebVideoGeneration } from "./seedanceWebVideoBridge.js";

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

test("seedanceWebVideoBridge: translates overseas page connection failure for node errors", async () => {
  const originalFetch = globalThis.fetch;

  try {
    globalThis.fetch = async (url) => {
      if (String(url) === "/api/v2/seedance-web/tasks") {
        return makeJsonResponse({
          success: true,
          task: { taskCode: "SDW-NOT-CONNECTED", status: "pending" },
        });
      }
      if (String(url) === "/api/v2/seedance-web/query_result?taskCode=SDW-NOT-CONNECTED") {
        return makeJsonResponse({
          success: true,
          taskCode: "SDW-NOT-CONNECTED",
          status: "failed",
          error: "overseas page is not connected",
        });
      }
      throw new Error("unexpected fetch url: " + String(url));
    };

    await assert.rejects(
      runSeedanceWebVideoGeneration({
        prompt: "a dancer in a studio",
        model: "dreamina/seedance2.0",
      }),
      (error) => {
        assert.match(error.message, /海外版即梦网页未连接/);
        assert.doesNotMatch(error.message, /overseas page/i);
        return true;
      },
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("seedanceWebVideoBridge: translates preset diagnostics without losing details", async () => {
  const originalFetch = globalThis.fetch;

  try {
    globalThis.fetch = async (url) => {
      if (String(url) === "/api/v2/seedance-web/tasks") {
        return makeJsonResponse({
          success: true,
          task: { taskCode: "SDW-PRESET-FAILED", status: "pending" },
        });
      }
      if (String(url) === "/api/v2/seedance-web/query_result?taskCode=SDW-PRESET-FAILED") {
        return makeJsonResponse({
          success: true,
          taskCode: "SDW-PRESET-FAILED",
          status: "failed",
          error: "overseas page preset failed: model did not switch to Seedance 2.0; current: Dreamina Seedance 2.0 Fast; options: Seedance 2.0 Fast / Seedance 2.0",
        });
      }
      throw new Error("unexpected fetch url: " + String(url));
    };

    await assert.rejects(
      runSeedanceWebVideoGeneration({
        prompt: "a dancer in a studio",
        model: "dreamina/seedance2.0",
      }),
      (error) => {
        assert.match(error.message, /海外版即梦参数设置失败/);
        assert.match(error.message, /模型/);
        assert.match(error.message, /当前/);
        assert.match(error.message, /Seedance 2\.0 Fast/);
        assert.doesNotMatch(error.message, /overseas page preset failed/i);
        return true;
      },
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("seedanceWebVideoBridge: translates overseas inappropriate audio review failure", async () => {
  const originalFetch = globalThis.fetch;

  try {
    globalThis.fetch = async (url) => {
      if (String(url) === "/api/v2/seedance-web/tasks") {
        return makeJsonResponse({
          success: true,
          task: { taskCode: "SDW-AUDIO-REVIEW", status: "pending" },
        });
      }
      if (String(url) === "/api/v2/seedance-web/query_result?taskCode=SDW-AUDIO-REVIEW") {
        return makeJsonResponse({
          success: true,
          taskCode: "SDW-AUDIO-REVIEW",
          status: "failed",
          error: "The audio may contain inappropriate content",
        });
      }
      throw new Error("unexpected fetch url: " + String(url));
    };

    await assert.rejects(
      runSeedanceWebVideoGeneration({
        prompt: "a dancer in a studio",
        model: "dreamina/seedance2.0",
      }),
      (error) => {
        assert.match(error.message, /审核|不合规|调整提示词|素材/);
        assert.doesNotMatch(error.message, /The audio may contain inappropriate content/i);
        return true;
      },
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("seedanceWebVideoBridge: translates overseas generic refresh-and-retry failure", async () => {
  const originalFetch = globalThis.fetch;

  try {
    globalThis.fetch = async (url) => {
      if (String(url) === "/api/v2/seedance-web/tasks") {
        return makeJsonResponse({
          success: true,
          task: { taskCode: "SDW-SOMETHING-WRONG", status: "pending" },
        });
      }
      if (String(url) === "/api/v2/seedance-web/query_result?taskCode=SDW-SOMETHING-WRONG") {
        return makeJsonResponse({
          success: true,
          taskCode: "SDW-SOMETHING-WRONG",
          status: "failed",
          error: "Something went wrong. Refresh and try again.",
        });
      }
      throw new Error("unexpected fetch url: " + String(url));
    };

    await assert.rejects(
      runSeedanceWebVideoGeneration({
        prompt: "a dancer in a studio",
        model: "dreamina/seedance2.0",
      }),
      (error) => {
        assert.match(error.message, /Overseas Dreamina page error/);
        assert.match(error.message, /Refresh and try again/);
        return true;
      },
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("seedanceWebVideoBridge: keeps polling when query_result has a transient fetch failure", async () => {
  const originalFetch = globalThis.fetch;
  let queryCount = 0;

  try {
    globalThis.fetch = async (url) => {
      if (String(url) === "/api/v2/seedance-web/tasks") {
        return makeJsonResponse({
          success: true,
          task: { taskCode: "SDW-QUERY-RETRY", status: "pending" },
        });
      }
      if (String(url) === "/api/v2/seedance-web/query_result?taskCode=SDW-QUERY-RETRY") {
        queryCount += 1;
        if (queryCount === 1) {
          throw new Error("Failed to fetch");
        }
        return makeJsonResponse({
          success: true,
          taskCode: "SDW-QUERY-RETRY",
          status: "completed",
          videos: [{ localPath: "user_data/seedance_web/files/out.mp4" }],
        });
      }
      throw new Error("unexpected fetch url: " + String(url));
    };

    const result = await runSeedanceWebVideoGeneration({
      prompt: "a dancer in a studio",
      model: "dreamina/seedance2.0",
    });

    assert.equal(queryCount, 2);
    assert.equal(result.localPath, "user_data/seedance_web/files/out.mp4");
  } finally {
    globalThis.fetch = originalFetch;
  }
});
