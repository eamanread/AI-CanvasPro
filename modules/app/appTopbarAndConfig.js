import {
  DREAMINA_OVERSEAS_VPN_MESSAGE,
  getDreaminaLoginPageUrl,
  normalizeDreaminaLoginRegion,
  shouldWarnDreaminaVpn,
} from "../../api/dreaminaLoginRegion.js";

const DREAMINA_LOGIN_REGION_STORAGE_KEY = "dreaminaLoginRegion";
const TERMINAL_LOGIN_PHASES = new Set(["success", "reused", "done"]);
const CONFIG_PROVIDER_KEYS = ["grsai", "ppio", "openai", "apimart", "runninghub"];

function getSelectedDreaminaLoginRegion() {
  try {
    return normalizeDreaminaLoginRegion(
      globalThis?.localStorage?.getItem(DREAMINA_LOGIN_REGION_STORAGE_KEY),
    );
  } catch {
    return "cn";
  }
}

function setSelectedDreaminaLoginRegion(value) {
  const region = normalizeDreaminaLoginRegion(value);
  try {
    globalThis?.localStorage?.setItem(DREAMINA_LOGIN_REGION_STORAGE_KEY, region);
  } catch {
    // localStorage can be unavailable in tests or restricted browser contexts.
  }
  return region;
}

function byId(id) {
  if (typeof document === "undefined") {
    return null;
  }
  return document.getElementById(id);
}

function getDreaminaElements() {
  return {
    settingsCardEl: byId("dreaminaSettingsCard"),
    statusTextEl: byId("dreaminaStatusText"),
    messageTextEl: byId("dreaminaStatusMessage"),
    creditTextEl: byId("dreaminaCreditText"),
    btnAuthEl: byId("btnDreaminaAuth"),
    btnLogoutEl: byId("btnDreaminaLogout"),
    modalOverlayEl: byId("dreaminaLoginModal"),
    modalCardEl: byId("dreaminaLoginModalCard"),
    modalCloseEl: byId("dreaminaModalClose"),
    modalMessageEl: byId("dreaminaModalMessage"),
    modalWaitEl: byId("dreaminaModalWait"),
    modalWaitTextEl: byId("dreaminaModalWaitText"),
    modalRetryEl: byId("dreaminaModalRetry"),
    manualGuideEl: byId("dreaminaManualGuide"),
    manualLoginUrlEl: byId("dreaminaManualLoginUrl"),
    manualAuthUrlEl: byId("dreaminaManualAuthUrl"),
    manualImportJsonEl: byId("dreaminaManualImportJson"),
    manualOpenLoginEl: byId("dreaminaManualOpenLogin"),
    manualCopyLoginEl: byId("dreaminaManualCopyLogin"),
    manualOpenAuthEl: byId("dreaminaManualOpenAuth"),
    manualCopyAuthEl: byId("dreaminaManualCopyAuth"),
    manualImportJsonBtnEl: byId("dreaminaManualImportJsonBtn"),
  };
}

export function extractDreaminaManualLinksFromOutputLines(lines) {
  const outputLines = Array.isArray(lines) ? lines : [];
  const urls = [];
  let pendingLineAfterPrompt = "";
  for (const line of outputLines) {
    const text = String(line || "");
    if (!pendingLineAfterPrompt && text.includes("请在浏览器中打开以下链接")) {
      pendingLineAfterPrompt = "__PENDING__";
    } else if (pendingLineAfterPrompt === "__PENDING__") {
      pendingLineAfterPrompt = text.trim();
    }
    const matches = text.match(/https?:\/\/[^\s]+/g);
    if (!matches) {
      continue;
    }
    for (const url of matches) {
      const cleanUrl = normalizeDreaminaManualUrlCandidate(url);
      if (cleanUrl && !urls.includes(cleanUrl)) {
        urls.push(cleanUrl);
      }
    }
  }
  const pendingUrl =
    pendingLineAfterPrompt && pendingLineAfterPrompt !== "__PENDING__"
      ? normalizeDreaminaManualUrlCandidate(pendingLineAfterPrompt)
      : "";
  const strictAuthorizeUrl =
    pendingUrl ||
    urls.find((url) => url.includes("/passport/web_login")) ||
    urls.find((url) => url.includes("/passport/web/web_login")) ||
    "";
  const callbackUrl =
    urls.find((url) => url.includes("/dreamina/cli/v1/dreamina_cli_login")) || "";
  const firstUsefulUrl =
    callbackUrl ||
    urls.find((url) => url !== getDreaminaLoginPageUrl("cn")) ||
    "";
  return {
    authorizeUrl: callbackUrl || strictAuthorizeUrl || firstUsefulUrl || "",
    strictAuthorizeUrl,
    callbackUrl,
  };
}

