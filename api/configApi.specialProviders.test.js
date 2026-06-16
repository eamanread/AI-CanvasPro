import { afterEach, test } from "node:test";
import assert from "node:assert/strict";

import { clearApiConfig, ensureConfig, getProviderConfig } from "./configApi.js";

const originalFetch = globalThis.fetch;

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

afterEach(() => {
  globalThis.fetch = originalFetch;
  clearApiConfig();
});

test("configApi: runninghubwf reuses RunningHUB special provider duration config", async () => {
  globalThis.fetch = async (input) => {
    const url = String(input?.url || input || "");
    if (url !== "/api/config" && !url.endsWith("/api/config")) {
      throw new Error(`unexpected url: ${url}`);
    }

    return jsonResponse({
      providers: {
        runninghub: {
          apiUrl: "https://www.runninghub.cn/",
          apiKey: "rh-workflow-key",
          modelApiKey: "rh-model-key",
          defaultDurationSec: "8",
        },
      },
    });
  };

  clearApiConfig();
  await ensureConfig();

  const workflowConfig = getProviderConfig("runninghubwf");
  assert.equal(workflowConfig.apiUrl, "https://www.runninghub.cn");
  assert.equal(workflowConfig.apiKey, "rh-workflow-key");
  assert.equal(workflowConfig.modelApiKey, "");
  assert.equal(workflowConfig.defaultDurationSec, "8");

  const runninghubConfig = getProviderConfig("runninghub");
  assert.equal(runninghubConfig.modelApiKey, "rh-model-key");
  assert.equal(runninghubConfig.defaultDurationSec, "8");
});
