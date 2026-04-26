import io
import ssl
import tempfile
import unittest
import urllib.error
from unittest.mock import patch

from services.media_file_route_service import MediaFileRouteService


class _FakeHeaders:
    def __init__(self, content_type="image/png"):
        self._content_type = content_type

    def get(self, name, default=None):
        if str(name).lower() == "content-type":
            return self._content_type
        return default


class _FakeResponse:
    def __init__(self, payload=b"pngdata", content_type="image/png"):
        self.headers = _FakeHeaders(content_type)
        self._stream = io.BytesIO(payload)

    def read(self, size=-1):
        return self._stream.read(size)

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, tb):
        return False


class _FakeHandler:
    def __init__(self, body_bytes):
        self.body_bytes = body_bytes


class MediaFileRouteServiceTests(unittest.TestCase):
    def _build_service(self, output_dir):
        return MediaFileRouteService(
            directory=output_dir,
            uploads_dir_getter=lambda: output_dir,
            output_dir_getter=lambda: output_dir,
            max_upload_bytes=1024 * 1024,
            next_output_filename=lambda ext: f"saved.{ext}",
            load_json_file=lambda *args, **kwargs: {},
            atomic_write_json=lambda *args, **kwargs: None,
            read_body=lambda handler: handler.body_bytes,
        )

    def test_save_output_from_url_retries_unverified_ssl_context_after_cert_failure(self):
        with tempfile.TemporaryDirectory() as output_dir:
            service = self._build_service(output_dir)
            handler = _FakeHandler(
                b'{"url":"https://file5.aitohumanize.com/file/mock.png","ext":"png","maxBytes":1048576}'
            )

            ssl_error = urllib.error.URLError(
                ssl.SSLCertVerificationError("certificate verify failed")
            )
            calls = []

            def fake_urlopen(request, timeout=0, context=None):
                calls.append(context)
                if len(calls) == 1:
                    raise ssl_error
                return _FakeResponse()

            with patch(
                "services.media_file_route_service.socket.getaddrinfo",
                return_value=[(None, None, None, None, ("8.8.8.8", 443))],
            ):
                with patch(
                    "services.media_file_route_service.urllib.request.urlopen",
                    side_effect=fake_urlopen,
                ):
                    result = service._handle_save_output_from_url(handler)

            self.assertEqual(result["kind"], "json_ok")
            self.assertEqual(result["data"]["success"], True)
            self.assertEqual(result["data"]["localPath"], "output/saved.png")
            self.assertEqual(result["data"]["url"], "/output/saved.png")
            self.assertEqual(len(calls), 2)
            self.assertIsNone(calls[0])
            self.assertIsNotNone(calls[1])


if __name__ == "__main__":
    unittest.main()
