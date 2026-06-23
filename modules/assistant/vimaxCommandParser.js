// Pure parser for the ViMax director-lane commands (α′ F6). Recognizes
// the three prefixes and extracts the body + any 《拍法》 picks. The raw
// 《》 strings are passed to the runner as skillRefs hints; the runner
// matches them against the roster server-side (it has the canonical
// names), so the panel stays free of the roster.
//
//   导演:  -> mode "plan"  (规划 prep 节点落画布, P1)
//   成片:  -> mode "plan"  in P1 (签字+渲染 is P2; same plan first)
//   定妆:  -> mode "portraits" (P3)
//
// Returns null when no prefix matches (the message falls through to the
// normal PI lane).
//
// Chinese prefixes ONLY: the English aliases (director:/film:/cast:) were
// dropped (B0-M1) - they hijacked plausible normal English messages
// ("film: my favorite movie", "cast: ...") into the billable director lane.
// 导演:/成片:/定妆: are unambiguous director intents, not normal prose.

// Body is optional in the regex; plan modes still require one (rejected
// below), but 定妆 (portraits) may be empty = 定妆 all visible characters.
const PREFIX_RE = /^\s*(导演|成片|定妆)\s*[:：]\s*(.*)$/s;
const SKILL_RE = /《([^《》]{1,40})》/g;

const MODE_BY_PREFIX = {
  导演: "plan",
  成片: "plan",
  定妆: "portraits",
};

// 成片 carries the intent to go all the way to a film; P1 only plans,
// so it maps to plan but we keep the intent flag for the panel/P2.
const FILM_PREFIXES = new Set(["成片"]);

export function extractSkillRefs(text) {
  const refs = [];
  const seen = new Set();
  let m;
  SKILL_RE.lastIndex = 0;
  while ((m = SKILL_RE.exec(String(text || ""))) !== null) {
    const name = m[1].trim();
    if (name && !seen.has(name)) {
      seen.add(name);
      refs.push(name);
    }
  }
  return refs;
}

export function parseVimaxCommand(message) {
  const match = String(message || "").match(PREFIX_RE);
  if (!match) return null;
  const prefix = match[1].toLowerCase() === match[1] ? match[1] : match[1]; // keep zh as-is
  const rawPrefix = match[1];
  const body = match[2].trim();
  const mode = MODE_BY_PREFIX[rawPrefix] || MODE_BY_PREFIX[rawPrefix.toLowerCase()] || "plan";
  // Plan modes need an idea; 定妆 may be empty (= 定妆 all visible chars).
  if (!body && mode !== "portraits") return null;
  const skillRefs = extractSkillRefs(body);
  return {
    mode,
    body,
    skillRefs,
    wantsFilm: FILM_PREFIXES.has(rawPrefix) || FILM_PREFIXES.has(rawPrefix.toLowerCase()),
  };
}
