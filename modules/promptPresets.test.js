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
