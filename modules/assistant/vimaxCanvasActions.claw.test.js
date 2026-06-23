import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { mapVimaxShotplanToCanvasActions } from "./vimaxCanvasActions.js";

// B0-C1 regression — run the REAL mapper output through the REAL claw gate.
//
// The ViMax 导演:/成片: path turns its plan into declarative canvas actions
// (mapVimaxShotplanToCanvasActions), and the assistant execution orchestrator
// validates EVERY action through the Python claw schema
// (services/claw_action_schema.py ClawActionSchema.validate_actions) before
// anything lands. The storyboard-script card node type was missing from
// claw's SAFE_NODE_TYPES, so the first card failed validation and - because
// validate_actions is all-or-nothing - the WHOLE batch was rejected
// (_invalid -> empty actions): a successful plan produced ZERO canvas nodes.
//
// The pure-JS mapper tests (vimaxCanvasActions.test.js) only asserted action
// SHAPE and never crossed into claw, which is exactly why the break shipped
// green. This file closes that gap end to end, the same JS<->python way the
// lineage contract tests pin the data-key whitelist.

const REPO_ROOT = fileURLToPath(new URL("../../", import.meta.url));
const PY = process.env.PYTHON || "python";

// Validate a batch through the production claw gate and return the parsed
// result. cwd = repo root so `from services...` resolves (same as the
// canvas-agent r5 regression spawn). `drop` lets a test reproduce the
// pre-fix whitelist in-memory without touching the source file.
function clawValidate(actions, { context = null, drop = [] } = {}) {
  const py = [
    "import sys, json, services.claw_action_schema as m",
    "p = json.loads(sys.stdin.buffer.read().decode('utf-8'))",
    "m.SAFE_NODE_TYPES.difference_update(p.get('drop') or [])",
    "r = m.ClawActionSchema().validate_actions(p['actions'], context=p.get('context'))",
    "sys.stdout.buffer.write(json.dumps(r, ensure_ascii=False).encode('utf-8'))",
  ].join("; ");
  const proc = spawnSync(PY, ["-c", py], {
    cwd: REPO_ROOT,
    input: JSON.stringify({ actions, context, drop }),
    encoding: "utf8",
    env: { ...process.env, PYTHONUTF8: "1", PYTHONIOENCODING: "utf-8" },
  });
  if (proc.error) {
    throw new Error(
      `could not spawn '${PY}' to run the claw validator (set the PYTHON env var to your interpreter): ${proc.error.message}`,
    );
  }
  assert.equal(proc.status, 0, `claw validator crashed:\n${proc.stderr}`);
  return JSON.parse(proc.stdout);
}

// 2 scenes, 3 shots, shot 1 carries a last-frame; Chinese skillRefs also
// exercise UTF-8 across the spawn boundary. Same shape as the sibling
// shape-only suite so the two read as one story.
const SHOTPLAN = {
  schemaVersion: "vimax-shotplan/v1",
  flowId: "flow-abc123",
  shots: [
    { idx: 0, sceneIdx: 0, camIdx: 0, ffDesc: "medium full shot at eye level, man on rocky shore", motionDesc: "static camera, man walks left to center" },
    { idx: 1, sceneIdx: 0, camIdx: 1, ffDesc: "extreme close-up high angle on calloused hands", lfDesc: "hands lower the bottle", motionDesc: "pries cork" },
    { idx: 2, sceneIdx: 1, camIdx: 2, ffDesc: "wide low angle, lighthouse looms", motionDesc: "pushes boat to sea" },
  ],
  skillRefs: ["电影布光大师", "一图成片:顶级执行导演 Skill"],
};

// A non-empty canvas context makes claw's node-reference checks LIVE (with an
// empty context _node_ref_errors short-circuits), so the card->prep edges are
// genuinely resolved against created_aliases rather than passing vacuously.
const CONTEXT = { canvas: { nodes: [{ id: "existing-anchor", type: "ai-text" }] } };

