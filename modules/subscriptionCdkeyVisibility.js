const DEFAULT_INPUT_ID = "subscriptionCdkeyInput";
const DEFAULT_TOGGLE_ID = "subscriptionCdkeyVisibilityToggle";

const EYE_ICON = `
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
    <circle cx="12" cy="12" r="2.5" stroke="currentColor" stroke-width="1.8"/>
  </svg>
`;

const EYE_OFF_ICON = `
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path d="M3 3l18 18" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
    <path d="M10.6 6.2A10.4 10.4 0 0 1 12 6c6 0 9.5 6 9.5 6a17 17 0 0 1-2.2 2.9M6.1 6.9C3.8 8.5 2.5 12 2.5 12s3.5 6 9.5 6c1.5 0 2.8-.4 4-1" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M9.8 9.8a2.5 2.5 0 0 0 3.4 3.4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
  </svg>
`;

function setToggleContent(toggleEl, visible) {
  if ("innerHTML" in toggleEl) {
    toggleEl.innerHTML = visible ? EYE_OFF_ICON : EYE_ICON;
  } else {
    toggleEl.textContent = visible ? "隐藏" : "显示";
  }
}

function syncVisibilityState(inputEl, toggleEl, visible) {
  inputEl.type = visible ? "text" : "password";
  toggleEl.setAttribute("aria-pressed", visible ? "true" : "false");
  toggleEl.setAttribute("aria-label", visible ? "隐藏 CDKEY" : "显示 CDKEY");
  toggleEl.title = visible ? "隐藏 CDKEY" : "显示 CDKEY";
  toggleEl.classList?.toggle?.("is-visible", visible);
  setToggleContent(toggleEl, visible);
}

export function initSubscriptionCdkeyVisibility({
  document: documentRef = globalThis.document,
  inputId = DEFAULT_INPUT_ID,
  toggleId = DEFAULT_TOGGLE_ID,
} = {}) {
  const inputEl = documentRef?.getElementById?.(inputId);
  const toggleEl = documentRef?.getElementById?.(toggleId);
  if (!inputEl || !toggleEl || toggleEl.dataset?.cdkeyVisibilityBound === "1") {
    return false;
  }

  if (toggleEl.dataset) {
    toggleEl.dataset.cdkeyVisibilityBound = "1";
  }

  let visible = false;
  syncVisibilityState(inputEl, toggleEl, visible);

  toggleEl.addEventListener("click", (event) => {
    event?.preventDefault?.();
    visible = !visible;
    syncVisibilityState(inputEl, toggleEl, visible);
    inputEl.focus?.();
  });

  return true;
}
