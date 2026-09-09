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

    def _write_published(self, folder: str, document_id: str) -> Path:
        target = self.project_root / folder / f"{document_id}.md"
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text("published content", encoding="utf-8")
        return target

    def test_deleting_draft_never_deletes_same_id_published_content(self):
        for payload in ({"id": "post_123"}, {"id": "post_123", "type": "draft"}):
            with self.subTest(payload=payload):
                draft = self._write_draft("post_123", "文章草稿")
                post = self._write_published("posts", "post_123")
                chatter = self._write_published("chatters", "post_123")
                with patch.object(drafts, "delete_document_from_configured_blog") as mirror:
                    result = self.client.post("/api/drafts/delete", json=payload).json()
                    self.assertTrue(result["success"])
                    self.assertFalse(draft.exists())
                    self.assertEqual(post.read_text(), "published content")
                    self.assertEqual(chatter.read_text(), "published content")
                    mirror.assert_not_called()

    def test_published_deletion_is_scoped_and_retryable(self):
        for doc_type, folder, other in (("post", "posts", "chatters"), ("chatter", "chatters", "posts")):
            with self.subTest(doc_type=doc_type):
                draft = self._write_draft("shared", "保留草稿")
                target = self._write_published(folder, "shared")
                unrelated = self._write_published(other, "shared")
                payload = {"id": "shared", "type": doc_type}
                with patch.object(drafts, "delete_document_from_configured_blog", side_effect=[(False, "offline"), (True, "done")]) as mirror:
                    self.assertFalse(self.client.post("/api/drafts/delete", json=payload).json()["success"])
                    self.assertFalse(target.exists())
                    self.assertTrue(self.client.post("/api/drafts/delete", json=payload).json()["success"])
                    self.assertEqual(mirror.call_count, 2)
                    mirror.assert_called_with(doc_type, "shared")
                self.assertTrue(draft.exists())
                self.assertTrue(unrelated.exists())

    def test_invalid_deletion_and_io_failure_do_not_report_success(self):
        draft = self._write_draft("post_123", "保留")
        for payload in ([], {"id": 123}, {"id": "../post_123"}, {"id": "post_123", "type": "all"}):
            self.assertFalse(self.client.post("/api/drafts/delete", json=payload).json()["success"])
        with patch.object(drafts.os, "remove", side_effect=PermissionError("locked")):
            self.assertFalse(self.client.post("/api/drafts/delete", json={"id": "post_123"}).json()["success"])
        self.assertTrue(draft.exists())

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
