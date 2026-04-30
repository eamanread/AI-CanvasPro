import {
  fetchUserSettingsFromServer,
  saveUserSettingsToServer,
  fetchSubscriptionStatus,
  activateCdkey,
} from "../api/index.js";

export const V54_VIP_MODEL_ID = "runninghub/2041741496667348994";
export const DREAMINA_VIDEO_VIP_MODEL_ID = "dreamina/video_vip";
export const VIDEO_VIP_MODEL_IDS = [
  V54_VIP_MODEL_ID,
  DREAMINA_VIDEO_VIP_MODEL_ID,
];

const SUBSCRIPTION_CONTACT_TEXT_FALLBACK = "联系管理员获取授权码";
const GENERATION_SCOPE_BLOCKED_VALUES = new Set(["none", "disabled", "inactive", "forbidden"]);
const VIDEO_VIP_MODEL_ID_SET = new Set(VIDEO_VIP_MODEL_IDS);
const VIP_MODEL_KEY_ALIASES = {
  [V54_VIP_MODEL_ID]: ["video_edit_v54", "video_edit.pro"],
  [DREAMINA_VIDEO_VIP_MODEL_ID]: [
    "dreamina_video_vip",
    "dreamina.video_vip",
    DREAMINA_VIDEO_VIP_MODEL_ID,
  ],
};
const VIP_MODEL_DISPLAY_NAMES = {
  [V54_VIP_MODEL_ID]: "视频编辑V5.4",
  [DREAMINA_VIDEO_VIP_MODEL_ID]: "即梦视频",
};
const NODE_TYPE_DISPLAY_NAMES = {
  text: "文本生成",
  image: "图像生成",
  video: "视频生成",
  audio: "音频生成",
};
const INSTALL_ID_KEY = "aic-install-id";
const V54_LOCAL_UNLOCK_KEY = "aic-v54-vip-unlocked";

let fetchSubscriptionStatusImpl = fetchSubscriptionStatus;
let activateCdkeyImpl = activateCdkey;

function normalizeStatus(value) {
  const status = String(value || "").trim().toLowerCase();
  if (status === "active") {
    return "active";
  }
  if (status === "expired") {
    return "expired";
  }
  return "none";
}

function toExpirySeconds(value) {
  if (value == null || value === "") {
    return null;
  }
  const numeric = Number(value);
  if (Number.isFinite(numeric) && numeric > 0) {
    return numeric > 10 ** 11 ? Math.floor(numeric / 1000) : Math.floor(numeric);
  }
  const timestamp = Date.parse(String(value));
  if (!Number.isFinite(timestamp) || timestamp <= 0) {
    return null;
  }
  return Math.floor(timestamp / 1000);
}

function getPayloadRoot(payload) {
  if (payload && typeof payload === "object" && payload.data && typeof payload.data === "object") {
    return payload.data;
  }
  return payload && typeof payload === "object" ? payload : {};
}

function readFirstValue(payload, keys, defaultValue = undefined) {
  const source = getPayloadRoot(payload);
  for (const key of keys) {
    if (source[key] !== undefined && source[key] !== null) {
      return source[key];
    }
  }
  return defaultValue;
}

function readStringList(payload, keys) {
  const raw = readFirstValue(payload, keys, []);
  if (!Array.isArray(raw)) {
    return [];
  }
  return raw
    .map((item) => String(item || "").trim())
    .filter(Boolean)
    .filter((item, index, list) => list.indexOf(item) === index);
}

function normalizeProviderValue(value) {
  return String(value || "").trim().toLowerCase();
}

function normalizeNodeTypeValue(value) {
  const normalized = normalizeProviderValue(value);
  if (!normalized) {
    return "";
  }
  if (normalized.startsWith("ai-")) {
    return normalized.slice(3);
  }
  if (normalized === "test-video") {
    return "video";
  }
  return normalized;
}

