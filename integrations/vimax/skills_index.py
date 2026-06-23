"""Pure skills index for the ViMax runner (P1-M3 / S1).

The 49 拍法 skills live as markdown under <USER_DIR>/skills/*.md. Each
file is canonically named by its first H1 line (NOT the filename - 9/49
filenames are truncated at a '.'); 48 carry a ```json``` Skill block, 1
is pure prose. This module loads a roster, extracts the craft "core"
(planner + storyboard_designer sections only, metadata stripped), scores
skills against a query with a no-tokenizer character-bigram Dice plus
signal-word bonuses, and selects the top-k for prompt injection within a
character budget. No ViMax / network deps - unit-testable in isolation.
"""
import json
import re

H1_RE = re.compile(r"^\s*#\s+(.+?)\s*$", re.M)
JSON_FENCE_RE = re.compile(r"```json\s*(.*?)```", re.S)
CORE_SECTIONS = ("planner", "storyboard_designer")
DEFAULT_SECTION_CAP = 4000
DEFAULT_TOTAL_BUDGET = 10000
# Noise floor: cross-language / unrelated queries top out around ~0.17
# on incidental character-bigram overlap; real matches clear >=1.0 via
# the name-substring (+3) and signal-word (+1 each) bonuses, or a
# substantial zh-zh description overlap. 0.2 drops noise -> no injection
# (宁缺毋滥) rather than feeding the wrong craft into the prompt.
# (Cross-lingual matching is a v1 gap; v2 vector search closes it.)
DEFAULT_MIN_SCORE = 0.2

# Bidirectional signal words (zh + en). Maintained here, not derived, so
# a query like "广告短片" reliably pulls the ad skill even when the
# bigram overlap is thin.
HIGH_SIGNAL = (
    "广告", "宣传", "mv", "音乐", "纪录", "纪实", "pov", "国风", "古风", "美食", "宠物",
    "口播", "访谈", "旅拍", "旅行", "风景", "群像", "短片", "电影", "预告", "直播",
    "转播", "卡通", "动画", "故事", "剧情", "vlog", "特写", "运镜", "分镜",
)


def canonical_name(md_text):
    m = H1_RE.search(md_text or "")
    return m.group(1).strip() if m else ""


def _truncate(text, cap):
    if cap is None or len(text) <= cap:
        return text
    cut = text.rfind("\n", 0, cap)
    if cut < cap * 0.6:
        cut = cap
    return text[:cut].rstrip()


def parse_skill(md_text, section_cap=DEFAULT_SECTION_CAP):
    """Return {name, description, core}. core = planner+storyboard_designer
    section content (each capped), metadata never included; prose files
    (no json block) fall back to the body minus the H1."""
    name = canonical_name(md_text)
    fence = JSON_FENCE_RE.search(md_text or "")
    if not fence:
        body = H1_RE.sub("", md_text or "", count=1).strip()
        return {"name": name, "description": "", "core": _truncate(body, section_cap)}
    try:
        data = json.loads(fence.group(1))
    except (ValueError, TypeError):
        # Defensive: drop the whole json block, keep prose only - never
        # let author/cover/auth_key metadata reach a prompt.
        body = JSON_FENCE_RE.sub("", md_text, count=1)
        body = H1_RE.sub("", body, count=1).strip()
        return {"name": name, "description": "", "core": _truncate(body, section_cap)}

    name = (data.get("skill_name") or name or "").strip()
    description = (data.get("skill_description") or "").strip()
    parts = []
    for entry in data.get("skill_content") or []:
        if not isinstance(entry, dict):
            continue
        if entry.get("section") in CORE_SECTIONS:
            content = str(entry.get("content") or "").strip()
            if content:
                parts.append(_truncate(content, section_cap))
    return {"name": name, "description": description, "core": "\n\n".join(parts)}


def load_roster(skills_dir):
    from pathlib import Path

    roster = []
    for path in sorted(Path(skills_dir).glob("*.md")):
        try:
            text = path.read_text(encoding="utf-8")
        except OSError:
            continue
        skill = parse_skill(text)
        skill["path"] = str(path)
        if skill["name"]:
            roster.append(skill)
    return roster