function survivors(result) {
  const actions = result.actions || [];
  return {
    cards: actions.filter((a) => a.type === "create_node" && a.nodeType === "storyboard-script"),
    preps: actions.filter((a) => a.type === "create_node" && a.nodeType === "ai-image"),
    edges: actions.filter((a) => a.type === "connect_nodes"),
    tidy: actions.filter((a) => a.type === "tidy_canvas"),
  };
}

test("claw: every storyboard-script card + ai-image prep + card->prep edge survives validation", () => {
  const { actions } = mapVimaxShotplanToCanvasActions({ shotplan: SHOTPLAN });
  const result = clawValidate(actions, { context: CONTEXT });

  assert.equal(result.valid, true, `claw rejected the plan: ${JSON.stringify(result.errors)}`);
  const { cards, preps, edges, tidy } = survivors(result);
  assert.equal(cards.length, SHOTPLAN.shots.length, "one storyboard-script card per shot survives claw");
  assert.equal(preps.length, SHOTPLAN.shots.length, "one ai-image prep per shot survives claw");
  assert.equal(edges.length, SHOTPLAN.shots.length, "one card->prep edge per shot survives claw");
  assert.equal(tidy.length, 1, "the final tidy_canvas survives claw");

  // The card->prep edges keep both endpoints, and each points from a surviving
  // card id to a surviving prep id (the alias resolution claw runs once the
  // card is an allowed node type).
  const cardIds = new Set(cards.map((a) => a.id || a.nodeId));
  const prepIds = new Set(preps.map((a) => a.id || a.nodeId));
  for (const edge of edges) {
    assert.ok(edge.from && edge.to, "edge keeps both endpoints");
    assert.ok(cardIds.has(edge.from), `edge.from ${edge.from} is a surviving card`);
    assert.ok(prepIds.has(edge.to), `edge.to ${edge.to} is a surviving prep`);
  }

  // Card node type accepted AND its ViMax lineage survived the data-key
  // whitelist - both must hold for the card to be usable downstream.
  const card0 = cards.find((a) => a.data?.vimaxShotIdx === 0);
  assert.ok(card0, "shot 0 card survives with its data intact");
  assert.equal(card0.data.vimaxFlowId, "flow-abc123", "card lineage preserved through claw");
});

test("claw: without storyboard-script in SAFE_NODE_TYPES the WHOLE batch is rejected (proves the guard)", () => {
  // Reproduce the exact pre-fix state in-memory: drop the type from the
  // whitelist and confirm the batch fails closed to zero actions - the
  // failure mode that put nothing on the canvas.
  const { actions } = mapVimaxShotplanToCanvasActions({ shotplan: SHOTPLAN });
  const result = clawValidate(actions, { context: CONTEXT, drop: ["storyboard-script"] });

  assert.equal(result.valid, false, "pre-fix whitelist must reject the plan");
  assert.deepEqual(result.actions, [], "all-or-nothing: a rejected batch lands ZERO nodes");
  assert.ok(
    result.errors.some((e) => /unsupported nodeType storyboard-script/.test(e)),
    `expected the storyboard-script rejection, got: ${JSON.stringify(result.errors)}`,
  );
});

test("claw: a REAL ViMax runner shotplan (golden) maps and validates clean end to end", () => {
  // 铁律 7: the golden is emitted by the real runner, not hand-written. This
  // pins runner -> mapper -> claw, the full production path the bug broke.
  const goldenPath = fileURLToPath(new URL("../../integrations/vimax/__fixtures__/shotplan.golden.json", import.meta.url));
  const shotplan = JSON.parse(readFileSync(goldenPath, "utf-8"));
  const { actions } = mapVimaxShotplanToCanvasActions({ shotplan });
  const result = clawValidate(actions, { context: CONTEXT });

  assert.equal(result.valid, true, `claw rejected the golden plan: ${JSON.stringify(result.errors)}`);
  const { cards, preps, edges } = survivors(result);
  assert.equal(cards.length, shotplan.shots.length, "one card per real shot survives claw");
  assert.equal(preps.length, shotplan.shots.length, "one prep per real shot survives claw");
  assert.equal(edges.length, shotplan.shots.length, "one edge per real shot survives claw");
});
