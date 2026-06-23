import os, sys, unittest
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))  # integrations/vimax
from brain.image_gen import ImageGeneratorGrsai, ImageOutput


class ExtractUrlTest(unittest.TestCase):
    def setUp(self):
        self.gen = ImageGeneratorGrsai(api_key="t", base_url="http://x/api/v2/vimax/draw")

    def test_broker_single_json_indented(self):
        body = '{\n  "status": "succeeded",\n  "results": [{"url": "https://b/1.png"}]\n}'
        self.assertEqual(self.gen._extract_url(body), "https://b/1.png")

    def test_broker_failed_envelope_raises_with_reason(self):
        body = '{"status": "failed", "failure_reason": "HY_TICKET_CAP_EXCEEDED: over cap"}'
        with self.assertRaises(ValueError) as ctx:
            self.gen._extract_url(body)
        self.assertIn("HY_TICKET_CAP_EXCEEDED", str(ctx.exception))

    def test_direct_grsai_sse_stream(self):
        body = ('data: {"status":"running"}\n'
                'data: {"status":"running"}\n'
                'data: {"status":"succeeded","results":[{"url":"https://b/2.png"}]}\n')
        self.assertEqual(self.gen._extract_url(body), "https://b/2.png")

    def test_no_url_raises(self):
        with self.assertRaises(ValueError):
            self.gen._extract_url('data: {"status":"running"}\n')


class SubmitUrllibTest(unittest.TestCase):
    def test_submit_posts_via_urllib_and_buffers_stream(self):
        gen = ImageGeneratorGrsai(api_key="tkt", base_url="http://h/api/v2/vimax/draw")
        captured = {}

        class FakeResp:
            def __enter__(self): return self
            def __exit__(self, *a): return False
            def __iter__(self):
                yield b'data: {"status":"running"}\n'
                yield b'data: {"status":"succeeded","results":[{"url":"https://b/3.png"}]}\n'

        def fake_urlopen(request, timeout=None):
            captured["url"] = request.full_url
            captured["method"] = request.get_method()
            captured["auth"] = request.headers.get("Authorization")
            captured["body"] = request.data
            return FakeResp()

        import brain.image_gen as ig
        orig = ig.urllib.request.urlopen
        ig.urllib.request.urlopen = fake_urlopen
        try:
            url = gen._submit_and_poll({"model": "nano-banana-2", "prompt": "p", "cost": 1})
        finally:
            ig.urllib.request.urlopen = orig
        self.assertEqual(url, "https://b/3.png")
        self.assertEqual(captured["method"], "POST")
        self.assertEqual(captured["auth"], "Bearer tkt")
        # "cost" key is filtered out of the body (broker parity).
        self.assertNotIn(b"cost", captured["body"])


if __name__ == "__main__":
    unittest.main()
