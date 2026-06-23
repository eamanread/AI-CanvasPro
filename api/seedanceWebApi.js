import { get, post } from "./apiBase.js";

function assertSuccess(response, fallbackMessage) {
  if (!response?.success) {
    throw new Error(response?.error || fallbackMessage);
  }
  return response.data || {};
}

export async function submitSeedanceWebVideoTask(payload = {}) {
  const response = await post("/api/v2/seedance-web/tasks", payload);
  const data = assertSuccess(response, "提交海外版 Seedance 视频任务失败");
  if (data.success === false) {
    throw new Error(data.error || "提交海外版 Seedance 视频任务失败");
  }
  return data.task || data;
}

export async function querySeedanceWebResult(taskCode) {
  const code = String(taskCode || "").trim();
  if (!code) {
    throw new Error("缺少海外版 Seedance 任务号");
  }
  const response = await get(`/api/v2/seedance-web/query_result?taskCode=${encodeURIComponent(code)}`);
  const data = assertSuccess(response, "查询海外版 Seedance 视频任务失败");
  if (data.success === false) {
    throw new Error(data.error || "查询海外版 Seedance 视频任务失败");
  }
  return data;
}

export async function fetchSeedanceWebStatusFromServer() {
  const response = await get("/api/v2/seedance-web/status");
  const data = assertSuccess(response, "获取海外版 Seedance 状态失败");
  return data.status || data;
}

export async function startSeedanceWebLoginFromServer(options = {}) {
  const response = await post("/api/v2/seedance-web/login", {
    force: Boolean(options?.force),
  });
  const data = assertSuccess(response, "发起海外版 Seedance 登录失败");
  if (data.success === false) {
    throw new Error(data.message || "发起海外版 Seedance 登录失败");
  }
  return data.runtime || data;
}

export async function logoutSeedanceWebFromServer() {
  const response = await post("/api/v2/seedance-web/logout", {});
  const data = assertSuccess(response, "退出海外版 Seedance 登录失败");
  if (data.success === false) {
    throw new Error(data.message || "退出海外版 Seedance 登录失败");
  }
  return data.status || data;
}
