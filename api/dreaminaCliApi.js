import { get, post } from "./apiBase.js";

export async function fetchDreaminaCliStatusFromServer({ refresh = false } = {}) {
  const data = await get(`/api/v2/dreamina/status${refresh ? "?refresh=1" : ""}`);
  if (!data.success) {
    throw new Error(data.error || "获取 Dreamina CLI 状态失败");
  }
  return data.data || {};
}

export async function fetchDreaminaCliLoginRuntimeFromServer() {
  const data = await get("/api/v2/dreamina/login/runtime");
  if (!data.success) {
    throw new Error(data.error || "获取 Dreamina 登录运行态失败");
  }
  return data.data || {};
}

export async function startDreaminaWebLoginFromServer(options = {}) {
  const data = await post("/api/v2/dreamina/login/web", {
    mode: "web",
    force: !!options?.force,
    region: String(options?.region || options?.loginRegion || ""),
  });
  if (!data.success) {
    throw new Error(data.error || data.message || "发起 Dreamina 网页登录失败");
  }
  return data.data || {};
}

export async function importDreaminaLoginResponseFromServer(loginResponse) {
  const data = await post("/api/v2/dreamina/login/import", { loginResponse });
  if (!data.success) {
    throw new Error(data.error || data.message || "导入 Dreamina 登录态失败");
  }
  return data.data || {};
}

export async function logoutDreaminaFromServer() {
  const data = await post("/api/v2/dreamina/logout", {});
  if (!data.success) {
    throw new Error(data.error || data.message || "退出 Dreamina 登录失败");
  }
  return data.data || {};
}

export async function cancelDreaminaLoginFromServer() {
  const data = await post("/api/v2/dreamina/login/cancel", {});
  if (!data.success) {
    throw new Error(data.error || data.message || "取消 Dreamina 登录失败");
  }
  return data.data || {};
}
