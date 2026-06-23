import assert from "node:assert/strict";
import test from "node:test";

import {
  applySeedanceWebRegionUi,
  findDreaminaRegion,
  renderSeedanceWebStatus,
  scheduleSeedanceWebRegionUiSync,
} from "./seedanceWebSettings.js";

function createMockEl({ textContent = "", active = false, dataset = {} } = {}) {
  return {
    textContent,
    hidden: false,
    disabled: false,
    style: {},
    dataset: { ...dataset },
    previousElementSibling: null,
    classList: {
      contains(name) {
        return name === "active" && active;
      },
    },
    matches(selector) {
      if (selector === "[data-dreamina-web-login]") {
        return this.dataset.dreaminaWebLogin === "1";
      }
      if (selector === "[data-dreamina-logout]") {
        return this.dataset.dreaminaLogout === "1";
      }
      return false;
    },
  };
}

function createMockRoot(region = "overseas", options = {}) {
  const manualPanel = createMockEl({ dataset: { dreaminaDomesticOnly: "1" } });
  const loginButton = createMockEl({ textContent: "web login", dataset: { dreaminaWebLogin: "1" } });
  const logoutButton = createMockEl({ textContent: "logout", dataset: { dreaminaLogout: "1" } });
  const statusText = createMockEl();
  const mainStatusLabel = createMockEl({ textContent: "登录状态" });
  const mainStatusText = createMockEl({ textContent: "not changed" });
  const mainStatusMessage = createMockEl({ textContent: "not changed" });
  const creditLabel = createMockEl({ textContent: "账户额度" });
  const creditText = createMockEl({ textContent: "not changed" });
  mainStatusText.previousElementSibling = mainStatusLabel;
  creditText.previousElementSibling = creditLabel;
  const regionButtons = [
    createMockEl({
      textContent: "国内版",
      active: region === "domestic",
      dataset: { dreaminaRegion: "domestic" },
    }),
    createMockEl({
      textContent: "海外版",
      active: region === "overseas",
      dataset: { dreaminaRegion: "overseas" },
    }),
  ];
  const root = {
    dataset: { dreaminaRegion: options.datasetRegion || region },
    querySelectorAll(selector) {
      if (selector === "[data-dreamina-domestic-only]") {
        return [manualPanel];
      }
      if (selector === "[data-dreamina-region], [data-region]") {
        return regionButtons;
      }
      return [];
    },
    querySelector(selector) {
      if (selector === "[data-dreamina-web-login]") {
        return loginButton;
      }
      if (selector === "[data-dreamina-logout]") {
        return logoutButton;
      }
      if (selector === "[data-seedance-web-status]") {
        return statusText;
      }
      if (selector === "#dreaminaStatusText") {
        return mainStatusText;
      }
      if (selector === "#dreaminaStatusMessage") {
        return mainStatusMessage;
      }
      if (selector === "#dreaminaCreditText") {
        return creditText;
      }
      if (selector === "[data-dreamina-region].active, [data-region].active") {
        return regionButtons.find((button) => button.classList.contains("active")) || null;
      }
      return null;
    },
  };
  return {
    root,
    manualPanel,
    loginButton,
    logoutButton,
    statusText,
    mainStatusLabel,
    mainStatusText,
    mainStatusMessage,
    creditLabel,
    creditText,
  };
}

test("seedanceWebSettings: overseas hides domestic-only login controls", () => {
  const dom = createMockRoot("overseas");

  applySeedanceWebRegionUi(dom.root);

  assert.equal(dom.manualPanel.hidden, true);
  assert.equal(dom.loginButton.textContent, "打开海外网页");
  assert.notEqual(dom.statusText.textContent, "");
});

