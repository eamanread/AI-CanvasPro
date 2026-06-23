export const CANVAS_SKILL_IDS = Object.freeze({
  imageCreateDraft: "imageNode.createDraft",
  imageUpdate: "imageNode.update",
  imageBindReferences: "imageNode.bindReferences",
  imageApplyPreset: "imageNode.applyPreset",
  imageGenerate: "imageNode.generate",
  textCreateDraft: "textNode.createDraft",
  textUpdate: "textNode.update",
  textBindReferences: "textNode.bindReferences",
  textApplyPreset: "textNode.applyPreset",
  textGenerate: "textNode.generate",
  videoCreateDraft: "videoNode.createDraft",
  videoUpdate: "videoNode.update",
  videoBindReferences: "videoNode.bindReferences",
  videoApplyPreset: "videoNode.applyPreset",
  videoGenerate: "videoNode.generate",
  workflowApply: "workflow.apply",
  workflowSave: "workflow.save",
  workflowUpdate: "workflow.update",
  assetList: "asset.list",
  assetUse: "asset.use",
  assetAdd: "asset.add",
  nodeBindReferences: "node.bindReferences",
});

function skill(id, key) {
  const isGenerate = id.includes("generate") || id.includes("execute");
  return {
    id,
    key,
    permission: isGenerate ? "generate" : id.startsWith("asset.list") ? "read" : "write",
  };
}

export const CANVAS_SKILLS_MANIFEST = Object.freeze({
  schemaVersion: "canvas-skills-manifest-v1",
  moduleId: "huanying.canvasSkills",
  version: "1.0.0",
  capabilities: Object.freeze(["node", "generation", "reference", "workflow", "asset", "trace", "smoke"]),
  skills: Object.freeze(Object.entries(CANVAS_SKILL_IDS).map(([key, id]) => Object.freeze(skill(id, key)))),
});
