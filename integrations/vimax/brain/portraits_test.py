import os, sys, unittest
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from brain.portraits import CharacterPortraitsGenerator


class FakeImg:
    def __init__(self):
        self.calls = []

    def generate_single_image(self, prompt, reference_image_paths=None, **kw):
        self.calls.append({"prompt": prompt, "refs": list(reference_image_paths or [])})

        class Out:
            data = "https://b/p.png"

            def save(self, path):
                pass
        return Out()


class PortraitsTest(unittest.TestCase):
    def setUp(self):
        self.img = FakeImg()
        self.gen = CharacterPortraitsGenerator(self.img)
        self.char = {"idx": 0, "identifier_in_scene": "Alice",
                     "static_features": "tall, blue eyes", "dynamic_features": "red coat"}

    def test_front_has_no_reference(self):
        self.gen.generate_front_portrait(self.char, "anime")
        self.assertEqual(self.img.calls[-1]["refs"], [])
        self.assertIn("Alice", self.img.calls[-1]["prompt"])
        self.assertIn("anime", self.img.calls[-1]["prompt"])

    def test_side_and_back_reference_front(self):
        self.gen.generate_side_portrait(self.char, "front.png")
        self.assertEqual(self.img.calls[-1]["refs"], ["front.png"])
        self.gen.generate_back_portrait(self.char, "front.png")
        self.assertEqual(self.img.calls[-1]["refs"], ["front.png"])


if __name__ == "__main__":
    unittest.main()
