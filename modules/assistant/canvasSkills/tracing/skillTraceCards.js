import { redactSkillTrace } from "./skillTraceRedactor.js";

function text(value) {
  return String(value ?? "").trim();
}

function generationCount(trace = {}) {
  const explicit = Number(trace.paramsSummary?.batchSize || trace.batchSize || 0);
  if (Number.isFinite(explicit) && explicit > 0) return explicit;
  return Array.isArray(trace.generationTasks) ? trace.generationTasks.length : 0;
}

export function createSkillTraceCard(trace = {}) {
  const safe = redactSkillTrace(trace) || {};
  const refs = Number(safe.referencesSummary?.total || 0);
  const count = generationCount(safe);
  const model = text(safe.modelDisplayName || safe.paramsSummary?.modelDisplayName || safe.modelId);
  const parts = [
    model ? `模型 ${model}` : "",
    refs ? `${refs} 个参考` : "",
    count ? `生成数量 ${count}` : "",
    safe.nodeId ? `节点 ${safe.nodeId}` : "",
  ].filter(Boolean);
  return {
    type: "skill_trace",
    traceId: text(safe.id || safe.traceId),
    skillId: text(safe.skillId),
    title: text(safe.title) || "执行明细",
    status: text(safe.status) || "success",
    summary: parts.join(" · ") || text(safe.summary) || "Agent 已调用画布 Skills",
    expanded: Boolean(safe.expanded),
    result: safe,
    paramsSummary: safe.paramsSummary || {},
    referencesSummary: safe.referencesSummary || {},
  };
}

export function createSkillTraceCards(traces = []) {
  return (Array.isArray(traces) ? traces : []).map(createSkillTraceCard);
}
