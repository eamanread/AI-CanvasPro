"""Golden对账 for native render/portraits RESULTS (Phase C C4.1).

Mirrors golden_compare.py but for result.json. The external runner and the
native orchestrator draw the same shots/characters through the same broker, so
the image URLs / free text NEVER match literally - what MUST hold is STRUCTURAL /
CONTRACT equivalence: same schemaVersion, every produced output carries a url
(no silent-empty canvas node), portraits keep the full 3-view set, and counts
are comparable within tolerance (a failed/skipped draw is run-specific, not a
contract break). Pure - no IO, no drawing. The render_golden_run harness (C4.2)
profiles a native result + an optional external result.json and compares.
"""

RENDER_SCHEMA = "vimax-render-result/v1"
PORTRAITS_SCHEMA = "vimax-portraits-result/v1"
_PORTRAIT_VIEW_COUNT = 3


def render_result_profile(result):
    """vimax-render-result/v1 -> structural fingerprint (no urls/free text)."""
    result = result if isinstance(result, dict) else {}
    outputs = [o for o in (result.get("outputs") or []) if isinstance(o, dict)]
    error_count = sum(1 for o in outputs if o.get("error"))
    # A produced output (not skipped, not error) MUST carry a url - else the
    # canvas lands a blank node (the B0-C2/C3 class of bug). `bool(produced)` so
    # the flag is False (not vacuously True via all([])) when nothing produced.
    produced = [o for o in outputs if not o.get("error") and not o.get("skipped")]
    all_have_url = bool(produced) and all(str(o.get("url") or "").strip() for o in produced)
    return {
        "schemaVersion": result.get("schemaVersion"),
        "outputCount": len(outputs),
        "producedCount": len(produced),
        "allHaveUrl": all_have_url,
        "errorCount": error_count,
    }


def portraits_result_profile(result):
    """vimax-portraits-result/v1 -> structural fingerprint."""
    result = result if isinstance(result, dict) else {}
    chars = [c for c in (result.get("characters") or []) if isinstance(c, dict)]
    error_count = sum(1 for c in chars if c.get("error"))
    produced = [c for c in chars if not c.get("error")]
    views_per_char = [len(c.get("views") or []) for c in produced]
    all_views_have_url = bool(produced) and all(
        str(v.get("url") or "").strip()
        for c in produced for v in (c.get("views") or [])
    )
    return {
        "schemaVersion": result.get("schemaVersion"),
        "charCount": len(chars),
        "producedCharCount": len(produced),
        "viewsPerChar": views_per_char,
        "allViewsHaveUrl": all_views_have_url,
        "errorCount": error_count,
    }


def compare_render_profiles(external, native, *, count_tolerance=1):
    """Compare two render fingerprints. Returns
    {equivalent, hardFailures, countDeltas, notes}. Each side must independently
    satisfy the hard invariants (schema, every produced output has a url, >=1
    produced); producedCount is compared within tolerance (a dropped/failed shot
    is run variance, not a contract break)."""
    external = external if isinstance(external, dict) else {}
    native = native if isinstance(native, dict) else {}
    hard = []
    notes = []
    for side, prof in (("external", external), ("native", native)):
        if prof.get("schemaVersion") != RENDER_SCHEMA:
            hard.append(f"{side}.schemaVersion != {RENDER_SCHEMA}")
        if not prof.get("allHaveUrl"):
            hard.append(f"{side}.allHaveUrl is False (a produced output has no url)")
        if int(prof.get("producedCount") or 0) <= 0:
            hard.append(f"{side}.producedCount is 0 (no keyframe produced)")
    count_deltas = {}
    for key in ("outputCount", "producedCount", "errorCount"):
        e, n = int(external.get(key, 0) or 0), int(native.get(key, 0) or 0)
        count_deltas[key] = {"external": e, "native": n, "delta": n - e}
    pd = count_deltas["producedCount"]
    if abs(pd["delta"]) > count_tolerance:
        notes.append(f"producedCount differs beyond tolerance: external={pd['external']} native={pd['native']}")
    return {"equivalent": not hard and not notes, "hardFailures": hard, "countDeltas": count_deltas, "notes": notes}


def compare_portraits_profiles(external, native, *, count_tolerance=1):
    """Compare two portraits fingerprints. Hard invariants: schema, every view
    has a url, >=1 produced character, and every produced character carries the
    full 3-view set. producedCharCount compared within tolerance."""
    external = external if isinstance(external, dict) else {}
    native = native if isinstance(native, dict) else {}
    hard = []
    notes = []
    for side, prof in (("external", external), ("native", native)):
        if prof.get("schemaVersion") != PORTRAITS_SCHEMA:
            hard.append(f"{side}.schemaVersion != {PORTRAITS_SCHEMA}")
        if not prof.get("allViewsHaveUrl"):
            hard.append(f"{side}.allViewsHaveUrl is False (a portrait view has no url)")
        if int(prof.get("producedCharCount") or 0) <= 0:
            hard.append(f"{side}.producedCharCount is 0 (no character portraits produced)")
        if any(v != _PORTRAIT_VIEW_COUNT for v in (prof.get("viewsPerChar") or [])):
            hard.append(f"{side}.viewsPerChar has a character without {_PORTRAIT_VIEW_COUNT} views")
    count_deltas = {}
    for key in ("charCount", "producedCharCount", "errorCount"):
        e, n = int(external.get(key, 0) or 0), int(native.get(key, 0) or 0)
        count_deltas[key] = {"external": e, "native": n, "delta": n - e}
    pd = count_deltas["producedCharCount"]
    if abs(pd["delta"]) > count_tolerance:
        notes.append(f"producedCharCount differs beyond tolerance: external={pd['external']} native={pd['native']}")
    return {"equivalent": not hard and not notes, "hardFailures": hard, "countDeltas": count_deltas, "notes": notes}
