import { createToolbarHtml, createToolbarIconButton } from "../nodeToolbar/buttonFactory.js";
import {
  CHARACTER_SHOT_PRESET_KEYS,
  CHARACTER_SHOT_PRESETS,
} from "../../modules/panoramaSceneNode/characterShotPresets.js";

// buttonFactory 将 action 编码为 CSS class `act-<action>`，因此 action 必须 class 安全（连字符）
export const CHARACTER_SHOT_ACTION_PREFIX = "character-shot-";

const ICON_COMMON = 'viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" width="16" height="16" stroke-linecap="round" stroke-linejoin="round"';

const ICONS = {
  "front-closeup": `<svg ${ICON_COMMON}><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="12" cy="11" r="4.2"/><path d="M6 21c1.6-3.4 10.4-3.4 12 0"/></svg>`,
  "right-close": `<svg ${ICON_COMMON}><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="10" cy="9" r="2.6"/><path d="M5.5 19c1-3.2 8-3.2 9 0"/><path d="M17.5 7v10"/></svg>`,
  "over-shoulder": `<svg ${ICON_COMMON}><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M2.5 21c2-5 7.5-6 9.5-6"/><circle cx="8" cy="11" r="3.4"/><circle cx="16.5" cy="9.5" r="2.2"/></svg>`,
  "right-medium": `<svg ${ICON_COMMON}><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="10" cy="8" r="2"/><path d="M6.5 21v-4.5c0-2 1.5-3.5 3.5-3.5s3.5 1.5 3.5 3.5V21"/><path d="M17.5 7v10"/></svg>`,
  "right-front-full": `<svg ${ICON_COMMON}><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="12" cy="7.2" r="1.7"/><path d="M12 9v5m0 0-2.4 5M12 14l2.4 5M9 11h6"/></svg>`,
  "front-medium": `<svg ${ICON_COMMON}><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="12" cy="8" r="2.2"/><path d="M7.5 21v-4c0-2.5 2-4.5 4.5-4.5s4.5 2 4.5 4.5v4"/></svg>`,
  "rear-high-extreme-long": `<svg ${ICON_COMMON}><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3.5 17.5 8 12l3.5 4 3-2.5 6 4"/><circle cx="16.5" cy="8" r="1.2"/><path d="M16.5 9.2v1.8"/></svg>`,
  "top-down": `<svg ${ICON_COMMON}><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M12 6.5v7m0 0-2.6-2.6M12 13.5l2.6-2.6"/><circle cx="12" cy="17.5" r="1.4"/></svg>`,
};

export const CHARACTER_SHOT_STRIP_HTML = createToolbarHtml({
  toolbarClass: "v2-character-shot-strip",
  items: CHARACTER_SHOT_PRESET_KEYS.map((key) => createToolbarIconButton({
    action: `${CHARACTER_SHOT_ACTION_PREFIX}${key}`,
    tooltip: CHARACTER_SHOT_PRESETS[key].label,
    label: CHARACTER_SHOT_PRESETS[key].label,
    iconSvg: ICONS[key] || "",
    extraClass: "character-shot-btn",
  })),
});

const ACTION_CLASS_PATTERN = /\bact-character-shot-([a-z0-9-]+)\b/;

export function extractCharacterShotPresetKey(className) {
  const match = String(className || "").match(ACTION_CLASS_PATTERN);
  return match ? match[1] : "";
}

// 非全屏入口：编辑工具栏上的"固定机位"按钮（点击展开机位下拉，样式同其他 act-* 按钮）
export const CHARACTER_SHOT_TOGGLE_ACTION = "character-shot-toggle";
const TOGGLE_ICON = `<svg ${ICON_COMMON}><path d="M4 8.5 13 6l.8 3.2L5 11.7z"/><rect x="13.6" y="6.6" width="6" height="4.4" rx="1"/><path d="M9 12v8m0-8 -3.5 8M9 12l3.5 8"/><circle cx="9" cy="12" r="1.1"/></svg>`;

export const CHARACTER_SHOT_TOGGLE_BUTTON_HTML = createToolbarIconButton({
  action: CHARACTER_SHOT_TOGGLE_ACTION,
  tooltip: "固定机位",
  label: "固定机位",
  iconSvg: TOGGLE_ICON,
  extraClass: "character-shot-toggle-btn",
});
