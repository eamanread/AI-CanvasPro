import test from "node:test";
import assert from "node:assert/strict";

import {
  applyGenerationSubmitButtonState,
  beginGenerationRun,
  isGenerationAbortError,
} from "./generationRunController.js";

function createButtonStub() {
  return {
    disabled: false,
    title: "",
    innerHTML: "",
    style: { color: "" },
    _attrs: new Map(),
    setAttribute(name, value) {
      this._attrs.set(String(name), String(value));
    },
    removeAttribute(name) {
      this._attrs.delete(String(name));
    },
    getAttribute(name) {
      return this._attrs.get(String(name)) || "";
    },
  };
}

function createStore(state) {
  return {
    updateNodeData(nodeId, patch) {
      state.nodes[nodeId] = {
        ...(state.nodes[nodeId] || {}),
        ...patch,
      };
    },
  };
}

test("generation run controller: applies one stop affordance for prompt submit buttons", () => {
  const button = createButtonStub();

  assert.equal(applyGenerationSubmitButtonState({ btnEl: button }, "running"), true);

  assert.equal(button.disabled, false);
  assert.equal(button.title, "停止生成");
  assert.equal(button.getAttribute("data-generation-state"), "running");
  assert.equal(button.getAttribute("data-generation-action"), "stop");
  assert.equal(button.getAttribute("data-tooltip"), "点击即可停止当前生成");
  assert.match(button.innerHTML, /<rect[^>]+x="7"[^>]+width="10"/);
});

test("generation run controller: cancelNow unlocks the node immediately", () => {
  const state = { nodes: { n1: { isGenerating: true, jobStatus: "running" } } };
  const node = {
    nodeId: "n1",
    btnEl: createButtonStub(),
    previewEl: {},
  };
  let stopLoadingTarget = null;

  const run = beginGenerationRun(node, {
    store: createStore(state),
    nodeId: "n1",
    previewEl: node.previewEl,
    stopLoading(target) {
      stopLoadingTarget = target;
    },
  });

  assert.equal(node._isGenerating, true);
  assert.equal(run.signal.aborted, false);

  assert.equal(run.cancelNow(), true);

  assert.equal(node._isGenerating, false);
  assert.equal(run.signal.aborted, true);
  assert.equal(state.nodes.n1.isGenerating, false);
  assert.equal(state.nodes.n1.jobStatus, null);
  assert.equal(stopLoadingTarget, node.previewEl);
  assert.equal(node.btnEl.getAttribute("data-generation-state"), "idle");
});

test("generation run controller: idle state clears any stop icon variant", () => {
  const button = createButtonStub();
  button.innerHTML =
    '<svg width="14" height="14" viewBox="0 0 24 24"><rect x="7" y="7" width="10" height="10" rx="2"></rect></svg>';
  button.style.color = "var(--red)";
  button.setAttribute("data-generation-action", "stop");
  button.setAttribute("data-generation-state", "running");
  button.setAttribute("data-tooltip", "\u70b9\u51fb\u5373\u53ef\u505c\u6b62\u5f53\u524d\u751f\u6210");

  applyGenerationSubmitButtonState(button, "idle");

  assert.equal(button.getAttribute("data-generation-action"), "");
  assert.equal(button.getAttribute("data-generation-state"), "idle");
  assert.equal(button.getAttribute("data-tooltip"), "");
  assert.equal(button.style.color, "");
  assert.match(button.innerHTML, /<line x1="12" y1="19" x2="12" y2="5"/);
  assert.doesNotMatch(button.innerHTML, /<rect[^>]+width="10"/);
});

test("generation run controller: stale runs are not current after a new run starts", () => {
  const node = { nodeId: "n1", btnEl: createButtonStub() };
  const first = beginGenerationRun(node, { nodeId: "n1" });
  first.cancelNow();

  const second = beginGenerationRun(node, { nodeId: "n1" });

  assert.equal(first.isCurrent(), false);
  assert.equal(second.isCurrent(), true);
});

test("generation run controller: late task metadata still triggers one background cancel", async () => {
  const node = { nodeId: "n1", btnEl: createButtonStub() };
  const remoteCancels = [];
  const run = beginGenerationRun(node, {
    nodeId: "n1",
    cancelRemote(meta) {
      remoteCancels.push(meta);
    },
  });

  run.cancelNow();
  run.setTaskMeta({ taskId: "task-1", apiKey: "sk-test" });
  run.setTaskMeta({ taskId: "task-1", apiKey: "sk-test" });
  await Promise.resolve();

  assert.deepEqual(remoteCancels, [{ taskId: "task-1", apiKey: "sk-test" }]);
});

test("generation run controller: abort errors include DOM-style and cancel messages", () => {
  assert.equal(isGenerationAbortError({ name: "AbortError" }), true);
  assert.equal(isGenerationAbortError(new Error("request aborted by user")), true);
  assert.equal(isGenerationAbortError(new Error("boom")), false);
});
