"""Golden对账 for the brain migration (Phase A3).

Both the external runner and the native planner hit the same LLM with the same
(ported-verbatim) prompts, so their free-text output (story / ff_desc / ...)
will NEVER match literally - comparing text is meaningless. What MUST hold is
STRUCTURAL / CONTRACT equivalence: same schemaVersion, the same field set,
valid + contiguous shot indices, valid variation types, correct lfDesc gating,
and comparable counts. This module profiles a vimax-shotplan/v1 into a
structural fingerprint and compares two fingerprints into a verdict.

Pure - no IO. The A3 harness loads an external + a native shotplan (JSON), runs
shotplan_profile on each, and compare_profiles for the gate.
"""

REQUIRED_SHOT_FIELDS = (
    "idx", "sceneIdx", "localIdx", "camIdx", "visualDesc",
    "ffDesc", "motionDesc", "audioDesc", "variationType",
)
REQUIRED_CHAR_FIELDS = ("idx", "identifierInScene", "isVisible", "staticFeatures", "dynamicFeatures")
VALID_VARIATIONS = ("large", "medium", "small")
_FF_MIN_LEN = 20  # an ffDesc shorter than this is effectively empty/degenerate


def shotplan_profile(plan):
    """vimax-shotplan/v1 -> structural fingerprint (no free text)."""
    plan = plan if isinstance(plan, dict) else {}
    scenes = plan.get("scenes") or []
    chars = plan.get("characters") or []
    shots = plan.get("shots") or []

    chars_complete = bool(chars) and all(
        isinstance(c, dict)
        and all(k in c for k in REQUIRED_CHAR_FIELDS)
        and str(c.get("identifierInScene") or "").strip()
        and str(c.get("staticFeatures") or "").strip()
        for c in chars
    )

    shot_fields_complete = bool(shots) and all(
        isinstance(s, dict) and all(k in s for k in REQUIRED_SHOT_FIELDS) for s in shots
    )
    idx_contiguous = [int(s.get("idx")) for s in shots if isinstance(s, dict)] == list(range(len(shots)))
    scene_idx_valid = all(0 <= int(s.get("sceneIdx", -1)) < max(len(scenes), 1) for s in shots) if shots else True
    variations = [str(s.get("variationType") or "") for s in shots]
    variations_valid = all(v in VALID_VARIATIONS for v in variations) if shots else True
    variation_dist = {v: variations.count(v) for v in VALID_VARIATIONS}
    # lfDesc must be present exactly for medium/large shots (contract §6).
    lf_gating_ok = all(
        bool("lfDesc" in s and str(s.get("lfDesc") or "").strip()) == (str(s.get("variationType")) in ("medium", "large"))
        for s in shots if isinstance(s, dict)
    ) if shots else True
    ff_nontrivial = all(len(str(s.get("ffDesc") or "").strip()) >= _FF_MIN_LEN for s in shots) if shots else False
    cam_count = len({int(s.get("camIdx", 0)) for s in shots}) if shots else 0

    return {
        "schemaVersion": plan.get("schemaVersion"),
        "sceneCount": len(scenes),
        "charCount": len(chars),
        "charsComplete": chars_complete,
        "shotCount": len(shots),
        "shotFieldsComplete": shot_fields_complete,
        "idxContiguous": idx_contiguous,
        "sceneIdxValid": scene_idx_valid,
        "variationsValid": variations_valid,
        "variationDist": variation_dist,
        "lfGatingOk": lf_gating_ok,
        "ffNonTrivial": ff_nontrivial,
        "camCount": cam_count,
    }


# Structural invariants both sides MUST satisfy independently (contract health).
_HARD_INVARIANTS = (
    "schemaVersion", "charsComplete", "shotFieldsComplete",
    "idxContiguous", "sceneIdxValid", "variationsValid", "lfGatingOk", "ffNonTrivial",
)


def compare_profiles(external, native, *, count_tolerance=2):
    """Compare two structural fingerprints. Returns
    {equivalent: bool, hardFailures: [...], countDeltas: {...}, notes: [...]}.
    Free-text is never compared; counts are compared within a tolerance (LLM
    variance is expected, a wildly different shot count is not)."""
    notes = []
    hard_failures = []

    if external.get("schemaVersion") != "vimax-shotplan/v1":
        hard_failures.append("external.schemaVersion != vimax-shotplan/v1")
    if native.get("schemaVersion") != "vimax-shotplan/v1":
        hard_failures.append("native.schemaVersion != vimax-shotplan/v1")

    # Each side must independently satisfy the structural invariants.
    for side, prof in (("external", external), ("native", native)):
        for inv in _HARD_INVARIANTS:
            if inv == "schemaVersion":
                continue
            if not prof.get(inv):
                hard_failures.append(f"{side}.{inv} is False")

    # Counts compared within tolerance (LLM variance, not a contract break).
    count_deltas = {}
    for key in ("sceneCount", "charCount", "shotCount", "camCount"):
        e, n = external.get(key, 0), native.get(key, 0)
        count_deltas[key] = {"external": e, "native": n, "delta": n - e}
        if abs(n - e) > count_tolerance:
            notes.append(f"{key} differs beyond tolerance: external={e} native={n}")

    equivalent = not hard_failures and not notes
    return {
        "equivalent": equivalent,
        "hardFailures": hard_failures,
        "countDeltas": count_deltas,
        "notes": notes,
    }
