// background.js - Service Worker (MV3)
// Handles extension lifecycle, message relay, and task polling.
const SEEDANCE_PAGE_URL_PATTERNS = [
  'https://jimeng.jianying.com/*',
  'https://dreamina.capcut.com/*',
  'https://*.capcut.com/*',
  'https://www.dreamina.ai/*',
  'https://*.dreamina.ai/*',
];

let seedancePageStatusPollTimer = null;
const SEEDANCE_BRIDGE_API_BASE = 'http://127.0.0.1:8777/api/v2/seedance-web/bridge';
let seedanceTaskPollTimer = null;
let seedanceTaskPollWakeTimer = null;
let seedanceExecutingTask = false;
const SEEDANCE_RESULT_MONITOR_TIMEOUT_MS = 10 * 60 * 1000;
const SEEDANCE_WORKER_TAB_STORAGE_KEY = 'seedanceWorkerTabId';
const SEEDANCE_TASK_WAIT_TIMEOUT_SECONDS = 25;
const SEEDANCE_TASK_WAIT_RETRY_MS = 2000;
let seedanceTaskWaitRunning = false;
let seedanceTaskWaitStopped = false;

chrome.runtime.onInstalled.addListener((details) => {
  console.log('[Seedance helper] extension installed', details.reason);

  chrome.storage.local.get(['preset'], (data) => {
    if (!data.preset) {
      chrome.storage.local.set({
        preset: {
          model: 'Seedance 2.0',
          referenceMode: 'first-last-frame',
          aspectRatio: '16:9',
          duration: '5s',
        },
        taskDelay: 2,
        apiBaseUrl: 'http://localhost:3456',
        pollInterval: 30,
        taskQueue: [],
      });
    }
  });
});

chrome.action.onClicked.addListener(async (tab) => {
  if (tab.url && tab.url.includes('jimeng.jianying.com')) {
    try {
      await chrome.tabs.sendMessage(tab.id, { action: 'toggleDrawer' });
    } catch (e) {
      console.warn('[Seedance helper] content script did not respond, injecting...');
      try {
        await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          files: ['content.js'],
        });
        setTimeout(async () => {
          try {
            await chrome.tabs.sendMessage(tab.id, { action: 'toggleDrawer' });
          } catch (e2) {
            console.error('[Seedance helper] drawer toggle failed after injection:', e2);
          }
        }, 500);
      } catch (injectErr) {
        console.error('[Seedance helper] content script injection failed:', injectErr);
      }
    }
  } else {
    await chrome.tabs.create({
      url: 'https://jimeng.jianying.com/ai-tool/home',
    });
  }
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.action === 'log') {
    console.log(`[Content -> BG] ${msg.message}`);
    sendResponse({ received: true });
  }

  if (msg.action === 'taskStatus') {
    if (msg.status === 'processing') {
      chrome.action.setBadgeText({ text: `${msg.current}/${msg.total}` });
      chrome.action.setBadgeBackgroundColor({ color: '#e94560' });
    } else if (msg.status === 'done') {
      chrome.action.setBadgeText({ text: 'OK' });
      chrome.action.setBadgeBackgroundColor({ color: '#4caf50' });
      setTimeout(() => {
        chrome.action.setBadgeText({ text: '' });
      }, 5000);
    }
    sendResponse({ received: true });
  }

  if (msg.action === 'fetchTasks') {
    fetchRemoteTasks(msg.apiBaseUrl)
      .then(result => sendResponse(result))
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true;
  }

  if (msg.action === 'reportTaskStatus') {
    reportTaskStatusToAPI(msg.apiBaseUrl, msg.taskCode, msg.status, msg.error)
      .then(result => sendResponse(result))
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true;
  }

  if (msg.action === 'ackTasks') {
    ackTasksToAPI(msg.apiBaseUrl, msg.taskCodes)
      .then(result => sendResponse(result))
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true;
  }

  if (msg.action === 'seedancePageStatus') {
    reportSeedancePageStatus(msg.status || {})
      .then(result => sendResponse(result))
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true;
  }
});

async function fetchRemoteTasks(apiBaseUrl) {
  try {
    const url = `${apiBaseUrl}/api/tasks/pending`;
    console.log(`[Seedance BG] fetch tasks: ${url}`);
    const resp = await fetch(url, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
    });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const data = await resp.json();
    console.log(`[Seedance BG] fetched ${data.total || 0} pending tasks`);

    if (data.total > 0) {
      chrome.action.setBadgeText({ text: String(data.total) });
      chrome.action.setBadgeBackgroundColor({ color: '#f0ad4e' });
    }

    return { success: true, tasks: data.tasks || [], total: data.total || 0 };
  } catch (err) {
    console.error('[Seedance BG] fetch tasks failed:', err.message);
    return { success: false, error: err.message, tasks: [] };
  }
}

