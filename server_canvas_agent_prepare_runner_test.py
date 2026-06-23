import unittest
from unittest import mock

import server


class _Bridge:
    def __init__(self, response):
        self.response = response
        self.calls = []

    def chat(self, **kwargs):
        self.calls.append(kwargs)
        return self.response


class ServerCanvasAgentPrepareRunnerTests(unittest.TestCase):
    def test_canvas_agent_execution_service_has_prepare_runner(self):
        self.assertTrue(callable(server.CANVAS_AGENT_EXECUTION_SERVICE._prepare_runner))

    def test_prepare_runner_recompiles_queued_execution_with_latest_context(self):
        bridge = _Bridge(
            {
                "success": True,
                "reply": "Recompiled from latest canvas.",
                "plan": {
                    "id": "plan-fresh",
                    "title": "Fresh layout",
                    "steps": [{"id": "step-1", "title": "Layout again"}],
                },
                "actionsByStep": {
                    "step-1": [{"id": "act-fresh", "type": "layout_nodes", "nodeIds": ["node-1"]}]
                },
                "developer": {"apiKey": "must-not-persist", "note": "kept"},
            }
        )
        payload = {
            "executionId": "exec-1",
            "agentMode": "act",
            "videoAuthorized": False,
            "context": {"canvas": {"nodeCount": 3}},
            "execution": {
                "id": "exec-1",
                "title": "Organize current canvas",
                "conversationId": "conv-1",
                "plan": {"id": "plan-stale", "steps": [{"id": "old", "title": "Old"}]},
                "actionsByStep": {"old": [{"id": "stale-action"}]},
            },
        }

        with mock.patch.object(server, "PI_BRIDGE_SERVICE", bridge):
            prepared = server._prepare_canvas_agent_queued_execution(payload)

        self.assertEqual(prepared["plan"]["id"], "plan-fresh")
        self.assertEqual(prepared["actionsByStep"]["step-1"][0]["id"], "act-fresh")
        self.assertEqual(prepared["drawerState"]["line2"], "Recompiled from latest canvas.")
        self.assertEqual(prepared["summary"], "Recompiled from latest canvas.")
        self.assertNotIn("apiKey", prepared["developer"])

        self.assertEqual(len(bridge.calls), 1)
        call = bridge.calls[0]
        self.assertEqual(call["context"], {"canvas": {"nodeCount": 3}})
        self.assertEqual(call["conversation_id"], "conv-1")
        self.assertEqual(call["mode"], "actions")
        self.assertIn("Organize current canvas", call["message"])
        self.assertIn("Recompile", call["message"])
        self.assertIn("video generation is not authorized", call["message"])

    def test_prepare_route_with_server_runner_returns_prepared_patch(self):
        bridge = _Bridge(
            {
                "success": True,
                "reply": "Prepared through route.",
                "plan": {"id": "plan-route", "steps": [{"id": "step-route", "title": "Route"}]},
                "actionsByStep": {
                    "step-route": [{"id": "act-route", "type": "layout_nodes"}]
                },
            }
        )
        execution_service = server.CanvasAgentExecutionService(
            clock=lambda: "2026-06-10T00:00:00Z",
            id_factory=lambda prefix: f"{prefix}-fixed",
            prepare_runner=server._prepare_canvas_agent_queued_execution,
        )
        execution_service.upsert_execution(
            {
                "id": "exec-route",
                "projectId": "project-a",
                "conversationId": "conv-route",
                "title": "Route task",
                "status": "queued",
            }
        )
        route_service = server.CanvasAgentRouteService(execution_service=execution_service)

        with mock.patch.object(server, "PI_BRIDGE_SERVICE", bridge):
            response = route_service.handle_post(
                None,
                "/api/v2/canvas-agent/executions/exec-route/prepare",
                b'{"context":{"canvas":{"nodeCount":1}},"agentMode":"act","videoAuthorized":false}',
            )

        self.assertEqual(response["kind"], "json_ok")
        self.assertEqual(response["data"]["plan"]["id"], "plan-route")
        self.assertEqual(response["data"]["actionsByStep"]["step-route"][0]["id"], "act-route")
        self.assertEqual(response["data"]["drawerState"]["line2"], "Prepared through route.")


if __name__ == "__main__":
    unittest.main()
