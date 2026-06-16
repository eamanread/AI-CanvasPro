import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { inflateSync } from "node:zlib";
import { pathToFileURL } from "node:url";

const PNG_SIGNATURE = "89504e470d0a1a0a";

function readUInt32(buffer, offset) {
  return buffer.readUInt32BE(offset);
}

function bytesPerPixelForColorType(colorType) {
  if (colorType === 6) {
    return 4;
  }
  if (colorType === 2) {
    return 3;
  }
  throw new Error(`Unsupported PNG color type ${colorType}; expected RGB or RGBA.`);
}

function unfilterScanline({ filter, current, previous, bytesPerPixel }) {
  const result = Buffer.alloc(current.length);
  for (let index = 0; index < current.length; index += 1) {
    const left = index >= bytesPerPixel ? result[index - bytesPerPixel] : 0;
    const up = previous ? previous[index] : 0;
    const upLeft = previous && index >= bytesPerPixel ? previous[index - bytesPerPixel] : 0;
    let predictor = 0;
    if (filter === 1) {
      predictor = left;
    } else if (filter === 2) {
      predictor = up;
    } else if (filter === 3) {
      predictor = Math.floor((left + up) / 2);
    } else if (filter === 4) {
      const pa = Math.abs(up - upLeft);
      const pb = Math.abs(left - upLeft);
      const pc = Math.abs(left + up - 2 * upLeft);
      predictor = pa <= pb && pa <= pc ? left : pb <= pc ? up : upLeft;
    } else if (filter !== 0) {
      throw new Error(`Unsupported PNG filter ${filter}.`);
    }
    result[index] = (current[index] + predictor) & 0xff;
  }
  return result;
}

export function decodePng(buffer) {
  if (!Buffer.isBuffer(buffer)) {
    throw new TypeError("decodePng expects a Buffer");
  }
  if (buffer.subarray(0, 8).toString("hex") !== PNG_SIGNATURE) {
    throw new Error("Invalid PNG signature.");
  }

  let offset = 8;
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  const idatChunks = [];
  while (offset < buffer.length) {
    const length = readUInt32(buffer, offset);
    const type = buffer.subarray(offset + 4, offset + 8).toString("ascii");
    const data = buffer.subarray(offset + 8, offset + 8 + length);
    offset += 12 + length;
    if (type === "IHDR") {
      width = readUInt32(data, 0);
      height = readUInt32(data, 4);
      bitDepth = data[8];
      colorType = data[9];
    } else if (type === "IDAT") {
      idatChunks.push(data);
    } else if (type === "IEND") {
      break;
    }
  }

  if (bitDepth !== 8) {
    throw new Error(`Unsupported PNG bit depth ${bitDepth}; expected 8.`);
  }
  const sourceBytesPerPixel = bytesPerPixelForColorType(colorType);
  const rowBytes = width * sourceBytesPerPixel;
  const inflated = inflateSync(Buffer.concat(idatChunks));
  const rgba = Buffer.alloc(width * height * 4);
  let readOffset = 0;
  let previous = null;
  for (let y = 0; y < height; y += 1) {
    const filter = inflated[readOffset];
    const current = inflated.subarray(readOffset + 1, readOffset + 1 + rowBytes);
    const row = unfilterScanline({
      filter,
      current,
      previous,
      bytesPerPixel: sourceBytesPerPixel,
    });
    previous = row;
    readOffset += rowBytes + 1;
    for (let x = 0; x < width; x += 1) {
      const source = x * sourceBytesPerPixel;
      const target = (y * width + x) * 4;
      rgba[target] = row[source];
      rgba[target + 1] = row[source + 1];
      rgba[target + 2] = row[source + 2];
      rgba[target + 3] = sourceBytesPerPixel === 4 ? row[source + 3] : 255;
    }
  }

  return { width, height, data: rgba };
}

async function readPng(filePath) {
  return decodePng(await readFile(filePath));
}

