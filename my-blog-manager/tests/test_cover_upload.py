import asyncio
import socket
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

from fastapi import FastAPI
from fastapi.testclient import TestClient

from cms_core.api import picbed


class CoverUploadTests(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.project_root = Path(self.temp_dir.name)
        self.project_patch = patch.object(picbed, "PROJECT_ROOT", str(self.project_root), create=True)
        self.project_patch.start()

        app = FastAPI()
        app.include_router(picbed.router, prefix="/api/picbed")
        self.client = TestClient(app)

    def tearDown(self):
        self.project_patch.stop()
        self.temp_dir.cleanup()

    def test_cropped_cover_is_saved_locally_without_picbed_credentials(self):
        runtime_public = self.project_root / ".next" / "standalone" / "public"
        runtime_public.mkdir(parents=True)
        jpeg = b"\xff\xd8\xff\xe0local-cover"
        response = self.client.post(
            "/api/picbed/upload-cover",
            files={"file": ("cover.jpg", jpeg, "image/jpeg")},
        )

        self.assertEqual(response.status_code, 200)
        result = response.json()
        self.assertTrue(result["success"])
        self.assertTrue(result["runtimeMirrored"])
        self.assertTrue(result["url"].startswith("/uploads/covers/cover-"))
        stored = self.project_root / "public" / result["url"].lstrip("/")
        self.assertEqual(stored.read_bytes(), jpeg)
        runtime_copy = runtime_public / result["url"].lstrip("/")
        self.assertEqual(runtime_copy.read_bytes(), jpeg)

        preview = self.client.get(f"/api/picbed/covers/{Path(result['url']).name}")
        self.assertEqual(preview.status_code, 200)
        self.assertEqual(preview.headers["content-type"], "image/jpeg")
        self.assertEqual(preview.content, jpeg)

    def test_cropped_cover_rejects_non_jpeg_payloads(self):
        response = self.client.post(
            "/api/picbed/upload-cover",
            files={"file": ("cover.txt", b"plain text", "text/plain")},
        )

        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json()["detail"], "裁剪封面必须是 JPEG 图片")

    def test_image_proxy_rejects_local_network_targets(self):
        response = self.client.get(
            "/api/picbed/proxy-image",
            params={"url": "http://127.0.0.1/private-image.jpg"},
        )

        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json()["detail"], "图片链接不能指向本机或内网地址")

    def test_public_hostname_may_resolve_to_desktop_proxy_fake_ip(self):
        fake_loop = SimpleNamespace(
            getaddrinfo=AsyncMock(
                return_value=[
                    (
                        socket.AddressFamily.AF_INET,
                        socket.SocketKind.SOCK_STREAM,
                        0,
                        "",
                        ("198.18.0.202", 443),
                    )
                ]
            )
        )

        with patch.object(picbed.asyncio, "get_running_loop", return_value=fake_loop):
            asyncio.run(picbed.validate_public_image_url("https://img.example.com/photo.jpg"))

    def test_literal_desktop_proxy_fake_ip_remains_blocked(self):
        with self.assertRaisesRegex(Exception, "图片链接不能指向本机或内网地址"):
            asyncio.run(picbed.validate_public_image_url("http://198.18.0.202/photo.jpg"))


if __name__ == "__main__":
    unittest.main()
