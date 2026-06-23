import {
  fetchSeedanceWebStatusFromServer,
  logoutSeedanceWebFromServer,
  startSeedanceWebLoginFromServer,
} from "../../api/seedanceWebApi.js";
import { showError, showToast } from "../../services/toastService.js";

function normalizeRegion(value) {
  const raw = String(value || "").trim().toLowerCase();
  if (["overseas", "global", "intl", "international"].includes(raw)) {
    return "overseas";
  }
  return "domestic";
}

function markIfExists(element, datasetKey, value = "1") {
  if (element?.dataset) {
    element.dataset[datasetKey] = value;
  }
}

function isOverseasButton(button) {
  const text = String(button?.textContent || "").trim();
  return text.includes("海外") || normalizeRegion(button?.dataset?.dreaminaRegion) === "overseas";
}

function isSeedanceWebConnected(status = {}) {
  const state = String(status?.connectionState || status?.pageStatus?.connectionState || "").trim();
  return state === "page_connected" || state === "account_connected";
}

function setPreviousLabelText(element, text) {
  const label = element?.previousElementSibling;
  if (label && typeof label.textContent === "string") {
    label.textContent = text;
  }
}

function setHiddenWithPreviousLabel(element, hidden) {
  if (!element) {
    return;
  }
  element.hidden = hidden;
  if (element.style) {
    element.style.display = hidden ? "none" : "";
  }
  const label = element.previousElementSibling;
  if (label) {
    label.hidden = hidden;
    if (label.style) {
      label.style.display = hidden ? "none" : "";
    }
  }
}

function resetDomesticResidue(root) {
  const statusText = root.querySelector?.("#dreaminaStatusText");
  const messageText = root.querySelector?.("#dreaminaStatusMessage");
  const creditText = root.querySelector?.("#dreaminaCreditText");
  const logoutButton = root.querySelector?.("[data-dreamina-logout]");
  if (statusText && String(statusText.textContent || "").startsWith("海外版网页")) {
    statusText.textContent = "检测中...";
  }
  if (messageText && String(messageText.textContent || "").trim() === "") {
    messageText.textContent = "正在读取即梦状态...";
  }
  if (creditText && String(creditText.textContent || "").trim() === "") {
    creditText.textContent = "登录后显示余额";
  }
  if (logoutButton) {
    logoutButton.hidden = false;
  }
}

export function findDreaminaRegion(root) {
  const active = root?.querySelector?.("[data-dreamina-region].active, [data-region].active");
  const activeValue =
    active?.dataset?.dreaminaRegion ||
    active?.dataset?.region ||
    (isOverseasButton(active) ? "overseas" : "");
  if (activeValue) {
    return normalizeRegion(activeValue);
  }
  const direct = String(root?.dataset?.dreaminaRegion || "").trim();
  if (direct) {
    return normalizeRegion(direct);
  }
  return normalizeRegion(activeValue);
}

export function applySeedanceWebRegionUi(root) {
  if (!root) {
    return "domestic";
  }
  const region = findDreaminaRegion(root);
  const isOverseas = region === "overseas";
  root.querySelectorAll?.("[data-dreamina-domestic-only]")?.forEach((el) => {
    el.hidden = isOverseas;
  });
  const mainStatusText = root.querySelector?.("#dreaminaStatusText");
  const creditText = root.querySelector?.("#dreaminaCreditText");
  const logoutButton = root.querySelector?.("[data-dreamina-logout]");
  if (mainStatusText) {
    setPreviousLabelText(mainStatusText, isOverseas ? "连接状态" : "登录状态");
  }
  setHiddenWithPreviousLabel(creditText, isOverseas);
  if (isOverseas && creditText) {
    creditText.textContent = "";
  } else if (!isOverseas) {
    resetDomesticResidue(root);
  }
  if (logoutButton) {
    logoutButton.hidden = isOverseas;
    logoutButton.disabled = isOverseas ? true : logoutButton.disabled;
  }
  const loginButton = root.querySelector?.("[data-dreamina-web-login]");
  if (loginButton) {
    loginButton.textContent = isOverseas ? "打开海外网页" : "网页登录";
  }
  const statusText = root.querySelector?.("[data-seedance-web-status]");
  if (statusText) {
    statusText.textContent = isOverseas
      ? "打开海外网页后，工作台会按网页连接状态接收任务。"
      : "";
  }
  return region;
}

export function scheduleSeedanceWebRegionUiSync(root, schedule = setTimeout) {
  return schedule(() => {
    applySeedanceWebRegionUi(root);
    refreshSeedanceWebStatus(root).catch(() => null);
  }, 0);
}

export function renderSeedanceWebStatus(root, status = {}) {
  if (!root || findDreaminaRegion(root) !== "overseas") {
    return;
  }
  const connected = isSeedanceWebConnected(status);
  const statusText = root.querySelector?.("#dreaminaStatusText");
  const messageText = root.querySelector?.("#dreaminaStatusMessage");
  const creditText = root.querySelector?.("#dreaminaCreditText");
  const loginButton = root.querySelector?.("[data-dreamina-web-login]");
  const logoutButton = root.querySelector?.("[data-dreamina-logout]");
  const webStatusText = root.querySelector?.("[data-seedance-web-status]");

  if (statusText) {
    setPreviousLabelText(statusText, "连接状态");
    statusText.textContent = connected ? "海外版网页已连接" : "海外版网页未连接";
  }
  if (messageText) {
    messageText.textContent = "";
  }
  if (creditText) {
    creditText.textContent = "";
    setHiddenWithPreviousLabel(creditText, true);
  }
  if (loginButton) {
    loginButton.disabled = false;
    loginButton.textContent = "打开海外网页";
  }
  if (logoutButton) {
    logoutButton.hidden = true;
    logoutButton.disabled = true;
  }
  if (webStatusText) {
    webStatusText.textContent = connected ? "请确认网页登录状态" : "海外版网页未连接";
  }
}