export async function comparePngFiles({
  baselinePath,
  actualPath,
  maxMismatchRatio = 0,
  maxChannelDelta = 0,
} = {}) {
  if (!baselinePath || !actualPath) {
    throw new TypeError("baselinePath and actualPath are required");
  }
  const [baseline, actual] = await Promise.all([readPng(baselinePath), readPng(actualPath)]);
  const name = path.basename(actualPath);
  if (baseline.width !== actual.width || baseline.height !== actual.height) {
    return {
      name,
      baselinePath,
      actualPath,
      passesTarget: false,
      dimensionMismatch: true,
      baseline: { width: baseline.width, height: baseline.height },
      actual: { width: actual.width, height: actual.height },
      totalPixels: 0,
      mismatchPixels: 0,
      mismatchRatio: 1,
      maxChannelDelta: 0,
    };
  }

  let mismatchPixels = 0;
  let observedMaxDelta = 0;
  const totalPixels = baseline.width * baseline.height;
  for (let pixel = 0; pixel < totalPixels; pixel += 1) {
    let pixelMismatch = false;
    const offset = pixel * 4;
    for (let channel = 0; channel < 4; channel += 1) {
      const delta = Math.abs(baseline.data[offset + channel] - actual.data[offset + channel]);
      observedMaxDelta = Math.max(observedMaxDelta, delta);
      if (delta > maxChannelDelta) {
        pixelMismatch = true;
      }
    }
    if (pixelMismatch) {
      mismatchPixels += 1;
    }
  }
  const mismatchRatio = totalPixels ? mismatchPixels / totalPixels : 0;
  return {
    name,
    baselinePath,
    actualPath,
    passesTarget: mismatchRatio <= maxMismatchRatio,
    dimensionMismatch: false,
    baseline: { width: baseline.width, height: baseline.height },
    actual: { width: actual.width, height: actual.height },
    totalPixels,
    mismatchPixels,
    mismatchRatio,
    maxChannelDelta: observedMaxDelta,
  };
}

async function listPngFiles(directory) {
  const names = await readdir(directory);
  return names.filter((name) => /\.png$/i.test(name)).sort((a, b) => a.localeCompare(b));
}

export async function compareVisualArtifactDirectories({
  baselineDir,
  actualDir,
  maxMismatchRatio = 0,
  maxChannelDelta = 0,
} = {}) {
  if (!baselineDir || !actualDir) {
    throw new TypeError("baselineDir and actualDir are required");
  }
  const [baselineNames, actualNames] = await Promise.all([
    listPngFiles(baselineDir),
    listPngFiles(actualDir),
  ]);
  const baselineSet = new Set(baselineNames);
  const actualSet = new Set(actualNames);
  const names = baselineNames.filter((name) => actualSet.has(name));
  const missingActuals = baselineNames.filter((name) => !actualSet.has(name));
  const missingBaselines = actualNames.filter((name) => !baselineSet.has(name));
  const comparisons = [];
  for (const name of names) {
    comparisons.push(await comparePngFiles({
      baselinePath: path.join(baselineDir, name),
      actualPath: path.join(actualDir, name),
      maxMismatchRatio,
      maxChannelDelta,
    }));
  }
  return {
    baselineDir,
    actualDir,
    passesTarget:
      comparisons.length > 0 &&
      missingActuals.length === 0 &&
      missingBaselines.length === 0 &&
      comparisons.every((comparison) => comparison.passesTarget),
    comparisons,
    missingActuals,
    missingBaselines,
    failedComparisons: comparisons.filter((comparison) => !comparison.passesTarget),
  };
}

function argValue(argv, name, fallback = "") {
  const index = argv.indexOf(name);
  return index >= 0 && argv[index + 1] ? argv[index + 1] : fallback;
}

async function main(argv = process.argv.slice(2)) {
  const baselineDir = argValue(argv, "--baseline");
  const actualDir = argValue(argv, "--actual");
  const outputPath = argValue(argv, "--out");
  const maxMismatchRatio = Number(argValue(argv, "--max-mismatch-ratio", "0"));
  const maxChannelDelta = Number(argValue(argv, "--max-channel-delta", "0"));
  const report = await compareVisualArtifactDirectories({
    baselineDir,
    actualDir,
    maxMismatchRatio,
    maxChannelDelta,
  });
  const serialized = JSON.stringify(report, null, 2);
  if (outputPath) {
    await writeFile(outputPath, serialized, "utf8");
  }
  console.log(serialized);
  return report.passesTarget ? 0 : 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().then((exitCode) => {
    process.exitCode = exitCode;
  }).catch((error) => {
    console.error(error?.stack || error?.message || error);
    process.exitCode = 1;
  });
}
