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
            "gitalkConfig": {"clientID": "public-id", "clientSecret": "private-secret"},
        }
        result = public_config(config)
        self.assertNotIn("picBedToken", result)
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
                    "unexpected": "blocked",
                },
                config_path=config_path,
                manager_ts_path=ts_path,
            )

            self.assertEqual(applied, ["title", "siteUrl"])
            self.assertEqual(
                config,
                {"title": "after", "siteUrl": "https://blog.example.com"},
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
