import test, { afterEach } from "node:test";
import assert from "node:assert/strict";

import { generateTextWithRegistryModel } from "./modelRegistryRuntime.js";

const originalFetch = globalThis.fetch;

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

afterEach(() => {
  globalThis.fetch = originalFetch;
});

test("modelRegistryRuntime: baseUrl 为根地址时自动补全 /chat/completions", async () => {
  globalThis.fetch = async (url, options) => {
    assert.equal(String(url), "https://example.com/v1/chat/completions");
    assert.equal(String(options?.method || "GET"), "POST");
    assert.equal(String(options?.headers?.Authorization || ""), "Bearer sk-text");

    const payload = JSON.parse(String(options?.body || "{}"));
    assert.equal(payload.model, "gemini-3.1-pro");
    assert.equal(payload.messages?.[1]?.content, "hello");

    return makeJsonResponse({
      choices: [
        {
          message: {
            content: "OK",
          },
        },
      ],
    });
  };

  const result = await generateTextWithRegistryModel({
    apiUrl: "https://example.com/v1/",
    apiKey: "sk-text",
    model: "gemini-3.1-pro",
    prompt: "hello",
  });

  assert.equal(result.text, "OK");
});

test("modelRegistryRuntime: 已填写完整 /chat/completions 时保持原地址", async () => {
  globalThis.fetch = async (url) => {
    assert.equal(String(url), "https://example.com/v1/chat/completions");
    return makeJsonResponse({
      choices: [
        {
          message: {
            content: "done",
          },
        },
      ],
    });
  };

  const result = await generateTextWithRegistryModel({
    apiUrl: "https://example.com/v1/chat/completions",
    apiKey: "sk-text",
    model: "gemini-3.1-pro",
    prompt: "hello",
  });

  assert.equal(result.text, "done");
});

test("modelRegistryRuntime: Gemini generateContent endpoint 不会被错误改写", async () => {
  globalThis.fetch = async (url) => {
    assert.equal(
      String(url),
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-pro:generateContent"
    );
    return makeJsonResponse({
      candidates: [
        {
          content: {
            parts: [{ text: "gemini ok" }],
          },
        },
      ],
    });
  };

  const result = await generateTextWithRegistryModel({
    apiUrl:
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-pro:generateContent",
    apiKey: "sk-text",
    model: "gemini-3.1-pro",
    prompt: "hello",
  });

  assert.equal(result.text, "gemini ok");
});
