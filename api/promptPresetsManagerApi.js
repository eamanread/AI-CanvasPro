import { del, get, post } from "./requester.js";

export async function fetchPromptPresetDefinitionsFromServer() {
  return get("/api/v2/user/presets/definitions", {
    provider: "local",
  });
}

export async function savePromptPresetDefinitionsToServer(definitions) {
  return post(
    "/api/v2/user/presets/definitions/save",
    {
      definitions,
    },
    {
      provider: "local",
    },
  );
}

export async function savePromptPresetToServer(payload) {
  return post("/api/v2/user/presets/dev/save", payload, {
    provider: "local",
  });
}

export async function deletePromptPresetFromServer(nodeType, title) {
  const safeNodeType = encodeURIComponent(String(nodeType || "").trim());
  const safeTitle = encodeURIComponent(String(title || "").trim());
  return del(`/api/v2/user/presets/dev/${safeNodeType}/${safeTitle}`, {
    provider: "local",
  });
}
