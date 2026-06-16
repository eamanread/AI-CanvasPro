import unittest

import server


class _Headers:
    def __init__(self, origin):
        self._origin = origin

    def get(self, name, default=""):
        if name.lower() == "origin":
            return self._origin
        return default


class _Handler:
    def __init__(self, origin):
        self.headers = _Headers(origin)
        self.server = type("Server", (), {"server_address": ("127.0.0.1", 8777)})()


class ServerCorsTests(unittest.TestCase):
    def test_dreamina_origins_are_allowed_for_seedance_extension_bridge(self):
        allowed = [
            "https://dreamina.capcut.com",
            "https://www.dreamina.ai",
            "https://jimeng.jianying.com",
        ]

        for origin in allowed:
            with self.subTest(origin=origin):
                self.assertTrue(server._is_allowed_origin(_Handler(origin), origin))


if __name__ == "__main__":
    unittest.main()
