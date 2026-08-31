import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from fastapi import FastAPI
from fastapi.testclient import TestClient

from cms_core.api import drafts


class DraftSyncTests(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.project_root = Path(self.temp_dir.name)
        self.project_patch = patch.object(drafts, "PROJECT_ROOT", str(self.project_root))
        self.project_patch.start()

        app = FastAPI()
        app.include_router(drafts.router, prefix="/api/drafts")
        self.client = TestClient(app)

    def tearDown(self):
        self.project_patch.stop()
        self.temp_dir.cleanup()

    def _write_draft(self, draft_id: str, title: str) -> Path:
        draft_path = self.project_root / "manager_data" / "drafts" / f"{draft_id}.json"
        draft_path.parent.mkdir(parents=True, exist_ok=True)
        draft_path.write_text(
            json.dumps(
                {
                    "id": draft_id,
                    "type": "post",
                    "title": title,
                    "content": f"<p>{title}正文</p>",
                    "cover": "",
                    "tags": [],
                },
                ensure_ascii=False,
            ),
            encoding="utf-8",
        )
        return draft_path

    def _publish(self, draft_id: str, *, cover: str = ""):
        return self.client.post(
            "/api/drafts/sync_local",
            json={
                "operations": [
                    {
                        "type": "publish_article",
                        "value": {
                            "id": draft_id,
                            "type": "post",
                            "title": "待发布文章",
                            "content": "<p>正文</p>",
                            "cover": cover,
                            "tags": [],
                        },
                    }
                ]
            },
        )

    def test_update_local_preserves_every_draft(self):
        published_draft = self._write_draft("draft_1001", "准备发布")
        untouched_draft = self._write_draft("draft_1002", "仍在编辑")

        response = self._publish("draft_1001")

        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.json()["success"])
        self.assertTrue(published_draft.exists(), "更新本地不能隐式删除已保存草稿")
        self.assertTrue(untouched_draft.exists(), "更新本地不能删除其他未发布草稿")
        listed = self.client.post("/api/drafts/list", json={}).json()["drafts"]
        self.assertEqual({draft["id"] for draft in listed}, {"draft_1001", "draft_1002"})

    def test_update_local_repairs_runtime_copy_for_local_cover(self):
        cover_name = "cover-1788093148912-7c8b1fba.jpg"
        cover_url = f"/uploads/covers/{cover_name}"
        source_cover = self.project_root / "public" / "uploads" / "covers" / cover_name
        source_cover.parent.mkdir(parents=True)
        source_cover.write_bytes(b"local-cover")
        runtime_public = self.project_root / ".next" / "standalone" / "public"
        runtime_public.mkdir(parents=True)

        response = self._publish("draft_1001", cover=cover_url)

        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.json()["success"])
        runtime_cover = runtime_public / "uploads" / "covers" / cover_name
        self.assertEqual(runtime_cover.read_bytes(), b"local-cover")
        published_file = next((self.project_root / "posts").glob("post_*.md"))
        published_source = published_file.read_text(encoding="utf-8")
        self.assertIn(f"cover: {cover_url}", published_source)
        self.assertRegex(published_source, r"updated: ['\"]?\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}")


if __name__ == "__main__":
    unittest.main()
