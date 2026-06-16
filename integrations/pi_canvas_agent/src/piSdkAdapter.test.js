import assert from "node:assert/strict";
import test from "node:test";

import { runPiCompletion } from "./piSdkAdapter.js";

test("piSdkAdapter: falls back to direct OpenAI-compatible chat completion when Pi SDK package is missing", async () => {
  const calls = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, options = {}) => {
    calls.push({ url, options });
    return {
      ok: true,
      status: 200,
      async json() {
        return {
          choices: [
            {
              message: {
                content: JSON.stringify({ reply: "direct reply", actions: [], warnings: [] })
              }
            }
          ]
        };
      },
      async text() {
        return "";
      }
    };
  };

  try {
    const text = await runPiCompletion({
      model: "gpt-5.5",
      systemPrompt: "system",
      message: "hello",
      context: { canvas: { nodes: [] } },
      toolName: "huanying_canvas",
      baseUrl: "https://text.example/v1/chat/completions",
      apiKey: "text-key"
    });

    assert.equal(text, JSON.stringify({ reply: "direct reply", actions: [], warnings: [] }));
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, "https://text.example/v1/chat/completions");
    assert.equal(calls[0].options.method, "POST");
    assert.equal(calls[0].options.headers.Authorization, "Bearer text-key");
    const body = JSON.parse(calls[0].options.body);
    assert.equal(body.model, "gpt-5.5");
    assert.equal(body.stream, false);
    assert.equal(body.messages[0].role, "system");
    assert.equal(body.messages[1].role, "user");
  } finally {
    globalThis.fetch = originalFetch;
  }
});


test("piSdkAdapter: includes OpenAI-compatible error message from text fallback body", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => ({
    ok: false,
    status: 400,
    async json() {
      return { error: { message: "missing required parameter: max_tokens" } };
    },
    async text() {
      return "";
    }
  });

  try {
    await assert.rejects(
      () => runPiCompletion({
        model: "gpt-5.5",
        systemPrompt: "system",
        message: "hello",
        context: {},
        toolName: "huanying_canvas",
        baseUrl: "https://text.example/v1",
        apiKey: "text-key"
      }),
      /missing required parameter: max_tokens/
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});


test("piSdkAdapter: includes string error payloads from OpenAI-compatible fallback", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => ({
    ok: false,
    status: 400,
    async json() {
      return { error: "prompt contains unsupported test journey request" };
    },
    async text() {
      return "";
    }
  });

  try {
    await assert.rejects(
      () => runPiCompletion({
        model: "gpt-5.5",
        systemPrompt: "system",
        message: "hello",
        context: {},
        toolName: "huanying_canvas",
        baseUrl: "https://text.example/v1",
        apiKey: "text-key"
      }),
      /prompt contains unsupported test journey request/
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("piSdkAdapter: openai-suffixed gateway base resolves to /v1/chat/completions", async () => {
  const calls = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, options = {}) => {
    calls.push({ url, options });
    return {
      ok: true,
      status: 200,
      async json() {
        return { choices: [{ message: { content: "{}" } }] };
      },
      async text() {
        return "";
      }
    };
  };

  try {
    await runPiCompletion({
      model: "gpt-5.5",
      systemPrompt: "system",
      message: "hello",
      context: {},
      toolName: "huanying_canvas",
      baseUrl: "https://api.gptclubapi.xyz/openai",
      apiKey: "gateway-key"
    });

    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, "https://api.gptclubapi.xyz/openai/v1/chat/completions");
  } finally {
    globalThis.fetch = originalFetch;
  }
});