export async function refreshSeedanceWebStatus(root) {
  if (!root || findDreaminaRegion(root) !== "overseas") {
    return null;
  }
  const status = await fetchSeedanceWebStatusFromServer();
  renderSeedanceWebStatus(root, status || {});
  return status || {};
}

function tagExistingDreaminaControls(documentRef, root) {
  const domesticButton = documentRef.getElementById?.("dreaminaRegionCn");
  const overseasButton = documentRef.getElementById?.("dreaminaRegionOverseas");
  const loginButton = documentRef.getElementById?.("btnDreaminaAuth");
  const logoutButton = documentRef.getElementById?.("btnDreaminaLogout");
  const modalGuide = documentRef.getElementById?.("dreaminaManualGuide");

  markIfExists(domesticButton, "dreaminaRegion", "domestic");
  markIfExists(overseasButton, "dreaminaRegion", "overseas");
  markIfExists(loginButton, "dreaminaWebLogin");
  markIfExists(logoutButton, "dreaminaLogout");
  markIfExists(modalGuide, "dreaminaDomesticOnly");

  const activeRegion = overseasButton?.classList?.contains("active") ? "overseas" : "domestic";
  if (root?.dataset) {
    root.dataset.dreaminaRegion = activeRegion;
  }
}

function ensureStatusElement(documentRef, root) {
  let statusEl = root.querySelector?.("[data-seedance-web-status]");
  if (statusEl) {
    return statusEl;
  }
  statusEl = documentRef.createElement("div");
  statusEl.className = "seedance-web-status settings-desc";
  statusEl.dataset.seedanceWebStatus = "1";
  root.appendChild(statusEl);
  return statusEl;
}

function setRootRegionFromTarget(root, target) {
  if (!root?.dataset || !target) {
    return;
  }
  if (target?.dataset?.dreaminaRegion) {
    root.dataset.dreaminaRegion = normalizeRegion(target.dataset.dreaminaRegion);
    return;
  }
  if (target?.dataset?.region) {
    root.dataset.dreaminaRegion = normalizeRegion(target.dataset.region);
    return;
  }
  if (isOverseasButton(target)) {
    root.dataset.dreaminaRegion = "overseas";
    return;
  }
  const text = String(target.textContent || "").trim();
  if (text.includes("国内")) {
    root.dataset.dreaminaRegion = "domestic";
  }
}

function stopOriginalDreaminaHandler(event) {
  event.preventDefault?.();
  event.stopPropagation?.();
  event.stopImmediatePropagation?.();
}

async function handleSeedanceLogin(button, root = null) {
  if (button) {
    button.disabled = true;
  }
  try {
    await startSeedanceWebLoginFromServer({ force: false });
    showToast("已打开海外版网页", "success");
  } catch (error) {
    showError(error?.message || "打开海外版网页失败");
  } finally {
    if (button) {
      button.disabled = false;
    }
    refreshSeedanceWebStatus(root || button?.closest?.("#dreaminaSettingsCard")).catch(() => null);
  }
}

async function handleSeedanceLogout(button, root = null) {
  if (button) {
    button.disabled = true;
  }
  try {
    await logoutSeedanceWebFromServer();
    showToast("海外版已退出登录", "success");
  } catch (error) {
    showError(error?.message || "退出海外版登录失败");
  } finally {
    if (button) {
      button.disabled = false;
    }
    refreshSeedanceWebStatus(root || button?.closest?.("#dreaminaSettingsCard")).catch(() => null);
  }
}

export function initSeedanceWebSettings({ documentRef = document } = {}) {
  const root = documentRef.getElementById?.("dreaminaSettingsCard");
  if (!root || root.dataset.seedanceWebEnhanced === "1") {
    return;
  }
  root.dataset.seedanceWebEnhanced = "1";
  tagExistingDreaminaControls(documentRef, root);
  ensureStatusElement(documentRef, root);
  applySeedanceWebRegionUi(root);
  refreshSeedanceWebStatus(root).catch(() => null);
  const statusTimer = setInterval(() => {
    refreshSeedanceWebStatus(root).catch(() => null);
  }, 3000);
  root.dataset.seedanceWebStatusTimer = String(statusTimer);

  root.addEventListener(
    "click",
    (event) => {
      const target = event.target?.closest?.(
        "[data-dreamina-web-login], [data-dreamina-logout], [data-dreamina-region], [data-region]"
      );
      if (!target) {
        return;
      }
      setRootRegionFromTarget(root, target);
      const region = applySeedanceWebRegionUi(root);
      scheduleSeedanceWebRegionUiSync(root);
      if (region !== "overseas") {
        return;
      }
      if (target.matches?.("[data-dreamina-web-login]")) {
        stopOriginalDreaminaHandler(event);
        handleSeedanceLogin(target, root);
        return;
      }
      if (target.matches?.("[data-dreamina-logout]")) {
        stopOriginalDreaminaHandler(event);
        handleSeedanceLogout(target, root);
      }
    },
    true
  );

  fetchSeedanceWebStatusFromServer()
    .then((status) => renderSeedanceWebStatus(root, status || {}))
    .catch(() => null);
}
