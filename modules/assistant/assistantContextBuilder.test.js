import assert from "node:assert/strict";
import test from "node:test";

import { buildAssistantCanvasContext } from "./assistantContextBuilder.js";

const keyPrefix = "s" + "k-";

test("summarizes project, nodes, edges, and selected nodes", () => {
  const context = buildAssistantCanvasContext({
    project: { id: "project-1", name: "Demo Project" },
    graphStore: {
      nodes: [
        {
          id: "node-1",
          type: "source-text",
          name: "Brief",
          x: 10,
          y: 20,
          width: 240,
          height: 120,
          data: { text: "hello" },
        },
        {
          id: "node-2",
          nodeType: "ai-image",
          title: "Image",
          x: 320,
          y: 20,
        },
      ],
      edges: [{ id: "edge-1", source: "node-1", target: "node-2" }],
      selectedNodeIds: ["node-2"],
    },
  });

  assert.deepEqual(context.project, { id: "project-1", name: "Demo Project" });
  assert.equal(context.canvas.nodeCount, 2);
  assert.equal(context.canvas.edgeCount, 1);
  assert.equal(context.canvas.nodes[0].id, "node-1");
  assert.equal(context.canvas.nodes[1].nodeType, "ai-image");
  assert.deepEqual(context.canvas.edges, [{ id: "edge-1", source: "node-1", target: "node-2" }]);
  assert.deepEqual(context.selection.selectedNodeIds, ["node-2"]);
});

test("always carries a one-line spatial digest, never the full projection by default", () => {
  const context = buildAssistantCanvasContext({
    graphStore: {
      nodes: [
        { id: "s1", type: "storyboard-script", name: "shot-001", x: 584, y: 168, width: 320, height: 220 },
        { id: "i1", type: "ai-image", name: "prep", x: 1000, y: 168, width: 320, height: 220 },
      ],
      edges: [{ id: "e1", source: "s1", target: "i1" }],
    },
  });

  assert.equal(typeof context.canvas.spatialDigest, "string");
  assert.equal(context.canvas.spatialDigest.includes("2"), true);
  assert.equal(context.canvas.spatialDigest.length <= 80, true);
  assert.equal("spatial" in context.canvas, false);
});

test("includeSpatial injects the full canvas-spatial projection with selection relevance", () => {
  const context = buildAssistantCanvasContext({
    includeSpatial: true,
    graphStore: {
      nodes: [
        { id: "s1", type: "storyboard-script", name: "shot-001", x: 584, y: 168, width: 320, height: 220 },
      ],
      edges: [],
      selectedNodeIds: ["s1"],
    },
  });

  assert.equal(context.canvas.spatial.schemaVersion, "canvas-spatial/v1");
  assert.equal(context.canvas.spatial.relevant.some((entry) => entry.node === "s1"), true);
  const serialized = JSON.stringify(context.canvas.spatial);
  assert.equal(/"x"\s*:/.test(serialized), false);
});

test("strips raw pixel coordinates from canvas nodes before they reach the agent", () => {
  const context = buildAssistantCanvasContext({
    graphStore: {
      nodes: [
        { id: "node-1", type: "ai-image", name: "Img", x: 10, y: 20, width: 320, height: 220, data: { prompt: "p" } },
        { id: "node-2", type: "comment", name: "Note", position: { x: 400, y: 80 } },
      ],
      edges: [],
    },
  });

  for (const node of context.canvas.nodes) {
    assert.equal("x" in node, false, JSON.stringify(node));
    assert.equal("y" in node, false, JSON.stringify(node));
    assert.equal("position" in node, false, JSON.stringify(node));
  }
  assert.equal(context.canvas.nodes[0].data.prompt, "p");
  assert.equal(context.canvas.nodeCount, 2);
});

