import test from "node:test";
import assert from "node:assert/strict";

import { IMAGE_TOOLBAR_ACTIONS } from "./imageToolbarLayoutMemory.js";
import {
  IMAGE_TOOLBAR_TOOL_CLASSIFICATION,
  IMAGE_TOOLBAR_TOOL_FIELD_CONTRACTS,
  getImageToolbarToolClassification,
} from "./imageToolbarToolClassification.js";

test("image toolbar action list stays classified", () => {
  assert.deepEqual(IMAGE_TOOLBAR_ACTIONS, [
    "matting",
    "repaint",
    "erase",
    "hd",
    "expand",
    "auto-subject",
    "panorama-360",
    "multigrid",
    "multiangle",
    "annotate",
    "crop",
    "fullscreen",
    "download",
    "reset-size",
  ]);
});

test("every image toolbar action has an explicit migration classification", () => {
  assert.equal(Object.keys(IMAGE_TOOLBAR_TOOL_CLASSIFICATION).length, IMAGE_TOOLBAR_ACTIONS.length);
  for (const action of IMAGE_TOOLBAR_ACTIONS) {
    assert.equal(typeof getImageToolbarToolClassification(action), "string", action);
  }
});

test("repaint and erase actions have concrete field contracts", () => {
  assert.deepEqual(IMAGE_TOOLBAR_TOOL_FIELD_CONTRACTS.repaint.inputFields, [
    "inputUrls",
    "maskPngBase64",
    "prompt",
    "model",
    "provider",
    "imageSize",
  ]);
  assert.deepEqual(IMAGE_TOOLBAR_TOOL_FIELD_CONTRACTS.erase.inputFields, [
    "inputUrls",
    "maskPngBase64",
    "prompt",
    "model",
    "provider",
    "imageSize",
  ]);
});
