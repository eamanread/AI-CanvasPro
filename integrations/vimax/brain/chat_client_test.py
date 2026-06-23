import io, os, sys, unittest, urllib.error
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from brain import chat_client as cc
from brain.chat_client import GrsaiChatClient


class _Resp:
    def __init__(self, body):
        self._b = body.encode("utf-8")

    def __enter__(self):
        return self

    def __exit__(self, *a):
        return False

    def read(self):
        return self._b


def _http_error(code, body):
    return urllib.error.HTTPError("http://x", code, "err", {}, io.BytesIO(body.encode("utf-8")))


_OVERLOAD_400 = '{"error":{"message":"The model load is too high, please try again later","type":"rix_api_error"}}'
_OK = '{"choices":[{"message":{"content":"hello"}}]}'


class OverloadRetryTest(unittest.TestCase):
    """grsai returns a NON-STANDARD 400 for transient overload; the client must
    ride it out (it killed a native plan mid-decompose in the C5.2 steer run)."""

    def _patched(self, fake):
        orig = cc.urllib.request.urlopen
        cc.urllib.request.urlopen = fake
        self.addCleanup(lambda: setattr(cc.urllib.request, "urlopen", orig))

    def test_grsai_overload_400_is_retried_then_succeeds(self):
        calls = {"n": 0}

        def fake(req, timeout=None):
            calls["n"] += 1
            if calls["n"] == 1:
                raise _http_error(400, _OVERLOAD_400)
            return _Resp(_OK)

        self._patched(fake)
        out = GrsaiChatClient(api_key="k", sleep=lambda s: None).chat([{"role": "user", "content": "hi"}])
        self.assertEqual(out, "hello")
        self.assertEqual(calls["n"], 2, "overload 400 retried once then succeeded")

    def test_plain_400_fails_loudly_without_retry(self):
        calls = {"n": 0}

        def fake(req, timeout=None):
            calls["n"] += 1
            raise _http_error(400, '{"error":{"message":"invalid request"}}')

        self._patched(fake)
        with self.assertRaises(ValueError):
            GrsaiChatClient(api_key="k", sleep=lambda s: None).chat([{"role": "user", "content": "hi"}])
        self.assertEqual(calls["n"], 1, "a plain 400 is a hard client error - no retry")


if __name__ == "__main__":
    unittest.main()
