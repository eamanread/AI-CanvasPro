import json, os, sys, tempfile, unittest
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from brain import render_runner


class FakeChat:
    def chat(self, messages, **kw):
        # selector asks first; judge asks with images. Return selector JSON for
        # the selector call (has <FRAME_DESC>), accept for the judge call.
        blob = json.dumps(messages)
        if "TARGET_DESCRIPTION_START" in blob:
            return '{"acceptable": true, "issues": ""}'
        return '{"ref_image_indices": [], "text_prompt": "a shot"}'


class FakeOut:
    data = "https://b/f.png"

    def save(self, path):
        with open(path, "wb") as h:
            h.write(b"\x89PNG stub")


class FakeImg:
    def __init__(self):
        self.n = 0

    def generate_single_image(self, prompt, reference_image_paths=None, **kw):
        self.n += 1
        return FakeOut()


def _seed(working_dir):
    shotplan = {"schemaVersion": "vimax-shotplan/v1", "flowId": "f1",
                "scenes": [{"idx": 0}], "characters": [],
                "shots": [{"idx": 0, "sceneIdx": 0, "localIdx": 0, "camIdx": 0,
                           "variationType": "small", "ffDesc": "hero enters the grand hall at dusk"}]}
    with open(os.path.join(working_dir, "shotplan.json"), "w", encoding="utf-8") as h:
        json.dump(shotplan, h)
    shot_dir = os.path.join(working_dir, "scene_0", "shots", "0")
    os.makedirs(shot_dir, exist_ok=True)
    with open(os.path.join(shot_dir, "shot_description.json"), "w", encoding="utf-8") as h:
        json.dump({"ff_desc": "hero enters the grand hall at dusk", "ff_vis_char_idxs": []}, h)
    with open(os.path.join(working_dir, "scene_0", "characters.json"), "w", encoding="utf-8") as h:
        json.dump([], h)
    with open(os.path.join(working_dir, "scene_0", "character_portraits_registry.json"), "w", encoding="utf-8") as h:
        json.dump({}, h)


class RenderRunnerTest(unittest.TestCase):
    def test_single_shot_render_writes_result(self):
        with tempfile.TemporaryDirectory() as wd:
            _seed(wd)
            img = FakeImg()
            result = render_runner.run_render(
                working_dir=wd, flow_id="f1", chat_client=FakeChat(), image_gen=img,
                retry_budget=2, max_reshoots_per_shot=1)
            self.assertEqual(result["schemaVersion"], "vimax-render-result/v1")
            self.assertEqual(len(result["outputs"]), 1)
            self.assertEqual(result["outputs"][0].get("url"), "https://b/f.png")
            self.assertEqual(img.n, 1)  # no reshoot (judge accepted)
            self.assertTrue(os.path.isfile(os.path.join(wd, "result.json")))

    def test_cache_skip_when_frame_exists(self):
        with tempfile.TemporaryDirectory() as wd:
            _seed(wd)
            # pre-create first_frame.png so the shot is cache-skipped (no draw).
            with open(os.path.join(wd, "scene_0", "shots", "0", "first_frame.png"), "wb") as h:
                h.write(b"\x89PNG cached")
            img = FakeImg()
            result = render_runner.run_render(
                working_dir=wd, flow_id="f1", chat_client=FakeChat(), image_gen=img,
                retry_budget=2)
            self.assertEqual(img.n, 0)  # no draw - cache hit
            self.assertTrue(result["outputs"][0].get("skipped"))

    def test_cancel_at_shot_boundary_returns_partial(self):
        with tempfile.TemporaryDirectory() as wd:
            _seed(wd)
            img = FakeImg()
            result = render_runner.run_render(
                working_dir=wd, flow_id="f1", chat_client=FakeChat(), image_gen=img,
                retry_budget=0, should_cancel=lambda: True)
            self.assertTrue(result.get("cancelled"))
            self.assertEqual(img.n, 0)


class _PortraitImg:
    def __init__(self):
        self.calls = []  # one entry per draw = its reference_image_paths

    def generate_single_image(self, prompt, reference_image_paths=None, **kw):
        self.calls.append(list(reference_image_paths or []))

        class Out:
            data = "https://b/p.png"

            def save(self, path):
                with open(path, "wb") as h:
                    h.write(b"\x89PNG stub")
        return Out()


def _seed_portraits(working_dir):
    shotplan = {"schemaVersion": "vimax-shotplan/v1", "flowId": "f1",
                "scenes": [{"idx": 0}],
                "characters": [{"idx": 0, "identifierInScene": "Alice", "isVisible": True,
                                "staticFeatures": "tall, blue eyes", "dynamicFeatures": "red coat"}],
                "shots": [{"idx": 0, "sceneIdx": 0, "localIdx": 0}]}
    with open(os.path.join(working_dir, "shotplan.json"), "w", encoding="utf-8") as h:
        json.dump(shotplan, h)


class PortraitsRunnerTest(unittest.TestCase):
    def test_three_views_with_reference_chain_and_registry(self):
        with tempfile.TemporaryDirectory() as wd:
            _seed_portraits(wd)
            img = _PortraitImg()
            result = render_runner.run_portraits(
                working_dir=wd, flow_id="f1", image_gen=img, style="anime")
            self.assertEqual(result["schemaVersion"], "vimax-portraits-result/v1")
            self.assertEqual(len(result["characters"]), 1)
            self.assertEqual(len(result["characters"][0]["views"]), 3)
            self.assertEqual(img.calls and len(img.calls), 3)  # front/side/back
            self.assertEqual(img.calls[0], [], "front uses NO reference")
            self.assertTrue(img.calls[1][0].endswith("front.png"), "side references front")
            self.assertTrue(img.calls[2][0].endswith("front.png"), "back references front")
            # registry written at the flow root + scene dir, with urls.
            reg_path = os.path.join(wd, "character_portraits_registry.json")
            self.assertTrue(os.path.isfile(reg_path))
            with open(reg_path, "r", encoding="utf-8") as h:
                reg = json.load(h)
            self.assertIn("Alice", reg)
            self.assertEqual(reg["Alice"]["front"]["url"], "https://b/p.png")
            self.assertEqual(reg["Alice"]["front"]["description"], "A front view portrait of Alice.")
            self.assertTrue(os.path.isfile(os.path.join(wd, "scene_0", "character_portraits_registry.json")))
            self.assertTrue(os.path.isfile(os.path.join(wd, "result.json")))

    def test_no_visible_characters_raises(self):
        with tempfile.TemporaryDirectory() as wd:
            shotplan = {"schemaVersion": "vimax-shotplan/v1", "flowId": "f1", "scenes": [{"idx": 0}],
                        "characters": [{"idx": 0, "identifierInScene": "Ghost", "isVisible": False}], "shots": []}
            with open(os.path.join(wd, "shotplan.json"), "w", encoding="utf-8") as h:
                json.dump(shotplan, h)
            with self.assertRaises(ValueError):
                render_runner.run_portraits(working_dir=wd, flow_id="f1", image_gen=_PortraitImg())


if __name__ == "__main__":
    unittest.main()
