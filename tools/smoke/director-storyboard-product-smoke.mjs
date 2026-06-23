import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "playwright";

const root = process.cwd();
const artifactDir = join(root, "docs/reviews/artifacts/2026-06-08-director-storyboard-product-acceptance");
mkdirSync(artifactDir, { recursive: true });

const chromeCandidates = [
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
  "C:/Program Files/Microsoft/Edge/Application/msedge.exe"
];
const chromeExecutable = chromeCandidates.find((path) => existsSync(path));
const url = process.env.SMOKE_URL || "http://127.0.0.1:8777/";
const launchOptions = { headless: true };
if (chromeExecutable) launchOptions.executablePath = chromeExecutable;

const browser = await chromium.launch(launchOptions);
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const pageErrors = [];
const httpErrors = [];

page.on("pageerror", (error) => pageErrors.push(String(error?.message || error)));
page.on("response", (response) => {
  const status = response.status();
  if (status >= 400) httpErrors.push({ status, url: response.url() });
});

await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
await page.waitForTimeout(1500);
await page.waitForFunction(
  () => Boolean(document.querySelector("#v2-canvas") || document.querySelector("#canvas") || document.querySelector(".canvas") || document.querySelector(".v2-canvas") || window.appStore || window.graphStore),
  null,
  { timeout: 15000 }
).catch(() => {});

async function probe(urlToProbe) {
  const response = await page.request.get(urlToProbe);
  return { url: urlToProbe, status: response.status() };
}

const result = await page.evaluate(() => {
  const directorSelectors = [
    '[data-type="panorama-scene"]',
    '[data-node-type="panorama-scene"]',
    '[data-type="panorama-360"]',
    '[data-node-type="panorama-360"]',
    '.left-menu [title*="3D"]',
    '.left-menu [title*="导演"]'
  ];
  const storyboardSelectors = [
    '[data-type="storyboard-script"]',
    '[data-node-type="storyboard-script"]',
    '.left-menu [title*="分镜"]'
  ];
  const bodyText = document.body?.textContent || "";
  return {
    title: document.title,
    appLoaded: Boolean(document.querySelector("#v2-canvas") || document.querySelector("#canvas") || document.querySelector(".canvas") || document.querySelector(".v2-canvas") || window.appStore || window.graphStore),
    leftMenuHasDirector: directorSelectors.some((selector) => Boolean(document.querySelector(selector))) || bodyText.includes("3D") || bodyText.includes("导演"),
    leftMenuHasStoryboardScript: storyboardSelectors.some((selector) => Boolean(document.querySelector(selector))) || bodyText.includes("分镜脚本"),
    globals: {
      hasAppStore: Boolean(window.appStore),
      hasGraphStore: Boolean(window.graphStore),
      hasV2Renderer: Boolean(window.v2Renderer),
      hasV2SidePlusUpdater: typeof window._v2UpdateSidePlus === "function"
    },
    maleAssetUrl: new URL("/assets/characters/quaternius/universal-base/Superhero_Male_FullBody.gltf", location.origin).href,
    femaleAssetUrl: new URL("/assets/characters/quaternius/universal-base/Superhero_Female_FullBody.gltf", location.origin).href
  };
});

result.characterAssetProbes = [await probe(result.maleAssetUrl), await probe(result.femaleAssetUrl)];

result.registrySeed = await page.evaluate(async () => {
  const smokeConfig = {
    modelRegistry: {
      text: [
        {
          id: "mdl_text_smoke_a",
          nodeType: "text",
          modelName: "Smoke Text A",
          modelId: "smoke-text-a",
          apiKey: "",
          baseUrl: "",
          adapterType: "openai_compatible",
          status: "unverified",
          disabled: false
        },
        {
          id: "mdl_text_smoke_b",
          nodeType: "text",
          modelName: "Smoke Text B",
          modelId: "smoke-text-b",
          apiKey: "",
          baseUrl: "",
          adapterType: "openai_compatible",
          status: "unverified",
          disabled: false
        }
      ],
      image: [],
      video: [],
      audio: [],
      other: []
    }
  };
  try {
    const configMod = await import("/api/configApi.js");
    const originalFetch = window.fetch.bind(window);
    window.fetch = async (input, init) => {
      const requestUrl = String(typeof input === "string" ? input : input?.url || "");
      if (requestUrl === "/api/config" || requestUrl.endsWith("/api/config")) {
        return new Response(JSON.stringify(smokeConfig), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        });
      }
      return originalFetch(input, init);
    };
    try {
      configMod.clearApiConfig?.();
      await configMod.fetchApiConfigFromServer();
    } finally {
      window.fetch = originalFetch;
    }
    return {
      seeded: true,
      textModelIds: smokeConfig.modelRegistry.text.map((model) => model.id)
    };
  } catch (error) {
    return {
      seeded: false,
      error: String(error?.message || error)
    };
  }
});

