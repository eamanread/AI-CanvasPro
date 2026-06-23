import assert from "node:assert/strict";
import test from "node:test";

test("dreaminaCliApi: QR image URL helper is not exported", async () => {
  const api = await import("./dreaminaCliApi.js");

  assert.equal(Object.hasOwn(api, "buildDreaminaQrImageUrl"), false);
});
