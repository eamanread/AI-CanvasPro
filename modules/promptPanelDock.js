const DOCKED_CLASS = 'viewport-fixed-prompt';
const VISIBLE_CLASS = 'is-visible';
const HIDDEN_CLASS = 'is-ui-hidden';

const records = new WeakMap();

function getDockRoot() {
  return document.getElementById('v2-wrap') || document.body;
}

function getPanelHost(panel) {
  return panel?.closest?.('.v2-node') || null;
}

function hasAnyClass(el, classNames) {
  if (!el?.classList) return false;
  return classNames.some(name => el.classList.contains(name));
}

function syncDockedPanel(panel) {
  const record = records.get(panel);
  if (!record) return;
  const host = record.host;
  if (!host?.isConnected) {
    panel.classList.remove(VISIBLE_CLASS);
    panel.classList.add(HIDDEN_CLASS);
    return;
  }
  panel.classList.toggle(
    VISIBLE_CLASS,
    hasAnyClass(host, ['selected', 'is-connecting-source', 'conn-src'])
  );
  panel.classList.toggle(HIDDEN_CLASS, hasAnyClass(host, ['is-ui-hidden']));
}

export function dockPromptPanel(panel) {
  if (!panel || records.has(panel)) return false;
  if (!panel.classList?.contains('text-prompt-panel')) return false;
  if (panel.classList.contains('video-fixed-prompt')) return false;

  const host = getPanelHost(panel);
  if (!host) return false;

  panel.classList.add(DOCKED_CLASS);
  if (host.id) panel.dataset.nodeId = host.id;

  const observer = new MutationObserver(() => syncDockedPanel(panel));
  observer.observe(host, { attributes: true, attributeFilter: ['class'] });
  records.set(panel, { host, observer });

  getDockRoot().appendChild(panel);
  syncDockedPanel(panel);
  return true;
}

function scanPromptPanels(root = document) {
  if (root?.nodeType === Node.ELEMENT_NODE && root.matches?.('.text-prompt-panel')) {
    dockPromptPanel(root);
  }
  root?.querySelectorAll?.('.text-prompt-panel')?.forEach(panel => dockPromptPanel(panel));
  document.querySelectorAll('.text-prompt-panel.viewport-fixed-prompt').forEach(panel => syncDockedPanel(panel));
}

export function initPromptPanelDock() {
  if (typeof document === 'undefined' || document.__promptPanelDockReady) return;
  document.__promptPanelDockReady = true;

  const start = () => {
    scanPromptPanels();
    const observer = new MutationObserver(mutations => {
      for (const mutation of mutations) {
        mutation.addedNodes?.forEach(node => scanPromptPanels(node));
      }
      scanPromptPanels();
    });
    observer.observe(document.body, { childList: true, subtree: true });
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
  } else {
    start();
  }
}

initPromptPanelDock();
