import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { rankDirectorKnowledge } from "./directorKnowledgeRanker.js";
import { buildAssistantCanvasContext } from "./assistantContextBuilder.js";

const VECTORS_PATH = fileURLToPath(new URL("./__fixtures__/director-knowledge-ranker.vectors.json", import.meta.url));

test("directorKnowledgeRanker: shared scoring vectors hold (cross-repo algorithm pin)", async () => {
  const { cards, vectors } = JSON.parse(await readFile(VECTORS_PATH, "utf8"));
  for (const vector of vectors) {
    const ranked = rankDirectorKnowledge(vector.message, cards, { limit: 3 });
    assert.deepEqual(
      ranked.map((card) => card.cardId),
      vector.expectedCardIds,
      `vector drifted for message: ${vector.message}`,
    );
  }
});

test("directorKnowledgeRanker: irrelevant messages inject nothing (precision over recall)", async () => {
  const { cards } = JSON.parse(await readFile(VECTORS_PATH, "utf8"));
  assert.deepEqual(rankDirectorKnowledge("hello world", cards), []);
  assert.deepEqual(rankDirectorKnowledge("", cards), []);
  assert.deepEqual(rankDirectorKnowledge("雨夜构图", []), []);
});

test("contextBuilder: director knowledge entries ride the llmWiki pipe field-intact and merge in front", async () => {
  const { cards } = JSON.parse(await readFile(VECTORS_PATH, "utf8"));
  const graphStore = { nodes: [], edges: [] };
  const workspaceStore = {
    knowledge: {
      llmWiki: {
        mode: "project",
        available: true,
        searchResults: [{ title: "既有wiki结果", snippet: "原有内容", citation: "原文" }],
      },
    },
  };

  const context = buildAssistantCanvasContext({
    graphStore,
    workspaceStore,
    directorKnowledge: cards.slice(0, 2),
  });

  const results = context.knowledge.llmWiki.searchResults;
  // Director cards prepend; the existing workspace results survive
  // (the raw input chain is an || short-circuit - the merge happens
  // inside knowledgeFrom where both sources are visible).
  assert.equal(results[0].cardId, "knowledge-negative-space");
  assert.equal(results[0].citationKind, "qmai");
  assert.equal(results[0].craftDomain, "directing");
  assert.equal(results[0].whenToUse, "双人离别戏、情感留白");
  assert.equal(results[0].citation, "负空间是缺席者的位置");
  assert.equal(results.some((entry) => entry.title === "既有wiki结果"), true);
  assert.equal(context.knowledge.llmWiki.mode, "project");
});

test("contextBuilder: director knowledge alone creates the llmWiki section", () => {
  const context = buildAssistantCanvasContext({
    graphStore: { nodes: [], edges: [] },
    directorKnowledge: [{
      title: "负空间调度",
      snippet: "prompt 中明确 negative space 位置。",
      citation: "负空间是缺席者的位置",
      citationKind: "qmai",
      cardId: "knowledge-negative-space",
      craftDomain: "directing",
      whenToUse: "双人离别戏",
    }],
  });

  assert.equal(context.knowledge.llmWiki.searchResults.length, 1);
  assert.equal(context.knowledge.llmWiki.searchResults[0].cardId, "knowledge-negative-space");
});
