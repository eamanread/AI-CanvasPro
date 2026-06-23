const DEFAULT_BASE_URL = "/api/v2/canvas-agent/executions";

function safeString(value) {
  return String(value ?? "").trim();
}

async function readJsonResponse(response) {
  if (typeof response?.json !== "function") {
    return {};
  }
  try {
    return await response.json();
  } catch {
    return {};
  }
}

function responseErrorMessage(payload, response) {
  return (
    safeString(payload?.error) ||
    safeString(payload?.message) ||
    safeString(response?.statusText) ||
    `Execution API request failed${response?.status ? ` (${response.status})` : ""}`
  );
}

export function createAssistantExecutionApiClient({
  baseUrl = DEFAULT_BASE_URL,
  fetchFn = globalThis.fetch?.bind(globalThis),
} = {}) {
  const root = safeString(baseUrl).replace(/\/+$/, "") || DEFAULT_BASE_URL;

  async function request(path = "", { method = "GET", body } = {}) {
    if (typeof fetchFn !== "function") {
      throw new Error("Execution API fetch is unavailable");
    }
    const response = await fetchFn(`${root}${path}`, {
      method,
      headers: {
        "Content-Type": "application/json",
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
    const payload = await readJsonResponse(response);
    if (!response?.ok) {
      throw new Error(responseErrorMessage(payload, response));
    }
    return payload;
  }

  const metricsUrl = root.replace(/\/executions$/, "") + "/metrics";

  async function fetchMetricsRequest(filters = {}) {
    if (typeof fetchFn !== "function") {
      throw new Error("Execution API fetch is unavailable");
    }
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(filters || {})) {
      const text = safeString(value);
      if (text) {
        params.set(key, text);
      }
    }
    const query = params.toString();
    const response = await fetchFn(`${metricsUrl}${query ? `?${query}` : ""}`, {
      method: "GET",
      headers: { "Content-Type": "application/json" },
    });
    const payload = await readJsonResponse(response);
    if (!response?.ok) {
      throw new Error(responseErrorMessage(payload, response));
    }
    return payload?.metrics || payload;
  }

  return {
    fetchMetrics(filters = {}) {
      return fetchMetricsRequest(filters);
    },

    listExecutions(filters = {}) {
      const params = new URLSearchParams();
      for (const [key, value] of Object.entries(filters || {})) {
        const text = safeString(value);
        if (text) {
          params.set(key, text);
        }
      }
      const query = params.toString();
      return request(query ? `?${query}` : "", { method: "GET" });
    },

    upsertExecution(execution) {
      return request("", { method: "POST", body: execution || {} });
    },

    appendTimelineEvent(executionId, event) {
      const id = encodeURIComponent(safeString(executionId));
      if (!id) {
        throw new Error("Missing execution id");
      }
      return request(`/${id}/timeline`, { method: "POST", body: event || {} });
    },

    updateExecutionStatus(executionId, status, patch = {}) {
      const id = encodeURIComponent(safeString(executionId));
      if (!id) {
        throw new Error("Missing execution id");
      }
      const nextStatus = safeString(status);
      if (!nextStatus) {
        throw new Error("Missing execution status");
      }
      return request(`/${id}/status`, {
        method: "PATCH",
        body: {
          ...patch,
          status: nextStatus,
        },
      });
    },

    controlQueuedExecution(executionId, action, payload = {}) {
      const id = encodeURIComponent(safeString(executionId));
      if (!id) {
        throw new Error("Missing execution id");
      }
      const queueAction = safeString(action);
      if (!queueAction) {
        throw new Error("Missing queue action");
      }
      return request(`/${id}/queue-control`, {
        method: "PATCH",
        body: {
          ...(payload && typeof payload === "object" ? payload : {}),
          action: queueAction,
        },
      });
    },

    prepareQueuedExecution(executionId, payload = {}) {
      const id = encodeURIComponent(safeString(executionId));
      if (!id) {
        throw new Error("Missing execution id");
      }
      return request(`/${id}/prepare`, {
        method: "POST",
        body: payload || {},
      });
    },
  };
}
