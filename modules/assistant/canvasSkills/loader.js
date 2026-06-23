import { CANVAS_SKILLS_MANIFEST } from "./manifest.js";
import { createCanvasSkillRegistry } from "./registry.js";
import { createCanvasSkillsRuntime } from "./runtime.js";

export const CANVAS_SKILLS_DEGRADED_NOTICE = "画布 Skills 未加载，当前只能聊天，不能操作画布。";

function hasRuntimeDependencies({ adapters = {}, executeActions } = {}) {
  if (typeof executeActions === "function") {
    return true;
  }
  return Boolean(adapters?.nodeLifecycle);
}

export function loadCanvasSkillsRuntime(options = {}) {
  const manifest = options.manifest || CANVAS_SKILLS_MANIFEST;
  const registry = options.registry || createCanvasSkillRegistry(manifest);
  if (!hasRuntimeDependencies(options)) {
    const notice = CANVAS_SKILLS_DEGRADED_NOTICE;
    return {
      ready: false,
      chatOnly: true,
      notice,
      manifest,
      registry,
      schemas: {},
      executeActions: async () => ({ success: false, appliedCount: 0, warnings: [notice] }),
    };
  }
  const runtime = createCanvasSkillsRuntime(options);
  return {
    ready: true,
    chatOnly: false,
    notice: "",
    manifest,
    registry,
    schemas: {},
    executeActions: runtime.executeActions,
  };
}
