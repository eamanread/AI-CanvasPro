import json
import tempfile
import unittest

from services.config_route_service import ConfigRouteService


class ConfigRouteServiceTests(unittest.TestCase):
    def _build_service(self, config_path):
        return ConfigRouteService(config_file_getter=lambda: config_path)

    def test_read_public_config_injects_default_registry_and_providers_backup(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            config_path = f"{temp_dir}/config.json"
            with open(config_path, "w", encoding="utf-8") as file:
                json.dump(
                    {
                        "providers": {
                            "grsai": {
                                "apiKey": "k_grsai",
                            }
                        }
                    },
                    file,
                    ensure_ascii=False,
                    indent=2,
                )

            service = self._build_service(config_path)
            config = service._read_public_config()

            self.assertIn("modelRegistry", config)
            self.assertEqual(
                config["modelRegistry"]["text"][0]["modelName"],
                "gemini-3.1",
            )
            self.assertEqual(
                config["modelRegistry"]["image"][0]["modelName"],
                "NanoBanana-2",
            )
            self.assertEqual(
                config["deprecatedProvidersBackup"]["grsai"]["apiKey"],
                "k_grsai",
            )

    def test_handle_post_normalizes_registry_and_preserves_explicit_empty_list(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            config_path = f"{temp_dir}/config.json"
            service = self._build_service(config_path)

            response = service.handle_post(
                handler=None,
                path="/api/config",
                body=json.dumps(
                    {
                        "providers": {
                            "grsai": {
                                "apiKey": "k_grsai",
                            }
                        },
                        "modelRegistry": {
                            "text": [],
                        },
                    }
                ).encode("utf-8"),
            )

            self.assertEqual(response["kind"], "json_ok")
            self.assertEqual(response["data"]["success"], True)

            with open(config_path, "r", encoding="utf-8") as file:
                saved = json.load(file)

            self.assertEqual(saved["modelRegistry"]["text"], [])
            self.assertEqual(
                saved["modelRegistry"]["video"][0]["modelName"],
                "seedance-2.0",
            )
            self.assertEqual(
                saved["deprecatedProvidersBackup"]["grsai"]["apiKey"],
                "k_grsai",
            )


if __name__ == "__main__":
    unittest.main()
