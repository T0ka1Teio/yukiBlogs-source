import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from fastapi import FastAPI
from fastapi.testclient import TestClient

from cms_core.api import drafts


class DraftImportTests(unittest.TestCase):
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

    def test_import_markdown_creates_editable_json_draft(self):
        markdown_source = """---
title: 数据库入门
type: chatter
tags:
  - MySQL
  - 教程
cover: https://example.test/cover.jpg
description: 从层级开始理解数据库
mood: 平静
date: 2026-08-19
---

正文开头。

| 层级 | 说明 |
| --- | --- |
| 数据库 | 顶层容器 |
| 数据表 | 数据集合 |
"""

        response = self.client.post(
            "/api/drafts/import",
            files={"file": ("database.md", markdown_source.encode("utf-8"), "text/markdown")},
        )

        self.assertEqual(response.status_code, 200)
        result = response.json()
        self.assertTrue(result["success"])
        self.assertEqual(result["draft"]["title"], "数据库入门")
        self.assertEqual(result["draft"]["type"], "chatter")

        draft_path = self.project_root / "manager_data" / "drafts" / f"{result['id']}.json"
        self.assertTrue(draft_path.exists())
        stored = json.loads(draft_path.read_text(encoding="utf-8"))
        self.assertEqual(stored["tags"], ["MySQL", "教程"])
        self.assertEqual(stored["date"], "2026-08-19")
        self.assertIn("<p>正文开头。</p>", stored["content"])
        self.assertIn("<table>", stored["content"])
        self.assertIn("<th>层级</th>", stored["content"])

        list_response = self.client.post("/api/drafts/list", json={})
        self.assertEqual(list_response.status_code, 200)
        preview = list_response.json()["drafts"][0]["contentPreview"]
        self.assertEqual(preview, "正文开头。 层级 说明 数据库 顶层容器 数据表 数据集合")

    def test_import_without_frontmatter_uses_leading_h1_and_filename_defaults(self):
        response = self.client.post(
            "/api/drafts/import",
            files={
                "file": (
                    "local-notes.md",
                    "\ufeff# 本地笔记\n\n第一段内容。".encode("utf-8"),
                    "text/markdown",
                )
            },
        )

        self.assertEqual(response.status_code, 200)
        stored_path = self.project_root / "manager_data" / "drafts" / f"{response.json()['id']}.json"
        stored = json.loads(stored_path.read_text(encoding="utf-8"))
        self.assertEqual(stored["title"], "本地笔记")
        self.assertEqual(stored["type"], "post")
        self.assertNotIn("<h1>", stored["content"])
        self.assertEqual(stored["content"], "<p>第一段内容。</p>")

    def test_import_rejects_non_markdown_files_without_writing_draft(self):
        response = self.client.post(
            "/api/drafts/import",
            files={"file": ("notes.txt", b"plain text", "text/plain")},
        )

        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json()["detail"], "仅支持导入 .md 文件")
        drafts_dir = self.project_root / "manager_data" / "drafts"
        self.assertFalse(drafts_dir.exists())


if __name__ == "__main__":
    unittest.main()