result.storyboardInjection = await page.evaluate(async () => {
  const id = "smoke-storyboard-side-plus";
  try {
    const storeMod = await import("/src/core/stores/appStore.js");
    const factoryMod = await import("/src/core/storyboardScriptFactory.js");
    const store = storeMod.default?.graphStore || storeMod.graphStore || storeMod.default;
    const node = factoryMod.createStoryboardScriptNodeData({
      id,
      x: 300,
      y: 220,
      width: 1024,
      height: 576,
      name: "分镜脚本"
    });
    node.storyboardScript = {
      ...node.storyboardScript,
      storyPrompt: "翡翠楼夜宴",
      textModelSource: "local-registry",
      selectedModelId: "mdl_text_smoke_a",
      selectedModelNameSnapshot: "Smoke Text A",
      modelDeleted: false
    };
    store.addNode(node);
    store.setSelectedNodes?.([id]);
    return { injected: true, via: "esm-app-store", id };
  } catch (error) {
    return { injected: false, via: "esm-app-store", error: String(error?.message || error), id };
  }
});
await page.waitForTimeout(800);

result.storyboardDom = await page.evaluate(() => {
  const elements = [
    document.querySelector('[data-node-id="smoke-storyboard-side-plus"]'),
    document.querySelector('#smoke-storyboard-side-plus'),
    ...document.querySelectorAll('.v2-node, .node')
  ].filter(Boolean);
  const storyboardEl = elements.find((el) => el?.dataset?.nodeId === "smoke-storyboard-side-plus" || el.textContent?.includes("分镜脚本") || String(el.className || "").includes("storyboard"));
  if (!storyboardEl) return { found: false };
  const rect = storyboardEl.getBoundingClientRect();
  return { found: true, rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height }, className: String(storyboardEl.className || "") };
});

if (result.storyboardDom?.found) {
  await page.mouse.move(result.storyboardDom.rect.x + result.storyboardDom.rect.width / 2, result.storyboardDom.rect.y + result.storyboardDom.rect.height / 2);
  await page.waitForTimeout(700);
}

result.sidePlus = await page.evaluate(() => {
  try {
    window._v2UpdateSidePlus?.({ selectionOnly: false });
  } catch {}
  const buttons = [...document.querySelectorAll(".side-plus-btn")].map((button) => {
    const rect = button.getBoundingClientRect();
    const style = getComputedStyle(button);
    return {
      side: button.dataset.side || "",
      visible: rect.width > 0 && rect.height > 0 && style.display !== "none" && style.visibility !== "hidden",
      className: String(button.className || ""),
      x: rect.x,
      y: rect.y,
      width: rect.width,
      height: rect.height
    };
  });
  return {
    buttons,
    hasLeft: buttons.some((button) => button.side === "left" && button.visible),
    hasRight: buttons.some((button) => button.side === "right" && button.visible)
  };
});