test("includes sanitized project preferences for cross-session creative memory", () => {
  const context = buildAssistantCanvasContext({
    project: {
      id: "project-1",
      name: "Demo Project",
      preferences: {
        visualStyle: "warm cinematic neon",
        aspectRatio: "16:9",
        preferredModels: {
          text: "gpt-5.5",
          image: "dreamina-v3",
          apiKey: `${keyPrefix}modelSecret123`,
        },
        naming: "shot_##",
        brandVoice: "confident but playful",
        workflowDefaults: {
          shotCount: 4,
          durationSec: 15,
          layout: "storyboard_grid",
        },
        localPath: "D:\\private\\brand.md",
        rawPromptDump: "ignore this verbose prompt dump",
      },
    },
  });

  assert.deepEqual(context.project.preferences, {
    visualStyle: "warm cinematic neon",
    aspectRatio: "16:9",
    preferredModels: {
      text: "gpt-5.5",
      image: "dreamina-v3",
    },
    naming: "shot_##",
    brandVoice: "confident but playful",
    workflowDefaults: {
      shotCount: 4,
      durationSec: 15,
      layout: "storyboard_grid",
    },
  });
  assert.doesNotMatch(JSON.stringify(context.project.preferences), /apiKey|modelSecret|private|rawPromptDump/);
});

test("uses workspace project preferences when direct project preferences are absent", () => {
  const context = buildAssistantCanvasContext({
    workspaceStore: {
      project: {
        id: "workspace-project",
        name: "Workspace Project",
        preferences: {
          style: "clean product render",
          ratio: "1:1",
          preferredModel: "fast-text-model",
          brandTone: "precise",
          pathNote: "C:\\Users\\Admin\\secret.txt",
        },
      },
    },
  });

  assert.equal(context.project.id, "workspace-project");
  assert.deepEqual(context.project.preferences, {
    visualStyle: "clean product render",
    aspectRatio: "1:1",
    preferredModels: {
      text: "fast-text-model",
    },
    brandVoice: "precise",
  });
  assert.doesNotMatch(JSON.stringify(context.project.preferences), /Users|secret|pathNote/);
});

test("redacts sensitive keys and values from the context", () => {
  const context = buildAssistantCanvasContext({
    graphStore: {
      nodes: [
        {
          id: "secret-node",
          type: "source-text",
          data: {
            apiKey: `${keyPrefix}secretKey123`,
            authorization: "Bearer bearer-secret",
            path: "D:\\private\\asset.png",
            preview: "data:image/png;base64,abc",
            blobUrl: "blob:http://localhost/abc",
            nested: { token: "plain-token-secret", safe: "keep" },
          },
        },
      ],
      edges: [],
    },
    assets: [{ id: "asset-1", filePath: "D:\\assets\\secret.png", url: "blob:http://local/asset" }],
  });

  const serialized = JSON.stringify(context);

  assert.doesNotMatch(serialized, /apiKey|authorization|token|filePath|path/i);
  assert.doesNotMatch(serialized, new RegExp(`${keyPrefix}secretKey123|bearer-secret|plain-token-secret`));
  assert.doesNotMatch(serialized, /D:\\private|D:\\assets|data:image|blob:http/);
  assert.match(serialized, /keep/);
});

test("redacts project metadata, selected ids, signed URLs, and spaced Windows paths", () => {
  const context = buildAssistantCanvasContext({
    project: {
      id: `${keyPrefix}projectSecret123`,
      name: "Bearer project-secret",
    },
    graphStore: {
      nodes: [
        {
          id: "node-1",
          type: "comment",
          data: {
            previewUrl: "https://example.test/file.png?token=secret-token&safe=1",
            local: "C:\\Users\\Jane Doe\\secret folder\\image.png",
          },
        },
      ],
      edges: [],
      selectedNodeIds: ["D:\\Selected Folder\\node.json", "Bearer selected-secret"],
    },
    assets: [
      {
        id: "asset-1",
        url: "https://cdn.example.test/a.png?X-Amz-Signature=secret&expires=1",
        profileName: "keep profile",
        filePath: "D:\\assets\\private.png",
      },
    ],
  });

  const serialized = JSON.stringify(context);

  assert.doesNotMatch(serialized, new RegExp(`${keyPrefix}projectSecret123|project-secret|selected-secret`));
  assert.doesNotMatch(serialized, /secret-token|X-Amz-Signature=secret/);
  assert.doesNotMatch(serialized, /Jane Doe|secret folder|Selected Folder|D:\\assets/);
  assert.match(serialized, /keep profile/);
  assert.doesNotMatch(serialized, /filePath/);
});

