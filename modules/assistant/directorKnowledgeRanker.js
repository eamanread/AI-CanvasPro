// Pure-string relevance ranking for director knowledge projection
// entries (director-knowledge-projection/v1): picks the top cards for
// a user message with zero LLM cost. The algorithm is pinned by the
// shared test vectors (director-knowledge-ranker.vectors.json) that
// the QMAI selectRelevantCards fallback consumes too - change the
// scoring, regenerate the vectors, let the other side go red first.

const CRAFT_DOMAIN_TERMS = Object.freeze({
  directing: ["调度", "导演", "走位", "场面"],
  cinematography: ["构图", "镜头", "景别", "光线", "打光", "摄影", "色调", "画面"],
  editing: ["剪辑", "节奏", "转场", "剪点"],
  acting: ["表演", "情绪", "眼神", "肢体"],
  production_design: ["美术", "场景", "道具", "置景", "服装"],
  sound: ["声音", "音效", "配乐", "环境音"],
  screenwriting: ["剧本", "台词", "结构", "伏笔"],
  review: ["审片", "复盘", "返工"],
});

function termsOf(value) {
  return String(value || "")
    .split(/[、,，;；\s]+/)
    .map((term) => term.trim())
    .filter((term) => term.length >= 2);
}

function bigramHits(term, text) {
  let hits = 0;
  const seen = new Set();
  for (let i = 0; i + 2 <= term.length; i += 1) {
    const gram = term.slice(i, i + 2);
    if (seen.has(gram)) continue;
    seen.add(gram);
    if (text.includes(gram)) hits += 1;
  }
  return hits;
}

function termScore(term, text, weight) {
  if (text.includes(term)) return weight;
  return bigramHits(term, text) >= 2 ? 1 : 0;
}

export function rankDirectorKnowledge(message, cards, { limit = 3 } = {}) {
  const text = String(message || "").trim();
  if (!text || !Array.isArray(cards) || cards.length === 0) return [];
  const scored = [];
  for (const card of cards) {
    if (!card || typeof card !== "object") continue;
    let score = 0;
    for (const term of termsOf(card.whenToUse)) score += termScore(term, text, 3);
    for (const term of termsOf(card.title)) score += termScore(term, text, 2);
    for (const term of CRAFT_DOMAIN_TERMS[String(card.craftDomain || "")] || []) {
      if (text.includes(term)) score += 2;
    }
    if (score > 0) scored.push({ card, score });
  }
  scored.sort(
    (left, right) =>
      right.score - left.score || String(left.card.cardId || "").localeCompare(String(right.card.cardId || "")),
  );
  return scored.slice(0, Math.max(1, limit)).map((entry) => entry.card);
}
