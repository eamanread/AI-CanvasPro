import { createToolbarDivider, createToolbarHtml, createToolbarIconButton } from "../nodeToolbar/buttonFactory.js";

const ICONS = {
  edit: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>',
  upload: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><path d="M12 16V4"/><path d="m7 9 5-5 5 5"/><path d="M4 20h16"/></svg>',
  fullscreen: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/></svg>',
  remove: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="m10 11 4 4m0-4-4 4"/><path d="M6 6l1 16h10l1-16"/></svg>',
  collapseToggle: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><path d="m6 15 6-6 6 6"/></svg>',
};

export const PANORAMA_SCENE_TOOLBAR_HTML = createToolbarHtml({
  toolbarClass: "v2-panorama-scene-toolbar",
  items: [
    createToolbarIconButton({ action: "enter-edit", tooltip: "\u7f16\u8f91", label: "\u7f16\u8f91", iconSvg: ICONS.edit, extraClass: "panorama-scene-toolbar-btn" }),
    createToolbarDivider(),
    createToolbarIconButton({ action: "upload-panorama", tooltip: "\u4e0a\u4f20\u5168\u666f\u56fe", label: "\u4e0a\u4f20\u5168\u666f\u56fe", iconSvg: ICONS.upload, extraClass: "panorama-scene-toolbar-btn" }),
    createToolbarIconButton({ action: "fullscreen", tooltip: "\u5168\u5c4f\u663e\u793a", label: "\u5168\u5c4f\u663e\u793a", iconSvg: ICONS.fullscreen, extraClass: "panorama-scene-toolbar-btn" }),
    createToolbarIconButton({ action: "collapse-node", tooltip: "\u6298\u53e0", label: "\u6298\u53e0", iconSvg: ICONS.collapseToggle, extraClass: "panorama-scene-toolbar-btn panorama-scene-toolbar-btn--collapse" }),
  ],
});
