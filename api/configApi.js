import { PROVIDERS_META } from "../modules/providers.js";
import { get, post } from "./apiBase.js";

const CONFIG_ENDPOINT = "/api/config";

let apiConfig = null;

function normalizeApiUrl(value) {
  return String(value || "").trim().replace(/\/+$/, "");
}

function getCanvasAgentProviderConfig(providerConfig, defaultUrl) {
  const apiUrl = normalizeApiUrl(providerConfig?.apiUrl || defaultUrl);
  const proxyBaseUrl = normalizeApiUrl(providerConfig?.proxyBaseUrl || "");
  return {
    apiUrl,
    apiKey: providerConfig?.apiKey || "",
    proxyBaseUrl,
    proxyToken: providerConfig?.proxyToken || "",
    model: providerConfig?.model || "",
    providerType: providerConfig?.providerType || "",
    defaultDurationSec: providerConfig?.defaultDurationSec || "",
  };
}

function isPlainObject(value) {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function cloneJson(value) {
  if (!isPlainObject(value) && !Array.isArray(value)) {
    return value ?? {};
  }
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return value;
  }
}

function normalizeConfigPayload(data) {
  return isPlainObject(data) ? cloneJson(data) : {};
}

function setApiConfig(nextConfig) {
  apiConfig = normalizeConfigPayload(nextConfig);
  syncLegacyWindowApiKeys(apiConfig);
  return apiConfig;
}

function syncLegacyWindowApiKeys(config) {
  if (typeof window === "undefined") {
    return;
  }

  const providers = isPlainObject(config?.providers) ? config.providers : {};
  const legacyRootApiKey = config?.apiKeyInput || config?.apiKey || "";

  window._appApiKey = providers.grsai?.apiKey || legacyRootApiKey || "";
  window._runningHubApiKey = providers.runninghub?.apiKey || "";
  window._runningHubModelApiKey = providers.runninghub?.modelApiKey || "";
}

export function clearApiConfig() {
  apiConfig = null;
}

export function getApiConfigSnapshot() {
  return cloneJson(apiConfig);
}

export async function fetchApiConfigFromServer() {
  const response = await get(CONFIG_ENDPOINT);
  if (!response.success) {
    throw new Error(response.error || "获取配置失败");
  }
  return setApiConfig(response.data);
}

export async function saveApiConfigToServer(nextConfig) {
  const payload = normalizeConfigPayload(nextConfig);
  const response = await post(CONFIG_ENDPOINT, payload);
  if (!response.success) {
    throw new Error(response.error || "保存配置失败");
  }

  setApiConfig(payload);
  return response.data;
}

export async function ensureConfig() {
  if (apiConfig) {
    return;
  }
  await fetchApiConfigFromServer();
}

export function getProviderConfig(providerId) {
  const meta = PROVIDERS_META[providerId];
  const defaultUrl = meta?.defaultUrl || "https://grsai.dakka.com.cn";
  const providerConfig = apiConfig?.providers?.[providerId];

  if (providerId === "canvas_agent" || providerId === "pi_canvas_agent") {
    return getCanvasAgentProviderConfig(providerConfig || {}, "");
  }

  if (
    providerConfig?.apiUrl ||
    providerConfig?.apiKey ||
    providerConfig?.modelApiKey ||
    providerConfig?.defaultDurationSec
  ) {
    return {
      apiUrl: normalizeApiUrl(providerConfig.apiUrl || defaultUrl),
      apiKey: providerConfig.apiKey || "",
      modelApiKey: providerConfig.modelApiKey || "",
      defaultDurationSec: providerConfig.defaultDurationSec || "",
    };
  }

  if (providerId === "runninghubwf") {
    const runninghubConfig = apiConfig?.providers?.runninghub;
    if (
      runninghubConfig?.apiUrl ||
      runninghubConfig?.apiKey ||
      runninghubConfig?.modelApiKey ||
      runninghubConfig?.defaultDurationSec
    ) {
      return {
        apiUrl: normalizeApiUrl(runninghubConfig.apiUrl || defaultUrl),
        apiKey: runninghubConfig.apiKey || "",
        modelApiKey: "",
        defaultDurationSec: runninghubConfig.defaultDurationSec || "",
      };
    }
  }

  if (providerId === "grsai") {
    return {
      apiUrl: normalizeApiUrl(
        apiConfig?.apiUrlInput || apiConfig?.apiUrl || defaultUrl
      ),
      apiKey: apiConfig?.apiKeyInput || apiConfig?.apiKey || "",
      modelApiKey: "",
      defaultDurationSec: "",
    };
  }

  return {
    apiUrl: defaultUrl,
    apiKey: "",
    modelApiKey: "",
    defaultDurationSec: "",
  };
}
