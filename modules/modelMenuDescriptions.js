function trimText(value) {
  return String(value ?? "").trim();
}

function normalizeNodeType(nodeType) {
  const normalized = trimText(nodeType).toLowerCase();
  if (normalized === "image" || normalized === "text" || normalized === "video" || normalized === "audio") {
    return normalized;
  }
  return "other";
}

function getExplicitDescription(model) {
  const candidateKeys = [
    "menuDescription",
    "menuSubtitle",
    "subtitle",
    "description",
  ];

  for (const key of candidateKeys) {
    const value = trimText(model?.[key]);
    if (value) {
      return value;
    }
  }

  return "";
}

function buildModelHaystack(model) {
  const parts = [
    model?.modelName,
    model?.name,
    model?.modelId,
    model?.id,
    model?.templateHints?.modelId,
    model?.templateHints?.modelID,
  ]
    .map((value) => trimText(value).toLowerCase())
    .filter(Boolean);

  return parts.join(" ");
}

function matchesAny(haystack, patterns) {
  return patterns.some((pattern) => pattern.test(haystack));
}

const NODE_TYPE_FALLBACKS = Object.freeze({
  image: "通用图像生成",
  text: "通用文本生成",
  video: "通用视频生成",
  audio: "通用音频生成",
  other: "通用模型能力",
});

const NODE_TYPE_RULES = Object.freeze({
  image: [
    { patterns: [/nano[-\s]?banana/], description: "适合快速出图" },
    { patterns: [/\bgpt[-\s]?image\b/, /\bgpt-image-\d+\b/], description: "适合高质量细节" },
    { patterns: [/\bmj\b/, /midjourney/], description: "适合风格化创作" },
    { patterns: [/seedream/, /即梦/, /dreamina/], description: "适合通用创意绘图" },
    { patterns: [/\bflux\b/], description: "适合高质量创意图" },
    { patterns: [/sdxl/, /stable diffusion/], description: "适合通用绘图" },
    { patterns: [/cogview/, /wanx/, /通义万相/], description: "适合中文海报插画" },
  ],
  text: [
    { patterns: [/deepseek/], description: "适合推理问答" },
    { patterns: [/\bqwen\b/, /通义千问/], description: "适合中文写作" },
    { patterns: [/\bkimi\b/, /moonshot/], description: "适合长文处理" },
    { patterns: [/\bgemini\b/], description: "适合多模态理解" },
    { patterns: [/\bclaude\b/], description: "适合长文分析" },
    { patterns: [/\bgpt\b/, /openai/], description: "适合高质量通用对话" },
    { patterns: [/\bglm\b/, /智谱/, /zhipu/], description: "适合中文问答" },
    { patterns: [/image[-\s]?to[-\s]?text/, /vision/, /识图/], description: "适合识图描述" },
  ],
  video: [
    { patterns: [/\bkling\b/, /可灵/], description: "适合图生视频" },
    { patterns: [/runway/], description: "适合电影感视频" },
    { patterns: [/hailuo/, /海螺/], description: "适合通用视频生成" },
    { patterns: [/seedance/], description: "适合流畅视频生成" },
  ],
  audio: [
    { patterns: [/minimax/], description: "适合自然语音生成" },
    { patterns: [/fish/, /语音克隆/], description: "适合音色克隆" },
  ],
});

export function getModelMenuSubtitle(model, { nodeType = "other" } = {}) {
  const explicitDescription = getExplicitDescription(model);
  if (explicitDescription) {
    return explicitDescription;
  }

  const normalizedNodeType = normalizeNodeType(nodeType);
  const haystack = buildModelHaystack(model);
  const rules = NODE_TYPE_RULES[normalizedNodeType] || [];

  for (const rule of rules) {
    if (matchesAny(haystack, rule.patterns)) {
      return rule.description;
    }
  }

  return NODE_TYPE_FALLBACKS[normalizedNodeType] || NODE_TYPE_FALLBACKS.other;
}
