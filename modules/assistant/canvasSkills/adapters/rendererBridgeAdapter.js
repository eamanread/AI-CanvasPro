export function resolveRendererBridge({ rendererBridge = null, windowRef = globalThis.window } = {}) {
  return (
    rendererBridge ||
    windowRef?.__v2RendererBridge ||
    windowRef?.v2Renderer ||
    globalThis.__v2RendererBridge ||
    globalThis.v2Renderer ||
    null
  );
}

export function findRendererNodeInstance(rendererBridge, nodeId) {
  const instances = rendererBridge?.nodeInstances;
  if (!instances) return null;
  if (typeof instances.get === "function") return instances.get(nodeId) || null;
  if (instances.map && typeof instances.map.get === "function") return instances.map.get(nodeId) || null;
  return instances[nodeId] || null;
}