result.storyboardModelSelector = await page.evaluate(async () => {
  const id = "smoke-storyboard-side-plus";
  try {
    const storeMod = await import("/src/core/stores/appStore.js");
    const store = storeMod.default?.graphStore || storeMod.graphStore || storeMod.default;
    const elements = [
      document.querySelector(`[data-node-id="${id}"]`),
      document.querySelector(`#${id}`),
      ...document.querySelectorAll(".v2-node, .node")
    ].filter(Boolean);
    const storyboardEl = elements.find(
      (el) =>
        el?.dataset?.nodeId === id ||
        String(el.id || "") === id ||
        String(el.className || "").includes("storyboard") ||
        el.textContent?.includes("分镜脚本")
    );
    const promptPanel =
      document.querySelector(`.text-prompt-panel[data-node-id="${id}"]`) ||
      [...document.querySelectorAll(".text-prompt-panel, .viewport-fixed-prompt")].find(
        (el) => el?.dataset?.nodeId === id || el?.querySelector?.(".storyboard-text-model-wrap")
      );
    const wrap =
      promptPanel?.querySelector?.(".storyboard-text-model-wrap, .img-model-wrap") ||
      storyboardEl?.querySelector?.(".storyboard-text-model-wrap, .img-model-wrap") ||
      document.querySelector(".storyboard-text-model-wrap");
    const labelEl = wrap?.querySelector?.(".img-model-label");
    const triggerEl = wrap?.querySelector?.(".img-model-btn-trigger");
    const menuEl = wrap?.querySelector?.(".img-model-menu");
    const itemsBefore = menuEl ? [...menuEl.querySelectorAll("[data-model-id]")] : [];
    const activeBefore = menuEl?.querySelector?.(".floating-menu-item.active")?.dataset?.modelId || "";
    const initialLabel = String(labelEl?.textContent || "").trim();
    const initialTitle = String(triggerEl?.title || "").trim();
    menuEl?.classList?.add?.("show");
    const targetItem = menuEl?.querySelector?.('[data-model-id="mdl_text_smoke_b"]');
    targetItem?.dispatchEvent?.(new MouseEvent("click", { bubbles: true, cancelable: true }));
    const node = store?.getState?.()?.nodes?.[id] || {};
    const script = node.storyboardScript || {};
    const selectedLabel = String(labelEl?.textContent || "").trim();
    const selectedTitle = String(triggerEl?.title || "").trim();
    const activeAfter = menuEl?.querySelector?.(".floating-menu-item.active")?.dataset?.modelId || "";
    const menuClosed = menuEl ? !menuEl.classList.contains("show") : false;
    const pass = Boolean(
      storyboardEl &&
        wrap &&
        labelEl &&
        triggerEl &&
        menuEl &&
        itemsBefore.length >= 2 &&
        initialLabel === "Smoke Text A" &&
        initialTitle === "Smoke Text A" &&
        activeBefore === "mdl_text_smoke_a" &&
        selectedLabel === "Smoke Text B" &&
        selectedTitle === "Smoke Text B" &&
        activeAfter === "mdl_text_smoke_b" &&
        menuClosed &&
        script.selectedModelId === "mdl_text_smoke_b" &&
        script.model === "smoke-text-b"
    );
    return {
      pass,
      found: Boolean(storyboardEl),
      hasWrap: Boolean(wrap),
      initialLabel,
      initialTitle,
      selectedLabel,
      selectedTitle,
      itemCount: itemsBefore.length,
      activeBefore,
      activeAfter,
      menuClosed,
      storeSelectedModelId: script.selectedModelId || "",
      storeModel: script.model || ""
    };
  } catch (error) {
    return {
      pass: false,
      error: String(error?.message || error)
    };
  }
});

result.sceneFusionRemoved = await page.evaluate(async () => {
  try {
    const sceneMod = await import("/modules/panoramaSceneNode/sceneNode.js");
    const defaultState = sceneMod.createDefaultPanoramaSceneState();
    const normalizedState = sceneMod.normalizePanoramaSceneState({
      inputImage: {
        localPath: "outputs/smoke-panorama.png",
        imageUrl: "/outputs/smoke-panorama.png",
        fileName: "smoke-panorama.png",
        width: 2048,
        height: 1024,
        mimeType: "image/png",
        appliedAt: 100
      },
      environmentImage: {
        enabled: true,
        imageUrl: "/outputs/smoke-panorama.png",
        opacity: 1
      },
      referencePlane: {
        enabled: true,
        imageUrl: "/outputs/smoke-reference.png",
        opacity: 1
      }
    });
    const removedKeys = ["inputImage", "environmentImage", "referencePlane"];
    const pass = removedKeys.every((key) => !(key in defaultState) && !(key in normalizedState));
    return {
      pass,
      defaultKeys: Object.keys(defaultState).filter((key) => removedKeys.includes(key)),
      normalizedKeys: Object.keys(normalizedState).filter((key) => removedKeys.includes(key))
    };
  } catch (error) {
    return {
      pass: false,
      error: String(error?.message || error)
    };
  }
});

