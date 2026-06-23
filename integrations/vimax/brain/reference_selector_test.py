import os, sys, unittest
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from brain.reference_selector import select_reference_images_and_generate_prompt


class FakeChat:
    def __init__(self, reply):
        self.reply = reply
        self.calls = []

    def chat(self, messages, **kw):
        self.calls.append(messages)
        return self.reply


class ReferenceSelectorTest(unittest.TestCase):
    def test_selects_indices_and_returns_prompt(self):
        chat = FakeChat('{"ref_image_indices": [0, 2], "text_prompt": "a wide shot of the hero"}')
        pairs = [("a.png", "hero front"), ("b.png", "villain"), ("c.png", "scene")]
        out = select_reference_images_and_generate_prompt(chat, pairs, "hero enters the hall")
        self.assertEqual(out["text_prompt"], "a wide shot of the hero")
        self.assertEqual(out["reference_image_path_and_text_pairs"], [("a.png", "hero front"), ("c.png", "scene")])
        # System+user messages, user content is an OpenAI content list.
        msgs = chat.calls[-1]
        self.assertEqual(msgs[0]["role"], "system")
        self.assertEqual(msgs[1]["role"], "user")
        self.assertIsInstance(msgs[1]["content"], list)

    def test_out_of_range_index_is_dropped(self):
        chat = FakeChat('{"ref_image_indices": [0, 9], "text_prompt": "x"}')
        pairs = [("a.png", "t0"), ("b.png", "t1")]
        out = select_reference_images_and_generate_prompt(chat, pairs, "desc")
        self.assertEqual(out["reference_image_path_and_text_pairs"], [("a.png", "t0")])


if __name__ == "__main__":
    unittest.main()