def _norm(text):
    return re.sub(r"\s+", "", str(text or "")).lower()


def _bigrams(text):
    t = _norm(text)
    if len(t) < 2:
        return {t} if t else set()
    return {t[i : i + 2] for i in range(len(t) - 1)}


def _dice(a, b):
    ba, bb = _bigrams(a), _bigrams(b)
    if not ba or not bb:
        return 0.0
    inter = len(ba & bb)
    return (2.0 * inter) / (len(ba) + len(bb))


def score_skill(query, skill):
    name = skill.get("name", "")
    desc = skill.get("description", "")
    nq = _norm(query)
    index_unit = f"{name} {desc}"
    score = _dice(query, index_unit)
    # Name appears -> strong signal. Forward (name contained in query) needs a
    # meaningful name length so a 2-char name (特写/运镜) doesn't spuriously
    # boost on incidental containment in an unrelated query.
    nn = _norm(name)
    if nn and (nq in nn or (len(nn) >= 3 and nn in nq)):
        score += 3.0
    # Signal words present on both sides.
    for word in HIGH_SIGNAL:
        if word in nq and (word in _norm(name) or word in _norm(desc)):
            score += 1.0
    return score


def select_skills(query, roster, k=3, min_score=DEFAULT_MIN_SCORE):
    scored = []
    for skill in roster:
        s = score_skill(query, skill)
        if s >= min_score:
            scored.append(dict(skill, _score=s))
    scored.sort(key=lambda item: item["_score"], reverse=True)
    return scored[:k]


def resolve_named_skill_refs(refs, roster):
    """S2 点名命中 (P3-M16): resolve explicit 《》 picks against the roster by
    NAME. Exact (normalized) name wins definitively; otherwise a UNIQUE
    substring match (either direction) resolves; >1 match -> ambiguous (the
    caller clarifies, never guesses); 0 -> unmatched (caller falls back to
    fuzzy select_skills). Resolved is deduped by name in ref order. Pure - no
    IO. Returns {resolved:[skill...], ambiguous:[{ref,candidates}], unmatched:[ref...]}.
    """
    resolved = []
    ambiguous = []
    unmatched = []
    seen = set()
    for raw in refs or []:
        ref = str(raw or "").strip()
        nref = _norm(ref)
        if not nref:
            continue
        # Exact name match is definitive (even if the ref is also a substring
        # of a longer skill name).
        matches = [s for s in roster if _norm(s.get("name")) == nref]
        if not matches:
            # Substring fallback. Forward (ref contained in name) is safe -
            # over-broad refs just produce ambiguity, which is surfaced. The
            # REVERSE direction (a short roster name contained in an unrelated
            # ref, e.g. 特写/运镜/分镜) would SILENTLY force-inject the wrong
            # skill, so gate it on a meaningful name length (>=3).
            matches = []
            for s in roster:
                nname = _norm(s.get("name"))
                if not nname:
                    continue
                if nref in nname or (len(nname) >= 3 and nname in nref):
                    matches.append(s)
        if len(matches) > 1:
            ambiguous.append({"ref": ref, "candidates": [s.get("name") for s in matches]})
        elif len(matches) == 1:
            name = matches[0].get("name")
            if name not in seen:
                seen.add(name)
                resolved.append(matches[0])
        else:
            unmatched.append(ref)
    return {"resolved": resolved, "ambiguous": ambiguous, "unmatched": unmatched}


def build_injection(selected, total_budget=DEFAULT_TOTAL_BUDGET):
    out = []
    used = 0
    sep = "\n\n"
    for skill in selected:
        block = f"# 拍法参考:{skill.get('name', '')}\n{skill.get('core', '')}".strip()
        extra = len(block) + (len(sep) if out else 0)
        if used + extra > total_budget:
            block = block[: max(0, total_budget - used - (len(sep) if out else 0))]
            if not block:
                break
            out.append(block)
            break
        out.append(block)
        used += extra
    return sep.join(out)
