function trimText(value) {
  return String(value ?? "").trim();
}

export function isConfiguredApiModel(model) {
  if (!model || typeof model !== "object" || Array.isArray(model)) {
    return false;
  }

  return Boolean(
    trimText(model.id) &&
      trimText(model.modelName || model.name) &&
      trimText(model.modelId) &&
      trimText(model.apiKey) &&
      trimText(model.baseUrl) &&
      trimText(model.status).toLowerCase() !== "deleted" &&
      model.disabled !== true
  );
}

export function isSelectableApiModel(model) {
  if (!model || typeof model !== "object" || Array.isArray(model)) {
    return false;
  }

  return Boolean(
    trimText(model.id) &&
      trimText(model.modelName || model.name) &&
      trimText(model.modelId) &&
      trimText(model.status).toLowerCase() !== "deleted" &&
      model.disabled !== true
  );
}

export function filterConfiguredApiModels(models) {
  return Array.isArray(models) ? models.filter(isConfiguredApiModel) : [];
}

export function filterSelectableTextModels(models) {
  return Array.isArray(models)
    ? models.filter(
        (model) =>
          trimText(model?.nodeType).toLowerCase() === "text" &&
          isSelectableApiModel(model)
      )
    : [];
}
