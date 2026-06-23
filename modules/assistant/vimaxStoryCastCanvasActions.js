// B3: story comment card + editable cast-sheet comment card for the native plan
// lane. Pure. comment renders data.content (CommentNoteNode) and content +
// vimax lineage survive claw; storyboard-script CANNOT be a generic grid (fixed
// shot columns), so the cast uses a comment card with a LABELED-BLOCK format so
// a feature value may contain |, :, , freely.

function text(value) {
  return String(value ?? "").trim();
}

export function mapVimaxStoryToCanvasActions({ flowId, story } = {}) {
  const fid = text(flowId);
  if (!fid) throw new Error("story card needs a non-empty flowId");
  return {
    actions: [
      {
        type: "create_node",
        id: `vimax-${fid}-story`,
        nodeType: "comment",
        name: "故事",
        placement: { strategy: "new-lane", topic: "story" },
        data: { content: text(story), vimaxFlowId: fid, vimaxRole: "story", vimaxShotIdx: -1 },
      },
    ],
  };
}

const CAST_HEADER =
  "角色表（可编辑：每个【角色 N】下用 静态:/动态:/出镜: 三行；改完回复「继续」，删/加/改名都可以）";

function castToContent(characters) {
  const blocks = (Array.isArray(characters) ? characters : []).map((c, i) => {
    c = c && typeof c === "object" ? c : {};
    const name = text(c.identifierInScene || c.identifier);
    const visible = c.isVisible === false ? "否" : "是";
    return [`【角色 ${i}】${name}`, `静态: ${text(c.staticFeatures)}`, `动态: ${text(c.dynamicFeatures)}`, `出镜: ${visible}`].join("\n");
  });
  return [CAST_HEADER, "", ...blocks].join("\n");
}

export function mapVimaxCastToCanvasActions({ flowId, characters } = {}) {
  const fid = text(flowId);
  if (!fid) throw new Error("cast sheet needs a non-empty flowId");
  return {
    actions: [
      {
        type: "create_node",
        id: `vimax-${fid}-cast`,
        nodeType: "comment",
        name: "角色表",
        placement: { strategy: "new-lane", topic: "cast" },
        data: { content: castToContent(characters), vimaxFlowId: fid, vimaxRole: "cast", vimaxShotIdx: -1 },
      },
    ],
  };
}

const HEADER_RE = /^【\s*角色\s*\d*\s*】\s*(.*)$/;

function labelValue(line, label) {
  const m = line.match(new RegExp(`^${label}\\s*[:：]\\s*(.*)$`));
  return m ? m[1].trim() : null;
}

// Parse the labeled-block cast sheet back into a cast list. idx = block order
// (M4 stable; the bracket number is cosmetic). Tolerant: skips the doc header /
// any preamble before the first 【角色】 block, blank lines, and unknown lines.
export function castContentToCharacters(content) {
  const out = [];
  let cur = null;
  for (const raw of String(content ?? "").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const h = line.match(HEADER_RE);
    if (h) {
      cur = { idx: out.length, identifierInScene: h[1].trim(), staticFeatures: "", dynamicFeatures: "", isVisible: true };
      out.push(cur);
      continue;
    }
    if (!cur) continue; // preamble / doc header before the first block
    const s = labelValue(line, "静态");
    if (s !== null) { cur.staticFeatures = s; continue; }
    const d = labelValue(line, "动态");
    if (d !== null) { cur.dynamicFeatures = d; continue; }
    const v = labelValue(line, "出镜");
    if (v !== null) { cur.isVisible = !/^(否|no|false)$/i.test(v.trim()); continue; }
    // unknown line inside a block: ignore
  }
  return out;
}
