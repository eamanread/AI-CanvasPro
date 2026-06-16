import assert from "node:assert/strict";
import { mkdtemp, mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { buildDirectorPlanResponse } from "../../tools/director_plan_runner.mjs";

const fixtureDir = fileURLToPath(new URL("./__fixtures__/qmai-live-sample", import.meta.url));

async function createTempDirectorProject() {
  const projectDir = await mkdtemp(join(tmpdir(), "qmai-runner-"));
  await mkdir(join(projectDir, "director/memory"), { recursive: true });
  await writeFile(
    join(projectDir, "director/memory/style-memory.json"),
    JSON.stringify({
      schemaVersion: "director-memory/v1",
      facts: ["全片冷蓝低饱和"],
      candidateFacts: [],
      updatedAt: "2026-06-12T00:00:00.000Z",
    }),
    "utf8",
  );
  return projectDir;
}

const VALID_INTENT = {
  schemaVersion: "director-intent/v1",
  flowId: "flow-runner-ear-001",
  lane: "director",
  laneReason: "用户使用导演前缀显式选择导演道",
  userGoal: "把雨夜便利店告别戏拆成可执行分镜",
  constraints: ["总时长30秒"],
  clarifications: [],
};

test("directorPlanRunner: builds a v2 contract response from a QMAI project directory", async () => {
  const response = await buildDirectorPlanResponse({
    qmaiProjectPath: fixtureDir,
    message: "按 QMAI 项目铺一版导演计划",
  });

  assert.equal(response.success, true);
  assert.equal(response.intent.id, "director_plan");
  assert.deepEqual(response.intent.matchedSkills, ["director"]);
  assert.match(response.reply, /雨屋样例项目/);
  assert.equal(response.execution.status, "draft");
  assert.equal(response.execution.drawerState.visible, true);

  const stepIds = response.plan.steps.map((step) => step.id);
  assert.ok(stepIds.includes("step_cards"));
  const cardActions = response.actionsByStep.step_cards;
  assert.ok(cardActions.length >= 1 && cardActions.length <= 6);
  assert.ok(cardActions.every((action) => action.type === "create_node" && action.nodeType === "comment"));
  assert.ok(cardActions.every((action) => action.metadata?.source === "qmai_director_brain"));
  assert.equal(JSON.stringify(response).includes("qmai-live-sample"), false);
});

test("directorPlanRunner: missing project path fails closed", async () => {
  const previous = process.env.HY_QMAI_PROJECT_DIR;
  delete process.env.HY_QMAI_PROJECT_DIR;
  try {
    const response = await buildDirectorPlanResponse({ message: "导演计划" });
    assert.equal(response.success, false);
    assert.match(String(response.error), /project/i);
  } finally {
    if (previous !== undefined) {
      process.env.HY_QMAI_PROJECT_DIR = previous;
    }
  }
});

test("directorPlanRunner: a valid director intent lands in the QMAI inbox and threads its flowId", async () => {
  const projectDir = await createTempDirectorProject();

  const response = await buildDirectorPlanResponse({
    qmaiProjectPath: projectDir,
    message: "导演计划",
    intent: VALID_INTENT,
  });

  assert.equal(response.success, true);
  assert.equal(response.intent.flowId, "flow-runner-ear-001");
  assert.equal(response.directorFlowId, "flow-runner-ear-001");

  const inboxFiles = await readdir(join(projectDir, "director/inbox"));
  assert.equal(inboxFiles.length, 1);
  assert.match(inboxFiles[0], /intent-flow-runner-ear-001\.json/);
  const saved = JSON.parse(await readFile(join(projectDir, "director/inbox", inboxFiles[0]), "utf8"));
  assert.equal(saved.schemaVersion, "director-intent/v1");
  assert.equal(saved.userGoal, VALID_INTENT.userGoal);
});

test("directorPlanRunner: invalid or non-director intents fail closed", async () => {
  const projectDir = await createTempDirectorProject();

  const wrongLane = await buildDirectorPlanResponse({
    qmaiProjectPath: projectDir,
    intent: { ...VALID_INTENT, lane: "canvas" },
  });
  assert.equal(wrongLane.success, false);
  assert.match(String(wrongLane.error), /lane/);

  const badFlow = await buildDirectorPlanResponse({
    qmaiProjectPath: projectDir,
    intent: { ...VALID_INTENT, flowId: "flow/../escape" },
  });
  assert.equal(badFlow.success, false);
  assert.match(String(badFlow.error), /flowId/);
});

test("directorPlanRunner: dailies mode writes canvas dailies to the QMAI inbox", async () => {
  const projectDir = await createTempDirectorProject();
  const dailies = {
    schemaVersion: "canvas-dailies/v1",
    flowId: "flow-runner-eye-001",
    exportedAt: "2026-06-12T02:00:00.000Z",
    nodes: [{ id: "qmai-shot-shot-001", type: "storyboard-script", name: "shot", generationStatus: null }],
    edges: [],
    stats: { nodeCount: 1, shotCount: 1, imageCount: 0, generatedCount: 0, failedCount: 0 },
  };

  const response = await buildDirectorPlanResponse({
    mode: "dailies",
    qmaiProjectPath: projectDir,
    dailies,
  });

  assert.equal(response.success, true);
  assert.equal(response.nodeCount, 1);
  const inboxFiles = await readdir(join(projectDir, "director/inbox"));
  assert.equal(inboxFiles.length, 1);
  assert.match(inboxFiles[0], /canvas-dailies-flow-runner-eye-001\.json/);

  const malformed = await buildDirectorPlanResponse({
    mode: "dailies",
    qmaiProjectPath: projectDir,
    dailies: { schemaVersion: "canvas-dailies/v9", nodes: [] },
  });
  assert.equal(malformed.success, false);
  assert.match(String(malformed.error), /dailies/i);
});

test("directorPlanRunner: continuity warn maps to requiresConfirmation", async () => {
  const response = await buildDirectorPlanResponse({
    qmaiProjectPath: fixtureDir,
    message: "导演计划",
    continuityReport: {
      schemaVersion: "director-continuity-report/v1",
      status: "warn",
      findings: [{ severity: "warn", message: "服装连续性存疑" }],
    },
  });
  assert.equal(response.success, true);
  assert.equal(response.requiresConfirmation, true);
});

test("directorPlanRunner: tidy_canvas actions bucket into the layout step", async () => {
  const response = await buildDirectorPlanResponse({
    qmaiProjectPath: fixtureDir,
    message: "导演计划",
    storyboard: {
      schemaVersion: "director-storyboard/v1",
      projectId: "project-rain",
      title: "旧伞告别",
      totalDurationSeconds: 10,
      format: "短片",
      visualStyle: "雨夜",
      traceIds: ["recipe-rain-night-short"],
      shots: [{
        id: "shot-001", shotNumber: 1, durationSeconds: 10, shotSize: "wide",
        cameraMove: "固定", action: "动作", emotionalBeat: "建立", visualFocus: "焦点",
        assetIds: [], continuityAnchors: ["锚点"], traceIds: ["recipe-rain-night-short"],
      }],
    },
  });

  assert.equal(response.success, true, response.error);
  const layoutBucket = response.actionsByStep.step_layout || [];
  assert.equal(layoutBucket.some((action) => action.type === "tidy_canvas"), true, JSON.stringify(Object.keys(response.actionsByStep)));
  const shotsBucket = response.actionsByStep.step_shots || [];
  assert.equal(shotsBucket.some((action) => action.type === "tidy_canvas"), false);
});

const ENVELOPE_CARD = {
  schemaVersion: "director-knowledge-card/v1",
  id: "knowledge-negative-space",
  title: "负空间调度",
  craftDomain: "directing",
  principle: "负空间留给缺席的人。",
  productionRule: "构图时在画面左侧保留空位。",
  promptImplication: "prompt 中明确 negative space 位置。",
  whenToUse: ["双人离别戏"],
  whenNotToUse: ["群像戏"],
  source: { fileName: "director-book.md", shortQuote: "负空间是缺席者的位置" },
};

async function writeEnvelope(projectDir) {
  await writeFile(
    join(projectDir, "qmai-director-export.json"),
    JSON.stringify({
      schemaVersion: "qmai-director-export/v1",
      project: { id: "project-rain", name: "雨夜旧宅" },
      exportedAt: "2026-06-12T00:00:00.000Z",
      memory: { entries: [{ id: "m1", type: "style", title: "风格", text: "全片冷蓝低饱和" }] },
      knowledgeCards: [ENVELOPE_CARD],
    }),
    "utf8",
  );
}

test("directorPlanRunner: envelope knowledge cards win over fabricated memory-slice cards", async () => {
  const projectDir = await createTempDirectorProject();
  await writeEnvelope(projectDir);

  const response = await buildDirectorPlanResponse({ qmaiProjectPath: projectDir, message: "导演计划" });

  assert.equal(response.success, true, response.error);
  const cardActions = response.actionsByStep.step_cards;
  assert.equal(cardActions.length, 1);
  assert.match(cardActions[0].data.content, /原则: 负空间留给缺席的人/);
  assert.match(cardActions[0].data.content, /适用: 双人离别戏/);
  assert.match(cardActions[0].data.content, /避免: 群像戏/);
  assert.equal(/摘录: 全片冷蓝低饱和/.test(cardActions[0].data.content), false);
  assert.equal(/知识降级/.test(response.reply), false);
  assert.equal(response.warnings.some((w) => /知识降级/.test(w)), false);
});

test("directorPlanRunner: directory fallback keeps fabricated cards and surfaces the degradation", async () => {
  const projectDir = await createTempDirectorProject();

  const response = await buildDirectorPlanResponse({ qmaiProjectPath: projectDir, message: "导演计划" });

  assert.equal(response.success, true, response.error);
  // Degradation must reach the user: the director panel renders the
  // reply, not response.warnings.
  assert.match(response.reply, /知识降级/);
  assert.equal(response.warnings.some((w) => /知识降级/.test(w)), true);
});

test("directorPlanRunner: envelope artifacts feed storyboard and prompts into the plan", async () => {
  const projectDir = await createTempDirectorProject();
  await writeFile(
    join(projectDir, "qmai-director-export.json"),
    JSON.stringify({
      schemaVersion: "qmai-director-export/v1",
      project: { id: "project-rain", name: "雨夜旧宅" },
      exportedAt: "2026-06-12T00:00:00.000Z",
      memory: { entries: [{ id: "m1", type: "style", title: "风格", text: "全片冷蓝低饱和" }] },
      knowledgeCards: [ENVELOPE_CARD],
      artifacts: {
        storyboard: {
          schemaVersion: "director-storyboard/v1",
          projectId: "project-rain",
          title: "旧伞告别",
          totalDurationSeconds: 12,
          format: "短片",
          visualStyle: "雨夜",
          traceIds: ["recipe-rain-night-short"],
          shots: [{
            id: "shot-001", shotNumber: 1, durationSeconds: 12, shotSize: "wide",
            cameraMove: "固定", action: "门外停顿", emotionalBeat: "建立", visualFocus: "雨幕便利店",
            dramaticBeat: "establish", assetIds: [], continuityAnchors: ["深色湿外套"], traceIds: ["recipe-rain-night-short"],
          }],
        },
        prompts: [{
          schemaVersion: "director-prompt-draft/v1",
          id: "prompt-shot-001-image",
          shotId: "shot-001",
          target: "text_to_image",
          promptLanguage: "Chinese",
          positivePrompt: "雨夜便利店,冷蓝低饱和",
          negativePrompt: "禁止暖光",
          continuityAnchors: ["深色湿外套"],
          keyElementIds: [],
          traceIds: ["recipe-rain-night-short"],
        }],
      },
    }),
    "utf8",
  );

  const response = await buildDirectorPlanResponse({ qmaiProjectPath: projectDir, message: "导演计划" });

  assert.equal(response.success, true, response.error);
  const shotActions = response.actionsByStep.step_shots || [];
  const prepNode = shotActions.find((action) => action.nodeType === "ai-image");
  assert.ok(prepNode, "envelope prompts should produce an ai-image prep node");
  assert.equal(prepNode.autoStart, false);
  assert.equal(prepNode.data.qmaiPromptId, "prompt-shot-001-image");
  assert.match(prepNode.data.prompt, /雨夜便利店/);
});

test("directorPlanRunner: knowledge mode projects envelope cards into llmWiki entry shape", async () => {
  const projectDir = await createTempDirectorProject();
  await writeEnvelope(projectDir);

  const response = await buildDirectorPlanResponse({ mode: "knowledge", qmaiProjectPath: projectDir });

  assert.equal(response.success, true, response.error);
  assert.equal(response.schemaVersion, "director-knowledge-projection/v1");
  assert.equal(response.cards.length, 1);
  const card = response.cards[0];
  assert.equal(card.title, "负空间调度");
  assert.equal(card.citationKind, "qmai");
  assert.equal(card.cardId, "knowledge-negative-space");
  assert.equal(card.craftDomain, "directing");
  // Scalar-only contract: whenToUse must be a joined string, never an
  // array (both context sanitizers drop arrays silently).
  assert.equal(typeof card.whenToUse, "string");
  assert.equal(card.whenToUse, "双人离别戏");
  assert.equal(card.snippet, "prompt 中明确 negative space 位置。");
});

test("directorPlanRunner: knowledge mode fails open with empty cards and a warning", async () => {
  const projectDir = await createTempDirectorProject();

  const response = await buildDirectorPlanResponse({ mode: "knowledge", qmaiProjectPath: projectDir });

  assert.equal(response.success, true);
  assert.deepEqual(response.cards, []);
  assert.match(String(response.warning), /knowledge/i);
});

test("directorPlanRunner: artifactsGeneratedAt reflects disk-read artifacts and is omitted for inline-only plans", async () => {
  const projectDir = await createTempDirectorProject();
  await writeEnvelope(projectDir);

  const fromDisk = await buildDirectorPlanResponse({ qmaiProjectPath: projectDir, message: "导演计划" });
  assert.equal(fromDisk.success, true, fromDisk.error);
  assert.equal(typeof fromDisk.artifactsGeneratedAt, "string");
  assert.equal(Number.isFinite(Date.parse(fromDisk.artifactsGeneratedAt)), true);

  const inlineDir = await createTempDirectorProject();
  const inlineOnly = await buildDirectorPlanResponse({ qmaiProjectPath: inlineDir, message: "导演计划" });
  assert.equal(inlineOnly.success, true, inlineOnly.error);
  assert.equal(inlineOnly.artifactsGeneratedAt, undefined);
});

test("formatDirectorJudgmentAge: renders age and stale hint past 30 minutes", async () => {
  const { formatDirectorJudgmentAge } = await import("../app/appAssistantPanel.js");
  const now = Date.parse("2026-06-12T12:00:00.000Z");
  assert.equal(formatDirectorJudgmentAge("2026-06-12T11:58:00.000Z", now), "(基于 2 分钟前 的导演判断)");
  assert.equal(
    formatDirectorJudgmentAge("2026-06-12T11:00:00.000Z", now),
    "(基于 1 小时前 的导演判断,发送「刷新导演判断」可更新)",
  );
  assert.equal(formatDirectorJudgmentAge("garbage", now), "");
  assert.equal(formatDirectorJudgmentAge(undefined, now), "");
});
