import test from "node:test";
import assert from "node:assert/strict";

import { getModelMenuSubtitle } from "./modelMenuDescriptions.js";

test("getModelMenuSubtitle maps known image models to simple Chinese guidance", () => {
  assert.equal(
    getModelMenuSubtitle(
      {
        modelName: "NanoBanana-2",
        modelId: "nano-banana-2",
      },
      { nodeType: "image" }
    ),
    "适合快速出图"
  );

  assert.equal(
    getModelMenuSubtitle(
      {
        modelName: "gpt-image-2",
        modelId: "gpt-image-2",
      },
      { nodeType: "image" }
    ),
    "适合高质量细节"
  );
});

test("getModelMenuSubtitle maps known text models to simple Chinese guidance", () => {
  assert.equal(
    getModelMenuSubtitle(
      {
        modelName: "deepseek-v3.2",
        modelId: "deepseek/deepseek-v3.2",
      },
      { nodeType: "text" }
    ),
    "适合推理问答"
  );

  assert.equal(
    getModelMenuSubtitle(
      {
        modelName: "gemini-3.1",
        modelId: "gemini-3.1-pro",
      },
      { nodeType: "text" }
    ),
    "适合多模态理解"
  );
});

test("getModelMenuSubtitle uses generic node-type fallback for unknown families", () => {
  assert.equal(
    getModelMenuSubtitle(
      {
        modelName: "unknown-video",
        modelId: "unknown-video",
      },
      { nodeType: "video" }
    ),
    "通用视频生成"
  );

  assert.equal(
    getModelMenuSubtitle(
      {
        modelName: "unknown-audio",
        modelId: "unknown-audio",
      },
      { nodeType: "audio" }
    ),
    "通用音频生成"
  );
});