async function reportTaskStatusToAPI(apiBaseUrl, taskCode, status, error) {
  try {
    const url = `${apiBaseUrl}/api/tasks/status`;
    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        taskCode,
        status,
        error: error || null,
        completedAt: status === 'completed' || status === 'failed' ? new Date().toISOString() : null,
      }),
    });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const data = await resp.json();
    return { success: true, data };
  } catch (err) {
    console.error(`[Seedance BG] report task status failed (${taskCode}):`, err.message);
    return { success: false, error: err.message };
  }
}

async function ackTasksToAPI(apiBaseUrl, taskCodes) {
  try {
    const url = `${apiBaseUrl}/api/tasks/ack`;
    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ taskCodes }),
    });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const data = await resp.json();
    return { success: true, data };
  } catch (err) {
    console.error('[Seedance BG] ack tasks failed:', err.message);
    return { success: false, error: err.message };
  }
}
function buildSeedancePageStatusFromInfo(info) {
  const source = info && typeof info === 'object' ? info : {};
  const url = String(source.url || '');
  const isLoginPage = /\/login|passport|sign[_-]?in|web_login/i.test(url);
  const hasPromptInput = Boolean(source.hasTextarea || source.hasPromptEditor);
  const hasSubmitButton = Boolean(source.hasSubmitButton);
  const hasReferenceInput = Boolean(source.hasFileInput || source.hasUploadArea);
  const hasWorkspaceSignal = Boolean(
    hasSubmitButton && (hasPromptInput || hasReferenceInput || source.hasToolbar)
  );
  const hasLoginButton = Boolean(source.hasLoginButton);
  const hasAccountSignal = Boolean(
    source.authenticated ||
    source.hasLogoutButton ||
    source.hasAccountMenu ||
    source.creditText ||
    source.credit
  );
  const hasExplicitLoginStatus = Boolean(source.hasExplicitLoginStatus);
  const authenticated = Boolean(source.authenticated);
  const hasUserAvatar = Boolean(source.hasUserAvatar);
  const account = source.account && typeof source.account === 'object' ? source.account : {};
  const balanceText = String(account.balanceText || source.creditText || source.credit || "").trim();
  const hasResolvedAccountData = Boolean(account.displayName || account.userId || balanceText);
  const hasResolvedLoginEvidence = hasResolvedAccountData || hasUserAvatar;
  return {
    ...source,
    url,
    title: String(source.title || ''),
    authenticated,
    hasExplicitLoginStatus,
    loggedIn: !isLoginPage && !hasLoginButton && hasResolvedLoginEvidence,
    isLoginPage,
    hasLoginButton,
    hasAccountMenu: Boolean(source.hasAccountMenu),
    hasUserAvatar,
    hasLogoutButton: Boolean(source.hasLogoutButton),
    account: {
      ...account,
      ...(balanceText ? { balanceText } : {}),
    },
    loginText: String(source.loginText || '').trim(),
    creditText: balanceText,
  };
}
function isSeedancePageUrl(url) {
  return /^https:\/\/([^/]+\.)?(capcut\.com|dreamina\.ai)\//i.test(String(url || '')) ||
    /^https:\/\/jimeng\.jianying\.com\//i.test(String(url || ''));
}

