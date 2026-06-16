const MENU_SELECTOR = ".img-model-menu,.fa-model-menu,.model-menu";
const SUBMENU_SELECTOR = [
  ".grsai-submenu",
  ".apimart-submenu",
  ".ppio-submenu",
  ".runninghub-submenu",
  ".runninghubwf-submenu",
  ".dreamina-submenu",
].join(",");
const CHANNEL_HEADER_SELECTOR = [
  "[data-grsai-toggle]",
  "[data-apimart-toggle]",
  "[data-ppio-toggle]",
  "[data-runninghub-toggle]",
  "[data-runninghubwf-toggle]",
  "[data-dreamina-toggle]",
  ".grsai-group-header",
  ".apimart-group-header",
  ".ppio-group-header",
  ".runninghub-group-header",
  ".runninghubwf-group-header",
  ".dreamina-group-header",
].join(",");

let observer = null;
let pending = false;

function queryAll(root, selector) {
  if (!root?.querySelectorAll) {
    return [];
  }
  try {
    return Array.from(root.querySelectorAll(selector));
  } catch {
    return [];
  }
}

function isSelectableModelItem(element) {
  return Boolean(
    element?.classList?.contains("floating-menu-item") &&
      element.dataset &&
      (element.dataset.value || element.dataset.modelId || element.dataset.nbFamily),
  );
}

function findHeaderForSubmenu(submenu) {
  let candidate = submenu?.previousElementSibling || null;
  while (candidate) {
    if (candidate.matches?.(CHANNEL_HEADER_SELECTOR)) {
      return candidate;
    }
    if (candidate.classList?.contains("floating-menu-item")) {
      return candidate;
    }
    candidate = candidate.previousElementSibling;
  }
  return null;
}

function getItemTextAnchor(item) {
  return (
    item?.querySelector?.(":scope > .fmi-content") ||
    item?.querySelector?.(":scope > .fmi-title") ||
    item?.querySelector?.(":scope > .model-text") ||
    null
  );
}

function stripLeadingModelItemIcon(item) {
  const anchor = getItemTextAnchor(item);
  if (!item || !anchor) {
    return false;
  }

  let changed = false;
  let child = item.firstElementChild;
  while (child && child !== anchor) {
    const next = child.nextElementSibling;
    child.remove();
    changed = true;
    child = next;
  }
  return changed;
}

export function stripModelMenuIcons(menu) {
  return queryAll(menu, ".floating-menu-item").reduce(
    (count, item) => count + (stripLeadingModelItemIcon(item) ? 1 : 0),
    0,
  );
}

export function flattenModelMenu(menu) {
  if (!menu || menu.dataset.flatModelMenuProcessing === "true") {
    return false;
  }

  const submenus = queryAll(menu, SUBMENU_SELECTOR).filter(
    (submenu) => submenu.parentElement === menu && submenu.dataset.flatModelSubmenu !== "true",
  );
  if (!submenus.length) {
    return false;
  }

  menu.dataset.flatModelMenuProcessing = "true";
  let changed = false;

  try {
    for (const submenu of submenus) {
      const header = findHeaderForSubmenu(submenu);
      const items = Array.from(submenu.children).filter(isSelectableModelItem);
      if (!items.length) {
        submenu.dataset.flatModelSubmenu = "true";
        continue;
      }

      const insertBefore = header || submenu;
      for (const item of items) {
        item.dataset.flatModelItem = "true";
        item.style.display = "";
        stripLeadingModelItemIcon(item);
        menu.insertBefore(item, insertBefore);
      }

      header?.remove();
      submenu.remove();
      changed = true;
    }
  } finally {
    delete menu.dataset.flatModelMenuProcessing;
  }

  if (changed) {
    menu.dataset.flatModelMenu = "true";
  }
  stripModelMenuIcons(menu);
  return changed;
}

export function flattenAllModelMenus(root = document) {
  return queryAll(root, MENU_SELECTOR).reduce(
    (count, menu) => {
      const flattened = flattenModelMenu(menu) ? 1 : 0;
      const stripped = stripModelMenuIcons(menu);
      return count + flattened + stripped;
    },
    0,
  );
}

function scheduleFlatten() {
  if (pending || typeof document === "undefined") {
    return;
  }
  pending = true;
  requestAnimationFrame(() => {
    pending = false;
    flattenAllModelMenus(document);
  });
}

export function initFlatModelMenus() {
  if (typeof document === "undefined" || observer) {
    return;
  }

  flattenAllModelMenus(document);
  observer = new MutationObserver(scheduleFlatten);
  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
  });
}

initFlatModelMenus();
