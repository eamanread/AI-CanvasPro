import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { TextDecoder } from "node:util";

function readIndexAsUtf8() {
  const bytes = readFileSync(new URL("./index.html", import.meta.url));
  return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
}

test("index.html is served as valid UTF-8 Chinese text", () => {
  const html = readIndexAsUtf8();

  for (const label of ["幻映工作台", "设置", "常规", "模型配置", "订阅中心", "键盘快捷键"]) {
    assert.match(html, new RegExp(label));
  }

  for (const marker of ["ÉèÖÃ", "³£¹æ", "Ä£ÐÍÅäÖÃ", "¶©ÔÄÖÐÐÄ", "¼üÅÌ¿ì½Ý¼ü"]) {
    assert.equal(html.includes(marker), false, `found mojibake marker: ${marker}`);
  }

  assert.equal(html.includes("?? 警告"), false, "server warning should not use replacement question marks");
  assert.equal(html.includes('id="userAvatar" data-tooltip-right="设置" aria-label="设置">?</button>'), false);
});
