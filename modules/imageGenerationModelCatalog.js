import { filterConfiguredApiModels } from "./modelRegistryFilters.js";
import { getModelMenuSubtitle } from "./modelMenuDescriptions.js";

export const REGISTRY_IMAGE_PROVIDER = "registry-openai";

function trimText(value) {
  return String(value ?? "").trim();
}

export function buildConfiguredImageGenerationModelCatalog(models) {
  const configuredModels = filterConfiguredApiModels(models);
  if (configuredModels.length === 0) {
    return {};
  }

  return {
    [REGISTRY_IMAGE_PROVIDER]: {
      name: "API图片模型",
      icon: "API",
      isTextIcon: true,
      description: "仅显示已在 API 设置中配置的图片模型",
      flatMenu: true,
      models: configuredModels.map((model) => ({
        id: trimText(model.id),
        name: trimText(model.modelName || model.name || model.id),
        description: getModelMenuSubtitle(model, { nodeType: "image" }),
        icon: "API",
        isTextIcon: true,
      })),
    },
  };
}

export function getConfiguredImageGenerationModelDisplayName(modelId, catalog) {
  const targetId = trimText(modelId);
  if (!targetId) {
    return "";
  }

  for (const provider of Object.values(catalog || {})) {
    const models = Array.isArray(provider?.models) ? provider.models : [];
    const match = models.find((model) => trimText(model?.id) === targetId);
    if (match) {
      return trimText(match.name || match.modelName || match.id) || targetId;
    }
  }

  return targetId;
}
