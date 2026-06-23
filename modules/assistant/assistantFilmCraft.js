// Film-craft (拍法) bridge — slice 7. The 拍法库 replaces the 爆款实验室: the user
// picks a 拍法 (film-craft skill) and it is injected into the 导演 flow via the
// EXISTING mechanism — a 《名》 ref the brain resolves through
// resolve_named_skill_refs → build_injection (integrations/vimax). This module
// is the pure UI-side bridge: it normalizes the /api/v2/vimax/skills roster and
// synthesizes the 《名》 command. No DOM, no network — unit-testable.

const DIRECTOR_PREFIXES = ["导演:", "导演：", "成片:", "成片："];

function safeTrim(value) {
  return value === undefined || value === null ? "" : String(value).trim();
}

// Normalize the /api/v2/vimax/skills response into a stable roster for the
// picker: [{ name, summary, uses }], dropping nameless entries. The server
// already sorts hot-first; we preserve that order.
export function normalizeFilmCraftRoster(response) {
  const skills = Array.isArray(response?.skills) ? response.skills : [];
  return skills
    .map((s) => ({
      name: safeTrim(s?.name),
      summary: safeTrim(s?.summary),
      uses: Number(s?.uses) || 0,
    }))
    .filter((s) => s.name);
}

// Build the 《名》 ref the brain resolves. CRITICAL: the body is the skill name
// VERBATIM — no "拍法:" prefix. vimaxCommandParser SKILL_RE = /《([^《》]{1,40})》/
// captures everything INSIDE the brackets, and resolve_named_skill_refs matches
// that against the roster BY NAME (exact-normalized, then substring). A "拍法:"
// prefix would become part of the ref and match nothing → silent fuzzy fallback,
// so the user's pick wouldn't take effect.
export function craftRef(craftName) {
  const name = safeTrim(craftName);
  return name ? `《${name}》` : "";
}

// 立即开拍: synthesize a 导演 command that carries the picked 拍法. The brief is
// the user's current input (optional); the craft ref is appended so the brain
// force-includes that 拍法 (S2 named pick) on top of the fuzzy top-up.
export function synthesizeFilmCraftCommand(brief, craftName) {
  const ref = craftRef(craftName);
  if (!ref) return safeTrim(brief);
  const body = safeTrim(brief);
  return body ? `导演:${body}${ref}` : `导演:${ref}`;
}

// True when a message is a 导演/成片 command (the lanes that consume craft refs).
export function isDirectorCommand(message) {
  const m = safeTrim(message);
  return DIRECTOR_PREFIXES.some((p) => m.startsWith(p));
}

// 设为当前拍法: while a craft is "current", every subsequent 导演/成片 command gets
// the 《名》 appended — unless the user already typed an explicit 《》 pick (their
// choice wins, no double-inject). Non-director messages pass through untouched.
export function appendCurrentCraft(message, craftName) {
  const ref = craftRef(craftName);
  if (!ref) return message;
  if (!isDirectorCommand(message)) return message;
  if (/《[^《》]+》/.test(String(message))) return message; // an explicit 《》 pick already wins
  return `${String(message).replace(/\s+$/, "")}${ref}`;
}
