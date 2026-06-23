// Phase D · D3 — ViMax = launch provider #1.
//
// ALL ViMax-specific vocabulary lives HERE (导演/成片/定妆/换拍法, the §6.1 match
// rules, command synthesis, the ContractPreview shape, cast-node resume). The
// generic launchProviderRegistry.js / launchContract.js layers must stay free of
// it (AC8 grep gate, D9). The provider declares only its id "vimax"; the trusted
// lineage tag "vimax-director" is resolved by launchTrustPolicy.js, never held
// here (R5).

const CHIPS = Object.freeze([
  { id: "director", label: "导演", icon: "movie", costTier: "free", tooltip: "故事编排，角色后暂停确认", aria: "启动导演规划流程" },
  { id: "film", label: "成片", icon: "photo", costTier: "confirm", tooltip: "导演链 + 渲染出图（需确认）", aria: "启动成片渲染" },
  { id: "portraits", label: "定妆·全部可见角色", icon: "user-circle", costTier: "confirm", tooltip: "对画布当前可见角色表全量定妆", aria: "全部可见角色定妆" },
  { id: "skills", label: "换拍法", icon: "books", costTier: "free", tooltip: "点选拍法库，注入《拍法》", aria: "更换拍法" },
]);

// §6.1 deterministic exclusion rules (pure front-end, no LLM — R1).
const COMMAND_PREFIX = /^\s*(导演|成片|定妆)\s*[:：]/;        // explicit prefix wins
// resume / confirm / reroll words, aligned with the AUTHORITATIVE grammar in the
// panel: parseVimaxRenderConfirm (确认成片 / 确认渲染 / 开始成片),
// parseVimaxPortraitsConfirm (确认定妆 / 开始定妆), plus 继续 / 取消 / 重摇.
// NOTE: this is only a best-effort discoverability debounce — the real gate is
// sendMessage's confirm parsers, which intercept these before any provider's
// match() runs. Keep this set in sync with that grammar (word order matters:
// it is 确认成片, not 成片确认).
const CONTROL_WORDS = /^\s*(继续|取消|确认成片|确认渲染|开始成片|确认定妆|开始定妆|重摇)/;
const MIN_BRIEF_LEN = 4;

function normalizeRef(ref) {
  const inner = String(ref == null ? "" : ref).replace(/^[《]+|[》]+$/g, "").trim();
  return `《${inner}》`;
}

function refsToString(skillRefs) {
  if (!Array.isArray(skillRefs) || !skillRefs.length) {
    return "";
  }
  return skillRefs.map(normalizeRef).join("");
}

// The director chain lands a story comment, a cast comment, then a storyboard
// script — all carry the vimax-director lineage at landing (set by the trust
// policy, not by these literals; these are just the preview's node manifest).
const DIRECTOR_NODES = Object.freeze([
  { type: "comment", role: "story", lineage: "vimax-director", reversible: true },
  { type: "comment", role: "cast", lineage: "vimax-director", reversible: true },
  { type: "storyboard-script", role: "storyboard", lineage: "vimax-director", reversible: true },
]);

function directorNodes() {
  return DIRECTOR_NODES.map((node) => ({ ...node }));
}

/**
 * Build the ViMax launch provider.
 * @param {object} [deps]
 * @param {Function} [deps.rankDirectorKnowledge] - ViMax's own brief-likeness
 *   scorer; used ONLY to order/highlight chips, never as the match gate (R1).
 */
export function createVimaxLaunchProvider(deps = {}) {
  const rank = typeof deps.rankDirectorKnowledge === "function" ? deps.rankDirectorKnowledge : null;

  return {
    id: "vimax",

    match(message, ctx = {}) {
      const msg = String(message == null ? "" : message);
      if (COMMAND_PREFIX.test(msg)) return false;          // 导演:/成片:/定妆: prefix → command lane owns it
      if (CONTROL_WORDS.test(msg)) return false;            // 继续/取消/确认/重摇
      if (ctx.paused) return false;                         // pendingVimaxNativeResume frozen (only 继续/取消)
      if (ctx.isCanvasOp) return false;                     // move/delete/queue canvas op
      if (msg.trim().length < MIN_BRIEF_LEN) return false;  // trivially short, not a brief
      return true;
    },

    // Optional ordering signal (NOT a gate — R1 keeps the gate deterministic).
    rank(message, ctx) {
      return rank ? rank(message, ctx) : 0;
    },

    chips: CHIPS.map((chip) => ({ ...chip })),

    // Pure, deterministic contract preview (no LLM, no spend — R1/R3).
    deriveContract(chipId, brief, ctx = {}) {
      const briefSummary = String(brief || "").trim().slice(0, 40);
      const skillRefs = Array.isArray(ctx.skillRefs) ? ctx.skillRefs.slice() : [];
      if (chipId === "director" || chipId === "skills") {
        return {
          mode: "director",
          briefSummary,
          nodes: directorNodes(),
          nodeCount: 3,
          cost: { tier: "free", note: "规划免费" },
          flow: ["story", "cast", "PAUSE", "storyboard"],
          skillRefs,
        };
      }
      if (chipId === "film") {
        return {
          mode: "film",
          briefSummary,
          nodes: directorNodes(),
          nodeCount: 3,
          // Shot count is unknown until planning — show 约 N (estimated) and let
          // the living card replace it with the real value after the plan (D7).
          cost: { tier: "confirm", drawCount: null, estimated: true, note: "成片镜数以规划为准" },
          flow: ["story", "cast", "PAUSE", "storyboard", "render"],
          skillRefs,
        };
      }
      if (chipId === "portraits") {
        const count = Math.max(0, Number(ctx.visibleCharacterCount) || 0);
        return {
          mode: "portraits",
          briefSummary,
          nodes: [],
          nodeCount: count,
          cost: { tier: "confirm", drawCount: count * 3, estimated: false, note: "每角色三视定妆" },
          flow: ["portraits"],
          characterTargets: [],
        };
      }
      return { mode: "unknown", briefSummary, nodes: [], nodeCount: 0, cost: { tier: "free", note: "" }, flow: [] };
    },

    // chip -> existing command, 1:1 (R2). Output feeds parseVimaxCommand verbatim.
    synthesizeCommand(chipId, brief, opts = {}) {
      const body = String(brief || "").trim();
      const refs = refsToString(opts.skillRefs);
      switch (chipId) {
        case "director":
          return `导演:${body}${refs}`;
        case "film":
          return `成片:${body}${refs}`;
        case "portraits":
          return "定妆:"; // empty body = all visible characters (§5.1)
        case "skills":
          return `导演:${body}${refs}`; // picking 拍法 feeds a director run
        default:
          return "";
      }
    },

    // Whether to graft a node-side 继续 affordance (D8); only on cast cards.
    resumeAffordance(node) {
      return node?.data?.vimaxRole === "cast";
    },
  };
}