function hasGenerationAccessMetadata(subscriptionState) {
  const source = subscriptionState && typeof subscriptionState === "object" ? subscriptionState : {};
  return Boolean(
    String(source.activationSource || "").trim() ||
      String(source.generationScope || "").trim() ||
      (Array.isArray(source.entitledNodeTypes) && source.entitledNodeTypes.length > 0) ||
      (Array.isArray(source.entitledProviders) && source.entitledProviders.length > 0),
  );
}

function normalizeLegacyEntitledModelIds(subscriptionState) {
  return Array.isArray(subscriptionState?.entitledModelIds)
    ? subscriptionState.entitledModelIds.map((item) => String(item || "").trim()).filter(Boolean)
    : [];
}

function normalizeLegacyEntitledModelKeys(subscriptionState) {
  return Array.isArray(subscriptionState?.entitledModelKeys)
    ? subscriptionState.entitledModelKeys
        .map((item) => String(item || "").trim().toLowerCase())
        .filter(Boolean)
    : [];
}

function normalizeGenerationScopeValue(value) {
  return String(value || "").trim().toLowerCase();
}

function isGenerationScopeAllowed(generationScope) {
  const normalizedScope = normalizeGenerationScopeValue(generationScope);
  if (!normalizedScope) {
    return true;
  }
  return !GENERATION_SCOPE_BLOCKED_VALUES.has(normalizedScope);
}

function isValueAllowedByRestriction(rawAllowedValues, candidateValue, normalizeValue) {
  const allowedValues = Array.isArray(rawAllowedValues)
    ? rawAllowedValues
        .map((item) => normalizeValue(item))
        .filter(Boolean)
        .filter((item, index, list) => list.indexOf(item) === index)
    : [];
  if (allowedValues.length === 0) {
    return true;
  }
  const normalizedCandidate = normalizeValue(candidateValue);
  if (!normalizedCandidate) {
    return false;
  }
  return allowedValues.includes(normalizedCandidate);
}

function inferLegacyNodeType(modelId, provider = "") {
  if (isVipModel(modelId, provider)) {
    return "video";
  }
  const normalizedModelId = String(modelId || "").trim().toLowerCase();
  if (normalizedModelId.includes("text")) {
    return "text";
  }
  if (normalizedModelId.includes("audio")) {
    return "audio";
  }
  if (
    normalizedModelId.includes("video") ||
    normalizedModelId.includes("seedance") ||
    normalizedModelId.includes("frames2video") ||
    normalizedModelId.includes("multiframe2video") ||
    normalizedModelId.includes("multimodal2video")
  ) {
    return "video";
  }
  if (normalizedModelId.includes("image")) {
    return "image";
  }
  return "";
}

function generateInstallId() {
  const seed = `${Date.now()}-${Math.random()}`;
  let hash = 0;
  for (let index = 0; index < seed.length; index += 1) {
    hash = ((hash * 31) + seed.charCodeAt(index)) >>> 0;
  }
  return `aic-${Date.now().toString(36)}-${hash.toString(36)}`;
}

export function createDefaultSubscriptionState() {
  return {
    loading: false,
    status: "none",
    expiresAt: null,
    activationSource: "",
    generationScope: "",
    entitledModelKeys: [],
    entitledModelIds: [],
    entitledNodeTypes: [],
    entitledProviders: [],
    error: null,
    lastSyncAt: 0,
    contactText: SUBSCRIPTION_CONTACT_TEXT_FALLBACK,
    contactUrl: "",
  };
}

export function isActivationRequestAccepted(payload) {
  const source = payload && typeof payload === "object" ? payload : {};
  return (
    source?.success === true ||
    Number(source?.code) === 0 ||
    String(source?.status || "").trim().toLowerCase() === "active"
  );
}

export function isActivationConfirmed(activationPayload, subscriptionState) {
  return isActivationRequestAccepted(activationPayload) && isSubscriptionActive(subscriptionState || {});
}

export function extractSubscriptionExpiresAt(payload) {
  const value = readFirstValue(
    payload,
    [
      "expiresAt",
      "expires_at",
      "expireAt",
      "expire_at",
      "expiryAt",
      "expiry_at",
      "expiry",
      "expiredAt",
      "expired_at",
      "validUntil",
      "valid_until",
      "deadlineAt",
      "deadline",
      "end_at",
      "endAt",
      "deadline_at",
      "end_at",
    ],
    null,
  );
  return toExpirySeconds(value);
}

