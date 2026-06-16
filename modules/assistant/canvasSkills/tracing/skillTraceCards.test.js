import test from "node:test";
import assert from "node:assert/strict";

import { createSkillTraceCard } from "./skillTraceCards.js";

test("skillTraceCards: summarizes created node references model and generation count", () => {
  const card = createSkillTraceCard({
    id: "trace-1",
    skillId: "imageNode.generate",
    status: "success",
    nodeId: "img-1",
    nodeType: "ai-image",
    modelDisplayName: "Image Model A",
    paramsSummary: { promptPreview: "cat", batchSize: 4, aspectRatio: "16:9" },
    referencesSummary: { total: 2, uploaded: 1, canvasNodes: 1, assets: 0 },
  });

  assert.equal(card.type, "skill_trace");
  assert.equal(card.traceId, "trace-1");
  assert.match(card.summary, /Image Model A/);
  assert.match(card.summary, /2 个参考/);
  assert.match(card.summary, /4/);
  assert.doesNotMatch(JSON.stringify(card), /apiKey|Authorization/);
});
