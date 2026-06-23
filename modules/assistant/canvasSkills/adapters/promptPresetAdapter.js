import { findRendererNodeInstance } from "./rendererBridgeAdapter.js";

export function createPromptPresetAdapter({
  rendererBridge,
  rendererBridgeResolver = null,
  applyPromptPresetToPromptEl,
} = {}) {
  function currentRendererBridge() {
    return typeof rendererBridgeResolver === "function" ? rendererBridgeResolver() || rendererBridge : rendererBridge;
  }

  return {
    applyPromptPreset(action = {}) {
      const nodeId = String(action.nodeId || action.targetNodeId || "").trim();
      const instance = nodeId ? findRendererNodeInstance(currentRendererBridge(), nodeId) : null;
      const template = action.template || action.promptTemplate || action.presetTemplate || "";
      if (!instance?.promptEl || !template || typeof applyPromptPresetToPromptEl !== "function") return false;
      const generate = instance._onGenerate || instance.onGenerate;
      return applyPromptPresetToPromptEl(
        template,
        {
          promptEl: instance.promptEl,
          nodeId,
          nodeType: action.nodeType,
          onGenerate(nextTemplate) {
            if (typeof generate === "function") return generate.call(instance, nextTemplate, { ...action, nodeId });
            return null;
          },
        },
        { delayMs: 0 }
      );
    },
  };
}
