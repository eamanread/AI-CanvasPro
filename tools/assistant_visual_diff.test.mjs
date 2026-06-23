import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { deflateSync } from "node:zlib";

import {
  comparePngFiles,
  compareVisualArtifactDirectories,
} from "./assistant_visual_diff.mjs";

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let index = 0; index < 8; index += 1) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data = Buffer.alloc(0)) {
  const typeBuffer = Buffer.from(type, "ascii");
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), 0);
  return Buffer.concat([length, typeBuffer, data, crc]);
}

function rgbaPng(width, height, pixels) {
  const signature = Buffer.from("89504e470d0a1a0a", "hex");
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  const rows = [];
  for (let y = 0; y < height; y += 1) {
    const offset = y * width * 4;
    rows.push(Buffer.from([0]), Buffer.from(pixels.slice(offset, offset + width * 4)));
  }
  return Buffer.concat([
    signature,
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(Buffer.concat(rows))),
    chunk("IEND"),
  ]);
}

test("assistant visual diff passes identical PNGs", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "assistant-visual-diff-"));
  const baseline = path.join(dir, "baseline.png");
  const actual = path.join(dir, "actual.png");
  const pixels = [
    0, 0, 0, 255, 255, 255, 255, 255,
    255, 0, 0, 255, 0, 255, 0, 255,
  ];
  await writeFile(baseline, rgbaPng(2, 2, pixels));
  await writeFile(actual, rgbaPng(2, 2, pixels));

  const diff = await comparePngFiles({ baselinePath: baseline, actualPath: actual });

  assert.equal(diff.passesTarget, true);
  assert.equal(diff.totalPixels, 4);
  assert.equal(diff.mismatchPixels, 0);
  assert.equal(diff.mismatchRatio, 0);
});

test("assistant visual diff fails when pixel mismatch exceeds threshold", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "assistant-visual-diff-"));
  const baseline = path.join(dir, "baseline.png");
  const actual = path.join(dir, "actual.png");
  const basePixels = new Array(16).fill(0);
  for (let index = 3; index < basePixels.length; index += 4) {
    basePixels[index] = 255;
  }
  const actualPixels = [...basePixels];
  actualPixels[0] = 255;
  await writeFile(baseline, rgbaPng(2, 2, basePixels));
  await writeFile(actual, rgbaPng(2, 2, actualPixels));

  const diff = await comparePngFiles({
    baselinePath: baseline,
    actualPath: actual,
    maxMismatchRatio: 0.1,
  });

  assert.equal(diff.passesTarget, false);
  assert.equal(diff.mismatchPixels, 1);
  assert.equal(diff.mismatchRatio, 0.25);
  assert.equal(diff.maxChannelDelta, 255);
});

test("assistant visual diff reports dimension mismatch as hard failure", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "assistant-visual-diff-"));
  const baseline = path.join(dir, "baseline.png");
  const actual = path.join(dir, "actual.png");
  await writeFile(baseline, rgbaPng(1, 1, [0, 0, 0, 255]));
  await writeFile(actual, rgbaPng(2, 1, [0, 0, 0, 255, 0, 0, 0, 255]));

  const diff = await comparePngFiles({ baselinePath: baseline, actualPath: actual });

  assert.equal(diff.passesTarget, false);
  assert.equal(diff.dimensionMismatch, true);
  assert.equal(diff.baseline.width, 1);
  assert.equal(diff.actual.width, 2);
});

test("assistant visual diff pairs screenshot artifacts by file name", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "assistant-visual-diff-"));
  const baselineDir = path.join(root, "baseline");
  const actualDir = path.join(root, "actual");
  await mkdir(baselineDir);
  await mkdir(actualDir);
  const pixels = [0, 0, 0, 255];
  await writeFile(path.join(baselineDir, "01-open-panel.png"), rgbaPng(1, 1, pixels));
  await writeFile(path.join(actualDir, "01-open-panel.png"), rgbaPng(1, 1, pixels));

  const report = await compareVisualArtifactDirectories({ baselineDir, actualDir });

  assert.equal(report.passesTarget, true);
  assert.equal(report.comparisons.length, 1);
  assert.equal(report.comparisons[0].name, "01-open-panel.png");
  assert.equal(report.missingBaselines.length, 0);
});
