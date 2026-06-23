import { test } from "node:test";
import assert from "node:assert/strict";
import {
  filterByName,
  sortSavedByMtime,
  buildSingleCanvasSnapshot,
  selectTempCanvases,
  frontendSafeName,
  findOverwriteTarget,
  ensureJsonName,
  buildRenameRequest,
} from "./myCanvasesLogic.js";

test("filterByName: 空查询返全量、大小写不敏感、中文", () => {
  const list = [{ name: "默认画布" }, { name: "Poster A" }, { name: "海报B" }];
  assert.equal(filterByName(list, "").length, 3, "空查询=全量");
  assert.equal(filterByName(list, "   ").length, 3, "纯空白=全量");
  assert.deepEqual(filterByName(list, "poster").map((x) => x.name), ["Poster A"], "大小写不敏感");
  assert.deepEqual(filterByName(list, "海报").map((x) => x.name), ["海报B"], "中文匹配");
  assert.deepEqual(filterByName(list, "画布").map((x) => x.name), ["默认画布"], "中文子串");
  assert.deepEqual(filterByName(null, "x"), [], "非数组安全");
});

test("sortSavedByMtime: mtime 倒序 + 同秒 filename 二级稳定", () => {
  const list = [
    { filename: "b.json", mtime: 100 },
    { filename: "a.json", mtime: 100 },
    { filename: "c.json", mtime: 200 },
  ];
  const out = sortSavedByMtime(list);
  assert.deepEqual(out.map((x) => x.filename), ["c.json", "a.json", "b.json"], "200 在前；同 100 按 filename 升序稳定");
  assert.deepEqual(list.map((x) => x.filename), ["b.json", "a.json", "c.json"], "不可变原数组");
});

test("buildSingleCanvasSnapshot: 只含目标画布、activeCanvasId 正确、找不到返 null", () => {
  const multi = { canvases: [{ id: "c1", name: "A", nodes: [1] }, { id: "c2", name: "B", nodes: [2] }], activeCanvasId: "c2" };
  const snap = buildSingleCanvasSnapshot(multi, "c1");
  assert.equal(snap.canvases.length, 1, "只一张");
  assert.equal(snap.canvases[0].id, "c1");
  assert.equal(snap.activeCanvasId, "c1", "activeCanvasId 指向该画布而非整工作区的");
  assert.equal(buildSingleCanvasSnapshot(multi, "ghost"), null, "找不到返 null（不伪造空快照）");
  assert.equal(buildSingleCanvasSnapshot({}, "c1"), null, "无 canvases 返 null");
});

test("selectTempCanvases: 排除已存映射、标记当前", () => {
  const canvases = [{ id: "c1", name: "A" }, { id: "c2", name: "B" }, { id: "c3", name: "C" }];
  const savedMap = new Map([["c2", "B.json"]]);
  const temp = selectTempCanvases(canvases, savedMap, "c3");
  assert.deepEqual(temp.map((t) => t.id), ["c1", "c3"], "c2 已保存→剔除临时区");
  assert.equal(temp.find((t) => t.id === "c3").isCurrent, true, "当前画布标记");
  assert.equal(temp.find((t) => t.id === "c1").isCurrent, false);
  assert.deepEqual(selectTempCanvases(canvases, null, "c1").map((t) => t.id), ["c1", "c2", "c3"], "无映射=全量临时");
});

test("frontendSafeName: 复刻后端 sanitize（[\\/:*?\"<>|]→_），异原名碰撞同名", () => {
  assert.equal(frontendSafeName("a/b"), "a_b");
  assert.equal(frontendSafeName("a:b"), "a_b", "a:b 与 a/b sanitize 后碰撞");
  assert.equal(frontendSafeName('q?"<>|*'), "q______");
  assert.equal(frontendSafeName("正常名"), "正常名", "合法中文保留");
});

test("findOverwriteTarget: 按 sanitize 后文件名命中已保存→提示将覆盖", () => {
  const saved = [{ filename: "a_b.json" }, { filename: "other.json" }];
  assert.equal(findOverwriteTarget("a/b", saved), "a_b.json", "a/b→a_b.json 命中已存在");
  assert.equal(findOverwriteTarget("a:b", saved), "a_b.json", "a:b 也 sanitize 成 a_b→同覆盖");
  assert.equal(findOverwriteTarget("brandnew", saved), null, "不存在→不覆盖");
});

test("ensureJsonName: 补 .json 后缀且不重复、空安全", () => {
  assert.equal(ensureJsonName("a"), "a.json");
  assert.equal(ensureJsonName("a.json"), "a.json", "已带不重复加");
  assert.equal(ensureJsonName("  b  "), "b.json", "trim");
  assert.equal(ensureJsonName(""), "", "空返空");
  assert.equal(ensureJsonName(null), "", "null 安全");
});

test("buildRenameRequest: URL 带 .json+encodeURIComponent, body 键为 name", () => {
  const r = buildRenameRequest("我的项目", "新名");
  assert.equal(r.url, "/api/v2/projects/" + encodeURIComponent("我的项目.json"));
  assert.deepEqual(r.body, { name: "新名" }, "键是 name 不是 newName");
  assert.equal(buildRenameRequest("a.json", "b").url, "/api/v2/projects/a.json", "已带 .json 不重复");
  assert.ok(buildRenameRequest("a b/c", "x").url.includes(encodeURIComponent("a b/c.json")), "特殊字符编码");
});
