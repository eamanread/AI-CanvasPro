import test from "node:test";
import assert from "node:assert/strict";

import { enforceNoGenerationConstraint, noGenerationConstraintScope } from "./huanyingTools.js";
import { responseFromModelText } from "./piClient.js";

const GEN = { type: "queue_generation_task", id: "g1", nodeType: "ai-text" };
const VGEN = { type: "queue_generation_task", id: "g2", nodeType: "ai-video" };
const CREATE = { type: "create_node", id: "n1", nodeType: "ai-text" };

test("noGenerationConstraintScope: explicit no-generation phrasings map to all", () => {
  for (const msg of [
    "只创建节点，不要生成。",
    "绝对不要排队任何生成任务（包括文本和图像，我会自己跑）。",
    "先创建节点和连线即可，生成任务我会自己跑。",
    "暂不生成，搭好结构就行",
  ]) {
    assert.equal(noGenerationConstraintScope(msg), "all", msg);
  }
});

test("noGenerationConstraintScope: explicit run requests are not filtered", () => {
  for (const msg of [
    "对文本节点 ai-text-1 执行生成，只跑这一个节点。",
    "创建一个文本节点并立即对它执行生成。",
    "马上生成一张图",
  ]) {
    assert.equal(noGenerationConstraintScope(msg), "none", msg);
  }
});

test("noGenerationConstraintScope: video-scoped negation only blocks video", () => {
  assert.equal(noGenerationConstraintScope("不要生成视频，图片正常出"), "video");
});

test("enforceNoGenerationConstraint: drops generation actions and records warning", () => {
  const out = enforceNoGenerationConstraint("只创建节点，不要生成。", {
    actions: [CREATE, GEN, VGEN],
    actionsByStep: { step_actions: [CREATE, GEN, VGEN] },
    warnings: [],
  });
  assert.deepEqual(out.actions.map((a) => a.id), ["n1"]);
  assert.deepEqual(out.actionsByStep.step_actions.map((a) => a.id), ["n1"]);
  assert.match(out.warnings.join(" "), /dropped 2 generation action/);
});

test("enforceNoGenerationConstraint: video scope keeps text/image generation", () => {
  const out = enforceNoGenerationConstraint("不要生成视频", { actions: [CREATE, GEN, VGEN] });
  assert.deepEqual(out.actions.map((a) => a.id), ["n1", "g1"]);
});

test("enforceNoGenerationConstraint: stamps autoStart=false on create actions even when nothing dropped", () => {
  const out = enforceNoGenerationConstraint("只创建节点，不要生成。", { actions: [CREATE], warnings: [] });
  assert.equal(out.actions[0].autoStart, false);
  assert.equal(out.actions[0].data.autoStart, false);
});

test("responseFromModelText: model relapse is gated deterministically", () => {
  const modelText = JSON.stringify({
    reply: "已创建并开始生成",
    actions: [CREATE, GEN],
  });
  const res = responseFromModelText({ id: "req-1", mode: "actions", message: "只创建节点，不要生成。" }, modelText);
  assert.deepEqual((res.actions || []).map((a) => a.type), ["create_node"]);
  assert.match((res.warnings || []).join(" "), /dropped 1 generation action/);
});

test("responseFromModelText: explicit generate request passes through untouched", () => {
  const modelText = JSON.stringify({ reply: "开始生成", actions: [GEN] });
  const res = responseFromModelText({ id: "req-2", mode: "actions", message: "对文本节点执行生成" }, modelText);
  assert.deepEqual((res.actions || []).map((a) => a.type), ["queue_generation_task"]);
});
