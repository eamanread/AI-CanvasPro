import test from "node:test";
import assert from "node:assert/strict";
import { createFloatingLayerController } from "./assistantFloatingLayer.js";

function createFakeDocument() {
  const listeners = new Map();
  return {
    listeners,
    addEventListener(type, handler) {
      listeners.set(type, handler);
    },
    removeEventListener(type, handler) {
      if (listeners.get(type) === handler) listeners.delete(type);
    },
    dispatch(type, event = {}) {
      const handler = listeners.get(type);
      if (handler) handler(event);
    },
  };
}

function createFakeElement(name) {
  return {
    name,
    contains(target) {
      return target === this || target?.owner === this;
    },
  };
}

test("assistantFloatingLayer: source toggle opens and closes the same layer", () => {
  const documentRef = createFakeDocument();
  const changes = [];
  const controller = createFloatingLayerController({
    document: documentRef,
    onChange: (activeId) => changes.push(activeId),
  });
  const sourceEl = createFakeElement("source");
  const layerEl = createFakeElement("layer");

  controller.registerLayer("model", { sourceEl, layerEl });

  assert.equal(controller.toggle("model"), "model");
  assert.equal(controller.isOpen("model"), true);
  assert.equal(controller.activeId, "model");

  assert.equal(controller.toggle("model"), "");
  assert.equal(controller.isOpen("model"), false);
  assert.equal(controller.activeId, "");
  assert.deepEqual(changes, ["model", ""]);
});

test("assistantFloatingLayer: opening a second layer closes the first", () => {
  const documentRef = createFakeDocument();
  const controller = createFloatingLayerController({ document: documentRef });

  controller.registerLayer("model", {
    sourceEl: createFakeElement("modelSource"),
    layerEl: createFakeElement("modelLayer"),
  });
  controller.registerLayer("mention", {
    sourceEl: createFakeElement("mentionSource"),
    layerEl: createFakeElement("mentionLayer"),
  });

  controller.open("model");
  assert.equal(controller.isOpen("model"), true);

  controller.open("mention");
  assert.equal(controller.isOpen("model"), false);
  assert.equal(controller.isOpen("mention"), true);
  assert.equal(controller.activeId, "mention");
});

test("assistantFloatingLayer: pointer outside closes active layer", () => {
  const documentRef = createFakeDocument();
  const controller = createFloatingLayerController({ document: documentRef });
  controller.registerLayer("mention", {
    sourceEl: createFakeElement("source"),
    layerEl: createFakeElement("layer"),
  });

  controller.open("mention");
  documentRef.dispatch("pointerdown", { target: createFakeElement("outside") });

  assert.equal(controller.isOpen("mention"), false);
});

test("assistantFloatingLayer: pointer on source or layer does not close active layer", () => {
  const documentRef = createFakeDocument();
  const controller = createFloatingLayerController({ document: documentRef });
  const sourceEl = createFakeElement("source");
  const layerEl = createFakeElement("layer");
  controller.registerLayer("mention", { sourceEl, layerEl });

  controller.open("mention");
  documentRef.dispatch("pointerdown", { target: sourceEl });
  assert.equal(controller.isOpen("mention"), true);

  documentRef.dispatch("pointerdown", { target: layerEl });
  assert.equal(controller.isOpen("mention"), true);
});

test("assistantFloatingLayer: Escape closes active layer", () => {
  const documentRef = createFakeDocument();
  const controller = createFloatingLayerController({ document: documentRef });
  controller.registerLayer("model", {
    sourceEl: createFakeElement("source"),
    layerEl: createFakeElement("layer"),
  });

  controller.open("model");
  documentRef.dispatch("keydown", { key: "Escape" });

  assert.equal(controller.isOpen("model"), false);
});

test("assistantFloatingLayer: destroy removes document listeners", () => {
  const documentRef = createFakeDocument();
  const controller = createFloatingLayerController({ document: documentRef });
  controller.registerLayer("model", {
    sourceEl: createFakeElement("source"),
    layerEl: createFakeElement("layer"),
  });

  assert.equal(documentRef.listeners.has("pointerdown"), true);
  assert.equal(documentRef.listeners.has("keydown"), true);

  controller.destroy();

  assert.equal(documentRef.listeners.has("pointerdown"), false);
  assert.equal(documentRef.listeners.has("keydown"), false);
});
