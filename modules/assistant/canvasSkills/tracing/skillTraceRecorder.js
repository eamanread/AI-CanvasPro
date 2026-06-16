import { redactSkillTrace } from "./skillTraceRedactor.js";

function nowMs() {
  return Date.now();
}

function iso(ms) {
  return new Date(ms).toISOString();
}

export function createSkillTraceRecorder({ store = null, now = nowMs } = {}) {
  const memory = [];
  const externalStore =
    store ||
    {
      list: () => memory,
      save(record) {
        const index = memory.findIndex((item) => item.id === record.id);
        if (index >= 0) memory[index] = record;
        else memory.push(record);
      },
      clear() {
        memory.length = 0;
      },
    };
  const active = new Map();

  function save(record) {
    const redacted = redactSkillTrace(record);
    externalStore.save?.(redacted);
    return redacted;
  }

  return {
    start(trace = {}) {
      const started = Number(now());
      const record = {
        status: "running",
        ...trace,
        id: trace.id || `trace_${Math.random().toString(36).slice(2, 12)}`,
        startedAt: trace.startedAt || iso(started),
        _startedMs: started,
      };
      active.set(record.id, record);
      return save(record);
    },
    end(id, patch = {}) {
      const ended = Number(now());
      const current = active.get(id) || { id, _startedMs: ended };
      const next = {
        ...current,
        ...patch,
        status: patch.status || "success",
        endedAt: patch.endedAt || iso(ended),
        durationMs: Math.max(0, ended - Number(current._startedMs || ended)),
        warnings: Array.isArray(patch.warnings) ? patch.warnings : Array.isArray(current.warnings) ? current.warnings : [],
      };
      delete next._startedMs;
      active.delete(id);
      return save(next);
    },
    record(trace = {}) {
      return save(trace);
    },
    listLocalTraceHistory() {
      return (externalStore.list?.() || []).map(redactSkillTrace);
    },
    clearLocalTraceHistory() {
      externalStore.clear?.();
      active.clear();
    },
  };
}