result.directorCharacterPlacement = await page.evaluate(async () => {
  try {
    const sceneMod = await import("/modules/panoramaSceneNode/sceneNode.js");
    const actionsMod = await import("/modules/panoramaSceneNode/sceneNodeActions.js");
    const id = "smoke-director-character-placement";
    const node = sceneMod.createPanoramaSceneNodeData({ id });
    const store = {
      state: { nodes: { [id]: node }, edges: [] },
      getState() {
        return this.state;
      },
      getStateRaw() {
        return this.state;
      },
      updateNodeData(nodeId, patch) {
        this.state.nodes[nodeId] = { ...this.state.nodes[nodeId], ...patch };
      },
      batch(callback) {
        callback();
      }
    };
    const mannequinId = actionsMod.addPanoramaSceneMannequin({
      nodeId: id,
      gender: "female",
      colorKey: "red",
      viewPose: { position: { x: 0, y: 1.6, z: 0 }, rotation: { y: 0 } },
      storeInstance: store
    });
    actionsMod.updatePanoramaSceneObjectTransform({
      nodeId: id,
      objectType: "mannequin",
      objectId: mannequinId,
      pose: {
        position: { x: 1, y: 0, z: 2 },
        rotation: { x: 0, y: 0.5, z: 0 },
        scale: 1.5
      },
      storeInstance: store
    });
    const state = sceneMod.normalizePanoramaSceneState(store.state.nodes[id].sceneNode);
    const mannequin = state.mannequins.find((item) => item.id === mannequinId);
    const pass = Boolean(
      mannequinId &&
        mannequin &&
        state.mannequins.length === 1 &&
        mannequin.gender === "female" &&
        mannequin.colorKey === "red" &&
        mannequin.position.x === 1 &&
        mannequin.position.z === 2 &&
        mannequin.rotation.y === 0.5 &&
        mannequin.scale === 1.5 &&
        state.selection.selectedObjectType === "mannequin" &&
        state.selection.selectedObjectId === mannequinId
    );
    return {
      pass,
      mannequinId,
      mannequinCount: state.mannequins.length,
      selectedObjectType: state.selection.selectedObjectType,
      selectedObjectId: state.selection.selectedObjectId,
      transform: mannequin
        ? {
            position: mannequin.position,
            rotation: mannequin.rotation,
            scale: mannequin.scale
          }
        : null
    };
  } catch (error) {
    return {
      pass: false,
      error: String(error?.message || error)
    };
  }
});

await page.screenshot({ path: join(artifactDir, "storyboard-side-plus.png"), fullPage: true });

result.pageErrors = pageErrors;
result.httpErrors = httpErrors.filter((item) => !item.url.includes("favicon.ico"));
result.artifacts = {
  screenshot: join(artifactDir, "storyboard-side-plus.png"),
  result: join(artifactDir, "product-smoke-result.json")
};
result.pass = Boolean(
  result.appLoaded &&
    result.leftMenuHasDirector &&
    result.leftMenuHasStoryboardScript &&
    result.characterAssetProbes.every((item) => item.status === 200) &&
    result.storyboardModelSelector.pass &&
    result.sceneFusionRemoved.pass &&
    result.directorCharacterPlacement.pass &&
    result.sidePlus.hasLeft &&
    result.sidePlus.hasRight &&
    pageErrors.length === 0
);

writeFileSync(join(artifactDir, "product-smoke-result.json"), JSON.stringify(result, null, 2));
await browser.close();

if (!result.pass) {
  console.error(JSON.stringify(result, null, 2));
  process.exit(1);
}
console.log(JSON.stringify(result, null, 2));
