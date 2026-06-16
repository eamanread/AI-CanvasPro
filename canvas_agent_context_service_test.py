import unittest

from services.canvas_agent_context_service import CanvasAgentContextService


class CanvasAgentContextServiceTests(unittest.TestCase):
    def setUp(self):
        self.service = CanvasAgentContextService()
        self.key_prefix = "s" + "k-"

    def test_preview_context_removes_sensitive_keys_recursively(self):
        result = self.service.preview_context(
            {
                "apiKey": self.key_prefix + "12345678",
                "token": "abc",
                "nested": {
                    "secret": "hidden",
                    "password": "hidden",
                    "credential": "hidden",
                    "safe": "visible",
                },
                "items": [{"api_key": "nested-key", "name": "asset"}],
            }
        )

        self.assertTrue(result["success"], result)
        self.assertEqual(result["context"], {"nested": {"safe": "visible"}, "items": [{"name": "asset"}]})
        joined_warnings = " ".join(result["warnings"])
        for key in ("apiKey", "token", "secret", "password", "credential", "api_key"):
            self.assertIn(key, joined_warnings)

    def test_preview_context_redacts_sensitive_string_values(self):
        result = self.service.preview_context(
            {
                "values": [
                    "OpenAI key " + self.key_prefix + "12345678 should not leak",
                    "Authorization Bearer abc.DEF_123 should not leak",
                    "Local file C:\\Users\\Administrator\\secret.txt should not leak",
                    "Inline image data:image/png;base64,AAAA should not leak",
                    "Blob ref blob:https://example.test/123 should not leak",
                ]
            }
        )

        self.assertTrue(result["success"], result)
        serialized = repr(result["context"])
        self.assertNotIn(self.key_prefix + "12345678", serialized)
        self.assertNotIn("Bearer abc.DEF_123", serialized)
        self.assertNotIn("C:\\Users\\Administrator\\secret.txt", serialized)
        self.assertNotIn("data:image/png;base64,AAAA", serialized)
        self.assertNotIn("blob:https://example.test/123", serialized)
        self.assertGreaterEqual(result["warnings"].count("redacted sensitive string"), 5)

    def test_sanitize_context_returns_warnings_when_called_directly(self):
        warnings = []

        sanitized = self.service.sanitize_context(
            {"safe": "keep", "token": "remove", "note": "Bearer direct-token"}, warnings
        )

        self.assertEqual(sanitized, {"safe": "keep", "note": "[redacted]"})
        self.assertIn("removed sensitive field token", warnings)
        self.assertIn("redacted sensitive string", warnings)

    def test_preview_context_preserves_safe_project_preferences(self):
        result = self.service.preview_context(
            {
                "project": {
                    "id": "project-1",
                    "preferences": {
                        "visualStyle": "warm cinematic neon",
                        "aspectRatio": "16:9",
                        "preferredModels": {
                            "text": "gpt-5.5",
                            "image": "dreamina-v3",
                            "apiKey": self.key_prefix + "model-secret",
                        },
                        "brandVoice": "playful",
                        "naming": "shot_##",
                        "localPath": "D:\\private\\style.md",
                        "rawPromptDump": "do not keep",
                    },
                }
            }
        )

        self.assertTrue(result["success"], result)
        self.assertEqual(
            result["context"]["project"]["preferences"],
            {
                "visualStyle": "warm cinematic neon",
                "aspectRatio": "16:9",
                "preferredModels": {
                    "text": "gpt-5.5",
                    "image": "dreamina-v3",
                },
                "brandVoice": "playful",
                "naming": "shot_##",
            },
        )
        serialized = repr(result["context"]["project"]["preferences"])
        self.assertNotIn("model-secret", serialized)
        self.assertNotIn("D:\\private", serialized)
        self.assertNotIn("rawPromptDump", serialized)

    def test_preview_context_summarizes_prompt_presets_without_template_bodies(self):
        result = self.service.preview_context(
            {
                "promptPresets": {
                    "items": {
                        "ai-text": [
                            {
                                "id": "story-outline",
                                "title": "Story Outline",
                                "desc": "Create a compact story outline",
                                "template": "PRIVATE TEMPLATE BODY " * 20,
                                "apiKey": self.key_prefix + "preset-secret",
                                "localPath": "D:\\private\\preset.txt",
                                "tags": ["story", "outline"],
                            }
                        ],
                        "ai-image": [
                            {
                                "title": "Product Hero",
                                "subItems": [
                                    {
                                        "id": "hero-front",
                                        "title": "Front Hero",
                                        "desc": "Front-facing preset",
                                        "template": "SECRET IMAGE TEMPLATE",
                                        "inputs": {"brief": "string", "style": "string"},
                                    }
                                ],
                            }
                        ],
                    }
                }
            }
        )

        self.assertTrue(result["success"], result)
        self.assertEqual(
            result["context"]["promptPresets"]["items"],
            [
                {
                    "id": "story-outline",
                    "presetId": "story-outline",
                    "title": "Story Outline",
                    "name": "Story Outline",
                    "description": "Create a compact story outline",
                    "nodeType": "ai-text",
                    "tags": ["story", "outline"],
                    "hasTemplate": True,
                },
                {
                    "id": "hero-front",
                    "presetId": "hero-front",
                    "title": "Front Hero",
                    "name": "Front Hero",
                    "description": "Front-facing preset",
                    "nodeType": "ai-image",
                    "category": "Product Hero",
                    "path": ["Product Hero", "Front Hero"],
                    "inputKeys": ["brief", "style"],
                    "hasTemplate": True,
                },
            ],
        )
        serialized = repr(result["context"]["promptPresets"])
        self.assertNotIn("PRIVATE TEMPLATE BODY", serialized)
        self.assertNotIn("SECRET IMAGE TEMPLATE", serialized)
        self.assertNotIn("preset-secret", serialized)
        self.assertNotIn("D:\\private", serialized)

    def test_preview_context_preserves_sanitized_readonly_llm_wiki_context(self):
        result = self.service.preview_context(
            {
                "knowledge": {
                    "llmWiki": {
                        "mode": "readonly",
                        "available": True,
                        "status": "connected",
                        "defaultProjectId": "project-brand",
                        "apiToken": self.key_prefix + "wiki-secret",
                        "searchResults": [
                            {
                                "title": "Brand Guide",
                                "fileId": "file-brand",
                                "projectId": "project-brand",
                                "snippet": "Warm, ingredient-led voice. D:\\private\\brand.md",
                                "citation": "p.12",
                                "token": "secret-token",
                            }
                        ],
                        "canvasActionHints": [
                            {
                                "nodeType": "source-text",
                                "title": "Brand Guide",
                                "sourceTitle": "Brand Guide",
                                "fileId": "file-brand",
                                "projectId": "project-brand",
                                "citationDisplay": "Brand Guide (file-brand)",
                            }
                        ],
                    }
                }
            }
        )

        self.assertTrue(result["success"], result)
        llm_wiki = result["context"]["knowledge"]["llmWiki"]
        self.assertEqual(llm_wiki["mode"], "readonly")
        self.assertTrue(llm_wiki["available"])
        self.assertEqual(llm_wiki["defaultProjectId"], "project-brand")
        self.assertEqual(llm_wiki["searchResults"][0]["fileId"], "file-brand")
        self.assertEqual(llm_wiki["canvasActionHints"][0]["citationDisplay"], "Brand Guide (file-brand)")
        serialized = repr(llm_wiki)
        self.assertNotIn("wiki-secret", serialized)
        self.assertNotIn("secret-token", serialized)
        self.assertNotIn("apiToken", serialized)
        self.assertNotIn("D:\\private", serialized)


if __name__ == "__main__":
    unittest.main()
