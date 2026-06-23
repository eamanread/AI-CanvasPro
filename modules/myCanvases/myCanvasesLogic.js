// 「我的画布」面板纯逻辑（T0）。不碰 window/DOM，可单测。
// 配套文档：docs/ui-upgrade/27-my-canvases-panel-dev-doc.md

// 按名称模糊过滤（大小写不敏感，空查询返全量，支持中文）。list 项需有 .name。
export function filterByName(list, kw) {
  const q = String(kw == null ? "" : kw).trim().toLowerCase();
  const arr = Array.isArray(list) ? list : [];
  if (!q) return arr.slice();
  return arr.filter((it) => String(it && it.name != null ? it.name : "").toLowerCase().includes(q));
}

// 已保存项目按 mtime 倒序（最近在前）；mtime 相同用 filename 作二级 key 保持稳定（防同秒抖动）。
export function sortSavedByMtime(list) {
  const arr = Array.isArray(list) ? list.slice() : [];
  return arr.sort((a, b) => {
    const ma = Number(a && a.mtime) || 0;
    const mb = Number(b && b.mtime) || 0;
    if (mb !== ma) return mb - ma;
    return String((a && a.filename) || "").localeCompare(String((b && b.filename) || ""));
  });
}

// 从 getMultiDataSnapshot() 结果里挑出单个画布，构造单画布另存快照。
// 找不到该 canvasId 时返回 null（不伪造空快照——让调用方显式报错，别存进空画布）。
export function buildSingleCanvasSnapshot(multiSnapshot, canvasId) {
  const canvases = multiSnapshot && Array.isArray(multiSnapshot.canvases) ? multiSnapshot.canvases : [];
  const one = canvases.find((c) => c && String(c.id) === String(canvasId));
  if (!one) return null;
  return { canvases: [one], activeCanvasId: String(canvasId) };
}

// 从工作区画布里挑出「临时区」要显示的（= 不在 savedMap 里的，即本会话尚未经本面板保存的）。
// 标记当前画布（id === activeId）。savedMap 是 Map<canvasId, filename>。
export function selectTempCanvases(canvases, savedMap, activeId) {
  const saved = savedMap instanceof Map ? savedMap : new Map();
  return (Array.isArray(canvases) ? canvases : [])
    .filter((c) => c && !saved.has(c.id))
    .map((c) => ({ id: c.id, name: c.name, isCurrent: String(c.id) === String(activeId) }));
}

// 复刻后端 _safe_name 的文件名安全化（[\/:*?"<>|] → _），用于保存前比对是否会同名覆盖。
export function frontendSafeName(s) {
  return String(s == null ? "" : s).replace(/[\\/:*?"<>|]/g, "_");
}

// 给定一个新画布名，判断保存后是否会覆盖已存在的某个已保存项目（按 sanitize 后的文件名比对）。
// savedList = getProjects() 列表（每项含 filename，如 "a_b.json"）。返回被覆盖项的 filename 或 null。
export function findOverwriteTarget(name, savedList) {
  const target = frontendSafeName(name) + ".json";
  const arr = Array.isArray(savedList) ? savedList : [];
  const hit = arr.find((p) => p && String(p.filename) === target);
  return hit ? hit.filename : null;
}

// 项目文件名规范化（确保 .json 后缀，与后端路由一致）。
export function ensureJsonName(filename) {
  const fn = String(filename == null ? "" : filename).trim();
  if (!fn) return "";
  return fn.endsWith(".json") ? fn : fn + ".json";
}

// 构造 PATCH 改名请求的 url/body（纯逻辑，供 api 层复用 + 单测）。后端取 body.name（不是 newName）。
export function buildRenameRequest(filename, newName) {
  const fn = ensureJsonName(filename);
  return { url: "/api/v2/projects/" + encodeURIComponent(fn), body: { name: String(newName == null ? "" : newName) } };
}
