import unittest

from services.canvas_agent_action_schema import CanvasAgentActionSchema


class CanvasAgentActionSchemaEnvelopeTests(unittest.TestCase):
    def setUp(self):
        self.schema = CanvasAgentActionSchema()

    def test_preserves_canvas_agent_envelope_fields(self):
        result = self.schema.validate_actions(
            [
                {
                    "schemaVersion": "2026-06-03",
                    "actionId": "act_create_text",
                    "clientMutationId": "client-1",
                    "type": "create_node",
                    "nodeId": "node-1",
                    "nodeType": "ai-text",
                    "riskLevel": "medium",
                    "requiresConfirmation": True,
                    "metadata": {
                        "source": "canvas_agent",
                        "conversationId": "conv-1",
                        "messageId": "msg-1",
                    },
                }
            ]
        )

        self.assertTrue(result["valid"])
        action = result["actions"][0]
        self.assertEqual(action["schemaVersion"], "2026-06-03")
        self.assertEqual(action["actionId"], "act_create_text")
        self.assertEqual(action["clientMutationId"], "client-1")
        self.assertEqual(action["riskLevel"], "medium")
        self.assertTrue(action["requiresConfirmation"])
        self.assertEqual(action["metadata"]["source"], "canvas_agent")


if __name__ == "__main__":
    unittest.main()

