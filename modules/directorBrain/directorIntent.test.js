import assert from "node:assert/strict";
import test from "node:test";

import { buildDirectorIntent, DIRECTOR_INTENT_SCHEMA_VERSION } from "./directorIntent.js";

const BASE = {
  userMessage: "帮我把雨夜便利店告别戏拍成30秒短片",
  lane: "director",
  laneReason: "用户请求是影视制作任务,匹配导演道:分镜/连续性/制作配方",
  flowId: "flow-conv-20260612-001",
  constraints: ["总时长30秒", "外套必须始终湿透并保持深色"],
  clarifications: [
    { question: "画幅比例?", answer: "16:9" },
  ],
};

test("directorIntent: builds a sanitized director-intent/v1 with the explicit lane decision", () => {
  const intent = buildDirectorIntent(BASE);

  assert.equal(intent.schemaVersion, DIRECTOR_INTENT_SCHEMA_VERSION);
  assert.equal(intent.flowId, "flow-conv-20260612-001");
  assert.equal(intent.lane, "director");
  assert.match(intent.laneReason, /导演道/);
  assert.equal(intent.userGoal, BASE.userMessage);
  assert.deepEqual(intent.constraints, BASE.constraints);
  assert.equal(intent.clarifications.length, 1);
});

test("directorIntent: omitted clarifications and constraints default to empty arrays", () => {
  const intent = buildDirectorIntent({
    userMessage: BASE.userMessage,
    lane: "director",
    laneReason: BASE.laneReason,
    flowId: BASE.flowId,
  });

  assert.deepEqual(intent.constraints, []);
  assert.deepEqual(intent.clarifications, []);
});

test("directorIntent: lane decisions must be explicit and auditable", () => {
  assert.throws(() => buildDirectorIntent({ ...BASE, laneReason: "  " }), /laneReason/);
  assert.throws(() => buildDirectorIntent({ ...BASE, lane: "magic" }), /lane/);
  assert.throws(() => buildDirectorIntent({ ...BASE, flowId: "flow/../escape" }), /flowId/);
  assert.throws(() => buildDirectorIntent({ ...BASE, userMessage: "" }), /userMessage|userGoal/);
});

test("directorIntent: local paths never enter the intent", () => {
  assert.throws(
    () => buildDirectorIntent({ ...BASE, projectHint: "D:\\Backup\\Documents\\导演wiki\\QMAI" }),
    /path/i,
  );

  const intent = buildDirectorIntent({
    ...BASE,
    constraints: ["参考 D:\\secret\\refs\\style.md 的风格", "总时长30秒"],
  });
  assert.equal(JSON.stringify(intent).includes("D:\\\\secret"), false);
});
