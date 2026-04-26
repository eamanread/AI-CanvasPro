import assert from "node:assert/strict";
import test from "node:test";

import {
  buildImageQueryCandidates,
  validateModel,
} from "./modelValidationService.js";

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

test("modelValidationService: 文本模型测试成功后返回 available", async () => {
  const originalFetch = globalThis.fetch;

  try {
    globalThis.fetch = async (url, options) => {
      assert.equal(String(url), "/api/v2/proxy/completions");
      const payload = JSON.parse(String(options?.body || "{}"));
      assert.equal(payload.model, "gemini-3.1");
      assert.equal(payload.messages[1].content, "Reply with OK only.");
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

    const result = await validateModel({
      nodeType: "text",
      modelName: "gemini-3.1",
      modelId: "gemini-3.1",
      apiKey: "sk-test",
      baseUrl: "https://example.com/v1/chat/completions",
    });

    assert.equal(result.status, "available");
    assert.equal(result.lastError, "");
    assert.equal(result.lastTestResult.ok, true);
    assert.match(result.lastTestResult.previewText, /OK/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("modelValidationService: 图片模型返回 taskId 后会轮询直至成功", async () => {
  const originalFetch = globalThis.fetch;
  const fetchUrls = [];

  try {
    globalThis.fetch = async (url, options) => {
      fetchUrls.push(String(url));
      if (String(url) === "/api/v2/proxy/image") {
        const payload = JSON.parse(String(options?.body || "{}"));
        if (payload.apiUrl === "https://grsai.example.com/v1/draw/nano-banana") {
          return makeJsonResponse({
            task_id: "task-123",
            status: "submitted",
          });
        }

        if (payload.apiUrl === "https://grsai.example.com/v1/draw/result") {
          assert.equal(payload.id, "task-123");
          return makeJsonResponse({
            code: 0,
            data: {
              id: "task-123",
              status: "succeeded",
              results: [
                {
                  url: "https://example.com/output.png",
                },
              ],
            },
          });
        }

        throw new Error(`unexpected image proxy apiUrl: ${String(payload.apiUrl || "")}`);
      }

      if (String(url).startsWith("/api/v2/proxy/task?apiUrl=")) {
        throw new Error(`unexpected fetch url: ${String(url)}`);
      }

      throw new Error(`unexpected fetch url: ${String(url)}`);
    };

    const result = await validateModel({
      nodeType: "image",
      modelName: "NanoBanana-2",
      modelId: "nano-banana-2",
      apiKey: "sk-image",
      baseUrl: "https://grsai.example.com/v1/draw/nano-banana",
    });

    assert.equal(result.status, "available");
    assert.equal(result.lastTestResult.ok, true);
    assert.equal(result.lastTestResult.taskId, "task-123");
    assert.equal(result.lastTestResult.outputUrl, "https://example.com/output.png");
    assert.ok(
      fetchUrls.some((url) =>
        url === "/api/v2/proxy/image"
      )
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("modelValidationService: 缺少四要素时直接返回 unconfigured", async () => {
  const result = await validateModel({
    nodeType: "text",
    modelName: "gemini-3.1",
    modelId: "",
    apiKey: "sk-test",
    baseUrl: "",
  });

  assert.equal(result.status, "unconfigured");
  assert.match(result.lastError, /缺少 modelId、apiKey 或 baseUrl/);
  assert.equal(result.lastTestResult.ok, false);
});

test("modelValidationService: 可推导 grsai 与 apimart 的查询地址", () => {
  const grsaiCandidates = buildImageQueryCandidates(
    "https://grsai.example.com/v1/draw/nano-banana",
    "task-1"
  );
  assert.deepEqual(grsaiCandidates, [
    "https://grsai.example.com/v1/draw/result?task_id=task-1",
    "https://grsai.example.com/v1/draw/query?task_id=task-1",
    "https://grsai.example.com/v1/draw/nano-banana/query?task_id=task-1",
  ]);

  const apimartCandidates = buildImageQueryCandidates(
    "https://api.apimart.ai/v1/tasks/submit",
    "task-2"
  );
  assert.ok(apimartCandidates.includes("https://api.apimart.ai/v1/tasks/task-2"));
});
