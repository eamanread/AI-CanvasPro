// Phase D · D3 — generic launch-provider registry.
//
// AC8: this layer is provider-agnostic. It must NOT contain any provider-
// specific vocabulary or hardcoded provider ids/labels — the D9 grep gate keeps
// it literally clean. The only trust knowledge it touches is lineageForProvider()
// from launchTrustPolicy.js — a function call, not a provider name.
//
// A LaunchProvider is the thin per-source plug:
//   { id, match(message, ctx)->bool, chips:[{id,label,icon,costTier,tooltip,aria}],
//     deriveContract(chipId, brief, ctx)->ContractPreview,
//     synthesizeCommand(chipId, brief, opts)->string,
//     resumeAffordance?(node)->bool }
// It declares ONLY its id — the trusted lineage tag is resolved from the static
// allowlist (R5), never carried by the provider.
import { lineageForProvider } from "./launchTrustPolicy.js";

const COST_TIERS = new Set(["free", "confirm"]);
const REQUIRED_FNS = ["match", "synthesizeCommand", "deriveContract"];

/**
 * Validate a provider against the registration contract (§16.1). Throws on the
 * first violation (fail-fast — never silently half-registers). Returns the id.
 * @param {object} provider
 * @param {Map|Set} [existingIds] - ids already registered (for duplicate check)
 */
export function validateLaunchProvider(provider, existingIds) {
  const id = provider && typeof provider.id === "string" ? provider.id.trim() : "";
  if (!id) {
    throw new Error("[launchProvider] provider.id is required");
  }
  if (existingIds && typeof existingIds.has === "function" && existingIds.has(id)) {
    throw new Error(`[launchProvider] duplicate provider id "${id}"`);
  }
  // R5: the id must resolve to a trusted lineage tag in the static allowlist.
  // An unknown id — or one mapped to a reserved tag — is refused here, so a
  // rogue/typo provider can never get its actions landed.
  if (!lineageForProvider(id)) {
    throw new Error(`[launchProvider] id "${id}" is not in the lineage allowlist`);
  }
  for (const fn of REQUIRED_FNS) {
    if (typeof provider[fn] !== "function") {
      throw new Error(`[launchProvider] "${id}" is missing required function ${fn}()`);
    }
  }
  const chips = Array.isArray(provider.chips) ? provider.chips : [];
  if (!chips.length) {
    throw new Error(`[launchProvider] "${id}" must declare at least one chip`);
  }
  chips.forEach((chip, index) => {
    const chipId = chip && typeof chip.id === "string" ? chip.id.trim() : "";
    if (!chipId) {
      throw new Error(`[launchProvider] "${id}" chip[${index}] is missing an id`);
    }
    if (!COST_TIERS.has(chip.costTier)) {
      throw new Error(
        `[launchProvider] "${id}" chip "${chipId}" has invalid costTier "${chip.costTier}" (must be free|confirm)`
      );
    }
  });
  return id;
}

/**
 * Create an isolated registry instance. The panel owns one instance and
 * registers providers into it; tests use fresh instances (no global state).
 */
export function createLaunchProviderRegistry() {
  const order = [];          // registration order (drives listMatching order)
  const byId = new Map();

  function register(provider) {
    const id = validateLaunchProvider(provider, byId);
    byId.set(id, provider);
    order.push(provider);
    return provider;
  }

  function listMatching(message, ctx = {}) {
    return order.filter((provider) => {
      try {
        return provider.match(message, ctx) === true;
      } catch {
        // A provider's match() must never break discovery for the others.
        return false;
      }
    });
  }

  function get(id) {
    return byId.get(String(id)) || null;
  }

  return {
    register,
    listMatching,
    get,
    size: () => order.length,
    ids: () => order.map((provider) => provider.id),
  };
}
