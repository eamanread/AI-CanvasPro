import test from "node:test";
import assert from "node:assert/strict";

import { ApiError, ErrorType } from "./ApiError.js";

test("ApiError unwraps object-shaped error messages", () => {
  const error = new ApiError({
    type: ErrorType.INVALID_PARAMS,
    provider: "registry-openai",
    message: {
      error: {
        message: "invalid image model",
      },
    },
  });

  assert.equal(error.message, "invalid image model");
  assert.ok(!error.getUserMessage().includes("[object Object]"));
});
