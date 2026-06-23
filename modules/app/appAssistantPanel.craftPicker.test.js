import test from "node:test";
import assert from "node:assert/strict";

import { createAppAssistantPanel } from "./appAssistantPanel.js";

// Slice 7: the 拍法库 picker (replaces 爆款实验室). It lists film-craft skills from
// /api/v2/vimax/skills; 立即开拍 sends 导演:<当前输入>《名》 now; 设为当前拍法
// stashes the craft so subsequent 导演 commands carry 《名》 (sendMessage hook).

class FakeClassList {
  constructor() { this.items = new Set(); }
  add(...n) { n.filter(Boolean).forEach((x) => this.items.add(x)); }
  remove(...n) { n.forEach((x) => this.items.delete(x)); }
  contains(x) { return this.items.has(x); }
  toggle(x, f) { const h = this.items.has(x); const w = f === undefined ? !h : f; if (w) this.items.add(x); else this.items.delete(x); return w; }
}
class FakeElement {
  constructor(tag = "div") {
    this.tagName = String(tag).toUpperCase();
    this.children = []; this.parentElement = null; this.classList = new FakeClassList();
    this.attributes = {}; this.dataset = {}; this.listeners = new Map();
    this.hidden = false; this.value = ""; this.type = ""; this._textContent = "";
    this.scrollTop = 0; this.clientHeight = 120; this._scrollHeight = null;
  }
  set className(v) { this.classList = new FakeClassList(); String(v || "").split(/\s+/).filter(Boolean).forEach((n) => this.classList.add(n)); }
  get className() { return Array.from(this.classList.items).join(" "); }
  set id(v) { this.attributes.id = String(v || ""); }
  get id() { return this.attributes.id || ""; }
  set textContent(v) { this._textContent = String(v ?? ""); this.children = []; }
  get textContent() { return [this._textContent, ...this.children.map((c) => c.textContent || "")].filter(Boolean).join(""); }
  set scrollHeight(v) { this._scrollHeight = Number(v) || 0; }
  get scrollHeight() { return this._scrollHeight !== null ? this._scrollHeight : Math.max(this.clientHeight, (this.children.length || 1) * 64); }
  appendChild(c) { c.remove?.(); c.parentElement = this; this.children.push(c); return c; }
  replaceChildren(...cs) { this.children.forEach((c) => { c.parentElement = null; }); this.children = []; cs.forEach((c) => this.appendChild(c)); }
  remove() { if (!this.parentElement) return; const s = this.parentElement.children; const i = s.indexOf(this); if (i >= 0) s.splice(i, 1); this.parentElement = null; }
  setAttribute(n, v) { this.attributes[n] = String(v); if (n === "class") this.className = v; if (n === "id") this.id = v; }
  getAttribute(n) { return this.attributes[n]; }
  removeAttribute(n) { delete this.attributes[n]; }
  addEventListener(t, l) { if (!this.listeners.has(t)) this.listeners.set(t, []); this.listeners.get(t).push(l); }
  removeEventListener() {}
  dispatchEvent(e) { const p = { preventDefault() {}, stopPropagation() {}, ...e, target: e?.target || this, currentTarget: this }; for (const l of this.listeners.get(p.type) || []) l(p); return true; }
  click() { this.dispatchEvent({ type: "click" }); }
  focus() {}
  matches(sel) {
    if (sel.startsWith(".")) return this.classList.contains(sel.slice(1));
    if (sel.startsWith("#")) return this.id === sel.slice(1);
    const a = sel.match(/^\.([^\[]+)\[([^=]+)='([^']+)'\]$/);
    if (a) return this.classList.contains(a[1]) && this.getAttribute(a[2]) === a[3];
    return this.tagName.toLowerCase() === sel.toLowerCase();
  }
  querySelector(sel) { return this.querySelectorAll(sel)[0] || null; }
  querySelectorAll(sel) { const out = []; const visit = (n) => { for (const c of n.children || []) { if (c.matches?.(sel)) out.push(c); visit(c); } }; visit(this); return out; }
}
function createFakeDocument() {
  const body = new FakeElement("body"); const head = new FakeElement("head");
  return {
    body, head, readyState: "complete",
    createElement(t) { return new FakeElement(t); },
    createElementNS(_n, t) { return new FakeElement(t); },
    getElementById(id) { return body.querySelector(`#${id}`) || head.querySelector(`#${id}`) || null; },
    querySelector(sel) { return body.querySelector(sel) || head.querySelector(sel); },
    addEventListener() {},
  };
}

const ROSTER = { success: true, skills: [
  { name: "东亚文艺片", summary: "情绪驱动", uses: 5 },
  { name: "GTA6 风格", summary: "玩转人生", uses: 2 },
] };

test("拍法库 picker lists crafts, 立即开拍 sends 导演:<brief>《名》, 设为当前拍法 stashes it", async () => {
  const document = createFakeDocument();
  const api = { async vimaxSkills() { return ROSTER; } };
  const panel = createAppAssistantPanel({ document, api });
  panel.init();
  panel.open();

  // 爆款实验室 is gone — the toolbar entry is now 拍法库.
  const lab = panel.root.querySelector(".hy-canvas-agent-lab");
  assert.ok(lab, "the 拍法库 toolbar entry exists");
  assert.match(lab.textContent, /拍法库/);

  // open → roster listed
  lab.click();
  await panel.flush();
  const picker = panel.root.querySelector(".hy-canvas-agent-craft-picker");
  assert.equal(picker.hidden, false, "picker opened");
  const rows = panel.root.querySelectorAll(".hy-canvas-agent-craft-row");
  assert.equal(rows.length, 2, "both crafts listed");
  assert.match(picker.textContent, /东亚文艺片/);
  assert.match(picker.textContent, /关键帧图/, "honest note: 成片产关键帧图(非视频片)");

  // 立即开拍 → sends 导演:<brief>《名》
  let captured = null;
  panel.state.sendMessage = (text) => { captured = text; return Promise.resolve(null); };
  const input = panel.root.querySelector(".hy-canvas-agent-input");
  input.value = "雨夜追杀";
  rows[0].querySelector(".hy-canvas-agent-craft-go").click();
  await panel.flush();
  assert.equal(captured, "导演:雨夜追杀《东亚文艺片》");
  assert.equal(picker.hidden, true, "picker closes after 立即开拍");

  // 设为当前拍法 → stashes the craft (the sendMessage hook that appends 《名》
  // to subsequent 导演 commands is unit-tested in assistantFilmCraft.test.js).
  lab.click();
  await panel.flush();
  const rows2 = panel.root.querySelectorAll(".hy-canvas-agent-craft-row");
  rows2[1].querySelector(".hy-canvas-agent-craft-set").click();
  await panel.flush();
  assert.equal(panel.state.currentFilmCraft, "GTA6 风格", "设为当前拍法 stashes the craft");
  assert.equal(picker.hidden, true, "picker closes after 设为当前拍法");
});

test("拍法库 picker shows a seed hint when the roster is empty (unconfigured brain)", async () => {
  const document = createFakeDocument();
  const api = { async vimaxSkills() { return { success: true, skills: [] }; } };
  const panel = createAppAssistantPanel({ document, api });
  panel.init();
  panel.open();
  panel.root.querySelector(".hy-canvas-agent-lab").click();
  await panel.flush();
  assert.match(panel.root.querySelector(".hy-canvas-agent-craft-picker").textContent, /seed|拍法库为空/);
});

const tick = () => new Promise((r) => setTimeout(r, 10));

test("start screen surfaces 6 random 拍法 cards (same style); clicking sets current + lab shows it; no 爆款实验室", async () => {
  const document = createFakeDocument();
  const skills = Array.from({ length: 10 }, (_, i) => ({ name: `拍法${i}`, summary: `摘要${i}`, uses: i }));
  const api = { async vimaxSkills() { return { success: true, skills }; } };
  const panel = createAppAssistantPanel({ document, api });
  panel.init();
  panel.open();
  await tick(); // open() loads the roster + re-renders the start screen

  const craftCards = panel.root.querySelectorAll(".hy-canvas-agent-skill-craft");
  assert.equal(craftCards.length, 6, "6 random 拍法 cards on the start screen");
  assert.ok(craftCards[0].querySelector(".hy-canvas-agent-skill-title"), "same skill-card style (title)");
  assert.ok(craftCards[0].querySelector(".hy-canvas-agent-skill-detail"), "same skill-card style (detail)");
  assert.doesNotMatch(panel.root.querySelector(".hy-canvas-agent-skill-list").textContent, /爆款实验室/);

  // click a craft → sets it current, marks it selected, lab entry shows it
  const picked = craftCards[0].getAttribute("data-craft");
  craftCards[0].click();
  await panel.flush();
  assert.equal(panel.state.currentFilmCraft, picked, "clicking a start-screen 拍法 sets the current 拍法");
  assert.match(panel.root.querySelector(".hy-canvas-agent-lab").textContent, new RegExp(picked), "toolbar 拍法库 entry shows the selected 拍法");
});

test("start screen falls back to the legacy quick-start skills when the roster is empty", async () => {
  const document = createFakeDocument();
  const api = { async vimaxSkills() { return { success: true, skills: [] }; } };
  const panel = createAppAssistantPanel({ document, api });
  panel.init();
  panel.open();
  await tick();
  const list = panel.root.querySelector(".hy-canvas-agent-skill-list");
  assert.equal(panel.root.querySelectorAll(".hy-canvas-agent-skill-craft").length, 0, "no craft cards when roster empty");
  assert.match(list.textContent, /电商套图/, "legacy quick-start skills shown as fallback");
  assert.doesNotMatch(list.textContent, /爆款实验室/, "but never 爆款实验室 (retired)");
});

test("toolbar 拍法库 button shows the selected 拍法 capped at 4 chars + '…' (full name on hover)", async () => {
  const document = createFakeDocument();
  const api = { async vimaxSkills() { return { success: true, skills: [
    { name: "东亚文艺片情绪驱动", summary: "长名", uses: 9 }, // 9 chars -> 东亚文艺…
    { name: "国风", summary: "短名", uses: 1 },               // 2 chars -> 国风
  ] }; } };
  const panel = createAppAssistantPanel({ document, api });
  panel.init();
  panel.open();

  panel.root.querySelector(".hy-canvas-agent-lab").click();
  await panel.flush();
  panel.root.querySelectorAll(".hy-canvas-agent-craft-row")[0].querySelector(".hy-canvas-agent-craft-set").click();
  await panel.flush();
  const lab = panel.root.querySelector(".hy-canvas-agent-lab");
  assert.equal(lab.textContent, "☰ 东亚文艺…", "long name capped at 4 chars + …");
  assert.doesNotMatch(lab.textContent, /情绪驱动/, "overflow not shown on the button");
  assert.match(lab.getAttribute("title") || "", /东亚文艺片情绪驱动/, "full name available on hover");

  panel.root.querySelector(".hy-canvas-agent-lab").click();
  await panel.flush();
  panel.root.querySelectorAll(".hy-canvas-agent-craft-row")[1].querySelector(".hy-canvas-agent-craft-set").click();
  await panel.flush();
  assert.equal(panel.root.querySelector(".hy-canvas-agent-lab").textContent, "☰ 国风", "a short name (≤4) shows in full");
});
