import test from "node:test";
import assert from "node:assert/strict";
import { createConnectedStoryboardScriptNode, VIDEO_STORYBOARD_SCRIPT_DEFAULT_PROMPT } from "./components/nodeToolbar/storyboardScriptAction.js";

test("video toolbar action creates a connected storyboard-script node", () => {
  const addedNodes = [];
  const addedEdges = [];
  let selected = [];
  let committed = false;
  const sourceNode = { id: "video-1", type: "source-video", x: 100, y: 200, width: 320, height: 180, name: "\u6e90\u89c6\u9891" };
  const storeInstance = {
    getStateRaw: () => ({ nodes: { "video-1": sourceNode }, edges: [] }),
    addNode: (node) => addedNodes.push(node),
    setSelectedNodes: (ids) => { selected = ids; },
    deleteNodes: () => {}
  };
  const result = createConnectedStoryboardScriptNode({
    sourceNode,
    storeInstance,
    generateId: () => "storyboard-script-1",
    calcSafeSpawnPosNearNode: () => ({ x: 480, y: 200 }),
    isValidConnectionFn: () => true,
    addEdgeWithPolicies: (edge) => { addedEdges.push(edge); return true; },
    commit: () => { committed = true; }
  });
  assert.deepEqual(result, { ok: true, nodeId: "storyboard-script-1" });
  assert.equal(addedNodes[0].type, "storyboard-script");
  assert.equal(addedNodes[0].x, 480);
  assert.equal(addedNodes[0].storyboardScript.title, "\u5206\u955c\u811a\u672c");
  assert.equal(addedNodes[0].storyboardScript.prompt, VIDEO_STORYBOARD_SCRIPT_DEFAULT_PROMPT);
  assert.deepEqual(addedEdges, [{ sourceId: "video-1", targetId: "storyboard-script-1" }]);
  assert.deepEqual(selected, ["storyboard-script-1"]);
  assert.equal(committed, true);
});

test("video storyboard default prompt is descriptive and non-empty", () => {
  assert.equal(typeof VIDEO_STORYBOARD_SCRIPT_DEFAULT_PROMPT, "string");
  assert.ok(VIDEO_STORYBOARD_SCRIPT_DEFAULT_PROMPT.length > 10);
  assert.match(VIDEO_STORYBOARD_SCRIPT_DEFAULT_PROMPT, /\u89c6\u9891/);
});