function collectSeedanceStatusFromPage() {
  const bodyText = (document.body && document.body.innerText || "").slice(0, 8000);
  const hasVisibleLoginText = String(bodyText || "")
    .split(/\r?\n/)
    .map((line) => line.trim().toLowerCase())
    .some((line) => /^(sign in|log in|login|鐧诲綍|鐧诲叆)$/.test(line));
  const isLoginPage = /\/login|passport|sign[_-]?in|web_login/i.test(window.location.href);
  const explicitLoginStatus = (() => {
    const loginStatusEl = document.getElementById('__GTW_LOGIN_STATUS__');
    const raw = String(loginStatusEl && loginStatusEl.textContent || "").trim();
    if (!raw) return null;
    try {
      const data = JSON.parse(raw);
      if (typeof data.__isLogined === "boolean") return data.__isLogined;
      if (typeof data.isLogined === "boolean") return data.isLogined;
      if (typeof data.loggedIn === "boolean") return data.loggedIn;
    } catch (err) {
      return null;
    }
    return null;
  })();
  const hasExplicitLoginStatus = explicitLoginStatus !== null;
  const authenticated = explicitLoginStatus === true;
  const hasLoginButton = hasVisibleLoginText || Array.from(document.querySelectorAll('button, a, [role="button"]')).some((el) => {
    const text = (el.textContent || "").trim().toLowerCase();
    const aria = String(el.getAttribute?.('aria-label') || "").trim().toLowerCase();
    const label = text + " " + aria;
    return text === "login" ||
      text === "log in" ||
      text === "sign in" ||
      label.includes("login") ||
      label.includes("sign in") ||
      label.includes("signin");
  });
  const hasLogoutButton = Array.from(document.querySelectorAll('button, a, [role="button"]')).some((el) => {
    const text = (el.textContent || "").trim().toLowerCase();
    const aria = String(el.getAttribute?.('aria-label') || "").trim().toLowerCase();
    const label = text + " " + aria;
    return label.includes("logout") ||
      label.includes("log out") ||
      label.includes("sign out");
  });
  const hasUserAvatar = (() => {
    const candidates = Array.from(document.querySelectorAll('button, a, [role="button"], [aria-label], [data-testid], [class], img'));
    return candidates.some((el) => {
      if (!el || typeof el.getBoundingClientRect !== 'function') return false;
      const rect = el.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0 || rect.bottom <= 0 || rect.right <= 0) return false;
      const text = String(el.textContent || '').trim().toLowerCase();
      const aria = String(el.getAttribute?.('aria-label') || '').trim().toLowerCase();
      const testId = String(el.getAttribute?.('data-testid') || '').trim().toLowerCase();
      const className = String(el.className || '').trim().toLowerCase();
      const src = String(el.getAttribute?.('src') || '').trim().toLowerCase();
      const label = text + " " + aria + " " + testId + " " + className + " " + src;
      if (/sign in|login|log in|鐧诲綍|鐧诲叆/i.test(label)) return false;
      if (/avatar|account|profile|user|鐢ㄦ埛|璐︽埛/.test(label)) return true;
      return el.tagName === 'IMG' && rect.width >= 16 && rect.width <= 80 &&
        rect.height >= 16 && rect.height <= 80 && rect.left < 180;
    });
  })();
  const hasToolbar = !!document.querySelector('[class*="toolbar-settings-content"]');
  const hasFileInput = !!document.querySelector('input[type="file"]');
  const hasSubmitButton = !!document.querySelector('[class*="submit-button"]');
  const hasTextarea = !!document.querySelector('textarea, div[contenteditable="true"]');
  const hasPromptEditor = !!document.querySelector('div[contenteditable="true"].ProseMirror, div[contenteditable="true"].tiptap');
  const hasUploadArea = !!document.querySelector('[class*="reference-upload"]');
  const creditText = (() => {
    const text = String(bodyText || "").replace(/\u00a0/g, " " );
    const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    const creditPattern = /(浣欓|棰濆害|credit|balance|quota|remaining|鍙敤|璐︽埛|wallet|credits)/i;
    const candidateLines = lines.filter((line) => creditPattern.test(line));
    const bestLine = candidateLines.find((line) => /\d/.test(line)) || candidateLines[0] || "";
    if (bestLine) return bestLine;
    const textCandidates = Array.from(document.querySelectorAll('button, a, [role="button"], span, div, strong, small, p, li'))
      .map((el) => String(el.textContent || "").trim())
      .filter((line) => line && creditPattern.test(line) && line.length <= 100);
    return textCandidates.find((line) => /\d/.test(line)) || textCandidates[0] || "";
  })();
  const account = (() => {
    const result = {};
    if (creditText) result.balanceText = creditText;
    const accountCandidates = Array.from(document.querySelectorAll(
      '[aria-label*="account" i], [aria-label*="profile" i], [data-testid*="account" i], [data-testid*="profile" i], button, a, [role="button"]'
    ))
      .map((el) => String(el.getAttribute?.('aria-label') || el.textContent || '').trim())
      .filter((value) => value && value.length <= 80 && !/sign in|login|log in|鐧诲綍|鐧诲叆/i.test(value));
    const accountText = accountCandidates.find((value) => /@|account|profile|user|credits?|balance|quota|璐︽埛|鐢ㄦ埛|浣欓|棰濆害/i.test(value));
    if (accountText) result.displayName = accountText;
    return result;
  })();
  const hasAccountMenu =
    hasLogoutButton ||
    !!creditText ||
    Array.from(document.querySelectorAll('button, a, [role="button"], [aria-label], [data-testid]')).some((el) => {
      const text = String(el.textContent || "").trim().toLowerCase();
      const aria = String(el.getAttribute?.('aria-label') || "").trim().toLowerCase();
      const testId = String(el.getAttribute?.('data-testid') || "").trim().toLowerCase();
      const label = text + " " + aria + " " + testId;
      return label.includes("account") ||
        label.includes("profile") ||
        label.includes("avatar") ||
        label.includes("balance") ||
        label.includes("credit") ||
        label.includes("quota") ||
        label.includes("璐︽埛") ||
        label.includes("浣欓") ||
        label.includes("棰濆害");
    });
  const hasWorkspaceSignal =
    hasSubmitButton && (hasTextarea || hasPromptEditor || hasFileInput || hasUploadArea || hasToolbar);
  const hasResolvedAccountData = Boolean(account.displayName || account.userId || account.balanceText || creditText);
  const hasResolvedLoginEvidence = hasResolvedAccountData || hasUserAvatar;
  return {
    url: window.location.href,
    title: document.title || "",
    authenticated,
    hasExplicitLoginStatus,
    loggedIn: !isLoginPage && !hasLoginButton && hasResolvedLoginEvidence,
    isLoginPage,
    hasLoginButton,
    hasLogoutButton,
    hasAccountMenu,
    hasUserAvatar,
    account,
    loginText: hasLoginButton ? "Sign in" : "",
    creditText,
    hasToolbar,
    hasFileInput,
    hasSubmitButton,
    hasTextarea,
    hasPromptEditor,
    hasUploadArea,
  };
}
function reportSeedanceTabStatusWithScripting(tab) {
  if (!tab || !tab.id || !isSeedancePageUrl(tab.url)) return;
  chrome.scripting.executeScript(
    {
      target: { tabId: tab.id },
      func: collectSeedanceStatusFromPage,
    },
    (results) => {
      if (chrome.runtime.lastError || !results || !results[0]) return;
      reportSeedancePageStatus(buildSeedancePageStatusFromInfo(results[0].result || { url: tab.url }))
        .catch(err => console.warn('[Seedance BG] 椤甸潰鑴氭湰鐘舵€佷笂鎶ュけ璐?', err.message));
    }
  );
}

