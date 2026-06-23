function notifyChange(onChange, activeId, previousId) {
  if (typeof onChange === "function" && activeId !== previousId) {
    onChange(activeId, previousId);
  }
}

function containsElement(container, target) {
  return Boolean(container && target && typeof container.contains === "function" && container.contains(target));
}

export function createFloatingLayerController({ document: documentRef, onChange } = {}) {
  const layers = new Map();
  let activeLayerId = "";

  function open(id) {
    const nextId = layers.has(String(id)) ? String(id) : "";
    const previousId = activeLayerId;
    activeLayerId = nextId;
    notifyChange(onChange, activeLayerId, previousId);
    return activeLayerId;
  }

  function close(id = activeLayerId) {
    if (!id || activeLayerId !== String(id)) {
      return activeLayerId;
    }
    const previousId = activeLayerId;
    activeLayerId = "";
    notifyChange(onChange, activeLayerId, previousId);
    return activeLayerId;
  }

  function closeAll() {
    return close(activeLayerId);
  }

  function toggle(id) {
    return activeLayerId === String(id) ? close(id) : open(id);
  }

  function isOpen(id) {
    return Boolean(id) && activeLayerId === String(id);
  }

  function registerLayer(id, { sourceEl, layerEl } = {}) {
    if (!id) {
      return;
    }
    layers.set(String(id), { sourceEl, layerEl });
  }

  function handlePointerDown(event) {
    if (!activeLayerId) {
      return;
    }
    const activeLayer = layers.get(activeLayerId);
    if (!activeLayer) {
      closeAll();
      return;
    }
    const target = event?.target;
    if (containsElement(activeLayer.sourceEl, target) || containsElement(activeLayer.layerEl, target)) {
      return;
    }
    closeAll();
  }

  function handleKeyDown(event) {
    if (event?.key === "Escape") {
      closeAll();
    }
  }

  if (documentRef && typeof documentRef.addEventListener === "function") {
    documentRef.addEventListener("pointerdown", handlePointerDown);
    documentRef.addEventListener("keydown", handleKeyDown);
  }

  function destroy() {
    if (documentRef && typeof documentRef.removeEventListener === "function") {
      documentRef.removeEventListener("pointerdown", handlePointerDown);
      documentRef.removeEventListener("keydown", handleKeyDown);
    }
    layers.clear();
    activeLayerId = "";
  }

  return {
    open,
    close,
    toggle,
    closeAll,
    isOpen,
    registerLayer,
    destroy,
    get activeId() {
      return activeLayerId;
    },
  };
}
