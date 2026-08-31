import json
import tempfile
import unittest
from pathlib import Path

from cms_core.config_store import apply_updates, public_config, render_typescript


class ConfigStoreTests(unittest.TestCase):
    def test_public_config_removes_manager_secrets(self):
        config = {
            "title": "yukiBlogs",
            "picBedToken": "private-token",
            "picBedProvider": "cloudflare-imgbed",
            "picBedProfiles": {
                "cloudflare-imgbed": {"url": "https://imgbed.example", "token": "private-token"},
            },
            "gitalkConfig": {"clientID": "public-id", "clientSecret": "private-secret"},
        }
        result = public_config(config)
        self.assertNotIn("picBedToken", result)
        self.assertNotIn("picBedProvider", result)
        self.assertNotIn("picBedProfiles", result)
        self.assertEqual(result["gitalkConfig"], {"clientID": "public-id"})

    def test_apply_updates_is_whitelisted_and_generates_typescript(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            config_path = root / "site_config.json"
            ts_path = root / "siteConfig.ts"
            config_path.write_text(json.dumps({"title": "before"}), encoding="utf-8")

            config, applied = apply_updates(
                {
                    "title": "after",
                    "siteUrl": "https://blog.example.com",
                    "musicTracks": [{"key": "wy:1", "platform": "wy", "id": "1"}],
                    "musicSources": [{"id": "builtin", "enabled": True}],
                    "bgImageCrops": {"https://img.example/photo.jpg": {"zoom": 1.2, "offsetX": 0.1, "offsetY": 0}},
                    "picBedProvider": "cloudflare-imgbed",
                    "picBedProfiles": {
                        "cloudflare-imgbed": {"url": "https://imgbed.example", "token": "secret"},
                    },
                    "unexpected": "blocked",
                },
                config_path=config_path,
                manager_ts_path=ts_path,
            )

            self.assertEqual(
                applied,
                [
                    "title",
                    "siteUrl",
                    "musicTracks",
                    "musicSources",
                    "bgImageCrops",
                    "picBedProvider",
                    "picBedProfiles",
                ],
            )
            self.assertEqual(
                config,
                {
                    "title": "after",
                    "siteUrl": "https://blog.example.com",
                    "musicTracks": [{"key": "wy:1", "platform": "wy", "id": "1"}],
                    "musicSources": [{"id": "builtin", "enabled": True}],
                    "bgImageCrops": {"https://img.example/photo.jpg": {"zoom": 1.2, "offsetX": 0.1, "offsetY": 0}},
                    "picBedProvider": "cloudflare-imgbed",
                    "picBedProfiles": {
                        "cloudflare-imgbed": {"url": "https://imgbed.example", "token": "secret"},
                    },
                },
            )
            self.assertNotIn("unexpected", config_path.read_text(encoding="utf-8"))
            self.assertIn('"title": "after"', ts_path.read_text(encoding="utf-8"))

    def test_typescript_renderer_emits_valid_export(self):
        rendered = render_typescript({"enabled": True, "items": ["一", "二"]})
        self.assertIn("export const siteConfig =", rendered)
        self.assertIn('"enabled": true', rendered)
        self.assertTrue(rendered.endswith(";\n"))


if __name__ == "__main__":
    unittest.main()