function reportSeedanceTabStatus(tab) {
  if (!tab || !tab.id || !isSeedancePageUrl(tab.url)) return;
  rememberSeedanceWorkerTab(tab).catch(() => {});
  reportSeedanceTabStatusWithScripting(tab);
  chrome.tabs.sendMessage(tab.id, { action: 'getPageInfo' }, (response) => {
    if (chrome.runtime.lastError || !response || !response.success) return;
    reportSeedancePageStatus(buildSeedancePageStatusFromInfo(response.info || { url: tab.url }))
      .catch(err => console.warn('[Seedance BG] 椤甸潰鐘舵€佸厹搴曚笂鎶ュけ璐?', err.message));
  });
}

function scheduleSeedanceTabStatusReport(tab) {
  if (!tab || !tab.id || !isSeedancePageUrl(tab.url)) return;
  setTimeout(() => reportSeedanceTabStatus(tab), 600);
  setTimeout(() => reportSeedanceTabStatus(tab), 2200);
}

function reportActiveSeedancePageStatus() {
  if (!chrome.tabs || !chrome.tabs.query) return;
  chrome.tabs.query({ url: SEEDANCE_PAGE_URL_PATTERNS }, (tabs) => {
    if (chrome.runtime.lastError) return;
    (tabs || []).forEach(scheduleSeedanceTabStatusReport);
  });
}

function startSeedancePageStatusPolling() {
  if (seedancePageStatusPollTimer) return;
  if (chrome.tabs && chrome.tabs.onUpdated) {
    chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
      const url = tab && tab.url ? tab.url : changeInfo && changeInfo.url;
      if (changeInfo.status === 'complete' || changeInfo.url) {
        scheduleSeedanceTabStatusReport({ ...tab, id: tabId, url });
      }
    });
  }
  if (chrome.tabs && chrome.tabs.onActivated) {
    chrome.tabs.onActivated.addListener((activeInfo) => {
      chrome.tabs.get(activeInfo.tabId, (tab) => {
        if (chrome.runtime.lastError) return;
        scheduleSeedanceTabStatusReport(tab);
      });
    });
  }
  reportActiveSeedancePageStatus();
  setTimeout(reportActiveSeedancePageStatus, 1500);
  seedancePageStatusPollTimer = setInterval(reportActiveSeedancePageStatus, 5000);
}

async function reportSeedancePageStatus(status) {
  const payload = status && typeof status === 'object' ? status : {};
  const resp = await fetch('http://127.0.0.1:8777/api/v2/seedance-web/page-status', {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
    body: JSON.stringify(payload),
  });
  if (!resp.ok) {
    throw new Error(`HTTP ${resp.status}`);
  }
  const data = await resp.json();
  pollSeedancePendingTasks().catch((err) => {
    console.warn('[Seedance BG] 韫囧啳鐑︾憴锕€褰傛禒璇插鏉烆喛顕楁径杈Е:', err.message);
  });
  return data;
}

