export const IMAGE_TOOLBAR_TOOL_CLASSIFICATION = Object.freeze({
  matting: "local-or-runninghub-workflow",
  repaint: "standard-model",
  erase: "standard-model",
  hd: "runninghub-workflow",
  expand: "standard-model",
  "auto-subject": "runninghub-workflow",
  "panorama-360": "runninghub-workflow",
  multiangle: "standard-model",
  multigrid: "local-only",
  annotate: "local-only",
  crop: "local-only",
  fullscreen: "local-only",
  download: "local-only",
  "reset-size": "local-only",
});

export const IMAGE_TOOLBAR_TOOL_FIELD_CONTRACTS = Object.freeze({
  repaint: Object.freeze({
    inputFields: Object.freeze([
      "inputUrls",
      "maskPngBase64",
      "prompt",
      "model",
      "provider",
      "imageSize",
    ]),
    outputFields: Object.freeze([
      "sourceUrl",
      "thumbUrl",
      "imageUrl",
      "localPath",
      "generationDuration",
      "asyncTaskStatus",
    ]),
  }),
  erase: Object.freeze({
    inputFields: Object.freeze([
      "inputUrls",
      "maskPngBase64",
      "prompt",
      "model",
      "provider",
      "imageSize",
    ]),
    outputFields: Object.freeze([
      "sourceUrl",
      "thumbUrl",
      "imageUrl",
      "localPath",
      "generationDuration",
      "asyncTaskStatus",
    ]),
  }),
});

export function getImageToolbarToolClassification(action) {
  return IMAGE_TOOLBAR_TOOL_CLASSIFICATION[String(action || "").trim()] || "";
}
