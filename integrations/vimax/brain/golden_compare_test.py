"""Pure tests for the A3 golden对账 comparator. No network/IO - the real
external-vs-native compare runs in the A3 harness; here we pin the structural
profiling + verdict logic."""
import unittest

from brain import golden_compare as gc


def _shot(idx, scene=0, cam=0, var="small", ff="x" * 30, lf=None):
    s = {"idx": idx, "sceneIdx": scene, "localIdx": idx, "camIdx": cam,
         "visualDesc": "v" * 30, "ffDesc": ff, "motionDesc": "m", "audioDesc": "a",
         "variationType": var}
    if lf is not None:
        s["lfDesc"] = lf
    return s


def _char(idx, name="Alice"):
    return {"idx": idx, "identifierInScene": name, "isVisible": True,
            "staticFeatures": "tall", "dynamicFeatures": "coat"}


def _plan(scenes=1, chars=1, shots=None):
    return {
        "schemaVersion": "vimax-shotplan/v1",
        "scenes": [{"idx": i, "script": "s"} for i in range(scenes)],
        "characters": [_char(i) for i in range(chars)],
        "shots": shots if shots is not None else [_shot(0)],
    }


class ProfileTest(unittest.TestCase):
    def test_healthy_plan_profile(self):
        p = gc.shotplan_profile(_plan(shots=[_shot(0, var="small"), _shot(1, var="medium", lf="end frame")]))
        self.assertEqual(p["schemaVersion"], "vimax-shotplan/v1")
        self.assertEqual(p["shotCount"], 2)
        self.assertTrue(p["charsComplete"])
        self.assertTrue(p["shotFieldsComplete"])
        self.assertTrue(p["idxContiguous"])
        self.assertTrue(p["variationsValid"])
        self.assertTrue(p["lfGatingOk"])
        self.assertTrue(p["ffNonTrivial"])
        self.assertEqual(p["variationDist"], {"large": 0, "medium": 1, "small": 1})

    def test_lf_gating_violation_detected(self):
        # small shot must NOT carry lfDesc; medium WITHOUT lfDesc is also a violation
        bad_small = gc.shotplan_profile(_plan(shots=[_shot(0, var="small", lf="should not be here")]))
        self.assertFalse(bad_small["lfGatingOk"])
        bad_medium = gc.shotplan_profile(_plan(shots=[_shot(0, var="medium")]))  # no lf
        self.assertFalse(bad_medium["lfGatingOk"])

    def test_non_contiguous_idx_and_bad_variation(self):
        p = gc.shotplan_profile(_plan(shots=[_shot(0), _shot(5, var="weird")]))
        self.assertFalse(p["idxContiguous"])
        self.assertFalse(p["variationsValid"])

    def test_degenerate_ff_flagged(self):
        self.assertFalse(gc.shotplan_profile(_plan(shots=[_shot(0, ff="short")]))["ffNonTrivial"])

    def test_incomplete_character_flagged(self):
        plan = _plan()
        plan["characters"][0].pop("staticFeatures")
        self.assertFalse(gc.shotplan_profile(plan)["charsComplete"])


class CompareTest(unittest.TestCase):
    def test_structurally_equivalent_despite_different_text_and_counts(self):
        ext = gc.shotplan_profile(_plan(scenes=1, chars=2, shots=[_shot(0), _shot(1, var="medium", lf="e")]))
        nat = gc.shotplan_profile(_plan(scenes=1, chars=2, shots=[_shot(0), _shot(1, var="small"), _shot(2)]))
        v = gc.compare_profiles(ext, nat)
        self.assertTrue(v["equivalent"], v)
        self.assertEqual(v["hardFailures"], [])
        self.assertEqual(v["countDeltas"]["shotCount"]["delta"], 1)

    def test_hard_failure_when_native_breaks_contract(self):
        ext = gc.shotplan_profile(_plan(shots=[_shot(0)]))
        bad = gc.shotplan_profile(_plan(shots=[_shot(0, var="weird")]))  # variationsValid False
        v = gc.compare_profiles(ext, bad)
        self.assertFalse(v["equivalent"])
        self.assertIn("native.variationsValid is False", v["hardFailures"])

    def test_count_beyond_tolerance_is_a_note_not_equivalent(self):
        ext = gc.shotplan_profile(_plan(shots=[_shot(i) for i in range(2)]))
        nat = gc.shotplan_profile(_plan(shots=[_shot(i) for i in range(8)]))
        v = gc.compare_profiles(ext, nat, count_tolerance=2)
        self.assertFalse(v["equivalent"])
        self.assertTrue(any("shotCount" in n for n in v["notes"]))


if __name__ == "__main__":
    unittest.main()
