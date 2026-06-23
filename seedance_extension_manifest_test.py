import json
import unittest
from pathlib import Path


MANIFEST_PATH = (
    Path(__file__).resolve().parent
    / "integrations"
    / "seedance_extension_bridge"
    / "extension"
    / "manifest.json"
)


class SeedanceExtensionManifestTests(unittest.TestCase):
    def test_overseas_dreamina_hosts_cover_redirect_subdomains(self):
        manifest = json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))
        host_permissions = set(manifest.get("host_permissions") or [])
        content_matches = set()
        web_resource_matches = set()
        for item in manifest.get("content_scripts") or []:
            content_matches.update(item.get("matches") or [])
        for item in manifest.get("web_accessible_resources") or []:
            web_resource_matches.update(item.get("matches") or [])

        for pattern in ("https://*.capcut.com/*", "https://*.dreamina.ai/*"):
            self.assertIn(pattern, host_permissions)
            self.assertIn(pattern, content_matches)
            self.assertIn(pattern, web_resource_matches)


if __name__ == "__main__":
    unittest.main()
