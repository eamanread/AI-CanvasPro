import unittest

from services.http_route_dispatcher import HttpRouteDispatcher


class _StubRouteService:
    def __init__(self, *, get_response=None, post_response=None, delete_response=None, patch_response=None):
        self.get_response = get_response
        self.post_response = post_response
        self.delete_response = delete_response
        self.patch_response = patch_response
        self.get_calls = []
        self.post_calls = []
        self.delete_calls = []
        self.patch_calls = []

    def handle_get(self, handler, path):
        self.get_calls.append(path)
        return self.get_response

    def handle_post(self, handler, path, body):
        self.post_calls.append((path, body))
        return self.post_response

    def handle_delete(self, handler, path):
        self.delete_calls.append(path)
        return self.delete_response

    def handle_patch(self, handler, path, body):
        self.patch_calls.append((path, body))
        return self.patch_response


class _ThrowingRouteService:
    def handle_get(self, handler, path):
        raise RuntimeError("apiKey=secret")

    def handle_post(self, handler, path, body):
        raise RuntimeError("apiKey=secret")


class HttpRouteDispatcherTests(unittest.TestCase):
    def _build_dispatcher(
        self,
        *,
        json_service,
        library_service,
        read_body,
        runtime_paths_getter=None,
        dreamina_service=None,
        seedance_service=None,
        canvas_agent_service=None,
        vimax_service=None,
        sent_responses=None,
        sent_errors=None,
        library_status_getter=None,
    ):
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
            dreamina_route_service_getter=lambda: dreamina_service or _StubRouteService(),
            seedance_web_route_service_getter=lambda: seedance_service or _StubRouteService(),
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
            json_err=lambda handler, code, message: (
                sent_errors.append({"code": code, "message": message})
                if sent_errors is not None
                else {"code": code, "message": message}
            ),
            send_route_response=lambda handler, response: (
                sent_responses.append(response) if sent_responses is not None else None
            ),
            read_body=read_body,
            runtime_paths_getter=runtime_paths_getter,
            canvas_agent_route_service_getter=lambda: canvas_agent_service or _StubRouteService(),
            vimax_route_service_getter=lambda: vimax_service or _StubRouteService(),
            library_status_getter=library_status_getter,
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

    def test_runtime_info_includes_distribution_and_storage_fields(self):
        dispatcher = self._build_dispatcher(
            json_service=_StubRouteService(),
            library_service=_StubRouteService(),
            read_body=lambda _handler: b"",
            runtime_paths_getter=lambda: {
                "distribution": "onefile",
                "writableRoot": "C:/Users/example/AppData/Local/AI-CanvasPro",
                "userDir": "C:/Users/example/AppData/Local/AI-CanvasPro/user",
                "outputDir": "C:/Users/example/AppData/Local/AI-CanvasPro/output",
                "uploadsDir": "C:/Users/example/AppData/Local/AI-CanvasPro/data/uploads",
            },
        )

        payload = dispatcher._runtime_info_payload()

        self.assertTrue(payload["success"])
        self.assertEqual(payload["distribution"], "onefile")
        self.assertTrue(payload["isPackaged"])
        self.assertTrue(payload["isOnefile"])
        self.assertEqual(
            payload["storage"]["userDir"],
            "C:/Users/example/AppData/Local/AI-CanvasPro/user",
        )

    def test_library_status_get_returns_status_payload_as_json_ok(self):
        captured = {}
        status_payload = {
            "reachable": True,
            "writable": True,
            "counts": {"assets": 3, "workflows": 2, "presets": 1},
        }

        def fake_status_getter():
            captured["called"] = captured.get("called", 0) + 1
            return status_payload

        dispatcher = self._build_dispatcher(
            json_service=_StubRouteService(),
            library_service=_StubRouteService(),
            read_body=lambda _handler: b"",
            library_status_getter=fake_status_getter,
        )

        result = dispatcher.handle_get(handler=None, path="/api/v2/library/status")

        self.assertTrue(result)
        self.assertEqual(captured.get("called"), 1)
        # _json_ok stub returns the payload it was handed, so we can assert on it
        self.assertEqual(
            dispatcher._library_status_payload(),
            status_payload,
        )

    def test_library_status_get_does_not_reach_json_file_route(self):
        json_service = _StubRouteService(
            get_response={"kind": "json_ok", "data": {"should": "not be used"}}
        )
        sent_responses = []
        dispatcher = self._build_dispatcher(
            json_service=json_service,
            library_service=_StubRouteService(),
            read_body=lambda _handler: b"",
            library_status_getter=lambda: {
                "reachable": False,
                "writable": False,
                "counts": {"assets": 0, "workflows": 0, "presets": 0},
            },
            sent_responses=sent_responses,
        )

        handled = dispatcher.handle_get(handler=None, path="/api/v2/library/status")

        self.assertTrue(handled)
        # library/status is matched before the json-file route fallthrough
        self.assertEqual(json_service.get_calls, [])

    def test_library_status_payload_falls_back_to_empty_when_getter_unset(self):
        dispatcher = self._build_dispatcher(
            json_service=_StubRouteService(),
            library_service=_StubRouteService(),
            read_body=lambda _handler: b"",
            library_status_getter=None,
        )

        self.assertEqual(dispatcher._library_status_payload(), {})

    def test_seedance_web_post_body_is_only_read_for_seedance_route(self):
        seedance_service = _StubRouteService(
            post_response={
                "kind": "json_ok",
                "data": {"success": True},
            }
        )
        dreamina_service = _StubRouteService()
        read_calls = []

        def read_body(_handler):
            read_calls.append("read")
            return b'{"force":true}'

        dispatcher = self._build_dispatcher(
            json_service=_StubRouteService(),
            library_service=_StubRouteService(),
            read_body=read_body,
            seedance_service=seedance_service,
            dreamina_service=dreamina_service,
        )

        handled = dispatcher.handle_post(handler=None, path="/api/v2/seedance-web/login")

        self.assertTrue(handled)
        self.assertEqual(read_calls, ["read"])
        self.assertEqual(seedance_service.post_calls[0][1], b'{"force":true}')
        self.assertEqual(dreamina_service.post_calls, [])

    def test_canvas_agent_post_reads_body_once_sends_response_and_returns_true(self):
        canvas_agent_service = _StubRouteService(
            post_response={
                "kind": "json_ok",
                "data": {"success": True},
            }
        )
        sent_responses = []
        read_calls = []

        def read_body(_handler):
            read_calls.append("read")
            return b'{"message":"hello"}'

        dispatcher = self._build_dispatcher(
            json_service=_StubRouteService(),
            library_service=_StubRouteService(),
            read_body=read_body,
            canvas_agent_service=canvas_agent_service,
            sent_responses=sent_responses,
        )

        handled = dispatcher.handle_post(handler=None, path="/api/v2/canvas-agent/chat")

        self.assertTrue(handled)
        self.assertEqual(read_calls, ["read"])
        self.assertEqual(
            canvas_agent_service.post_calls,
            [("/api/v2/canvas-agent/chat", b'{"message":"hello"}')],
        )
        self.assertEqual(sent_responses, [{"kind": "json_ok", "data": {"success": True}}])

    def test_canvas_agent_status_get_sends_response_and_returns_true(self):
        canvas_agent_service = _StubRouteService(
            get_response={
                "kind": "json_ok",
                "data": {"success": True, "status": "ready"},
            }
        )
        sent_responses = []
        dispatcher = self._build_dispatcher(
            json_service=_StubRouteService(),
            library_service=_StubRouteService(),
            read_body=lambda _handler: b"",
            canvas_agent_service=canvas_agent_service,
            sent_responses=sent_responses,
        )

        handled = dispatcher.handle_get(handler=None, path="/api/v2/canvas-agent/status")

        self.assertTrue(handled)
        self.assertEqual(
            sent_responses,
            [{"kind": "json_ok", "data": {"success": True, "status": "ready"}}],
        )

    def test_canvas_agent_conversations_get_delegates_to_route_service(self):
        canvas_agent_service = _StubRouteService(
            get_response={
                "kind": "json_ok",
                "data": {"success": True, "conversations": []},
            }
        )
        sent_responses = []
        dispatcher = self._build_dispatcher(
            json_service=_StubRouteService(),
            library_service=_StubRouteService(),
            read_body=lambda _handler: b"",
            canvas_agent_service=canvas_agent_service,
            sent_responses=sent_responses,
        )

        handled = dispatcher.handle_get(handler=None, path="/api/v2/canvas-agent/conversations")

        self.assertTrue(handled)
        self.assertEqual(canvas_agent_service.get_calls, ["/api/v2/canvas-agent/conversations"])
        self.assertEqual(sent_responses[0]["data"]["conversations"], [])

    def test_canvas_agent_sync_get_and_post_are_allowed(self):
        canvas_agent_service = _StubRouteService(
            get_response={
                "kind": "json_ok",
                "data": {"success": True, "snapshot": {"schemaVersion": "canvas-agent-sync-v1"}},
            },
            post_response={
                "kind": "json_ok",
                "data": {"success": True, "result": {"importedConversations": 1}},
            },
        )
        sent_responses = []
        read_calls = []

        def read_body(_handler):
            read_calls.append("read")
            return b'{"projectId":"project-a","snapshot":{}}'

        dispatcher = self._build_dispatcher(
            json_service=_StubRouteService(),
            library_service=_StubRouteService(),
            read_body=read_body,
            canvas_agent_service=canvas_agent_service,
            sent_responses=sent_responses,
        )

        self.assertTrue(dispatcher.handle_get(handler=None, path="/api/v2/canvas-agent/sync/project"))
        self.assertTrue(dispatcher.handle_post(handler=None, path="/api/v2/canvas-agent/sync/project"))

        self.assertEqual(canvas_agent_service.get_calls, ["/api/v2/canvas-agent/sync/project"])
        self.assertEqual(
            canvas_agent_service.post_calls,
            [("/api/v2/canvas-agent/sync/project", b'{"projectId":"project-a","snapshot":{}}')],
        )
        self.assertEqual(read_calls, ["read"])

    def test_canvas_agent_stream_post_and_conversation_post_are_allowed(self):
        canvas_agent_service = _StubRouteService(
            post_response={
                "kind": "json_ok",
                "data": {"success": True},
            }
        )
        sent_responses = []
        read_calls = []

        def read_body(_handler):
            read_calls.append("read")
            return b'{"message":"hello"}'

        dispatcher = self._build_dispatcher(
            json_service=_StubRouteService(),
            library_service=_StubRouteService(),
            read_body=read_body,
            canvas_agent_service=canvas_agent_service,
            sent_responses=sent_responses,
        )

        self.assertTrue(dispatcher.handle_post(handler=None, path="/api/v2/canvas-agent/chat/stream"))
        self.assertTrue(dispatcher.handle_post(handler=None, path="/api/v2/canvas-agent/conversations"))

        self.assertEqual(read_calls, ["read", "read"])
        self.assertEqual(
            [call[0] for call in canvas_agent_service.post_calls],
            ["/api/v2/canvas-agent/chat/stream", "/api/v2/canvas-agent/conversations"],
        )

    def test_canvas_agent_conversation_patch_and_delete_are_delegated(self):
        canvas_agent_service = _StubRouteService(
            patch_response={"kind": "json_ok", "data": {"success": True}},
            delete_response={"kind": "json_ok", "data": {"success": True}},
        )
        sent_responses = []
        read_calls = []

        def read_body(_handler):
            read_calls.append("read")
            return b'{"title":"Renamed"}'

        dispatcher = self._build_dispatcher(
            json_service=_StubRouteService(),
            library_service=_StubRouteService(),
            read_body=read_body,
            canvas_agent_service=canvas_agent_service,
            sent_responses=sent_responses,
        )

        self.assertTrue(dispatcher.handle_patch(handler=None, path="/api/v2/canvas-agent/conversations/conv-1"))
        self.assertTrue(dispatcher.handle_delete(handler=None, path="/api/v2/canvas-agent/conversations/conv-1"))

        self.assertEqual(read_calls, ["read"])
        self.assertEqual(
            canvas_agent_service.patch_calls,
            [("/api/v2/canvas-agent/conversations/conv-1", b'{"title":"Renamed"}')],
        )
        self.assertEqual(canvas_agent_service.delete_calls, ["/api/v2/canvas-agent/conversations/conv-1"])

    def test_canvas_agent_execution_routes_are_allowed(self):
        canvas_agent_service = _StubRouteService(
            get_response={"kind": "json_ok", "data": {"success": True, "executions": []}},
            post_response={"kind": "json_ok", "data": {"success": True, "execution": {"id": "exec-1"}}},
            patch_response={"kind": "json_ok", "data": {"success": True, "execution": {"id": "exec-1"}}},
            delete_response={"kind": "json_ok", "data": {"success": True, "cleared": 1}},
        )
        sent_responses = []
        read_calls = []

        def read_body(_handler):
            read_calls.append("read")
            return b'{"status":"completed"}'

        dispatcher = self._build_dispatcher(
            json_service=_StubRouteService(),
            library_service=_StubRouteService(),
            read_body=read_body,
            canvas_agent_service=canvas_agent_service,
            sent_responses=sent_responses,
        )

        self.assertTrue(dispatcher.handle_get(handler=None, path="/api/v2/canvas-agent/executions"))
        self.assertTrue(dispatcher.handle_get(handler=None, path="/api/v2/canvas-agent/executions/exec-1"))
        self.assertTrue(dispatcher.handle_post(handler=None, path="/api/v2/canvas-agent/executions"))
        self.assertTrue(dispatcher.handle_post(handler=None, path="/api/v2/canvas-agent/executions/exec-1/timeline"))
        self.assertTrue(dispatcher.handle_patch(handler=None, path="/api/v2/canvas-agent/executions/exec-1/status"))
        self.assertTrue(dispatcher.handle_patch(handler=None, path="/api/v2/canvas-agent/executions/exec-1/queue-control"))
        self.assertTrue(dispatcher.handle_delete(handler=None, path="/api/v2/canvas-agent/executions"))

        self.assertEqual(
            canvas_agent_service.get_calls,
            ["/api/v2/canvas-agent/executions", "/api/v2/canvas-agent/executions/exec-1"],
        )
        self.assertEqual(
            [call[0] for call in canvas_agent_service.post_calls],
            ["/api/v2/canvas-agent/executions", "/api/v2/canvas-agent/executions/exec-1/timeline"],
        )
        self.assertEqual(
            canvas_agent_service.patch_calls,
            [
                ("/api/v2/canvas-agent/executions/exec-1/status", b'{"status":"completed"}'),
                ("/api/v2/canvas-agent/executions/exec-1/queue-control", b'{"status":"completed"}'),
            ],
        )
        self.assertEqual(canvas_agent_service.delete_calls, ["/api/v2/canvas-agent/executions"])
        self.assertEqual(read_calls, ["read", "read", "read", "read"])

    def test_canvas_agent_post_exception_returns_generic_error(self):
        sent_errors = []
        dispatcher = self._build_dispatcher(
            json_service=_StubRouteService(),
            library_service=_StubRouteService(),
            read_body=lambda _handler: b'{"message":"hello"}',
            canvas_agent_service=_ThrowingRouteService(),
            sent_errors=sent_errors,
        )

        handled = dispatcher.handle_post(handler=None, path="/api/v2/canvas-agent/chat")

        self.assertTrue(handled)
        self.assertEqual(sent_errors, [{"code": 500, "message": "Canvas agent route failed"}])

    def test_canvas_agent_get_exception_returns_generic_error(self):
        sent_errors = []
        dispatcher = self._build_dispatcher(
            json_service=_StubRouteService(),
            library_service=_StubRouteService(),
            read_body=lambda _handler: b"",
            canvas_agent_service=_ThrowingRouteService(),
            sent_errors=sent_errors,
        )

        handled = dispatcher.handle_get(handler=None, path="/api/v2/canvas-agent/status")

        self.assertTrue(handled)
        self.assertEqual(sent_errors, [{"code": 500, "message": "Canvas agent route failed"}])

    def test_unknown_canvas_agent_post_returns_404_without_reading_body(self):
        read_calls = []
        sent_errors = []
        dispatcher = self._build_dispatcher(
            json_service=_StubRouteService(),
            library_service=_StubRouteService(),
            read_body=lambda _handler: read_calls.append("read") or b"{}",
            canvas_agent_service=_StubRouteService(),
            sent_errors=sent_errors,
        )

        handled = dispatcher.handle_post(handler=None, path="/api/v2/canvas-agent/unknown")

        self.assertTrue(handled)
        self.assertEqual(read_calls, [])
        self.assertEqual(sent_errors, [{"code": 404, "message": "Not found"}])


    def test_canvas_agent_metrics_get_is_allowed(self):
        canvas_agent_service = _StubRouteService(
            get_response={
                "kind": "json_ok",
                "data": {"success": True, "metrics": {"totalExecutions": 0}},
            }
        )
        sent_responses = []
        dispatcher = self._build_dispatcher(
            json_service=_StubRouteService(),
            library_service=_StubRouteService(),
            read_body=lambda _handler: b"",
            canvas_agent_service=canvas_agent_service,
            sent_responses=sent_responses,
        )

        handled = dispatcher.handle_get(handler=None, path="/api/v2/canvas-agent/metrics")

        self.assertTrue(handled)
        self.assertEqual(canvas_agent_service.get_calls, ["/api/v2/canvas-agent/metrics"])
        self.assertEqual(sent_responses[0]["data"]["metrics"]["totalExecutions"], 0)


    def test_canvas_agent_director_plan_post_is_allowed(self):
        canvas_agent_service = _StubRouteService(
            post_response={"kind": "json_ok", "data": {"success": True}}
        )
        sent_responses = []
        dispatcher = self._build_dispatcher(
            json_service=_StubRouteService(),
            library_service=_StubRouteService(),
            read_body=lambda _handler: b"{}",
            canvas_agent_service=canvas_agent_service,
            sent_responses=sent_responses,
        )

        handled = dispatcher.handle_post(handler=None, path="/api/v2/canvas-agent/director/plan")

        self.assertTrue(handled)
        self.assertEqual(canvas_agent_service.post_calls, [("/api/v2/canvas-agent/director/plan", b"{}")])


    def test_canvas_agent_director_dailies_post_is_allowed(self):
        canvas_agent_service = _StubRouteService(
            post_response={"kind": "json_ok", "data": {"success": True}}
        )
        sent_responses = []
        dispatcher = self._build_dispatcher(
            json_service=_StubRouteService(),
            library_service=_StubRouteService(),
            read_body=lambda _handler: b"{}",
            canvas_agent_service=canvas_agent_service,
            sent_responses=sent_responses,
        )

        handled = dispatcher.handle_post(handler=None, path="/api/v2/canvas-agent/director/dailies")

        self.assertTrue(handled)
        self.assertEqual(canvas_agent_service.post_calls, [("/api/v2/canvas-agent/director/dailies", b"{}")])


    def test_canvas_agent_director_refresh_post_is_allowed(self):
        canvas_agent_service = _StubRouteService(
            post_response={"kind": "json_ok", "data": {"success": True}}
        )
        sent_responses = []
        dispatcher = self._build_dispatcher(
            json_service=_StubRouteService(),
            library_service=_StubRouteService(),
            read_body=lambda _handler: b"{}",
            canvas_agent_service=canvas_agent_service,
            sent_responses=sent_responses,
        )

        handled = dispatcher.handle_post(handler=None, path="/api/v2/canvas-agent/director/refresh")

        self.assertTrue(handled)
        self.assertEqual(canvas_agent_service.post_calls, [("/api/v2/canvas-agent/director/refresh", b"{}")])


    def test_canvas_agent_director_knowledge_get_is_allowed(self):
        canvas_agent_service = _StubRouteService(
            get_response={
                "kind": "json_ok",
                "data": {"success": True, "schemaVersion": "director-knowledge-projection/v1", "cards": []},
            }
        )
        sent_responses = []
        dispatcher = self._build_dispatcher(
            json_service=_StubRouteService(),
            library_service=_StubRouteService(),
            read_body=lambda _handler: b"",
            canvas_agent_service=canvas_agent_service,
            sent_responses=sent_responses,
        )

        handled = dispatcher.handle_get(handler=None, path="/api/v2/canvas-agent/director/knowledge")

        self.assertTrue(handled)
        self.assertEqual(canvas_agent_service.get_calls, ["/api/v2/canvas-agent/director/knowledge"])
        self.assertEqual(sent_responses[0]["data"]["schemaVersion"], "director-knowledge-projection/v1")


    def test_external_venv_paths_retired_are_404(self):  # C5.2
        # the external venv plan/render/portraits/status/jobs paths are no longer
        # whitelisted -> 404 before the route service (never reach it).
        for path in ("/api/v2/vimax/status", "/api/v2/vimax/jobs?jobId=a"):
            vimax_service = _StubRouteService(get_response={"kind": "json_ok", "data": {}})
            sent_errors = []
            dispatcher = self._build_dispatcher(
                json_service=_StubRouteService(), library_service=_StubRouteService(),
                read_body=lambda _h: b"", vimax_service=vimax_service, sent_errors=sent_errors,
            )
            dispatcher.handle_get(handler=None, path=path)
            self.assertEqual(vimax_service.get_calls, [], path + " must not reach the route service")
            self.assertEqual(sent_errors, [{"code": 404, "message": "Not found"}], path)
        for path in ("/api/v2/vimax/plan", "/api/v2/vimax/render",
                     "/api/v2/vimax/portraits", "/api/v2/vimax/jobs/cancel"):
            vimax_service = _StubRouteService(post_response={"kind": "json_ok", "data": {}})
            sent_errors = []
            dispatcher = self._build_dispatcher(
                json_service=_StubRouteService(), library_service=_StubRouteService(),
                read_body=lambda _h: b"{}", vimax_service=vimax_service, sent_errors=sent_errors,
            )
            dispatcher.handle_post(handler=None, path=path)
            self.assertEqual(vimax_service.post_calls, [], path + " must not reach the route service")
            self.assertEqual(sent_errors, [{"code": 404, "message": "Not found"}], path)

    def test_vimax_native_plan_post_is_allowed(self):  # Phase B
        vimax_service = _StubRouteService(post_response={"kind": "json_ok", "data": {"success": True}})
        dispatcher = self._build_dispatcher(
            json_service=_StubRouteService(), library_service=_StubRouteService(),
            read_body=lambda _h: b"{}", vimax_service=vimax_service,
        )
        handled = dispatcher.handle_post(handler=None, path="/api/v2/vimax/native/plan")
        self.assertTrue(handled)
        self.assertEqual(vimax_service.post_calls, [("/api/v2/vimax/native/plan", b"{}")])

    def test_vimax_native_jobs_get_with_query_is_allowed(self):  # Phase B
        vimax_service = _StubRouteService(get_response={"kind": "json_ok", "data": {"success": True}})
        dispatcher = self._build_dispatcher(
            json_service=_StubRouteService(), library_service=_StubRouteService(),
            read_body=lambda _h: b"", vimax_service=vimax_service, sent_responses=[],
        )
        handled = dispatcher.handle_get(handler=None, path="/api/v2/vimax/native/jobs?jobId=nj&since=1")
        self.assertTrue(handled)
        self.assertEqual(vimax_service.get_calls, ["/api/v2/vimax/native/jobs?jobId=nj&since=1"])

    def test_vimax_native_cancel_post_is_allowed(self):  # Phase B
        vimax_service = _StubRouteService(post_response={"kind": "json_ok", "data": {"success": True}})
        dispatcher = self._build_dispatcher(
            json_service=_StubRouteService(), library_service=_StubRouteService(),
            read_body=lambda _h: b"{}", vimax_service=vimax_service,
        )
        handled = dispatcher.handle_post(handler=None, path="/api/v2/vimax/native/jobs/cancel")
        self.assertTrue(handled)
        self.assertEqual(vimax_service.post_calls, [("/api/v2/vimax/native/jobs/cancel", b"{}")])

    def test_vimax_native_resume_post_is_allowed(self):  # B3b
        vimax_service = _StubRouteService(post_response={"kind": "json_ok", "data": {"success": True}})
        dispatcher = self._build_dispatcher(
            json_service=_StubRouteService(), library_service=_StubRouteService(),
            read_body=lambda _h: b"{}", vimax_service=vimax_service)
        handled = dispatcher.handle_post(handler=None, path="/api/v2/vimax/native/resume")
        self.assertTrue(handled)
        self.assertEqual(vimax_service.post_calls, [("/api/v2/vimax/native/resume", b"{}")])

    def test_vimax_native_render_post_is_allowed(self):  # Phase C
        vimax_service = _StubRouteService(post_response={"kind": "json_ok", "data": {"success": True}})
        dispatcher = self._build_dispatcher(
            json_service=_StubRouteService(), library_service=_StubRouteService(),
            read_body=lambda _h: b"{}", vimax_service=vimax_service)
        handled = dispatcher.handle_post(handler=None, path="/api/v2/vimax/native/render")
        self.assertTrue(handled)
        self.assertEqual(vimax_service.post_calls, [("/api/v2/vimax/native/render", b"{}")])

    def test_vimax_native_portraits_post_is_allowed(self):  # Phase C
        vimax_service = _StubRouteService(post_response={"kind": "json_ok", "data": {"success": True}})
        dispatcher = self._build_dispatcher(
            json_service=_StubRouteService(), library_service=_StubRouteService(),
            read_body=lambda _h: b"{}", vimax_service=vimax_service)
        handled = dispatcher.handle_post(handler=None, path="/api/v2/vimax/native/portraits")
        self.assertTrue(handled)
        self.assertEqual(vimax_service.post_calls, [("/api/v2/vimax/native/portraits", b"{}")])

    def test_vimax_unlisted_path_is_404_before_route_service(self):
        vimax_service = _StubRouteService(get_response={"kind": "json_ok", "data": {}})
        sent_errors = []
        dispatcher = self._build_dispatcher(
            json_service=_StubRouteService(), library_service=_StubRouteService(),
            read_body=lambda _h: b"", vimax_service=vimax_service, sent_errors=sent_errors,
        )
        handled = dispatcher.handle_get(handler=None, path="/api/v2/vimax/secret")
        self.assertTrue(handled)
        self.assertEqual(vimax_service.get_calls, [], "unlisted path never reaches the route service")
        self.assertEqual(sent_errors, [{"code": 404, "message": "Not found"}])

    def test_vimax_skills_get_reaches_route_service(self):
        # skills is whitelisted AND handled (M8). It reaches the route
        # service, which returns the roster.
        vimax_service = _StubRouteService(get_response={"kind": "json_ok", "data": {"success": True, "skills": []}})
        dispatcher = self._build_dispatcher(
            json_service=_StubRouteService(), library_service=_StubRouteService(),
            read_body=lambda _h: b"", vimax_service=vimax_service,
        )
        handled = dispatcher.handle_get(handler=None, path="/api/v2/vimax/skills")
        self.assertTrue(handled)
        self.assertEqual(vimax_service.get_calls, ["/api/v2/vimax/skills"])

    def test_vimax_sign_and_draw_post_allowed(self):
        for path in ("/api/v2/vimax/sign", "/api/v2/vimax/draw"):
            vimax_service = _StubRouteService(post_response={"kind": "json_ok", "data": {"success": True}})
            dispatcher = self._build_dispatcher(
                json_service=_StubRouteService(), library_service=_StubRouteService(),
                read_body=lambda _h: b"{}", vimax_service=vimax_service,
            )
            handled = dispatcher.handle_post(handler=None, path=path)
            self.assertTrue(handled)
            self.assertEqual(vimax_service.post_calls, [(path, b"{}")], f"{path} reaches the route service")

    def test_vimax_get_only_path_rejected_on_post(self):
        vimax_service = _StubRouteService(post_response={"kind": "json_ok", "data": {}})
        sent_errors = []
        dispatcher = self._build_dispatcher(
            json_service=_StubRouteService(), library_service=_StubRouteService(),
            read_body=lambda _h: b"{}", vimax_service=vimax_service, sent_errors=sent_errors,
        )
        handled = dispatcher.handle_post(handler=None, path="/api/v2/vimax/status")
        self.assertTrue(handled)
        self.assertEqual(vimax_service.post_calls, [], "GET-only path not POST-able")
        self.assertEqual(sent_errors, [{"code": 404, "message": "Not found"}])


if __name__ == "__main__":
    unittest.main()


class CanvasAgentDirectorKnowledgeGetTests(unittest.TestCase):
    _build_dispatcher = CanvasAgentRouteTests.__dict__["_build_dispatcher"] if "CanvasAgentRouteTests" in dir() else None