export function isSubscriptionActive(subscriptionState) {
  return normalizeStatus(subscriptionState?.status) === "active";
}

export function canAccessGeneration(
  subscriptionState,
  { provider = "", nodeType = "", requireCdkeySource = false } = {},
) {
  const source = subscriptionState && typeof subscriptionState === "object" ? subscriptionState : {};
  if (!isSubscriptionActive(source)) {
    return false;
  }
  if (!isGenerationScopeAllowed(source.generationScope)) {
    return false;
  }

  const activationSource = normalizeProviderValue(source.activationSource);
  if (requireCdkeySource && activationSource !== "cdkey") {
    return false;
  }

  if (
    !isValueAllowedByRestriction(
      source.entitledNodeTypes,
      nodeType,
      normalizeNodeTypeValue,
    )
  ) {
    return false;
  }

  if (
    !isValueAllowedByRestriction(
      source.entitledProviders,
      provider,
      normalizeProviderValue,
    )
  ) {
    return false;
  }

  return true;
}

export function resolveVipGateModelId(modelId, provider = "") {
  const normalizedModelId = String(modelId || "").trim();
  const normalizedProvider = String(provider || "").trim().toLowerCase();
  if (
    normalizedProvider === "dreamina" ||
    normalizedModelId.startsWith("dreamina/")
  ) {
    return DREAMINA_VIDEO_VIP_MODEL_ID;
  }
  return normalizedModelId;
}

export function getVipModelDisplayName(modelId, provider = "") {
  const resolvedModelId = resolveVipGateModelId(modelId, provider);
  return VIP_MODEL_DISPLAY_NAMES[resolvedModelId] || resolvedModelId || "该模型";
}

export function isVipModel(modelId, provider = "") {
  return VIDEO_VIP_MODEL_ID_SET.has(resolveVipGateModelId(modelId, provider));
}

export function getGenerationAccessDisplayName({ modelId = "", provider = "", nodeType = "" } = {}) {
  const normalizedNodeType = normalizeNodeTypeValue(nodeType);
  if (NODE_TYPE_DISPLAY_NAMES[normalizedNodeType]) {
    return NODE_TYPE_DISPLAY_NAMES[normalizedNodeType];
  }
  if (isVipModel(modelId, provider)) {
    return getVipModelDisplayName(modelId, provider);
  }
  const normalizedProvider = normalizeProviderValue(provider);
  if (normalizedProvider === "dreamina") {
    return "即梦生成";
  }
  if (normalizedProvider === "runninghubwf") {
    return "RunningHub 工作流生成";
  }
  return "生成权限";
}

export function setLocalVipUnlocked(unlocked) {
  try {
    if (unlocked) {
      globalThis.localStorage?.setItem(V54_LOCAL_UNLOCK_KEY, "1");
    } else {
      globalThis.localStorage?.removeItem(V54_LOCAL_UNLOCK_KEY);
    }
  } catch {
    // Ignore local storage failures.
  }
}

export function isModelAllowed(modelId, subscriptionState, provider = "") {
  const source = subscriptionState && typeof subscriptionState === "object" ? subscriptionState : {};
  if (hasGenerationAccessMetadata(source) || !isVipModel(modelId, provider)) {
    return canAccessGeneration(source, {
      provider,
      nodeType: inferLegacyNodeType(modelId, provider),
    });
  }

  const resolvedModelId = resolveVipGateModelId(modelId, provider);
  if (!isVipModel(resolvedModelId)) {
    return true;
  }
  if (!isSubscriptionActive(source)) {
    return false;
  }

  const entitledModelIds = normalizeLegacyEntitledModelIds(source);
  if (entitledModelIds.length > 0) {
    return entitledModelIds.includes(resolvedModelId);
  }

  const entitledModelKeys = normalizeLegacyEntitledModelKeys(source);
  if (entitledModelKeys.length > 0) {
    const aliases = VIP_MODEL_KEY_ALIASES[resolvedModelId] || [];
    if (aliases.length === 0) {
      return false;
    }
    return aliases.some((alias) => entitledModelKeys.includes(String(alias).toLowerCase()));
  }

  return true;
}

