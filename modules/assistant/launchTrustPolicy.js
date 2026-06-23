// Phase D · launch-provider trust policy (security boundary, R5).
//
// This is the ONE place that decides which lineage tag a launch provider's
// canvas actions carry to the claw gate. It is deliberately split out of the
// generic launchProviderRegistry.js so that the registry/contract logic stays
// provider-agnostic (AC8: no provider vocabulary in the generic layer), while
// this file — by its very purpose a security allowlist — names provider ids.
//
// R5 (lineage is unforgeable): a provider declares only its `id`. The lineage
// tag is looked up HERE from a frozen static allowlist keyed on that id; a
// provider can neither hold nor pass a lineage string at landing time. A rogue
// provider calling landTrustedActions(actions, "vimax", ...) cannot mint
// "vimax-director" unless it actually registered as the (single, validated)
// provider with id "vimax".
//
// Note: `qmai` is allowlisted as a known future lineage so the multi-provider
// isolation tests (AC8b) can prove lineage never crosses between providers — but
// no QMAI provider is registered this phase (YAGNI, §16.3). Adding a future
// source = add its (id -> lineage) line here + register its provider.

export const PROVIDER_LINEAGE = Object.freeze({
  vimax: "vimax-director",
  qmai: "qmai-director",
});

// Lineage tags that no provider may ever carry (they denote panel/server-side
// trust, not a provider). If an allowlist entry ever mapped to one of these,
// lineageForProvider refuses it (fail-closed).
export const RESERVED_LINEAGE_TAGS = new Set(["admin", "system", "panel", "claw"]);

/**
 * Resolve the trusted lineage tag for a provider id, or null if the id is not a
 * registered/allowlisted provider (=> its actions must NOT land). The tag is
 * never taken from a runtime argument — only from the static PROVIDER_LINEAGE.
 */
export function lineageForProvider(providerId) {
  const tag = PROVIDER_LINEAGE[String(providerId || "")];
  return tag && !RESERVED_LINEAGE_TAGS.has(tag) ? tag : null;
}