function storageGet(keys) {
  return new Promise((resolve) => {
    chrome.storage.local.get(keys, (value) => resolve(value || {}));
  });
}

function storageSet(value) {
  return new Promise((resolve) => {
    chrome.storage.local.set(value || {}, () => resolve());
  });
}

function getTabById(tabId) {
  return new Promise((resolve) => {
    if (!tabId || !chrome.tabs || !chrome.tabs.get) {
      resolve(null);
      return;
    }
    chrome.tabs.get(Number(tabId), (tab) => {
      if (chrome.runtime.lastError) {
        resolve(null);
        return;
      }
      resolve(tab || null);
    });
  });
}

async function rememberSeedanceWorkerTab(tab) {
  if (!tab || !tab.id || !isSeedancePageUrl(tab.url)) return;
  await storageSet({ [SEEDANCE_WORKER_TAB_STORAGE_KEY]: tab.id });
}

async function getRememberedSeedanceWorkerTab() {
  const data = await storageGet([SEEDANCE_WORKER_TAB_STORAGE_KEY]);
  const tab = await getTabById(data[SEEDANCE_WORKER_TAB_STORAGE_KEY]);
  return tab && isSeedancePageUrl(tab.url) ? tab : null;
}

function rankSeedanceTabs(tabs = []) {
  return (tabs || [])
    .filter((tab) => isSeedancePageUrl(tab.url))
    .sort((a, b) => {
      const activeDiff = Number(Boolean(b.active)) - Number(Boolean(a.active));
      if (activeDiff) return activeDiff;
      const highlightedDiff = Number(Boolean(b.highlighted)) - Number(Boolean(a.highlighted));
      if (highlightedDiff) return highlightedDiff;
      return Number(b.lastAccessed || 0) - Number(a.lastAccessed || 0);
    });
}

async function findActiveSeedanceTab() {
  const rememberedTab = await getRememberedSeedanceWorkerTab();
  if (rememberedTab) return rememberedTab;

  const activeTabs = await withSeedanceChromeRetry(() => chrome.tabs.query({
    active: true,
    lastFocusedWindow: true,
  }), '鏌ヨ褰撳墠娴峰缃戦〉');
  const activeSeedanceTab = rankSeedanceTabs(activeTabs)[0];
  if (activeSeedanceTab) {
    await rememberSeedanceWorkerTab(activeSeedanceTab);
    return activeSeedanceTab;
  }
  const tabs = await withSeedanceChromeRetry(
    () => chrome.tabs.query({ url: SEEDANCE_PAGE_URL_PATTERNS }),
    '鏌ヨ娴峰缃戦〉'
  );
  const tab = rankSeedanceTabs(tabs)[0] || null;
  if (tab) {
    await rememberSeedanceWorkerTab(tab);
  }
  return tab;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isTransientSeedanceChromeError(err) {
  const message = String(err && err.message || err || '');
  return /\bNo SW\b|extension context invalidated|receiving end does not exist/i.test(message);
}

async function withSeedanceChromeRetry(operation, label, attempts = 3) {
  let lastError = null;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await operation();
    } catch (err) {
      lastError = err;
      if (!isTransientSeedanceChromeError(err) || attempt >= attempts) {
        throw err;
      }
      console.warn(`[Seedance BG] ${label} 閬囧埌涓存椂 Chrome 鎵╁睍閿欒锛岄噸璇?${attempt}/${attempts}:`, err.message || err);
      await sleep(350 * attempt);
    }
  }
  throw lastError || new Error(`${label}澶辫触`);
}

async function activateSeedanceWorkTab(tab) {
  if (!tab || !tab.id) return tab;
  let activatedTab = tab;
  if (tab.windowId !== undefined && chrome.windows && chrome.windows.update) {
    try {
      await withSeedanceChromeRetry(
        () => chrome.windows.update(tab.windowId, { focused: true, state: 'normal' }),
        'focus overseas browser window'
      );
    } catch (err) {
      console.warn('[Seedance BG] focus overseas browser window failed:', err.message || err);
    }
  }
  if (chrome.tabs && chrome.tabs.update) {
    try {
      const updatedTab = await withSeedanceChromeRetry(
        () => chrome.tabs.update(tab.id, { active: true }),
        'activate overseas work tab'
      );
      if (updatedTab) {
        activatedTab = updatedTab;
      }
    } catch (err) {
      console.warn('[Seedance BG] activate overseas work tab failed:', err.message || err);
    }
  }
  await rememberSeedanceWorkerTab(activatedTab);
  await sleep(650);
  return activatedTab;
}

