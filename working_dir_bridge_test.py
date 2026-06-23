"""Tests for the native working_dir bridge (B1.3b / C3). Pure I/O, no network -
verifies a native plan re-materializes the exact on-disk layout 成片/定妆 read."""
import json
import os
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "integrations", "vimax"))

from working_dir_bridge import character_to_snake, local_idx_for, persist_native_run  # noqa: E402

CHARS = [
    {"idx": 0, "identifierInScene": "Alice", "isVisible": True, "staticFeatures": "tall", "dynamicFeatures": "red coat"},
    {"idx": 1, "identifierInScene": "Bob", "isVisible": False, "staticFeatures": "short", "dynamicFeatures": "hat"},
]
SCENE0_SHOTS = [
    {"idx": 0, "ff_desc": "Alice waits", "ff_vis_char_idxs": [0], "lf_desc": "", "motion_desc": "m", "audio_desc": "quiet"},
    {"idx": 1, "ff_desc": "Bob arrives", "ff_vis_char_idxs": [1], "lf_desc": "", "motion_desc": "m2", "audio_desc": "steps"},
]
SHOTPLAN = {"schemaVersion": "vimax-shotplan/v1", "flowId": "f", "characters": CHARS,
            "shots": [{"idx": 0, "sceneIdx": 0, "localIdx": 0}, {"idx": 1, "sceneIdx": 0, "localIdx": 1}]}


class CharacterToSnakeTest(unittest.TestCase):
    def test_camel_to_snake_keys(self):
        out = character_to_snake(CHARS[0])
        self.assertEqual(out, {"idx": 0, "identifier_in_scene": "Alice", "is_visible": True,
                               "static_features": "tall", "dynamic_features": "red coat"})

    def test_tolerates_snake_input(self):
        out = character_to_snake({"idx": 3, "identifier_in_scene": "Eve", "is_visible": False,
                                  "static_features": "s", "dynamic_features": "d"})
        self.assertEqual(out["identifier_in_scene"], "Eve")
        self.assertFalse(out["is_visible"])

    def test_missing_fields_default(self):
        out = character_to_snake({})
        self.assertEqual(out["identifier_in_scene"], "")
        self.assertTrue(out["is_visible"])  # default visible

    def test_idx_falls_back_to_position(self):  # review#R5
        self.assertIsNone(character_to_snake({})["idx"], "no idx, no fallback -> None")
        self.assertEqual(character_to_snake({}, 4)["idx"], 4, "fallback used when idx absent")
        self.assertEqual(character_to_snake({"idx": 2}, 4)["idx"], 2, "explicit idx wins over fallback")


class LocalIdxTest(unittest.TestCase):
    def test_uses_own_idx_when_present(self):
        self.assertEqual(local_idx_for({"idx": 5}, 2), 5)

    def test_falls_back_to_position(self):
        self.assertEqual(local_idx_for({}, 3), 3)

    def test_non_int_idx_falls_back(self):
        self.assertEqual(local_idx_for({"idx": "x"}, 4), 4)


