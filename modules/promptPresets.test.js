import assert from "node:assert/strict";
import test from "node:test";

function makeJsonResponse(payload, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: {
      get(name) {
        return String(name || "").toLowerCase() === "content-type"
          ? "application/json"
          : null;
      },
    },
    json: async () => payload,
    text: async () => JSON.stringify(payload),
  };
}

test("promptPresets: loadCustomPresets 会合并系统 definitions 与自定义 txt 预设", async () => {
  const originalFetch = globalThis.fetch;

  try {
    globalThis.fetch = async (url) => {
      if (String(url) === "/api/v2/user/presets/definitions") {
        return makeJsonResponse({
          "ai-image": [
            {
              title: "多宫格",
              desc: "系统分组",
              subItems: [
                {
                  title: "9宫格",
                  template: "系统九宫格模板",
                },
              ],
            },
          ],
          "ai-audio": [],
        });
      }

      if (String(url) === "/api/v2/user/presets") {
        return makeJsonResponse({
          "ai-image": [
            {
              title: "开发联调预设",
              template: "自定义模板",
            },
          ],
        });
      }

      throw new Error(`unexpected fetch url: ${String(url)}`);
    };

    const moduleUnderTest = await import(`./promptPresets.js?test=${Date.now()}`);
    await moduleUnderTest.loadCustomPresets();

    const presets = moduleUnderTest.getPromptPresets("ai-image");
    assert.equal(presets.length, 2);
    assert.equal(presets[0].title, "多宫格");
    assert.equal(presets[0].subItems[0].title, "9宫格");
    assert.equal(presets[1].title, "开发联调预设");
    assert.equal(presets[1].template, "自定义模板");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("promptPresets: openCustomPresetsManager opens the requested node type manager", async () => {
  const originalWindow = globalThis.window;
  const originalBroadcastChannel = globalThis.BroadcastChannel;
  const calls = [];

  try {
    globalThis.BroadcastChannel = undefined;
    globalThis.window = {
      screen: {
        width: 1920,
        height: 1080,
      },
      open(url, name, features) {
        calls.push({ url, name, features });
        return {
          focus() {
            calls.push({ focus: true });
          },
        };
      },
      addEventListener() {},
    };

    const moduleUnderTest = await import(`./promptPresets.js?manager=${Date.now()}`);
    const managerWindow = moduleUnderTest.openCustomPresetsManager("ai-text");

    assert.ok(managerWindow);
    assert.equal(calls[0].url, "/dev/preset-manager.html?nodeType=ai-text");
    assert.equal(calls[0].name, "huanying-preset-manager");
    assert.match(calls[0].features, /width=1480/);
    assert.deepEqual(calls[1], { focus: true });
  } finally {
    globalThis.window = originalWindow;
    globalThis.BroadcastChannel = originalBroadcastChannel;
  }
});

test("promptPresets: normalized preset data does not expose icons", async () => {
  const moduleUnderTest = await import(`./promptPresets.js?icons=${Date.now()}`);
  const presets = moduleUnderTest.getPromptPresets("ai-image");
  const groupedPreset = presets.find((preset) => Array.isArray(preset.subItems));

  assert.ok(presets.length > 0);
  assert.equal("icon" in presets[0], false);
  assert.ok(groupedPreset);
  assert.equal("icon" in groupedPreset.subItems[0], false);
});

test("promptPresets: preserves empty system groups", async () => {
  const originalFetch = globalThis.fetch;

  try {
    globalThis.fetch = async (url) => {
      if (String(url) === "/api/v2/user/presets/definitions") {
        return makeJsonResponse({
          "ai-image": [
            {
              title: "Empty Group",
              desc: "Group without children",
              subItems: [],
            },
            {
              title: "Top Leaf",
              template: "top-leaf-template",
            },
          ],
        });
      }

      if (String(url) === "/api/v2/user/presets") {
        return makeJsonResponse({
          "ai-image": [],
          "ai-text": [],
          "ai-video": [],
          "ai-audio": [],
        });
      }

      throw new Error(`unexpected fetch url: ${String(url)}`);
    };

    const moduleUnderTest = await import(`./promptPresets.js?emptyGroup=${Date.now()}`);
    await moduleUnderTest.loadCustomPresets();

    const presets = moduleUnderTest.getPromptPresets("ai-image");
    assert.equal(presets.length, 2);
    assert.deepEqual(presets[0], {
      title: "Empty Group",
      desc: "Group without children",
      subItems: [],
    });
    assert.equal(presets[1].title, "Top Leaf");
    assert.equal(presets[1].template, "top-leaf-template");
  } finally {
    globalThis.fetch = originalFetch;
  }
});