test("seedanceWebSettings: overseas page connection renders connection state without account data", () => {
  const dom = createMockRoot("overseas");

  renderSeedanceWebStatus(dom.root, {
    loggedIn: false,
    connectionState: "page_connected",
    account: {},
    pageStatus: { url: "https://dreamina.capcut.com/" },
  });

  assert.equal(dom.mainStatusLabel.textContent, "连接状态");
  assert.equal(dom.mainStatusText.textContent, "海外版网页已连接");
  assert.equal(dom.statusText.textContent, "请确认网页登录状态");
  assert.equal(dom.mainStatusMessage.textContent.includes("登录"), false);
  assert.equal(dom.creditLabel.hidden, true);
  assert.equal(dom.creditText.hidden, true);
  assert.equal(dom.creditText.textContent, "");
  assert.equal(dom.logoutButton.hidden, true);
  assert.equal(dom.logoutButton.disabled, true);
});

test("seedanceWebSettings: overseas disconnected state is explicit", () => {
  const dom = createMockRoot("overseas");

  renderSeedanceWebStatus(dom.root, {
    loggedIn: true,
    connectionState: "not_connected",
    account: { displayName: "old account" },
  });

  assert.equal(dom.mainStatusText.textContent, "海外版网页未连接");
});

test("seedanceWebSettings: domestic leaves controls visible", () => {
  const dom = createMockRoot("domestic");

  applySeedanceWebRegionUi(dom.root);

  assert.equal(dom.manualPanel.hidden, false);
  assert.equal(dom.statusText.textContent, "");
});

test("seedanceWebSettings: domestic clears overseas status residue", () => {
  const dom = createMockRoot("domestic");
  dom.mainStatusLabel.textContent = "连接状态";
  dom.mainStatusText.textContent = "海外版网页已连接";
  dom.mainStatusMessage.textContent = "";
  dom.creditText.textContent = "";
  dom.creditText.hidden = true;
  dom.creditLabel.hidden = true;
  dom.logoutButton.hidden = true;

  applySeedanceWebRegionUi(dom.root);

  assert.equal(dom.mainStatusLabel.textContent, "登录状态");
  assert.equal(dom.mainStatusText.textContent, "检测中...");
  assert.equal(dom.mainStatusMessage.textContent, "正在读取即梦状态...");
  assert.equal(dom.creditText.textContent, "登录后显示余额");
  assert.equal(dom.creditText.hidden, false);
  assert.equal(dom.creditLabel.hidden, false);
  assert.equal(dom.logoutButton.hidden, false);
});

test("seedanceWebSettings: findDreaminaRegion reads selected dataset", () => {
  assert.equal(findDreaminaRegion({ dataset: { dreaminaRegion: "overseas" } }), "overseas");
  assert.equal(findDreaminaRegion({ dataset: { dreaminaRegion: "" } }), "domestic");
});

test("seedanceWebSettings: active region button overrides stale root dataset", () => {
  const dom = createMockRoot("domestic", { datasetRegion: "overseas" });

  applySeedanceWebRegionUi(dom.root);
  renderSeedanceWebStatus(dom.root, { connectionState: "page_connected" });

  assert.equal(findDreaminaRegion(dom.root), "domestic");
  assert.equal(dom.mainStatusLabel.textContent, "登录状态");
  assert.equal(dom.mainStatusText.textContent, "not changed");
  assert.equal(dom.creditLabel.hidden, false);
  assert.equal(dom.loginButton.textContent, "网页登录");
});

test("seedanceWebSettings: schedules a second sync after existing handlers", () => {
  const dom = createMockRoot("overseas");
  let callback = null;

  scheduleSeedanceWebRegionUiSync(dom.root, (fn) => {
    callback = fn;
    return 1;
  });

  dom.loginButton.textContent = "web login";
  assert.equal(typeof callback, "function");
  callback();
  assert.equal(dom.loginButton.textContent, "打开海外网页");
});

test("seedanceWebSettings: does not render overseas status while domestic region is active", () => {
  const dom = createMockRoot("domestic");

  renderSeedanceWebStatus(dom.root, {
    connectionState: "page_connected",
    message: "overseas login synced",
  });

  assert.equal(dom.mainStatusText.textContent, "not changed");
  assert.equal(dom.mainStatusLabel.textContent, "登录状态");
});
