const MODEL_MENU_ITEM_SELECTOR = ".floating-menu-item";
const MODEL_TRIGGER_SELECTOR =
  ".img-model-btn-trigger,.fa-model-btn,[data-model-toggle],.model-toggle";
const MODEL_MENU_CONTENT_SELECTOR = ".fmi-content";
const MODEL_TRIGGER_LABEL_SELECTOR =
  ".img-model-label,.fa-model-label,.tool-model-label,.model-text";

function toElementArray(value) {
  return Array.isArray(value) ? value : Array.from(value || []);
}

function matchesSelector(element, selector) {
  if (!element || typeof element.matches !== "function") {
    return false;
  }
  try {
    return element.matches(selector);
  } catch {
    return false;
  }
}

function queryAll(root, selector) {
  if (!root || typeof root.querySelectorAll !== "function") {
    return [];
  }
  try {
    return Array.from(root.querySelectorAll(selector) || []);
  } catch {
    return [];
  }
}

function collectTargets(root, selector) {
  const targets = queryAll(root, selector);
  if (matchesSelector(root, selector)) {
    targets.unshift(root);
  }
  return targets;
}

function removeLeadingChildrenBeforeAnchor(container, anchorSelector) {
  const children = toElementArray(container?.children);
  if (children.length === 0) {
    return false;
  }

  const anchorIndex = children.findIndex((child) => matchesSelector(child, anchorSelector));
  if (anchorIndex <= 0) {
    return false;
  }

  for (let index = 0; index < anchorIndex; index += 1) {
    children[index]?.remove?.();
  }
  return true;
}

export function removeLeadingMenuItemVisuals(menuItem) {
  return removeLeadingChildrenBeforeAnchor(menuItem, MODEL_MENU_CONTENT_SELECTOR);
}

export function removeLeadingModelTriggerVisuals(trigger) {
  return removeLeadingChildrenBeforeAnchor(trigger, MODEL_TRIGGER_LABEL_SELECTOR);
}

export function sanitizeModelMenuVisuals(root) {
  if (!root) {
    return 0;
  }

  let changedCount = 0;

  for (const menuItem of collectTargets(root, MODEL_MENU_ITEM_SELECTOR)) {
    if (removeLeadingMenuItemVisuals(menuItem)) {
      changedCount += 1;
    }
  }

  for (const trigger of collectTargets(root, MODEL_TRIGGER_SELECTOR)) {
    if (removeLeadingModelTriggerVisuals(trigger)) {
      changedCount += 1;
    }
  }

  return changedCount;
}

export function initModelMenuVisualSanitizer(documentRoot = document) {
  if (!documentRoot) {
    return null;
  }

  sanitizeModelMenuVisuals(documentRoot);

  if (typeof MutationObserver !== "function") {
    return null;
  }

  const observeTarget =
    documentRoot.body || documentRoot.documentElement || documentRoot;
  if (!observeTarget || typeof observeTarget !== "object") {
    return null;
  }

  const observer = new MutationObserver((records) => {
    for (const record of records || []) {
      for (const node of toElementArray(record?.addedNodes)) {
        sanitizeModelMenuVisuals(node);
      }
    }
  });

  observer.observe(observeTarget, {
    childList: true,
    subtree: true,
  });

  return observer;
}