test("normalizes object map and Map collection shapes", () => {
  const context = buildAssistantCanvasContext({
    graphStore: {
      nodes: {
        items: {
          a: { id: "node-a", type: "comment" },
          b: { id: "node-b", type: "comment" },
        },
      },
      edges: new Map([["edge-a", { id: "edge-a", source: "node-a", target: "node-b" }]]),
      selectedNodeIds: [],
    },
    assets: new Map([["asset-a", { id: "asset-a" }]]),
  });

  assert.equal(context.canvas.nodeCount, 2);
  assert.equal(context.canvas.edgeCount, 1);
  assert.deepEqual(context.canvas.nodes.map((node) => node.id), ["node-a", "node-b"]);
  assert.deepEqual(context.assets.items, [{ id: "asset-a" }]);
});

test("replaces circular references with a safe placeholder", () => {
  const node = { id: "node-1", type: "comment" };
  node.self = node;
  node.items = [];
  node.items.push(node.items);

  const context = buildAssistantCanvasContext({
    graphStore: { nodes: [node], edges: [] },
  });

  assert.equal(context.canvas.nodes[0].self, "[Circular]");
  assert.deepEqual(context.canvas.nodes[0].items, ["[Circular]"]);
  assert.doesNotThrow(() => JSON.stringify(context));
});

test("truncates large collections while preserving original counts", () => {
  const nodes = Array.from({ length: 85 }, (_, index) => ({ id: `node-${index}`, type: "comment" }));
  const edges = Array.from({ length: 130 }, (_, index) => ({
    id: `edge-${index}`,
    source: "node-0",
    target: "node-1",
  }));

  const context = buildAssistantCanvasContext({
    graphStore: {
      nodes,
      edges,
      selectedNodeIds: Array.from({ length: 25 }, (_, index) => `node-${index}`),
    },
    assets: Array.from({ length: 31 }, (_, index) => ({ id: `asset-${index}` })),
    workflows: Array.from({ length: 21 }, (_, index) => ({ id: `workflow-${index}` })),
    promptPresets: Array.from({ length: 41 }, (_, index) => ({ id: `preset-${index}` })),
  });

  assert.equal(context.canvas.nodeCount, 85);
  assert.equal(context.canvas.nodes.length, 80);
  assert.equal(context.canvas.edgeCount, 130);
  assert.equal(context.canvas.edges.length, 120);
  assert.equal(context.selection.selectedNodeIds.length, 20);
  assert.equal(context.assets.items.length, 30);
  assert.equal(context.workflows.items.length, 20);
  assert.equal(context.promptPresets.items.length, 40);
});

