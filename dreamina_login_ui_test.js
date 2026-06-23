import fs from "node:fs";
import assert from "node:assert/strict";
import test from "node:test";

test("dreamina settings UI does not include QR login controls", () => {
  const html = fs.readFileSync(new URL("./index.html", import.meta.url), "utf8");

  assert.equal(html.includes("btnDreaminaQrAuth"), false);
  assert.equal(html.includes("dreaminaModalQrWrap"), false);
  assert.equal(html.includes("dreaminaModalQrImage"), false);
  assert.equal(html.includes("扫码登录"), false);
  assert.equal(html.includes("二维码"), false);
});
