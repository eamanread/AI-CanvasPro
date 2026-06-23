import os, sys, unittest
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from brain.render_compare import (
    render_result_profile, portraits_result_profile,
    compare_render_profiles, compare_portraits_profiles,
)

RENDER_OK = {"schemaVersion": "vimax-render-result/v1", "outputs": [
    {"shotIdx": 0, "url": "https://g/0.png"}, {"shotIdx": 1, "url": "https://g/1.png"}]}
PORTRAITS_OK = {"schemaVersion": "vimax-portraits-result/v1", "characters": [
    {"idx": 0, "identifier": "A", "views": [
        {"view": "front", "url": "u0f"}, {"view": "side", "url": "u0s"}, {"view": "back", "url": "u0b"}]}]}


class RenderProfileTest(unittest.TestCase):
    def test_profile_and_equivalent(self):
        p = render_result_profile(RENDER_OK)
        self.assertEqual(p["producedCount"], 2)
        self.assertTrue(p["allHaveUrl"])
        self.assertTrue(compare_render_profiles(p, p)["equivalent"])

    def test_schema_mismatch_is_hard_failure(self):
        bad = render_result_profile({"schemaVersion": "x", "outputs": [{"url": "u"}]})
        v = compare_render_profiles(render_result_profile(RENDER_OK), bad)
        self.assertFalse(v["equivalent"])
        self.assertTrue(v["hardFailures"])

    def test_missing_url_is_hard_failure(self):
        bad = render_result_profile({"schemaVersion": "vimax-render-result/v1", "outputs": [{"shotIdx": 0}]})
        self.assertFalse(bad["allHaveUrl"])
        self.assertFalse(compare_render_profiles(render_result_profile(RENDER_OK), bad)["equivalent"])

    def test_count_delta_beyond_tolerance_not_equivalent(self):
        big = {"schemaVersion": "vimax-render-result/v1", "outputs": [{"url": f"u{i}"} for i in range(5)]}
        v = compare_render_profiles(render_result_profile(RENDER_OK), render_result_profile(big), count_tolerance=1)
        self.assertFalse(v["equivalent"])  # 2 vs 5
        self.assertTrue(v["notes"])

    def test_skipped_output_does_not_need_url(self):
        sk = {"schemaVersion": "vimax-render-result/v1",
              "outputs": [{"shotIdx": 0, "url": "u"}, {"shotIdx": 1, "skipped": True}]}
        p = render_result_profile(sk)
        self.assertTrue(p["allHaveUrl"])
        self.assertEqual(p["producedCount"], 1)

    def test_allHaveUrl_false_when_nothing_produced(self):  # review fix #2
        # an all-error result has producedCount 0 -> allHaveUrl must be False, not
        # vacuously True via all([]).
        p = render_result_profile({"schemaVersion": "vimax-render-result/v1",
                                   "outputs": [{"shotIdx": 0, "error": "boom"}]})
        self.assertEqual(p["producedCount"], 0)
        self.assertFalse(p["allHaveUrl"])

    def test_compare_render_none_safe(self):  # review fix #1
        v = compare_render_profiles(None, render_result_profile(RENDER_OK))
        self.assertFalse(v["equivalent"])  # None side fails the schema invariant
        self.assertTrue(v["hardFailures"])


class PortraitsProfileTest(unittest.TestCase):
    def test_profile_and_equivalent(self):
        p = portraits_result_profile(PORTRAITS_OK)
        self.assertEqual(p["viewsPerChar"], [3])
        self.assertTrue(p["allViewsHaveUrl"])
        self.assertTrue(compare_portraits_profiles(p, p)["equivalent"])

    def test_missing_view_url_is_hard_failure(self):
        bad = {"schemaVersion": "vimax-portraits-result/v1", "characters": [
            {"idx": 0, "views": [{"view": "front", "url": "u"}, {"view": "side", "url": ""}, {"view": "back", "url": "u"}]}]}
        p = portraits_result_profile(bad)
        self.assertFalse(p["allViewsHaveUrl"])
        self.assertFalse(compare_portraits_profiles(portraits_result_profile(PORTRAITS_OK), p)["equivalent"])

    def test_incomplete_view_set_is_hard_failure(self):
        two = {"schemaVersion": "vimax-portraits-result/v1", "characters": [
            {"idx": 0, "views": [{"view": "front", "url": "u"}, {"view": "side", "url": "u"}]}]}
        v = compare_portraits_profiles(portraits_result_profile(PORTRAITS_OK), portraits_result_profile(two))
        self.assertFalse(v["equivalent"])

    def test_allViewsHaveUrl_false_when_nothing_produced(self):  # review fix #2
        p = portraits_result_profile({"schemaVersion": "vimax-portraits-result/v1",
                                      "characters": [{"idx": 0, "error": "boom"}]})
        self.assertEqual(p["producedCharCount"], 0)
        self.assertFalse(p["allViewsHaveUrl"])

    def test_compare_portraits_none_safe(self):  # review fix #1
        v = compare_portraits_profiles(portraits_result_profile(PORTRAITS_OK), None)
        self.assertFalse(v["equivalent"])
        self.assertTrue(v["hardFailures"])


if __name__ == "__main__":
    unittest.main()
