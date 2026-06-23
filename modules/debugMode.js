function queryPartsFromHref(href) {
  const value = String(href || "");
  const parts = [];
  const firstQuestion = value.indexOf("?");
  if (firstQuestion >= 0) {
    parts.push(value.slice(firstQuestion + 1).split("#")[0]);
  }
  const hashIndex = value.indexOf("#");
  const hashQuestion = hashIndex >= 0 ? value.indexOf("?", hashIndex) : -1;
  if (hashQuestion >= 0) {
    parts.push(value.slice(hashQuestion + 1).split("#")[0]);
  }
  return parts;
}

export function isHuanyingDebugModeEnabled({
  windowRef = typeof window !== "undefined" ? window : null,
} = {}) {
  if (!windowRef) {
    return false;
  }
  try {
    if (windowRef.localStorage?.getItem?.("huanyingDebugMode") === "true") {
      return true;
    }
  } catch {
    // Some embedded contexts block localStorage; query flags still work.
  }

  return queryPartsFromHref(windowRef.location?.href).some((part) => {
    try {
      return new URLSearchParams(part).get("debug") === "1";
    } catch {
      return false;
    }
  });
}
