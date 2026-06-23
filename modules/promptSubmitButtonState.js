const BUTTON_SELECTOR = '.prompt-submit:not(.debug-wrench-btn)';
const SPINNING_CLASS = 'is-icon-spinning';
const NORMALIZED_ATTR = 'data-icon-only-submit';
const ARROW_ICON = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 19V5"></path><path d="m5 12 7-7 7 7"></path></svg>';

const GENERATING_RE = /\u751f\u6210\u4e2d|\u6b63\u5728\u751f\u6210|\u63d0\u4ea4\u4e2d|\u5904\u7406\u4e2d|\u52a0\u8f7d\u4e2d|loading|generating|pending|running/i;
const GENERATING_CLASS_RE = /(^|\s)(is-|state-)?(generating|loading|pending|running)(\s|$)/i;
const IDLE_RE = /^(\u751f\u6210|\u63d0\u4ea4|\u5f00\u59cb\u751f\u6210|\u53d1\u9001)$/i;

export function resolvePromptSubmitGeneratingState({
  text = '',
  className = '',
  ariaBusy = '',
  disabled = false,
  previousGenerating = false,
} = {}) {
  const cleanText = String(text || '').replace(/\s+/g, '');
  const cleanClassName = String(className || '');
  if (GENERATING_RE.test(cleanText) || GENERATING_CLASS_RE.test(cleanClassName) || String(ariaBusy) === 'true') {
    return true;
  }
  if (IDLE_RE.test(cleanText) || disabled === false) {
    return false;
  }
  return Boolean(previousGenerating && disabled);
}

export function normalizePromptSubmitButton(btn) {
  if (!btn || btn.__promptSubmitNormalizing || btn.matches?.('.debug-wrench-btn')) return;
  if (
    btn.dataset?.generationAction === 'stop' ||
    btn.getAttribute?.('data-generation-action') === 'stop' ||
    btn.dataset?.generationState === 'running' ||
    btn.getAttribute?.('data-generation-state') === 'running'
  ) {
    return;
  }

  const isGenerating = resolvePromptSubmitGeneratingState({
    text: btn.textContent || '',
    className: btn.className || '',
    ariaBusy: btn.getAttribute?.('aria-busy') || '',
    disabled: Boolean(btn.disabled),
    previousGenerating: btn.dataset?.promptSubmitGenerating === 'true',
  });

  btn.__promptSubmitNormalizing = true;
  try {
    btn.classList.toggle(SPINNING_CLASS, isGenerating);
    btn.dataset.promptSubmitGenerating = isGenerating ? 'true' : 'false';
    btn.setAttribute(NORMALIZED_ATTR, 'true');
    btn.setAttribute('aria-label', isGenerating ? '\u751f\u6210\u4e2d' : '\u751f\u6210');
    if (btn.textContent.trim() || !btn.querySelector('svg')) {
      btn.innerHTML = ARROW_ICON;
    }
  } finally {
    btn.__promptSubmitNormalizing = false;
  }
}

function scanPromptSubmitButtons(root = document) {
  if (root?.nodeType === Node.ELEMENT_NODE && root.matches?.(BUTTON_SELECTOR)) {
    normalizePromptSubmitButton(root);
  }
  root?.querySelectorAll?.(BUTTON_SELECTOR)?.forEach(normalizePromptSubmitButton);
}

export { scanPromptSubmitButtons };

export function initPromptSubmitButtonState() {
  if (typeof document === 'undefined' || document.__promptSubmitButtonStateReady) return;
  document.__promptSubmitButtonStateReady = true;

  const start = () => {
    scanPromptSubmitButtons();
    const observer = new MutationObserver(mutations => {
      for (const mutation of mutations) {
        const target = mutation.target?.nodeType === Node.ELEMENT_NODE
          ? mutation.target
          : mutation.target?.parentElement;
        scanPromptSubmitButtons(target);
        mutation.addedNodes?.forEach(node => scanPromptSubmitButtons(node));
      }
    });
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: ['class', 'disabled', 'aria-busy', 'title'],
    });
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
  } else {
    start();
  }
}

initPromptSubmitButtonState();
