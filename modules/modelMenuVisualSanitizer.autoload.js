import { initModelMenuVisualSanitizer } from "./modelMenuVisualSanitizer.js";

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => initModelMenuVisualSanitizer(), {
    once: true,
  });
} else {
  initModelMenuVisualSanitizer();
}