async function sendSeedanceTabMessage(tab, message, fallbackError) {
  try {
    return await withSeedanceChromeRetry(
      () => chrome.tabs.sendMessage(tab.id, message),
      fallbackError || 'send message to overseas page'
    );
  } catch (err) {
    const reason = err && err.message || String(err || '');
    throw new Error(fallbackError ? `${fallbackError}: ${reason}` : (reason || 'overseas page script did not respond'));
  }
}

async function ensureSeedanceContentScriptReady(tab) {
  try {
    const ping = await withSeedanceChromeRetry(
      () => chrome.tabs.sendMessage(tab.id, { action: 'ping' }),
      'check overseas page script'
    );
    if (ping && ping.success) return ping;
  } catch (err) {
    // Try one explicit injection for pages opened before the extension was updated.
  }

  try {
    await withSeedanceChromeRetry(
      () => chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ['content.js'],
      }),
      'inject overseas page script'
    );
    await sleep(500);
    const retry = await withSeedanceChromeRetry(
      () => chrome.tabs.sendMessage(tab.id, { action: 'ping' }),
      'recheck overseas page script'
    );
    if (retry && retry.success) return retry;
  } catch (err) {
    throw new Error(`overseas page script did not respond, refresh the page and retry: ${err.message || err}`);
  }

  throw new Error('overseas page script did not respond, refresh the page and retry');
}

async function bridgeFetch(path, options = {}) {
  const resp = await fetch(`${SEEDANCE_BRIDGE_API_BASE}${path}`, options);
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  return resp.json();
}

async function waitRemoteTasks(apiBaseUrl) {
  const url = `${apiBaseUrl}/api/tasks/wait?clientId=background&includeSubmitted=1&timeout=${SEEDANCE_TASK_WAIT_TIMEOUT_SECONDS}`;
  const resp = await fetch(url, {
    method: 'GET',
    headers: { 'Content-Type': 'application/json' },
  });
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  return resp.json();
}

async function reportBridgeTaskStatus(taskCode, status, error = '', extra = {}) {
  return bridgeFetch('/api/tasks/status', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ taskCode, status, error: error || '', ...(extra || {}) }),
  });
}

function normalizeSeedanceWebModelLabel(model) {
  const raw = String(model || '').trim();
  const key = raw.toLowerCase().replace(/[\s_-]+/g, '');
  if (!key) return '';
  if (key.includes('seedance2.0fastvip')) return 'Seedance 2.0 Fast VIP';
  if (key.includes('seedance2.0vip')) return 'Seedance 2.0 VIP';
  if (key.includes('seedance2.0fast')) return 'Seedance 2.0 Fast';
  if (key.includes('seedance2.0')) return 'Seedance 2.0';
  if (/^seedance\s+2\.0/i.test(raw)) return raw.replace(/\s+/g, ' ');
  return raw;
}

function normalizeSeedanceWebDurationLabel(duration) {
  const raw = String(duration || '').trim();
  if (!raw) return '';
  const numeric = Number(raw.replace(/[^\d.]/g, ''));
  if (Number.isFinite(numeric) && numeric > 0) {
    return `${Math.trunc(numeric)}S`;
  }
  return raw.toUpperCase();
}

function normalizeSeedanceWebReferenceMode(modelConfig = {}) {
  const explicit = String(modelConfig.referenceMode || modelConfig.mode || '').trim();
  if (explicit) return explicit;
  const routeMode = String(modelConfig.routeMode || '').trim().toLowerCase();
  if (routeMode === 'frames2video') return 'First/last frame';
  if (routeMode === 'multiframe2video') return 'Smart multi-frame';
  return 'Omni reference';
}

function buildSeedanceTaskPreset(task) {
  const modelConfig = task && typeof task === 'object' && task.modelConfig &&
    typeof task.modelConfig === 'object' ? task.modelConfig : {};
  const model = normalizeSeedanceWebModelLabel(modelConfig.model || task?.model || task?.modelVersion);
  const preset = {
    model,
    referenceMode: normalizeSeedanceWebReferenceMode(modelConfig),
    aspectRatio: String(modelConfig.aspectRatio || task?.aspectRatio || '').trim(),
    duration: normalizeSeedanceWebDurationLabel(modelConfig.duration || task?.duration),
  };
  return Object.fromEntries(Object.entries(preset).filter(([, value]) => String(value || '').trim()));
}

function validateSeedancePresetResult(preset, result) {
  const requested = preset && typeof preset === 'object' ? preset : {};
  if (!Object.keys(requested).length) return;
  if (!result || typeof result !== 'object') {
    throw new Error('overseas page preset failed: no page confirmation');
  }
  if (result.error) {
    throw new Error(`overseas page preset failed: ${result.error}`);
  }
  if (result.warning) {
    throw new Error(`overseas page preset failed: ${result.warning}`);
  }
  const labels = {
    model: 'model',
    referenceMode: 'reference mode',
    aspectRatio: 'aspect ratio',
    duration: 'duration',
  };
  for (const key of Object.keys(requested)) {
    if (result[key] !== true) {
      throw new Error(`overseas page preset failed: ${labels[key] || key} did not switch to ${requested[key]}`);
    }
  }
}

