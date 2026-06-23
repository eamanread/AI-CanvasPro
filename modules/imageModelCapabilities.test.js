import test from "node:test";
import assert from "node:assert/strict";

import {
  buildMainImageRatioLabel,
  shouldDisableImageSizeControl,
  shouldOmitImageSizeParam,
} from "./imageModelCapabilities.js";

test("image model capabilities: grsai gpt-image-2 allows image size selection", () => {
  assert.equal(shouldDisableImageSizeControl("grsai/gpt-image-2"), false);
  assert.equal(shouldOmitImageSizeParam("grsai/gpt-image-2"), false);
  assert.match(
    buildMainImageRatioLabel({
      model: "grsai/gpt-image-2",
      provider: "grsai",
      aspectRatio: "自适应",
      imageSize: "4K",
    }),
    /4K/
  );
});