class PersistNativeRunTest(unittest.TestCase):
    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.wd = os.path.join(self._tmp.name, "run")

    def tearDown(self):
        self._tmp.cleanup()

    def _read(self, *parts):
        with open(os.path.join(self.wd, *parts), "r", encoding="utf-8") as h:
            return json.load(h)

    def test_writes_shotplan_characters_and_shots(self):
        written = persist_native_run(self.wd, SHOTPLAN, CHARS, [SCENE0_SHOTS])
        # shotplan.json verbatim
        self.assertEqual(self._read("shotplan.json")["schemaVersion"], "vimax-shotplan/v1")
        # per-scene characters.json: snake, ALL chars (not visibility-filtered),
        # idx-ordered so render's positional ff_vis_char_idxs line up
        chars = self._read("scene_0", "characters.json")
        self.assertEqual([c["identifier_in_scene"] for c in chars], ["Alice", "Bob"])
        self.assertFalse(chars[1]["is_visible"], "invisible Bob still present for positional indexing")
        # shot_description.json at localIdx, snake, ff_vis_char_idxs preserved
        sd0 = self._read("scene_0", "shots", "0", "shot_description.json")
        self.assertEqual(sd0["ff_vis_char_idxs"], [0])
        sd1 = self._read("scene_0", "shots", "1", "shot_description.json")
        self.assertEqual(sd1["ff_desc"], "Bob arrives")
        self.assertIn(os.path.join(self.wd, "shotplan.json"), written)

    def test_characters_unfiltered_so_positional_indexing_survives_gaps(self):
        # render does characters[cidx].identifier_in_scene POSITIONALLY, so an
        # invisible character in the MIDDLE must still occupy its slot - else a
        # shot's ff_vis_char_idxs=[0,2] would silently grab the wrong character.
        chars = [
            {"idx": 0, "identifierInScene": "Alice", "isVisible": True, "staticFeatures": "a", "dynamicFeatures": "x"},
            {"idx": 1, "identifierInScene": "Bob", "isVisible": False, "staticFeatures": "b", "dynamicFeatures": "y"},
            {"idx": 2, "identifierInScene": "Carol", "isVisible": True, "staticFeatures": "c", "dynamicFeatures": "z"},
        ]
        shots = [{"idx": 0, "ff_desc": "Alice + Carol", "ff_vis_char_idxs": [0, 2], "lf_desc": "", "motion_desc": "m", "audio_desc": "q"}]
        persist_native_run(self.wd, SHOTPLAN, chars, [shots])
        written_chars = self._read("scene_0", "characters.json")
        self.assertEqual(len(written_chars), 3, "invisible middle char NOT filtered out")
        self.assertEqual([c["identifier_in_scene"] for c in written_chars], ["Alice", "Bob", "Carol"])
        # the exact positional lookups render will perform
        idxs = self._read("scene_0", "shots", "0", "shot_description.json")["ff_vis_char_idxs"]
        self.assertEqual(written_chars[idxs[0]]["identifier_in_scene"], "Alice")
        self.assertEqual(written_chars[idxs[1]]["identifier_in_scene"], "Carol")
        self.assertFalse(written_chars[1]["is_visible"], "Bob present at slot 1 though invisible")

    def test_divergent_idx_writes_at_localidx_not_position(self):
        # LLM emitted a non-contiguous idx: the dir must be the idx (7), so it
        # matches the shotplan's localIdx that render addresses.
        shots = [{"idx": 7, "ff_desc": "x", "ff_vis_char_idxs": []}]
        persist_native_run(self.wd, SHOTPLAN, CHARS, [shots])
        self.assertTrue(os.path.isfile(os.path.join(self.wd, "scene_0", "shots", "7", "shot_description.json")))
        self.assertFalse(os.path.isdir(os.path.join(self.wd, "scene_0", "shots", "0")))

    def test_multi_scene_layout(self):
        persist_native_run(self.wd, SHOTPLAN, CHARS, [SCENE0_SHOTS, [{"idx": 0, "ff_desc": "s2"}]])
        self.assertTrue(os.path.isfile(os.path.join(self.wd, "scene_1", "characters.json")))
        self.assertEqual(self._read("scene_1", "shots", "0", "shot_description.json")["ff_desc"], "s2")

    def test_shotplan_written_even_with_no_scenes(self):
        written = persist_native_run(self.wd, SHOTPLAN, CHARS, [])
        self.assertTrue(os.path.isfile(os.path.join(self.wd, "shotplan.json")))
        self.assertEqual(len(written), 1)  # only shotplan.json

    def test_idx_fallback_applied_through_persist(self):  # review#R5
        chars = [{"identifierInScene": "NoIdx", "isVisible": True}]  # no idx key
        persist_native_run(self.wd, SHOTPLAN, chars, [SCENE0_SHOTS])
        written_chars = self._read("scene_0", "characters.json")
        self.assertEqual(written_chars[0]["idx"], 0, "position used as fallback idx")

    def test_clears_stale_files_from_prior_run(self):  # review#R3
        # a prior plan for this flowId left a generated frame in a scene the new
        # plan no longer has; persist must wipe it so run_render's frame-exists
        # skip can't silently reuse it as the new plan's output.
        stale = os.path.join(self.wd, "scene_5", "shots", "0", "first_frame.png")
        os.makedirs(os.path.dirname(stale), exist_ok=True)
        with open(stale, "w", encoding="utf-8") as h:
            h.write("old frame from a different plan")
        persist_native_run(self.wd, SHOTPLAN, CHARS, [SCENE0_SHOTS])
        self.assertFalse(os.path.exists(stale), "stale frame cleared")
        self.assertFalse(os.path.isdir(os.path.join(self.wd, "scene_5")), "stale scene dir removed")
        self.assertTrue(os.path.isfile(os.path.join(self.wd, "shotplan.json")), "new plan written")
        self.assertTrue(os.path.isfile(os.path.join(self.wd, "scene_0", "characters.json")))

    def test_partial_failure_leaves_no_commit_marker(self):  # review#R2
        # a non-JSON-serializable shot makes a scene write raise; shotplan.json
        # is the commit marker written LAST, so it must be ABSENT -> run_render
        # refuses ("shotplan.json missing") and bills nothing, instead of
        # half-rendering a corrupt plan.
        bad_shots = [{"idx": 0, "ff_desc": "x", "bad": {1, 2, 3}}]  # set: not JSON-serializable
        with self.assertRaises(TypeError):
            persist_native_run(self.wd, SHOTPLAN, CHARS, [bad_shots])
        self.assertFalse(os.path.isfile(os.path.join(self.wd, "shotplan.json")),
                         "no commit marker after partial write")


if __name__ == "__main__":
    unittest.main()