async function executeSeedanceBridgeTask(task) {
  const tab = await findActiveSeedanceTab();
  if (!tab) throw new Error('overseas page is not connected');
  const taskCode = String(task.taskCode || '').trim();
  if (!taskCode) throw new Error('missing overseas task code');
  await activateSeedanceWorkTab(tab);
  await ensureSeedanceContentScriptReady(tab);
  await reportBridgeTaskStatus(taskCode, 'processing');
  const filesData = (task.referenceFiles || []).map((file) => ({
    name: file.fileName || file.name || 'reference.png',
    data: file.base64 || file.data || '',
    type: file.fileType || file.type || 'image/png',
  }));
  const preset = buildSeedanceTaskPreset(task);
  if (Object.keys(preset).length > 0) {
    const presetResp = await sendSeedanceTabMessage(tab, {
      action: 'applyPreset',
      preset,
    }, 'overseas page preset failed: page script did not respond');
    if (!presetResp || presetResp.success === false) {
      throw new Error(presetResp && presetResp.error || 'overseas page preset failed');
    }
    validateSeedancePresetResult(preset, presetResp.result);
  }
  const generateResp = await sendSeedanceTabMessage(tab, {
    action: 'doGenerate',
    files: filesData,
    prompt: task.markedPrompt || task.prompt || '',
    aspectRatio: task.modelConfig && task.modelConfig.aspectRatio,
  }, 'overseas page fill/upload failed: page script did not respond');
  if (!generateResp || generateResp.success === false) {
    throw new Error(generateResp && generateResp.error || 'overseas page fill/upload failed');
  }
  const clickResp = await sendSeedanceTabMessage(tab, { action: 'clickGenerate' }, 'overseas page click generate failed: page script did not respond');
  if (!clickResp || clickResp.success === false) {
    throw new Error(clickResp && clickResp.error || 'overseas page click generate failed');
  }
  await reportBridgeTaskStatus(taskCode, 'submitted', '', {
    resultAnchor: clickResp.resultAnchor || null,
  });
}

async function pollSeedanceSubmittedTaskResult(task) {
  const taskCode = String(task && task.taskCode || '').trim();
  if (!taskCode) return;
  const startedAt = Number(task.createdAt || task.updatedAt || 0) * 1000;
  if (startedAt > 0 && Date.now() - startedAt > SEEDANCE_RESULT_MONITOR_TIMEOUT_MS) {
    await reportBridgeTaskStatus(taskCode, 'failed', 'overseas video generation timed out');
    return;
  }
  const tab = await findActiveSeedanceTab();
  if (!tab) return;
  await ensureSeedanceContentScriptReady(tab);
  const expectedPreset = buildSeedanceTaskPreset(task);
  const result = await sendSeedanceTabMessage(tab, {
    action: 'findLatestSeedanceResultAfterSubmit',
    resultAnchor: task.resultAnchor || null,
    expectedPrompt: task.prompt || '',
    expectedPromptMarker: task.promptMarker || '',
    expectedModel: expectedPreset.model || '',
    expectedDuration: expectedPreset.duration || '',
  }, 'overseas page result query failed: page script did not respond');
  if (!result || result.success === false) {
    throw new Error(result && result.error || 'overseas page result query failed');
  }
  const resultProbe = result.resultProbe || null;
  if (result.status === 'failed') {
    await reportBridgeTaskStatus(taskCode, 'failed', result.message || 'overseas video generation failed', {
      resultProbe: result.resultProbe || null,
    });
    return;
  }
  if (result.status === 'completed' && result.videoUrl) {
    const uploadResult = await sendSeedanceTabMessage(tab, {
      action: 'captureAndUploadLatestSeedanceResult',
      taskCode,
      serverUrl: SEEDANCE_BRIDGE_API_BASE,
      quality: 'standard',
      videoUrl: result.videoUrl,
      promptMarker: task.promptMarker || '',
    }, 'video upload back to workbench failed: page script did not respond');
    if (!uploadResult || uploadResult.success === false || uploadResult.uploaded <= 0) {
      throw new Error(uploadResult && (uploadResult.message || uploadResult.error) || 'video upload back to workbench failed');
    }
    await reportBridgeTaskStatus(taskCode, 'completed', '', {
      resultProbe: result.resultProbe || null,
    });
    return;
  }
  if (resultProbe) {
    await reportBridgeTaskStatus(taskCode, 'submitted', '', {
      resultProbe: result.resultProbe || null,
    });
  }
}

