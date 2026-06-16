import test from "node:test";
import assert from "node:assert/strict";

import {
  DREAMINA_CN_LOGIN_PAGE_URL,
  DREAMINA_OVERSEAS_LOGIN_PAGE_URL,
  normalizeDreaminaLoginRegion,
  getDreaminaLoginPageUrl,
  shouldWarnDreaminaVpn,
} from "./dreaminaLoginRegion.js";

test("dreamina login region defaults to domestic login page", () => {
  assert.equal(normalizeDreaminaLoginRegion(""), "cn");
  assert.equal(getDreaminaLoginPageUrl("cn"), DREAMINA_CN_LOGIN_PAGE_URL);
  assert.equal(shouldWarnDreaminaVpn("cn"), false);
});

test("dreamina login region maps overseas aliases to overseas login page and VPN prompt", () => {
  assert.equal(normalizeDreaminaLoginRegion("international"), "overseas");
  assert.equal(getDreaminaLoginPageUrl("overseas"), DREAMINA_OVERSEAS_LOGIN_PAGE_URL);
  assert.equal(shouldWarnDreaminaVpn("overseas"), true);
});