export async function ensureInstallId() {
  try {
    const localInstallId = String(globalThis.localStorage?.getItem(INSTALL_ID_KEY) || "").trim();
    if (localInstallId) {
      globalThis.__aicInstallId = localInstallId;
      return localInstallId;
    }
  } catch {
    // Continue with server lookup.
  }

  let userSettings = {};
  try {
    userSettings = (await fetchUserSettingsFromServer()) || {};
  } catch {
    userSettings = {};
  }

  const serverInstallId = String(userSettings.installId || "").trim();
  if (serverInstallId) {
    try {
      globalThis.localStorage?.setItem(INSTALL_ID_KEY, serverInstallId);
    } catch {
      // Ignore persistence failures.
    }
    globalThis.__aicInstallId = serverInstallId;
    return serverInstallId;
  }

  const generatedInstallId = generateInstallId();
  try {
    globalThis.localStorage?.setItem(INSTALL_ID_KEY, generatedInstallId);
  } catch {
    // Ignore persistence failures.
  }
  try {
    await saveUserSettingsToServer({ ...userSettings, installId: generatedInstallId });
  } catch {
    // Ignore sync failures; the local installId is still usable.
  }
  globalThis.__aicInstallId = generatedInstallId;
  return generatedInstallId;
}

export function normalizeSubscriptionPayload(payload) {
  const defaultState = createDefaultSubscriptionState();
  const source = getPayloadRoot(payload);

  const entitledModelIds = readStringList(payload, [
    "entitledModelIds",
    "entitled_model_ids",
    "modelIds",
  ]);
  const entitledModelKeys = readStringList(payload, [
    "entitledModelKeys",
    "entitled_model_keys",
    "modelKeys",
  ]);
  const entitledNodeTypes = readStringList(payload, [
    "entitledNodeTypes",
    "entitled_node_types",
    "nodeTypes",
  ]);
  const entitledProviders = readStringList(payload, [
    "entitledProviders",
    "entitled_providers",
    "providers",
  ]);

  return {
    ...defaultState,
    status: normalizeStatus(source.status || source.subscriptionStatus || source.state || ""),
    expiresAt: extractSubscriptionExpiresAt(payload),
    activationSource: String(
      source.activationSource ?? source.activation_source ?? defaultState.activationSource,
    ).trim(),
    generationScope: String(
      source.generationScope ?? source.generation_scope ?? defaultState.generationScope,
    ).trim(),
    entitledModelKeys,
    entitledModelIds,
    entitledNodeTypes,
    entitledProviders,
    contactText: String(
      source.contactText ?? source.contact_text ?? defaultState.contactText,
    ),
    contactUrl: String(source.contactUrl ?? source.contact_url ?? ""),
  };
}

export async function pullSubscriptionState(installId) {
  const payload = await fetchSubscriptionStatusImpl(installId);
  const state = normalizeSubscriptionPayload(payload || {});
  setLocalVipUnlocked(isSubscriptionActive(state));
  return state;
}

export async function submitCdkey(installId, cdkey) {
  const payload = await activateCdkeyImpl({ installId, cdkey });
  return payload && typeof payload === "object" ? payload : {};
}

export function __setSubscriptionApiForTest({
  fetchSubscriptionStatusImpl: nextFetchSubscriptionStatusImpl,
  activateCdkeyImpl: nextActivateCdkeyImpl,
} = {}) {
  fetchSubscriptionStatusImpl =
    typeof nextFetchSubscriptionStatusImpl === "function"
      ? nextFetchSubscriptionStatusImpl
      : fetchSubscriptionStatus;
  activateCdkeyImpl =
    typeof nextActivateCdkeyImpl === "function"
      ? nextActivateCdkeyImpl
      : activateCdkey;
}