function normalizeDreaminaManualUrlCandidate(value) {
  const raw = String(value || "").trim();
  if (!raw) {
    return "";
  }
  const clean = raw
    .replace(/^[<（(【\["'“‘]+/, "")
    .replace(/[>）)】\]"'”’]+$/, "")
    .replace(/[，。；;、]+$/, "");
  return /^https?:\/\//.test(clean) ? clean : "";
}

export function getDreaminaWebLoginButtonText(status) {
  const runtime = status?.runtime || {};
  if (runtime?.active) {
    return "查看网页登录";
  }
  return status?.loggedIn ? "网页重新登录" : "网页登录";
}

export function getDreaminaStatusSessionKey(status) {
  const runtime = status?.runtime || {};
  const startedAt = Number(runtime?.startedAt || 0);
  if (startedAt > 0) {
    return `login:${startedAt}`;
  }
  const completedAt = Number(runtime?.completedAt || 0);
  if (completedAt > 0) {
    return `done:${completedAt}`;
  }
  return "";
}

export function shouldDreaminaManualGuideOpenByDefault(status, dismissedSessionKey = "") {
  const runtime = status?.runtime || {};
  if (!runtime?.active || String(runtime?.loginMode || "") !== "web") {
    return false;
  }
  const sessionKey = getDreaminaStatusSessionKey(status);
  return !sessionKey || String(dismissedSessionKey || "") !== sessionKey;
}

export function shouldAutoOpenDreaminaWebAuthLink(status, state = {}, now = Date.now()) {
  const runtime = status?.runtime || {};
  const phase = String(runtime?.phase || "");
  const authorizeUrl = String(runtime?.authorizeUrl || "").trim();
  const loginPageUrl = String(runtime?.loginPageUrl || "").trim();
  const loginIsTerminal = !!status?.loggedIn || TERMINAL_LOGIN_PHASES.has(phase);
  const primedAt = Number(state?.webLoginPrimedAt || 0);
  const autoOpenedUrl = String(state?.autoOpenedManualAuthUrl || "").trim();
  if (String(runtime?.loginMode || "") !== "web" || !runtime?.active || !loginIsTerminal) {
    return false;
  }
  if (!authorizeUrl || authorizeUrl === loginPageUrl || autoOpenedUrl === authorizeUrl) {
    return false;
  }
  if (primedAt <= 0) {
    return false;
  }
  return Math.max(0, Number(now || 0) - primedAt) >= 2500;
}

export function openDreaminaManualAuthLinkInWindow(handle, url) {
  const targetUrl = String(url || "").trim();
  if (!targetUrl || !handle || handle.closed) {
    return false;
  }
  try {
    handle.location.href = targetUrl;
    handle.focus?.();
    return true;
  } catch {
    return false;
  }
}

export function buildDreaminaCancelledStatusSnapshot(status = {}) {
  const runtime = { ...(status?.runtime || {}) };
  const now = Date.now();
  return {
    ...(status || {}),
    loggedIn: false,
    message: "即梦登录已取消",
    runtime: {
      ...runtime,
      active: false,
      phase: "cancelled",
      message: "即梦登录已取消",
      error: "",
      completedAt: Number(runtime.completedAt || 0) || now,
    },
  };
}

function renderDreaminaLoginRegionControls() {
  const region = getSelectedDreaminaLoginRegion();
  byId("dreaminaRegionCn")?.classList?.toggle("active", region === "cn");
  byId("dreaminaRegionOverseas")?.classList?.toggle("active", region === "overseas");
}

function getStatusText(status) {
  const runtime = status?.runtime || {};
  if (runtime?.active) {
    return String(runtime.phase || "") === "preparing" ? "准备中" : "登录中";
  }
  if (status?.loggedIn) {
    return "已登录";
  }
  return "未登录";
}

function getStatusMessage(status) {
  const runtime = status?.runtime || {};
  return (
    String(runtime?.message || "").trim() ||
    String(status?.message || "").trim() ||
    "未登录，点击登录即可使用"
  );
}

function formatCredit(credit) {
  if (!credit || typeof credit !== "object") {
    return "登录后显示余额";
  }
  const total = Number(credit.total_credit || 0);
  const vip = Number(credit.vip_credit || 0);
  const gift = Number(credit.gift_credit || 0);
  const purchase = Number(credit.purchase_credit || 0);
  return `总额度 ${total}（会员 ${vip} / 赠送 ${gift} / 购买 ${purchase}）`;
}

function mergeManualLinks(status) {
  const runtime = status?.runtime || {};
  const links = extractDreaminaManualLinksFromOutputLines(runtime?.outputTail || []);
  return {
    ...links,
    authorizeUrl: String(runtime?.authorizeUrl || "").trim() || links.authorizeUrl,
    callbackUrl: String(runtime?.callbackUrl || "").trim() || links.callbackUrl,
  };
}

function copyText(text) {
  const value = String(text || "");
  if (!value) {
    return Promise.resolve(false);
  }
  if (navigator?.clipboard?.writeText) {
    return navigator.clipboard.writeText(value).then(
      () => true,
      () => fallbackCopyText(value),
    );
  }
  return Promise.resolve(fallbackCopyText(value));
}

function fallbackCopyText(value) {
  try {
    const textarea = document.createElement("textarea");
    textarea.value = value;
    textarea.setAttribute("readonly", "readonly");
    textarea.style.position = "fixed";
    textarea.style.left = "-9999px";
    document.body?.appendChild(textarea);
    textarea.focus();
    textarea.select();
    const ok = document.execCommand("copy");
    textarea.remove();
    return !!ok;
  } catch {
    return false;
  }
}

function openUrl(url, label) {
  const targetUrl = String(url || "").trim();
  if (!targetUrl) {
    window.showToast?.(`浏览器未能直接打开，请先复制${label}`, "warning");
    return Promise.resolve(false);
  }
  let handle = null;
  try {
    handle = window.open(targetUrl, "_blank");
    if (handle) {
      handle.opener = null;
      return Promise.resolve(true);
    }
  } catch {
    // Fall through to copy.
  }
  return copyText(targetUrl).then((copied) => {
    window.showToast?.(
      copied ? `浏览器未能直接打开，已复制${label}` : `浏览器未能直接打开，请先复制${label}`,
      "warning",
    );
    return copied;
  });
}

export function createAppTopbarAndConfig({
  fetchApiConfigFromServer,
  saveApiConfigToServer,
  fetchDreaminaCliStatusFromServer,
  startDreaminaWebLoginFromServer,
  cancelDreaminaLoginFromServer,
  importDreaminaLoginResponseFromServer,
  logoutDreaminaFromServer,
  showError,
} = {}) {
  const state = {
    pollTimer: null,
    lastToastKey: "",
    lastStatus: null,
    modalCloseTimer: null,
    currentSessionKey: "",
    dismissedSessionKey: "",
    manualGuideOpen: false,
    webLoginPrimedAt: 0,
    autoOpenedManualAuthUrl: "",
    manualAuthWindow: null,
    config: {},
  };

  function bindHeaderProjectNameAutoSave() {
    const projectNameText = byId("projectNameText");
    projectNameText?.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        projectNameText.blur();
      }
    });
    projectNameText?.addEventListener("click", () => {
      projectNameText.focus();
    });

    const userAvatar = byId("userAvatar");
    const avatarMenu = byId("avatarMenu");
    userAvatar?.addEventListener("click", (event) => {
      event.stopPropagation();
      avatarMenu?.classList?.toggle("open");
    });
    document?.addEventListener("click", (event) => {
      if (
        avatarMenu?.classList?.contains("open") &&
        !event.target?.closest?.("#userAvatar") &&
        !event.target?.closest?.("#avatarMenu")
      ) {
        avatarMenu.classList.remove("open");
      }
    });
  }

  function ensureDreaminaVisible() {
    const { settingsCardEl } = getDreaminaElements();
    if (!settingsCardEl) {
      return false;
    }
    settingsCardEl.hidden = false;
    return true;
  }

  function startPolling() {
    if (state.pollTimer) {
      return;
    }
    state.pollTimer = setInterval(() => {
      refreshDreaminaStatus({ silent: true }).catch(() => null);
    }, 800);
  }

  function stopPolling() {
    if (state.pollTimer) {
      clearInterval(state.pollTimer);
      state.pollTimer = null;
    }
  }

  function clearModalCloseTimer() {
    if (state.modalCloseTimer) {
      clearTimeout(state.modalCloseTimer);
      state.modalCloseTimer = null;
    }
  }

  function showLoginModal({ clearDismissed = false } = {}) {
    const { modalOverlayEl } = getDreaminaElements();
    if (!modalOverlayEl) {
      return;
    }
    clearModalCloseTimer();
    if (clearDismissed) {
      state.dismissedSessionKey = "";
    }
    modalOverlayEl.hidden = false;
  }

  function hideLoginModal({ rememberDismissal = true } = {}) {
    const { modalOverlayEl, manualImportJsonEl } = getDreaminaElements();
    clearModalCloseTimer();
    if (rememberDismissal) {
      const sessionKey = getDreaminaStatusSessionKey(state.lastStatus);
      if (sessionKey) {
        state.dismissedSessionKey = sessionKey;
      }
    }
    if (modalOverlayEl) {
      modalOverlayEl.hidden = true;
    }
    if (manualImportJsonEl) {
      manualImportJsonEl.value = "";
    }
    state.manualGuideOpen = false;
    renderManualGuide(state.lastStatus || {});
  }

  function scheduleCloseModal(ms = 0) {
    clearModalCloseTimer();
    state.modalCloseTimer = setTimeout(() => {
      hideLoginModal({ rememberDismissal: false });
    }, Math.max(0, Number(ms) || 0));
  }

  function currentLoginPageUrl() {
    const selectedRegion = getSelectedDreaminaLoginRegion();
    const runtime = state.lastStatus?.runtime || {};
    const runtimeRegion = normalizeDreaminaLoginRegion(runtime?.loginRegion);
    const runtimeLoginPageUrl = String(runtime?.loginPageUrl || "").trim();
    return runtimeLoginPageUrl && runtimeRegion === selectedRegion
      ? runtimeLoginPageUrl
      : getDreaminaLoginPageUrl(selectedRegion);
  }

  function currentAuthorizeUrl(status = state.lastStatus || {}) {
    const links = mergeManualLinks(status);
    return String(links.authorizeUrl || "").trim() || currentLoginPageUrl();
  }

  function renderManualGuide(status = state.lastStatus || {}) {
    const {
      manualGuideEl,
      manualLoginUrlEl,
      manualOpenLoginEl,
      manualCopyLoginEl,
      manualAuthUrlEl,
      manualOpenAuthEl,
      manualCopyAuthEl,
    } = getDreaminaElements();
    if (!manualGuideEl) {
      return;
    }
    const loginPageUrl = currentLoginPageUrl();
    const authorizeUrl = currentAuthorizeUrl(status);
    if (manualLoginUrlEl) {
      manualLoginUrlEl.value = loginPageUrl;
    }
    if (manualAuthUrlEl) {
      manualAuthUrlEl.value = authorizeUrl;
    }
    for (const element of [
      manualOpenLoginEl,
      manualCopyLoginEl,
      manualOpenAuthEl,
      manualCopyAuthEl,
    ]) {
      if (element) {
        element.disabled = false;
      }
    }
    manualGuideEl.hidden = !state.manualGuideOpen;
  }

  function renderLoginModal(status = state.lastStatus || {}) {
    const {
      modalCardEl,
      modalMessageEl,
      modalWaitEl,
      modalWaitTextEl,
      modalRetryEl,
    } = getDreaminaElements();
    if (!modalMessageEl) {
      return;
    }
    const runtime = status?.runtime || {};
    const phase = String(runtime?.phase || "");
    const active = !!runtime?.active;
    const loggedIn = !!status?.loggedIn || TERMINAL_LOGIN_PHASES.has(phase);
    if (loggedIn) {
      state.manualGuideOpen = false;
    }
    if (!loggedIn && shouldDreaminaManualGuideOpenByDefault(status, state.dismissedSessionKey)) {
      state.manualGuideOpen = true;
    }
    const shouldOpen = state.manualGuideOpen || active;
    if (shouldOpen) {
      showLoginModal();
    } else if (["success", "reused", "done", "failed", "cancelled"].includes(phase)) {
      scheduleCloseModal(phase === "failed" ? 0 : 600);
    } else {
      hideLoginModal({ rememberDismissal: false });
    }
    modalCardEl?.classList?.toggle("dreamina-login-modal--guide-open", state.manualGuideOpen);
    modalMessageEl.textContent = loggedIn
      ? "登录完成，正在更新账户信息..."
      : phase === "failed"
        ? "即梦登录失败"
        : getStatusMessage(status) || "正在处理即梦登录...";
    if (modalWaitEl) {
      modalWaitEl.hidden = false;
    }
    if (modalWaitTextEl) {
      modalWaitTextEl.textContent =
        phase === "failed"
          ? "登录失败，请先点右侧“打开”(继续登录链接)重试。"
          : "请在浏览器中完成即梦授权，系统会自动同步登录状态。";
    }
    if (modalRetryEl) {
      modalRetryEl.hidden = false;
      modalRetryEl.disabled = false;
      modalRetryEl.textContent = state.manualGuideOpen ? "收起手动流程" : "手动登录流程";
    }
    renderManualGuide(status);
  }

  function maybeToastTerminalStatus(runtime = {}) {
    const phase = String(runtime?.phase || "");
    const completedAt = Number(runtime?.completedAt || 0);
    const toastKey = completedAt > 0 ? `${phase}:${completedAt}:${runtime?.error || ""}` : "";
    if (!toastKey || toastKey === state.lastToastKey) {
      return;
    }
    state.lastToastKey = toastKey;
    if (phase === "success") {
      window.showToast?.("即梦已登录成功，正在同步账号状态...", "success");
      return;
    }
    if (phase === "reused") {
      window.showToast?.("当前即梦登录态仍然有效", "info");
      return;
    }
    if (phase === "failed") {
      window.showToast?.(runtime?.error || runtime?.message || "即梦登录失败", "error");
    }
  }

  function resetSessionState(status) {
    const sessionKey = getDreaminaStatusSessionKey(status);
    const active = !!status?.runtime?.active;
    if (sessionKey && sessionKey !== state.currentSessionKey) {
      state.currentSessionKey = sessionKey;
      state.dismissedSessionKey = "";
      state.manualGuideOpen = false;
      state.webLoginPrimedAt = 0;
      state.autoOpenedManualAuthUrl = "";
      state.manualAuthWindow = null;
      return;
    }
    if (!active && !sessionKey) {
      state.currentSessionKey = "";
      state.dismissedSessionKey = "";
      state.manualGuideOpen = false;
      state.webLoginPrimedAt = 0;
      state.autoOpenedManualAuthUrl = "";
      state.manualAuthWindow = null;
    }
  }

  function maybeAutoOpenAuthorizeUrl(status) {
    if (!shouldAutoOpenDreaminaWebAuthLink(status, state)) {
      return;
    }
    const authorizeUrl = currentAuthorizeUrl(status);
    if (!authorizeUrl) {
      return;
    }
    if (openDreaminaManualAuthLinkInWindow(state.manualAuthWindow, authorizeUrl)) {
      state.autoOpenedManualAuthUrl = authorizeUrl;
      return;
    }
    openUrl(authorizeUrl, "继续登录链接").then((opened) => {
      if (opened) {
        state.autoOpenedManualAuthUrl = authorizeUrl;
      }
    });
  }

  function renderDreaminaStatus(status) {
    const {
      statusTextEl,
      messageTextEl,
      creditTextEl,
      btnAuthEl,
      btnLogoutEl,
    } = getDreaminaElements();
    if (!statusTextEl || !ensureDreaminaVisible()) {
      return;
    }
    const runtime = status?.runtime || {};
    const active = !!runtime?.active;
    const loggedIn = !!status?.loggedIn;
    statusTextEl.textContent = getStatusText(status);
    if (messageTextEl) {
      messageTextEl.textContent = getStatusMessage(status);
    }
    if (creditTextEl) {
      creditTextEl.textContent = loggedIn ? formatCredit(status?.credit) : "登录后显示余额";
    }
    if (btnAuthEl) {
      btnAuthEl.disabled = false;
      btnAuthEl.textContent = getDreaminaWebLoginButtonText(status);
    }
    if (btnLogoutEl) {
      btnLogoutEl.disabled = active || !loggedIn;
    }
    renderDreaminaLoginRegionControls();
    if (active) {
      startPolling();
    } else {
      stopPolling();
    }
    state.lastStatus = status || {};
    resetSessionState(status);
    renderLoginModal(status);
    maybeAutoOpenAuthorizeUrl(status);
    maybeToastTerminalStatus(runtime);
  }

  async function refreshDreaminaStatus({ force = false, silent = false } = {}) {
    if (!ensureDreaminaVisible() || typeof fetchDreaminaCliStatusFromServer !== "function") {
      return null;
    }
    try {
      const status = await fetchDreaminaCliStatusFromServer({ refresh: force });
      renderDreaminaStatus(status || {});
      return status || {};
    } catch (error) {
      if (!silent) {
        window.showToast?.(error?.message || "获取即梦状态失败", "error");
      }
      return null;
    }
  }

  async function startWebLogin() {
    if (!ensureDreaminaVisible()) {
      return;
    }
    const runtime = state.lastStatus?.runtime || {};
    if (runtime?.active) {
      showLoginModal({ clearDismissed: true });
      state.manualGuideOpen = true;
      renderLoginModal(state.lastStatus || {});
      return;
    }
    const force = !!state.lastStatus?.loggedIn;
    const region = getSelectedDreaminaLoginRegion();
    if (shouldWarnDreaminaVpn(region)) {
      window.showToast?.(DREAMINA_OVERSEAS_VPN_MESSAGE, "warning");
    }
    await openUrl(getDreaminaLoginPageUrl(region), "即梦登录链接");
    if (typeof startDreaminaWebLoginFromServer !== "function") {
      return;
    }
    state.manualGuideOpen = true;
    state.webLoginPrimedAt = Date.now();
    state.autoOpenedManualAuthUrl = "";
    showLoginModal({ clearDismissed: true });
    try {
      const result = await startDreaminaWebLoginFromServer({ force, region });
      if (result?.success === false) {
        throw new Error(result?.message || "即梦网页登录启动失败");
      }
      if (result?.status) {
        renderDreaminaStatus(result.status);
      }
      window.showToast?.(
        force ? "已打开即梦网页登录，请完成重新授权" : "已打开即梦网页登录，请完成授权",
        "info",
      );
      startPolling();
    } catch (error) {
      window.showToast?.(error?.message || "即梦网页登录启动失败", "error");
    }
  }

  async function toggleManualGuideOrCancel() {
    const runtime = state.lastStatus?.runtime || {};
    if (state.manualGuideOpen && runtime?.active) {
      const cancelled = buildDreaminaCancelledStatusSnapshot(state.lastStatus || {});
      state.manualGuideOpen = false;
      state.webLoginPrimedAt = 0;
      state.autoOpenedManualAuthUrl = "";
      state.manualAuthWindow = null;
      stopPolling();
      renderDreaminaStatus(cancelled);
      if (typeof cancelDreaminaLoginFromServer !== "function") {
        return;
      }
      try {
        const result = await cancelDreaminaLoginFromServer();
        if (result?.success === false) {
          throw new Error(result?.message || "取消即梦登录失败");
        }
        if (result?.status) {
          renderDreaminaStatus(result.status);
        }
        window.showToast?.("已取消即梦登录", "info");
      } catch (error) {
        window.showToast?.(error?.message || "取消即梦登录失败", "error");
      }
      return;
    }
    state.manualGuideOpen = !state.manualGuideOpen;
    renderLoginModal(state.lastStatus || {});
  }

  async function logoutDreamina() {
    if (!ensureDreaminaVisible() || typeof logoutDreaminaFromServer !== "function") {
      return;
    }
    try {
      const result = await logoutDreaminaFromServer();
      if (result?.success === false) {
        throw new Error(result?.message || "退出即梦登录失败");
      }
      if (result?.status) {
        renderDreaminaStatus(result.status);
      } else {
        await refreshDreaminaStatus({ force: true, silent: true });
      }
      stopPolling();
      window.showToast?.("已退出即梦登录", "success");
    } catch (error) {
      window.showToast?.(error?.message || "退出即梦登录失败", "error");
    }
  }

  async function openLoginPage() {
    await openUrl(currentLoginPageUrl(), "即梦登录链接");
  }

  async function copyLoginPage() {
    const copied = await copyText(currentLoginPageUrl());
    window.showToast?.(copied ? "已复制" : "复制失败，请手动选中文本复制", copied ? "success" : "error");
  }

  async function openAuthorizeUrl() {
    await openUrl(currentAuthorizeUrl(), "继续登录链接");
  }

  async function copyAuthorizeUrl() {
    const copied = await copyText(currentAuthorizeUrl());
    window.showToast?.(copied ? "已复制" : "复制失败，请手动选中文本复制", copied ? "success" : "error");
  }

  async function importLoginJson() {
    const { manualImportJsonEl } = getDreaminaElements();
    const text = String(manualImportJsonEl?.value || "").trim();
    if (!text) {
      window.showToast?.("请先粘贴第 2 步最终跳转页面返回的完整 JSON", "warning");
      return;
    }
    let payload = null;
    try {
      payload = JSON.parse(text);
    } catch {
      window.showToast?.("JSON 解析失败", "error");
      return;
    }
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      window.showToast?.("JSON 必须是对象格式", "error");
      return;
    }
    if (typeof importDreaminaLoginResponseFromServer !== "function") {
      return;
    }
    try {
      const result = await importDreaminaLoginResponseFromServer(payload);
      if (result?.success === false) {
        throw new Error(result?.message || "导入登录态失败");
      }
      window.showToast?.("登录态已导入，正在同步状态", "success");
      await refreshDreaminaStatus({ force: true, silent: true });
    } catch (error) {
      window.showToast?.(error?.message || "导入登录态失败", "error");
    }
  }

  function bindDreaminaControls() {
    const {
      btnAuthEl,
      btnLogoutEl,
      modalOverlayEl,
      modalCloseEl,
      modalRetryEl,
      manualOpenLoginEl,
      manualCopyLoginEl,
      manualOpenAuthEl,
      manualCopyAuthEl,
      manualImportJsonBtnEl,
    } = getDreaminaElements();
    byId("dreaminaRegionCn")?.addEventListener("click", () => {
      setSelectedDreaminaLoginRegion("cn");
      renderDreaminaLoginRegionControls();
      renderManualGuide(state.lastStatus || {});
    });
    byId("dreaminaRegionOverseas")?.addEventListener("click", () => {
      setSelectedDreaminaLoginRegion("overseas");
      renderDreaminaLoginRegionControls();
      renderManualGuide(state.lastStatus || {});
    });
    renderDreaminaLoginRegionControls();
    btnAuthEl?.addEventListener("click", () => {
      startWebLogin().catch(() => null);
    });
    btnLogoutEl?.addEventListener("click", () => {
      logoutDreamina().catch(() => null);
    });
    modalCloseEl?.addEventListener("click", () => {
      hideLoginModal();
    });
    modalRetryEl?.addEventListener("click", () => {
      toggleManualGuideOrCancel().catch(() => null);
    });
    manualOpenLoginEl?.addEventListener("click", () => {
      openLoginPage().catch(() => null);
    });
    manualCopyLoginEl?.addEventListener("click", () => {
      copyLoginPage().catch(() => null);
    });
    manualOpenAuthEl?.addEventListener("click", () => {
      openAuthorizeUrl().catch(() => null);
    });
    manualCopyAuthEl?.addEventListener("click", () => {
      copyAuthorizeUrl().catch(() => null);
    });
    manualImportJsonBtnEl?.addEventListener("click", () => {
      importLoginJson().catch(() => null);
    });
    modalOverlayEl?.addEventListener("click", (event) => {
      if (event.target === modalOverlayEl) {
        hideLoginModal();
      }
    });
    document?.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        hideLoginModal();
      }
    });
    if (document?.body) {
      const observer = new MutationObserver(() => {
        if (ensureDreaminaVisible()) {
          refreshDreaminaStatus({ force: true, silent: true }).catch(() => null);
        }
      });
      observer.observe(document.body, { attributes: true, attributeFilter: ["class"] });
    }
  }

  function applyApiConfigToInputs(config) {
    const providers = config?.providers || {};
    for (const key of CONFIG_PROVIDER_KEYS) {
      const urlInput = byId(`providerUrl-${key}`);
      const keyInput = byId(`providerKey-${key}`);
      const provider = providers[key] || {};
      if (urlInput && provider.apiUrl) {
        urlInput.value = provider.apiUrl;
      }
      if (keyInput && provider.apiKey) {
        keyInput.value = provider.apiKey;
      }
    }
    const runninghubModelKey = byId("providerKey-runninghub-model");
    if (runninghubModelKey && providers.runninghub?.modelApiKey) {
      runninghubModelKey.value = providers.runninghub.modelApiKey;
    }
    const grsaiKey = byId("providerKey-grsai");
    if (!providers.grsai?.apiKey && config?.apiKey && grsaiKey && !grsaiKey.value) {
      grsaiKey.value = config.apiKey;
    }
  }

  function readApiConfigFromInputs() {
    const providers = {};
    for (const key of CONFIG_PROVIDER_KEYS) {
      const urlInput = byId(`providerUrl-${key}`);
      const keyInput = byId(`providerKey-${key}`);
      providers[key] = {};
      if (urlInput) {
        providers[key].apiUrl = String(urlInput.value || "").trim();
      }
      if (keyInput) {
        providers[key].apiKey = String(keyInput.value || "").trim();
      }
    }
    const runninghubModelKey = byId("providerKey-runninghub-model");
    if (runninghubModelKey) {
      providers.runninghub = providers.runninghub || {};
      providers.runninghub.modelApiKey = String(runninghubModelKey.value || "").trim();
    }
    return {
      ...(state.config || {}),
      providers,
    };
  }

  function initApiConfig() {
    const saveButton = byId("btnApiSave");
    if (typeof fetchApiConfigFromServer === "function") {
      fetchApiConfigFromServer()
        .then((config) => {
          if (!config || config.error) {
            return;
          }
          state.config = config || {};
          applyApiConfigToInputs(state.config);
        })
        .catch((error) => {
          console.error("[API Config] 加载失败:", error);
          showError?.(`加载 API 配置失败: ${error?.message || "未知错误"}`);
        })
        .finally(() => {
          if (ensureDreaminaVisible()) {
            refreshDreaminaStatus({ force: true, silent: true }).catch(() => null);
          }
        });
    }
    saveButton?.addEventListener("click", () => {
      if (typeof saveApiConfigToServer !== "function") {
        return;
      }
      const nextConfig = readApiConfigFromInputs();
      saveApiConfigToServer(nextConfig)
        .then((result) => {
          if (result?.success || !result?.error) {
            state.config = nextConfig;
            window.showToast?.("API 配置已保存");
            refreshDreaminaStatus({ force: true, silent: true }).catch(() => null);
          } else {
            window.showToast?.(`保存失败: ${result.error || "未知错误"}`, "error");
          }
        })
        .catch((error) => {
          window.showToast?.(`保存失败: ${error.message}`, "error");
        });
    });
    bindDreaminaControls();
  }

  function init() {
    bindHeaderProjectNameAutoSave();
    ensureDreaminaVisible();
    initApiConfig();
  }

  return { init };
}
