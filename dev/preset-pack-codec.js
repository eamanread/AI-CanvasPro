export const PRESET_PACK_MAGIC = "HUANYING_PRESETS_V1:";
export const PRESET_PACK_EXTENSION = ".hy-presets";

const PACK_APP = "huanying-preset-pack";
const PACK_VERSION = 1;
const DEFAULT_NODE_TYPES = ["ai-image", "ai-text", "ai-video", "ai-audio"];
const SECRET = "huanying-local-preset-pack-v1";

function trimText(value) {
  return String(value ?? "").trim();
}

function isPlainObject(value) {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function cloneJsonValue(value) {
  return JSON.parse(JSON.stringify(value ?? null));
}

function utf8Encode(value) {
  if (typeof TextEncoder !== "undefined") {
    return new TextEncoder().encode(String(value ?? ""));
  }
  return Buffer.from(String(value ?? ""), "utf8");
}

function utf8Decode(bytes) {
  if (typeof TextDecoder !== "undefined") {
    return new TextDecoder().decode(bytes);
  }
  return Buffer.from(bytes).toString("utf8");
}

function bytesToBase64(bytes) {
  if (typeof btoa === "function") {
    let binary = "";
    bytes.forEach((byte) => {
      binary += String.fromCharCode(byte);
    });
    return btoa(binary);
  }
  return Buffer.from(bytes).toString("base64");
}

function base64ToBytes(value) {
  const text = trimText(value);
  if (typeof atob === "function") {
    const binary = atob(text);
    return Uint8Array.from(binary, (char) => char.charCodeAt(0));
  }
  return Uint8Array.from(Buffer.from(text, "base64"));
}

function buildKeyBytes(length) {
  const seed = utf8Encode(SECRET);
  const key = new Uint8Array(length);
  for (let index = 0; index < key.length; index += 1) {
    key[index] = seed[index % seed.length] ^ ((index * 31 + 17) & 0xff);
  }
  return key;
}

function xorBytes(bytes) {
  const key = buildKeyBytes(bytes.length);
  return Uint8Array.from(bytes, (byte, index) => byte ^ key[index]);
}

function encodePayloadText(text) {
  return bytesToBase64(xorBytes(utf8Encode(text)));
}

function decodePayloadText(text) {
  return utf8Decode(xorBytes(base64ToBytes(text)));
}

function normalizePresetItem(value, path, { allowSubItems }) {
  if (!isPlainObject(value)) {
    throw new Error(`${path} 必须是对象`);
  }

  const title = trimText(value.title);
  if (!title) {
    throw new Error(`${path}.title 不能为空`);
  }

  const item = { title };
  const icon = String(value.icon || "");
  const desc = String(value.desc || "");
  if (icon.trim()) {
    item.icon = icon;
  }
  if (desc.trim()) {
    item.desc = desc;
  }

  if (allowSubItems && Object.prototype.hasOwnProperty.call(value, "subItems")) {
    if (!Array.isArray(value.subItems)) {
      throw new Error(`${path}.subItems 必须是数组`);
    }
    item.subItems = value.subItems.map((child, index) =>
      normalizePresetItem(child, `${path}.subItems[${index}]`, { allowSubItems: false }),
    );
    return item;
  }

  if (typeof value.template !== "string") {
    throw new Error(`${path}.template 必须是字符串`);
  }
  if (!value.template.trim()) {
    throw new Error(`${path}.template 不能为空`);
  }
  item.template = value.template;
  return item;
}

function unwrapPresetPayload(value) {
  if (isPlainObject(value?.presets)) {
    return value.presets;
  }
  return value;
}

export function normalizePresetDefinitionsForImport(value) {
  const source = unwrapPresetPayload(value);
  if (!isPlainObject(source)) {
    throw new Error("预设文件顶层必须是对象");
  }

  const normalized = {};
  Object.entries(source).forEach(([nodeType, items]) => {
    if (!Array.isArray(items)) {
      throw new Error(`${nodeType} 必须是数组`);
    }
    normalized[nodeType] = items.map((item, index) =>
      normalizePresetItem(item, `${nodeType}[${index}]`, { allowSubItems: true }),
    );
  });

  DEFAULT_NODE_TYPES.forEach((nodeType) => {
    normalized[nodeType] = normalized[nodeType] || [];
  });

  return normalized;
}

export async function encodePresetPack(definitions) {
  const presets = normalizePresetDefinitionsForImport(definitions);
  const payload = {
    app: PACK_APP,
    version: PACK_VERSION,
    createdAt: new Date().toISOString(),
    presets,
  };
  return `${PRESET_PACK_MAGIC}${encodePayloadText(JSON.stringify(payload))}`;
}

function parseJsonText(text, errorPrefix) {
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error(`${errorPrefix}: ${error?.message || "JSON 解析失败"}`);
  }
}

export async function decodePresetImportText(text) {
  const raw = String(text ?? "").trim();
  if (!raw) {
    throw new Error("导入文件为空");
  }

  if (raw.startsWith(PRESET_PACK_MAGIC)) {
    const encodedPayload = raw.slice(PRESET_PACK_MAGIC.length);
    let payloadText = "";
    try {
      payloadText = decodePayloadText(encodedPayload);
    } catch (error) {
      throw new Error(`加密包损坏或解密失败: ${error?.message || "无法解密"}`);
    }
    const payload = parseJsonText(payloadText, "加密包 JSON 格式错误");
    if (payload?.app !== PACK_APP || Number(payload?.version) !== PACK_VERSION) {
      throw new Error("加密包版本不兼容");
    }
    return normalizePresetDefinitionsForImport(payload);
  }

  if (!raw.startsWith("{")) {
    throw new Error("文件格式无法识别，请导入 .hy-presets 或 prompt-presets.json");
  }

  return normalizePresetDefinitionsForImport(parseJsonText(raw, "JSON 格式错误"));
}

export function clonePresetDefinitions(definitions) {
  return normalizePresetDefinitionsForImport(cloneJsonValue(definitions));
}
