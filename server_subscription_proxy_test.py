import unittest

import server


class ServerSubscriptionProxyTests(unittest.TestCase):
    def test_infer_proxy_image_generation_metadata_marks_runninghub_audio_submit_as_audio(self):
        metadata = server._infer_proxy_image_generation_metadata(
            "https://www.runninghub.cn/openapi/v2/run/ai-app/1991510999935172610",
            {},
        )

        self.assertEqual(metadata["required_model_id"], "runninghub/1991510999935172610")
        self.assertEqual(metadata["provider"], "runninghubwf")
        self.assertEqual(metadata["node_type"], "audio")
        self.assertTrue(metadata["allow_task_probe_short_circuit"])

    def test_infer_proxy_image_generation_metadata_marks_video_vip_submit_as_video(self):
        metadata = server._infer_proxy_image_generation_metadata(
            "https://www.runninghub.cn/openapi/v2/run/ai-app/2041741496667348994",
            {},
        )

        self.assertEqual(metadata["required_model_id"], "runninghub/2041741496667348994")
        self.assertEqual(metadata["provider"], "runninghubwf")
        self.assertEqual(metadata["node_type"], "video")

    def test_infer_proxy_image_generation_metadata_keeps_unknown_runninghub_submit_untyped(self):
        metadata = server._infer_proxy_image_generation_metadata(
            "https://www.runninghub.cn/openapi/v2/run/ai-app/9999999999999999999",
            {},
        )

        self.assertEqual(metadata["required_model_id"], "runninghub/9999999999999999999")
        self.assertEqual(metadata["provider"], "runninghubwf")
        self.assertEqual(metadata["node_type"], "")

    def test_strip_internal_control_fields_removes_install_id_and_gate_metadata(self):
        payload = {
            "installId": "aic-test",
            "provider": "text",
            "activationSource": "cdkey",
            "generationScope": "all",
            "entitledNodeTypes": ["text"],
            "messages": [{"role": "user", "content": "hello"}],
            "model": "gpt-test",
        }

        forwarded = server._strip_internal_control_fields(payload)

        self.assertEqual(forwarded["model"], "gpt-test")
        self.assertEqual(forwarded["messages"][0]["content"], "hello")
        self.assertNotIn("installId", forwarded)
        self.assertNotIn("provider", forwarded)
        self.assertNotIn("activationSource", forwarded)
        self.assertNotIn("generationScope", forwarded)
        self.assertNotIn("entitledNodeTypes", forwarded)


if __name__ == "__main__":
    unittest.main()