function isTransientSeedanceSubmittedTaskError(err) {
  const message = String(err && err.message || err || '').toLowerCase();
  return /failed to fetch|network\s*error|networkerror|load failed|request timeout|请求超时|网络请求失败|message channel closed|message port closed|receiving end does not exist|extension context invalidated|page script did not respond|overseas page result query failed|video upload back to workbench failed/i.test(message);
}

async function processSeedanceBridgeTasks(tasks = []) {
  for (const task of tasks) {
    try {
      if (task.status === 'submitted') {
        await pollSeedanceSubmittedTaskResult(task);
      } else {
        await executeSeedanceBridgeTask(task);
      }
    } catch (err) {
      if (task.status === 'submitted' && isTransientSeedanceSubmittedTaskError(err)) {
        console.warn('[Seedance BG] submitted task poll/upload transient error, keep waiting:', err.message || err);
        continue;
      }
      await reportBridgeTaskStatus(task.taskCode, 'failed', err.message || String(err));
    }
  }
}

async function pollSeedancePendingTasks() {
  if (seedanceExecutingTask) return;
  seedanceExecutingTask = true;
  try {
    const data = await bridgeFetch('/api/tasks/pending?clientId=background&includeSubmitted=1');
    const tasks = Array.isArray(data.tasks) ? data.tasks : [];
    for (const task of tasks) {
      try {
        if (task.status === 'submitted') {
          await pollSeedanceSubmittedTaskResult(task);
        } else {
          await executeSeedanceBridgeTask(task);
        }
      } catch (err) {
        if (task.status === 'submitted' && isTransientSeedanceSubmittedTaskError(err)) {
          console.warn('[Seedance BG] submitted task poll/upload transient error, keep waiting:', err.message || err);
          continue;
        }
        await reportBridgeTaskStatus(task.taskCode, 'failed', err.message || String(err));
      }
    }
  } catch (err) {
    console.warn('[Seedance BG] task polling failed:', err.message);
  } finally {
    seedanceExecutingTask = false;
  }
}

async function startSeedanceTaskWaiting() {
  if (seedanceTaskWaitRunning || seedanceTaskWaitStopped) return;
  seedanceTaskWaitRunning = true;
  try {
    while (!seedanceTaskWaitStopped) {
      try {
        if (seedanceExecutingTask) {
          await sleep(SEEDANCE_TASK_WAIT_RETRY_MS);
          continue;
        }
        const data = await waitRemoteTasks(SEEDANCE_BRIDGE_API_BASE);
        const tasks = Array.isArray(data.tasks) ? data.tasks : [];
        if (tasks.length > 0) {
          seedanceExecutingTask = true;
          try {
            await processSeedanceBridgeTasks(tasks);
          } finally {
            seedanceExecutingTask = false;
          }
        }
      } catch (err) {
        console.warn('[Seedance BG] task wait failed:', err.message || err);
        await sleep(SEEDANCE_TASK_WAIT_RETRY_MS);
      }
    }
  } finally {
    seedanceTaskWaitRunning = false;
  }
}

function scheduleSeedancePendingPollSoon() {
  if (seedanceTaskPollWakeTimer) return;
  seedanceTaskPollWakeTimer = setTimeout(() => {
    seedanceTaskPollWakeTimer = null;
    pollSeedancePendingTasks().catch((err) => {
      console.warn('[Seedance BG] 蹇冭烦鍞ら啋浠诲姟杞澶辫触:', err.message);
    });
  }, 250);
}

function startSeedanceTaskPolling() {
  if (seedanceTaskPollTimer) return;
  setTimeout(pollSeedancePendingTasks, 2000);
  seedanceTaskPollTimer = setInterval(pollSeedancePendingTasks, 5000);
}

function setupSeedanceTaskWakeAlarm() {
  if (!chrome.alarms || !chrome.alarms.create) return;
  chrome.alarms.create('seedance-task-wakeup', { periodInMinutes: 0.5 });
  chrome.alarms.onAlarm.addListener((alarm) => {
    if (!alarm || alarm.name !== 'seedance-task-wakeup') return;
    startSeedanceTaskWaiting().catch((err) => {
      console.warn('[Seedance BG] task wait wake failed:', err.message || err);
    });
    pollSeedancePendingTasks().catch((err) => {
      console.warn('[Seedance BG] task alarm poll failed:', err.message || err);
    });
    reportActiveSeedancePageStatus();
  });
}

startSeedancePageStatusPolling();
startSeedanceTaskPolling();
setupSeedanceTaskWakeAlarm();
startSeedanceTaskWaiting().catch((err) => {
  console.warn('[Seedance BG] task wait startup failed:', err.message || err);
});


