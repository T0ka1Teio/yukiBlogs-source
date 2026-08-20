import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from cms_core.api import sync


class AboutSyncTests(unittest.TestCase):
    def test_chatter_delete_is_idempotent_and_keeps_posts(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            manager = root / "manager"
            frontend = root / "myBlogs"
            (manager / "data").mkdir(parents=True)
            deploy_config = manager / "data" / "deploy_config.json"
            deploy_config.write_text(json.dumps({"blogPath": str(frontend)}), encoding="utf-8")

            for relative in ["app", "components", "chatters", "posts"]:
                (frontend / relative).mkdir(parents=True)
            (frontend / "siteConfig.ts").write_text("config", encoding="utf-8")
            (frontend / "package.json").write_text(json.dumps({"name": "yukiblogs"}), encoding="utf-8")
            (frontend / "chatters" / "target.md").write_text("target", encoding="utf-8")
            (frontend / "posts" / "keep.md").write_text("keep", encoding="utf-8")

            with patch.object(sync, "PROJECT_ROOT", str(manager)), patch.object(sync, "DEPLOY_CONFIG_FILE", str(deploy_config)):
                first, _ = sync.delete_document_from_configured_blog("chatter", "target")
                second, _ = sync.delete_document_from_configured_blog("chatter", "target")

            self.assertTrue(first)
            self.assertTrue(second)
            self.assertFalse((frontend / "chatters" / "target.md").exists())
            self.assertEqual((frontend / "posts" / "keep.md").read_text(encoding="utf-8"), "keep")

    def test_moment_delete_does_not_touch_unrelated_content(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            manager = root / "manager"
            frontend = root / "myBlogs"
            (manager / "data").mkdir(parents=True)
            deploy_config = manager / "data" / "deploy_config.json"
            deploy_config.write_text(json.dumps({"blogPath": str(frontend)}), encoding="utf-8")

            (frontend / "app").mkdir(parents=True)
            (frontend / "components").mkdir()
            (frontend / "moments").mkdir()
            (frontend / "posts").mkdir()
            (frontend / "siteConfig.ts").write_text("config", encoding="utf-8")
            (frontend / "package.json").write_text(json.dumps({"name": "yukiblogs"}), encoding="utf-8")
            (frontend / "moments" / "target.md").write_text("target", encoding="utf-8")
            (frontend / "posts" / "keep.md").write_text("keep", encoding="utf-8")

            with patch.object(sync, "PROJECT_ROOT", str(manager)), patch.object(sync, "DEPLOY_CONFIG_FILE", str(deploy_config)):
                deleted, _ = sync.delete_moment_from_configured_blog("target")

            self.assertTrue(deleted)
            self.assertFalse((frontend / "moments" / "target.md").exists())
            self.assertEqual((frontend / "posts" / "keep.md").read_text(encoding="utf-8"), "keep")

    def test_full_sync_uses_manager_config_and_removes_private_fields(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            manager = root / "manager"
            frontend = root / "myBlogs"
            for relative in ["posts", "chatters", "moments", "app/about", "data", "public/uploads/covers"]:
                (manager / relative).mkdir(parents=True, exist_ok=True)
            (manager / "app" / "about" / "about.md").write_text("about", encoding="utf-8")
            (manager / "data" / "albums.ts").write_text("albums", encoding="utf-8")
            (manager / "data" / "friends.ts").write_text("friends", encoding="utf-8")
            (manager / "data" / "projects.ts").write_text("projects", encoding="utf-8")
            (manager / "public" / "uploads" / "covers" / "cover-test.jpg").write_bytes(b"cover")
            (manager / "siteConfig.ts").write_text("manager config", encoding="utf-8")

            (frontend / "app").mkdir(parents=True)
            (frontend / "components").mkdir()
            (frontend / "siteConfig.ts").write_text("old", encoding="utf-8")
            (frontend / "package.json").write_text(json.dumps({"name": "yukiblogs"}), encoding="utf-8")

            runtime_config = {
                "bio": "new profile",
                "picBedToken": "private",
                "gitalkConfig": {"clientID": "public", "clientSecret": "private"},
            }
            with patch.object(sync, "PROJECT_ROOT", str(manager)), patch.object(sync, "load_config", return_value=runtime_config):
                copied, _ = sync.sync_blog_tree(str(frontend))

            self.assertTrue(copied)
            generated = (frontend / "siteConfig.ts").read_text(encoding="utf-8")
            self.assertIn("new profile", generated)
            self.assertNotIn("picBedToken", generated)
            self.assertNotIn("clientSecret", generated)
            self.assertEqual(
                (frontend / "public" / "uploads" / "covers" / "cover-test.jpg").read_bytes(),
                b"cover",
            )

    def test_about_publish_is_mirrored_to_configured_frontend(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            manager = root / "manager"
            frontend = root / "myBlogs"
            (manager / "app" / "about").mkdir(parents=True)
            (manager / "app" / "about" / "about.md").write_text("new about", encoding="utf-8")
            (manager / "data").mkdir()
            deploy_config = manager / "data" / "deploy_config.json"
            deploy_config.write_text(json.dumps({"blogPath": str(frontend)}), encoding="utf-8")

            (frontend / "app" / "about").mkdir(parents=True)
            (frontend / "components").mkdir()
            (frontend / "siteConfig.ts").write_text("export const siteConfig = {};", encoding="utf-8")
            (frontend / "package.json").write_text(json.dumps({"name": "yukiblogs"}), encoding="utf-8")

            with patch.object(sync, "PROJECT_ROOT", str(manager)), patch.object(sync, "DEPLOY_CONFIG_FILE", str(deploy_config)):
                copied, destination = sync.sync_about_to_configured_blog()

            self.assertTrue(copied)
            self.assertEqual(Path(destination).read_text(encoding="utf-8"), "new about")


if __name__ == "__main__":
    unittest.main()
