function text(value) {
  return String(value ?? "").trim();
}

function graphNodes(graphStore) {
  const state = typeof graphStore?.getState === "function" ? graphStore.getState() : graphStore;
  const nodes = state?.nodes;
  if (Array.isArray(nodes)) return nodes;
  if (nodes instanceof Map) return Array.from(nodes.values());
  if (nodes && typeof nodes === "object") return Object.values(nodes);
  return [];
}

function findNode(graphStore, nodeId) {
  return graphNodes(graphStore).find((node) => text(node?.id) === text(nodeId));
}

function normalizeReference(reference = {}) {
  const id = text(reference.id || reference.nodeId || reference.sourceNodeId || reference.assetId);
  return {
    ...reference,
    id,
    type: text(reference.type || reference.kind || (reference.assetId ? "asset" : "canvas_node")) || "canvas_node",
    label: text(reference.label || reference.name || reference.displayName || id),
  };
}

function edgeId(source, target, index) {
  return `assistant-ref-${source}-${target}-${index + 1}`;
}

export function bindAssistantCanvasReferences({ graphStore, targetNodeId, references = [] } = {}) {
  const warnings = [];
  const boundReferences = [];
  const targetId = text(targetNodeId);
  const targetNode = findNode(graphStore, targetId);
  if (!graphStore || !targetId || !targetNode) {
    return { boundReferences, warnings: [`target node not found: ${targetId || "unknown"}`] };
  }

  const existingRefs = Array.isArray(targetNode.data?.assistantReferences) ? targetNode.data.assistantReferences : [];
  const nextRefs = [...existingRefs];

  references.map(normalizeReference).forEach((reference, index) => {
    if (!reference.id) {
      warnings.push("reference id missing");
      return;
    }
    if (reference.type === "canvas_node") {
      const sourceNode = findNode(graphStore, reference.id);
      if (!sourceNode) {
        warnings.push(`canvas reference missing: ${reference.id}`);
        return;
      }
      const edge = {
        id: edgeId(reference.id, targetId, index),
        source: reference.id,
        target: targetId,
        sourceId: reference.id,
        targetId,
        label: reference.label,
        kind: "assistant_reference",
      };
      graphStore.addEdge?.(edge);
      const boundReference = { ...reference, edgeId: edge.id };
      boundReferences.push(boundReference);
      nextRefs.push(boundReference);
      return;
    }
    boundReferences.push(reference);
    nextRefs.push(reference);
  });

  if (boundReferences.length) {
    graphStore.updateNodeData?.(targetId, {
      assistantReferences: nextRefs,
      referenceNodeIds: nextRefs.filter((item) => item.type === "canvas_node").map((item) => item.id),
    });
  }

  return { boundReferences, warnings };
}