test("summarizes prompt preset catalog without leaking template bodies", () => {
  const longTemplate = "FULL PRIVATE TEMPLATE ".repeat(40);
  const context = buildAssistantCanvasContext({
    promptPresets: {
      "ai-text": [
        {
          id: "story-outline",
          title: "Story Outline",
          desc: "Create a compact story outline",
          template: longTemplate,
          apiKey: `${keyPrefix}presetSecret123`,
          localPath: "D:\\private\\preset.txt",
          tags: ["story", "outline"],
        },
      ],
      "ai-image": [
        {
          title: "Product Hero",
          desc: "Generate a product hero image",
          subItems: [
            {
              id: "product-hero-front",
              title: "Front Hero",
              desc: "Front-facing image preset",
              template: "SECRET IMAGE TEMPLATE",
              inputs: { brief: "string", style: "string" },
            },
          ],
        },
      ],
      "ai-video": [
        {
          id: "video-teaser",
          title: "Video Teaser",
          desc: "Video preset metadata only",
          template: "SECRET VIDEO TEMPLATE",
        },
      ],
    },
  });

  assert.deepEqual(context.promptPresets.items, [
    {
      id: "story-outline",
      presetId: "story-outline",
      title: "Story Outline",
      name: "Story Outline",
      description: "Create a compact story outline",
      nodeType: "ai-text",
      tags: ["story", "outline"],
      hasTemplate: true,
    },
    {
      id: "product-hero-front",
      presetId: "product-hero-front",
      title: "Front Hero",
      name: "Front Hero",
      description: "Front-facing image preset",
      nodeType: "ai-image",
      category: "Product Hero",
      path: ["Product Hero", "Front Hero"],
      inputKeys: ["brief", "style"],
      hasTemplate: true,
    },
    {
      id: "video-teaser",
      presetId: "video-teaser",
      title: "Video Teaser",
      name: "Video Teaser",
      description: "Video preset metadata only",
      nodeType: "ai-video",
      hasTemplate: true,
    },
  ]);
  const serialized = JSON.stringify(context.promptPresets);
  assert.doesNotMatch(serialized, /FULL PRIVATE TEMPLATE|SECRET IMAGE TEMPLATE|SECRET VIDEO TEMPLATE/);
  assert.doesNotMatch(serialized, /apiKey|presetSecret|D:\\private|localPath|template"/);
});

test("adds semantic compression for large canvases with selection and boundary context", () => {
  const nodes = Array.from({ length: 120 }, (_, index) => ({
    id: `node-${index}`,
    type: index % 3 === 0 ? "ai-image" : index % 3 === 1 ? "ai-text" : "comment",
    name: index % 4 === 0 ? "Shot" : `Node ${index}`,
    data: {
      workflowKind: index < 9 ? "story_to_video" : "",
      workflowStep: index % 3 === 0 ? "shot_keyframe" : index % 3 === 1 ? "shot_script" : "",
      generationStatus: index % 5 === 0 ? "failed" : index % 5 === 1 ? "running" : "completed",
      prompt: index % 7 === 0 ? "" : `prompt ${index}`,
    },
  }));
  const edges = Array.from({ length: 119 }, (_, index) => ({
    id: `edge-${index}`,
    source: `node-${index}`,
    target: `node-${index + 1}`,
  }));
  const context = buildAssistantCanvasContext({
    graphStore: {
      nodes,
      edges,
      selectedNodeIds: ["node-60", "node-61"],
    },
  });

  assert.equal(context.canvas.nodeCount, 120);
  assert.equal(context.canvas.semanticCompression.largeCanvas, true);
  assert.deepEqual(context.canvas.semanticCompression.selectedNodeIds, ["node-60", "node-61"]);
  assert.ok(context.canvas.semanticCompression.selectedNodes.some((node) => node.id === "node-60"));
  assert.ok(context.canvas.semanticCompression.boundaryNodes.some((node) => node.id === "node-59"));
  assert.ok(context.canvas.semanticCompression.boundaryNodes.some((node) => node.id === "node-62"));
  assert.ok(context.canvas.semanticCompression.workflowSummaries.some((item) => item.workflowKind === "story_to_video"));
  assert.ok(context.canvas.semanticCompression.generationStatusSummary.failed > 0);
  assert.ok(context.canvas.semanticCompression.duplicateNameGroups.some((group) => group.name === "Shot"));
});

test("semantic compression keeps storyboard shot metadata for selected shot edits", () => {
  const nodes = Array.from({ length: 95 }, (_, index) => ({
    id: `filler-${index}`,
    type: "comment",
    name: `Filler ${index}`,
  }));
  nodes.push(
    {
      id: "shot-script-2",
      type: "ai-text",
      name: "Shot 2 script",
      data: {
        workflowKind: "story_to_video",
        workflowStep: "shot_script",
        storyboardId: "storyboard-rain",
        shotIndex: 2,
        shotTitle: "Market turn",
        shotVisual: "Courier cuts through a holographic food market.",
        shotCamera: "Fast lateral tracking shot.",
        shotStyle: "Rainy neon, shallow depth of field.",
        shotPrompt: "Rainy neon market chase script.",
        shotContinuity: "Keep the red jacket and drone threat consistent.",
        prompt: "Existing shot 2 script prompt",
      },
    },
    {
      id: "shot-keyframe-2",
      type: "ai-image",
      name: "Shot 2 keyframe",
      data: {
        workflowKind: "story_to_video",
        workflowStep: "shot_keyframe",
        storyboardId: "storyboard-rain",
        shotIndex: 2,
        shotTitle: "Market turn",
        shotVisual: "Courier cuts through a holographic food market.",
        shotCamera: "Fast lateral tracking shot.",
        shotStyle: "Rainy neon, shallow depth of field.",
        shotPrompt: "Rainy neon market chase keyframe.",
        shotContinuity: "Keep the red jacket and drone threat consistent.",
        prompt: "Existing shot 2 image prompt",
      },
    }
  );
  const context = buildAssistantCanvasContext({
    graphStore: {
      nodes,
      edges: [{ id: "shot-2-link", source: "shot-script-2", target: "shot-keyframe-2" }],
      selectedNodeIds: ["shot-keyframe-2"],
    },
  });

  const selected = context.canvas.semanticCompression.selectedNodes.find((node) => node.id === "shot-keyframe-2");

  assert.equal(context.canvas.semanticCompression.largeCanvas, true);
  assert.equal(selected.workflowKind, "story_to_video");
  assert.equal(selected.workflowStep, "shot_keyframe");
  assert.equal(selected.storyboardId, "storyboard-rain");
  assert.equal(selected.shotIndex, 2);
  assert.equal(selected.shotTitle, "Market turn");
  assert.match(selected.shotCamera, /lateral tracking/i);
  assert.match(selected.shotStyle, /Rainy neon/i);
  assert.match(selected.shotPrompt, /keyframe/i);
  assert.match(selected.shotContinuity, /red jacket/i);
});

test("semantic compression keeps knowledge source metadata for knowledge cards", () => {
  const context = buildAssistantCanvasContext({
    graphStore: {
      nodes: [
        {
          id: "knowledge-card-1",
          type: "source-text",
          name: "Brand Guide",
          data: {
            workflowKind: "knowledge_card",
            workflowStep: "llm_wiki_card",
            citationKind: "llm_wiki",
            citationDisplay: "Brand Guide (file-brand)",
            citationProjectId: "project-brand",
            sourceTitle: "Brand Guide",
            sourceFileId: "file-brand",
            sourceProjectId: "project-brand",
            citation: "p.12",
            summary: "Warm, ingredient-led brand voice.",
          },
        },
      ],
      edges: [],
      selectedNodeIds: ["knowledge-card-1"],
    },
  });

  const selected = context.canvas.semanticCompression.selectedNodes[0];

  assert.equal(selected.workflowKind, "knowledge_card");
  assert.deepEqual(selected.knowledgeSource, {
    kind: "llm_wiki",
    display: "Brand Guide (file-brand)",
    title: "Brand Guide",
    fileId: "file-brand",
    projectId: "project-brand",
    citation: "p.12",
  });
  assert.doesNotMatch(JSON.stringify(selected), /summary/);
});

test("includes sanitized LLM Wiki context for read-only knowledge cards", () => {
  const context = buildAssistantCanvasContext({
    knowledge: {
      llmWiki: {
        mode: "readonly",
        available: true,
        apiToken: `${keyPrefix}wikiSecret123`,
        searchResults: [
          {
            title: "Brand Guide",
            fileId: "file-brand",
            projectId: "project-brand",
            snippet: "Warm, ingredient-led voice. D:\\private\\brand.md",
            citation: "p.12",
            token: "secret-token",
          },
        ],
        canvasActionHints: [
          {
            nodeType: "source-text",
            title: "Brand Guide",
            sourceTitle: "Brand Guide",
            fileId: "file-brand",
            projectId: "project-brand",
            citationDisplay: "Brand Guide (file-brand)",
          },
        ],
      },
    },
  });
  const serialized = JSON.stringify(context.knowledge.llmWiki);

  assert.equal(context.knowledge.llmWiki.mode, "readonly");
  assert.equal(context.knowledge.llmWiki.available, true);
  assert.equal(context.knowledge.llmWiki.searchResults[0].fileId, "file-brand");
  assert.equal(context.knowledge.llmWiki.canvasActionHints[0].citationDisplay, "Brand Guide (file-brand)");
  assert.doesNotMatch(serialized, /apiToken|wikiSecret|secret-token|D:\\private|token/);
});

test("includes references and redacts local attachment paths", () => {
  const context = buildAssistantCanvasContext({
    references: [
      {
        id: "node:n1",
        kind: "node",
        targetId: "n1",
        label: "脚本",
        nodeType: "ai-text",
        usage: "target",
      },
    ],
    attachments: [
      {
        id: "att1",
        name: "ref.png",
        mime: "image/png",
        kind: "image",
        usage: "style",
        assetId: "asset-1",
        dimensions: { width: 512, height: 512 },
        thumbnailHint: "style board",
        localPath: "D:\\secret\\ref.png",
        path: "D:\\secret\\ref.png",
        url: "blob:http://local/ref",
      },
    ],
  });
  const serialized = JSON.stringify(context);

  assert.equal(context.references.items[0].targetId, "n1");
  assert.equal(context.references.items[0].usage, "target");
  assert.equal(context.attachments.items[0].usage, "style");
  assert.deepEqual(context.attachments.items[0].dimensions, { width: 512, height: 512 });
  assert.equal(context.attachments.items[0].thumbnailHint, "style board");
  assert.equal(serialized.includes("D:\\secret"), false);
  assert.equal(serialized.includes("blob:"), false);
  assert.doesNotMatch(serialized, /localPath|path|url/);
});


test("adds canvas doctor diagnostics hints", () => {
  const context = buildAssistantCanvasContext({
    graphStore: {
      nodes: [
        { id: "text-1", type: "ai-text", name: "Scene", data: { prompt: "" } },
        { id: "image-1", type: "ai-image", name: "Scene", data: { prompt: "hero image", generationStatus: "failed" } },
        { id: "video-1", type: "ai-video", name: "Final", data: { prompt: "" } },
        { id: "note-1", type: "comment", name: "Note", data: { text: "ok" } },
      ],
      edges: [
        { id: "edge-ok", source: "text-1", target: "image-1" },
        { id: "edge-missing", source: "image-1", target: "missing-node" },
      ],
    },
  });

  assert.deepEqual(context.canvas.diagnostics.failedNodeIds, ["image-1"]);
  assert.deepEqual(context.canvas.diagnostics.missingPromptNodeIds, ["text-1", "video-1"]);
  assert.deepEqual(context.canvas.diagnostics.danglingEdgeIds, ["edge-missing"]);
  assert.deepEqual(context.canvas.diagnostics.isolatedNodeIds, ["video-1", "note-1"]);
  assert.deepEqual(context.canvas.diagnostics.duplicateNameGroups, [{ name: "Scene", nodeIds: ["text-1", "image-1"] }]);
  assert.deepEqual(context.canvas.diagnostics.recommendedFocusNodeIds, ["image-1", "text-1", "video-1"]);
});


test("adds auto layout hints for selected canvas nodes", () => {
  const context = buildAssistantCanvasContext({
    graphStore: {
      nodes: [
        { id: "n1", type: "ai-text", x: 100, y: 120, width: 200, height: 80 },
        { id: "n2", type: "ai-image", x: 420, y: 180, width: 300, height: 200 },
        { id: "n3", type: "comment", x: 900, y: 20, width: 120, height: 60 },
      ],
      edges: [],
      selectedNodeIds: ["n1", "n2"],
    },
  });

  assert.equal(context.canvas.layoutHints.coordinateSystem, "absolute_xy_top_left");
  assert.deepEqual(context.canvas.layoutHints.targetNodeIds, ["n1", "n2"]);
  assert.deepEqual(context.canvas.layoutHints.bounds, { x: 100, y: 120, width: 620, height: 260 });
  assert.deepEqual(context.canvas.layoutHints.suggestedOrigin, { x: 816, y: 120 });
  assert.equal(context.canvas.layoutHints.defaultGap, 96);
  assert.ok(context.canvas.layoutHints.strategies.includes("storyboard_grid"));
  assert.ok(context.canvas.layoutHints.forbiddenEdits.includes("generation"));
});
