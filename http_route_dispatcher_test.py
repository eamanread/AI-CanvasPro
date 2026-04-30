import unittest

from services.http_route_dispatcher import HttpRouteDispatcher


class _StubRouteService:
    def __init__(self, *, get_response=None, post_response=None, delete_response=None, patch_response=None):
        self.get_response = get_response
        self.post_response = post_response
        self.delete_response = delete_response
        self.patch_response = patch_response
        self.post_calls = []

    def handle_get(self, handler, path):
        return self.get_response

    def handle_post(self, handler, path, body):
        self.post_calls.append((path, body))
        return self.post_response

    def handle_delete(self, handler, path):
        return self.delete_response

    def handle_patch(self, handler, path, body):
        return self.patch_response


class HttpRouteDispatcherTests(unittest.TestCase):
    def _build_dispatcher(self, *, json_service, library_service, read_body):
        return HttpRouteDispatcher(
            local_version="test",
            is_dev_build=lambda: True,
            is_advanced_mode=lambda: False,
            subscription_client_getter=lambda: None,
            subscription_gate_service_getter=lambda: None,
            config_route_service_getter=lambda: _StubRouteService(),
            json_file_route_service_getter=lambda: json_service,
            library_file_route_service_getter=lambda: library_service,
            media_file_route_service_getter=lambda: _StubRouteService(),
            local_media_processing_route_service_getter=lambda: _StubRouteService(),
            remote_proxy_route_service_getter=lambda: _StubRouteService(),
            dreamina_route_service_getter=lambda: _StubRouteService(),
            sam3_route_service_getter=lambda: _StubRouteService(),
            update_service_getter=lambda: None,
            smart_clip_cleanup=lambda: None,
            smart_clip_jobs={},
            smart_clip_lock=None,
            sub_status_none="none",
            sub_error_invalid_arguments="INVALID_ARGUMENTS",
            default_sub_contact_text="",
            default_sub_contact_url="",
            json_ok=lambda handler, payload: payload,
            json_err=lambda handler, code, message: {"code": code, "message": message},
            send_route_response=lambda handler, response: None,
            read_body=read_body,
        )

    def test_preset_dev_save_body_is_only_read_for_library_route(self):
        json_service = _StubRouteService()
        library_service = _StubRouteService(
            post_response={
                "kind": "json_ok",
                "data": {"success": True},
            }
        )
        read_calls = []

        def read_body(_handler):
            read_calls.append("read")
            return b'{"nodeType":"ai-image"}'

        dispatcher = self._build_dispatcher(
            json_service=json_service,
            library_service=library_service,
            read_body=read_body,
        )

        handled = dispatcher.handle_post(handler=None, path="/api/v2/user/presets/dev/save")

        self.assertTrue(handled)
        self.assertEqual(read_calls, ["read"])
        self.assertEqual(json_service.post_calls[0][1], b"")
        self.assertEqual(
            library_service.post_calls[0][1],
            b'{"nodeType":"ai-image"}',
        )

    def test_preset_definitions_save_body_is_only_read_for_library_route(self):
        json_service = _StubRouteService()
        library_service = _StubRouteService(
            post_response={
                "kind": "json_ok",
                "data": {"success": True},
            }
        )
        read_calls = []

        def read_body(_handler):
            read_calls.append("read")
            return b'{"definitions":{"ai-image":[]}}'

        dispatcher = self._build_dispatcher(
            json_service=json_service,
            library_service=library_service,
            read_body=read_body,
        )

        handled = dispatcher.handle_post(
            handler=None,
            path="/api/v2/user/presets/definitions/save",
        )

        self.assertTrue(handled)
        self.assertEqual(read_calls, ["read"])
        self.assertEqual(json_service.post_calls[0][1], b"")
        self.assertEqual(
            library_service.post_calls[0][1],
            b'{"definitions":{"ai-image":[]}}',
        )


if __name__ == "__main__":
    unittest.main()
