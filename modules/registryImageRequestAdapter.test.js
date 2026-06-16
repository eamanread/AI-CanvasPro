import test from "node:test";
import assert from "node:assert/strict";

import {
  buildMidjourneyTaskFetchApiUrl,
  buildRegistryImageSubmitRequest,
  normalizeOpenAiCompatibleImageApiUrl,
} from "./registryImageRequestAdapter.js";

test("registryImageRequestAdapter appends OpenAI image endpoint for /v1 base URLs", () => {
  assert.equal(
    normalizeOpenAiCompatibleImageApiUrl("https://yunwu.ai/v1", "openai_compatible"),
    "https://yunwu.ai/v1/images/generations"
  );
  assert.equal(
    normalizeOpenAiCompatibleImageApiUrl(
      "https://image.example.com/v1/images/generations",
      "openai_compatible"
    ),
    "https://image.example.com/v1/images/generations"
  );
});

test("registryImageRequestAdapter maps mj_imagine models to Midjourney proxy submit and fetch URLs", () => {
  const submit = buildRegistryImageSubmitRequest({
    apiUrl: "https://yunwu.ai/v1",
    apiKey: "k_mj",
    model: "mj_imagine",
    adapterType: "openai_compatible",
    prompt: "cat",
    inputUrls: [],
  });

  assert.equal(submit.mode, "midjourney_proxy");
  assert.equal(submit.apiUrl, "https://yunwu.ai/mj/submit/imagine");
  assert.deepEqual(submit.body, { prompt: "cat" });
  assert.equal(
    buildMidjourneyTaskFetchApiUrl(submit.apiUrl, "task-1"),
    "https://yunwu.ai/mj/task/task-1/fetch"
  );
});
