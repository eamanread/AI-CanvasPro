import { initSubscriptionCdkeyVisibility } from "./subscriptionCdkeyVisibility.js";

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => initSubscriptionCdkeyVisibility(), { once: true });
} else {
  initSubscriptionCdkeyVisibility();
}
