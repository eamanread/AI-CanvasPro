import test from "node:test";
import assert from "node:assert/strict";

import { applyFeatureSelectionsToNodeData } from "./featureSelectionMemory.js";

test("featureSelectionMemory: ai-image 默认记忆切到 registry 模型", () => {
  const nextNodeData = applyFeatureSelectionsToNodeData(
    {
      id: "node-ai-image-default",
      type: "ai-image",
    },
    {}
  );

  assert.equal(nextNodeData.selectedModelId, "mdl_image_default_nano_banana_2");
  assert.equal(nextNodeData.selectedModelNameSnapshot, "NanoBanana-2");
  assert.equal(nextNodeData.modelDeleted, false);
  assert.equal(nextNodeData.model, "nano-banana-2");
  assert.equal(nextNodeData.provider, "registry-openai");
});
