function text(value) {
  return String(value ?? "").trim();
}

function stateOf(graphStore) {
  const state = typeof graphStore?.getState === "function" ? graphStore.getState() : graphStore;
  const nodes = Array.isArray(state?.nodes) ? state.nodes : state?.nodes && typeof state.nodes === "object" ? Object.values(state.nodes) : [];
  const edges = Array.isArray(state?.edges) ? state.edges : state?.edges && typeof state.edges === "object" ? Object.values(state.edges) : [];
  return { ...(state || {}), nodes, edges };
}

async function workflowsFrom(service, graphStore) {
  if (typeof service?.loadWorkflowsFromServer === "function") return service.loadWorkflowsFromServer();
  const state = stateOf(graphStore);
  return Array.isArray(state.workflows?.items) ? state.workflows.items : [];
}

function findWorkflow(workflows, action = {}) {
  const workflowId = text(action.workflowId || action.id || action.templateId);
  const name = text(action.name || action.workflowName || action.templateName);
  return (Array.isArray(workflows) ? workflows : []).find((workflow) => {
    return (workflowId && text(workflow?.id) === workflowId) || (name && text(workflow?.name) === name);
  });
}

export function createAssistantCanvasWorkflowSkills({
  graphStore,
  workflowService = {},
  workflowCanvas = {},
} = {}) {
  async function applyWorkflow(action = {}) {
    const workflows = await workflowsFrom(workflowService, graphStore);
    const workflow = findWorkflow(workflows, action) || action.workflow;
    if (!workflow) return { applied: false, createdNodeIds: [], createdEdgeIds: [], warning: `workflow not found: ${action.workflowId || action.name || "unknown"}` };
    const applied = workflowCanvas.applyWorkflowToCanvas?.(workflow, action.placement || action.position || action) || workflow.workflowData || {};
    const nodes = Array.isArray(applied.nodes) ? applied.nodes : [];
    const edges = Array.isArray(applied.edges) ? applied.edges : [];
    nodes.forEach((node) => graphStore?.addNode?.(node));
    edges.forEach((edge) => graphStore?.addEdge?.(edge));
    const createdNodeIds = nodes.map((node) => text(node?.id)).filter(Boolean);
    const createdEdgeIds = edges.map((edge) => text(edge?.id)).filter(Boolean);
    if (createdNodeIds.length) graphStore?.setSelectedNodes?.(createdNodeIds);
    await workflowService.saveWorkflowUsage?.(workflow);
    return { applied: true, workflowId: text(workflow.id), createdNodeIds, createdEdgeIds };
  }

  async function saveWorkflow(action = {}) {
    const meta = { name: action.name || action.title || "Agent workflow", cover: action.cover || "", tags: action.tags || [], note: action.note || "" };
    const saved = await workflowService.saveNewWorkflowFromCanvas?.(stateOf(graphStore), meta);
    if (!saved) return { saved: false, warning: "workflow save service unavailable" };
    return { saved: true, workflowId: text(saved.id), workflow: saved };
  }

  async function updateWorkflow(action = {}) {
    const workflowId = text(action.workflowId || action.id);
    const meta = { name: action.name || action.title || "Agent workflow", cover: action.cover || "", tags: action.tags || [], note: action.note || "" };
    const saved = await workflowService.saveUpdatedWorkflowFromCanvas?.(workflowId, stateOf(graphStore), meta);
    if (!saved) return { saved: false, workflowId, warning: "workflow update service unavailable" };
    return { saved: true, workflowId: text(saved.id || workflowId), workflow: saved };
  }

  return { applyWorkflow, saveWorkflow, updateWorkflow };
}
