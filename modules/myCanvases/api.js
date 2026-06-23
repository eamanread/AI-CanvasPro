// 「我的画布」非吞错 API 层（T1/M4）。直接走裸 requester 的 get/patch/del：
// 4xx/5xx/网络错误一律抛出（ApiError 带 status），由面板 catch 后显式报错并区分 409/404，
// 不像 projectService.getProjects/loadProject/deleteProject 那样静默吞错（返 []/空项目/false）。
import { get, patch, del } from "../../api/requester.js";
import { ensureJsonName, buildRenameRequest } from "./myCanvasesLogic.js";

// 列已保存项目。成功返数组；网络/服务器错误抛出（区分"真空列表"与"加载失败"）。
export async function listSavedProjects() {
  const list = await get("/api/v2/projects", { provider: "local" });
  return Array.isArray(list) ? list : [];
}

// 取单个项目原始数据。404→null（项目不存在），其它错误抛；成功返原始数据（待 resolveCanvasData）。
export async function loadSavedProjectRaw(filename) {
  const fn = ensureJsonName(filename);
  if (!fn) return null;
  return await get("/api/v2/projects/" + encodeURIComponent(fn), { allow404Null: true, provider: "local" });
}

// 删除项目。成功返 true；失败抛出（不吞错）。
export async function deleteSavedProject(filename) {
  const fn = ensureJsonName(filename);
  if (!fn) throw new Error("deleteSavedProject: 缺少 filename");
  await del("/api/v2/projects/" + encodeURIComponent(fn), { provider: "local" });
  return true;
}

// 重命名项目（PATCH，body.name）。成功返 {success,filename}；409/404/500 抛出由面板分支。
export async function renameProjectOnServer(filename, newName) {
  const fn = ensureJsonName(filename);
  if (!fn) throw new Error("renameProjectOnServer: 缺少 filename");
  const { url, body } = buildRenameRequest(filename, newName);
  return await patch(url, body, { provider: "local" });
}
