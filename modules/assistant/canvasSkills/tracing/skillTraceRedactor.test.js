import test from "node:test";
import assert from "node:assert/strict";

import { redactSkillTrace } from "./skillTraceRedactor.js";

test("skillTraceRedactor: removes apiKey Authorization Bearer signed URL and long base64", () => {
  const redacted = redactSkillTrace({
    skillId: "imageNode.generate",
    apiKey: "sk-secret-1234567890",
    headers: { Authorization: "Bearer hidden-token" },
    url: "https://cdn.example.test/a.png?token=hidden&signature=sig&safe=1",
    image: `data:image/png;base64,${"a".repeat(180)}`,
    paramsSummary: { promptPreview: "cat" },
  });
  const json = JSON.stringify(redacted);

  assert.doesNotMatch(json, /sk-secret|hidden-token|Bearer hidden|token=hidden|signature=sig|a{80}/);
  assert.match(json, /\[REDACTED/);
  assert.equal(redacted.paramsSummary.promptPreview, "cat");
});
