import asyncio
import unittest
from unittest.mock import patch

from cms_core.api import picbed


class FakeResponse:
    def __init__(self, status_code, payload):
        self.status_code = status_code
        self._payload = payload

    def json(self):
        return self._payload


class FakeAsyncClient:
    def __init__(self, response, calls):
        self.response = response
        self.calls = calls

    async def __aenter__(self):
        return self

    async def __aexit__(self, exc_type, exc, traceback):
        return False

    async def get(self, url, headers):
        self.calls.append(("GET", url, headers))
        return self.response

    async def post(self, url, headers, files):
        self.calls.append(("POST", url, headers, files))
        return self.response


class FakeUpload:
    filename = "photo.png"
    content_type = "image/png"

    async def read(self):
        return b"image-content"


class PicBedProviderTests(unittest.TestCase):
    def test_dusays_endpoints_remain_compatible(self):
        self.assertEqual(
            picbed.build_picbed_test_endpoint("https://pic.example", "dusays"),
            "https://pic.example/api/v1/profile",
        )
        self.assertEqual(
            picbed.build_picbed_upload_endpoint("https://pic.example", "dusays"),
            "https://pic.example/api/v1/upload",
        )

    def test_cloudflare_imgbed_uses_list_probe_and_r2_upload(self):
        self.assertEqual(
            picbed.build_picbed_test_endpoint("https://imgbed.example", "cloudflare-imgbed"),
            "https://imgbed.example/api/manage/list?start=0&count=1",
        )
        self.assertEqual(
            picbed.build_picbed_upload_endpoint("https://imgbed.example", "cloudflare-imgbed"),
            "https://imgbed.example/upload?uploadChannel=cfr2&returnFormat=full&autoRetry=false",
        )

    def test_cloudflare_imgbed_upload_path_is_normalized_and_encoded(self):
        self.assertEqual(
            picbed.normalize_cloud_path(r"  blog\\2026//夏日  "),
            "/blog/2026/夏日",
        )
        self.assertEqual(
            picbed.build_picbed_upload_endpoint(
                "https://imgbed.example",
                "cloudflare-imgbed",
                "/blog/2026/夏日",
            ),
            "https://imgbed.example/upload?uploadChannel=cfr2&returnFormat=full&autoRetry=false&uploadFolder=blog/2026/%E5%A4%8F%E6%97%A5",
        )
        with self.assertRaises(ValueError):
            picbed.normalize_cloud_path("/blog/../private")

    def test_cloudflare_directory_tree_is_flattened_for_combobox(self):
        paths = picbed.flatten_cloudflare_directory_tree({
            "tree": {
                "name": "/",
                "path": "",
                "children": [{
                    "name": "blog",
                    "path": "blog/",
                    "children": [{
                        "name": "2026",
                        "path": "blog/2026/",
                        "children": [],
                    }],
                }],
            },
        })
        self.assertEqual(paths, ["/", "/blog", "/blog/2026"])

    def test_cloudflare_imgbed_prefers_public_url(self):
        result = picbed.parse_picbed_upload_response(
            [{
                "src": "https://imgbed.example/file/photo.png",
                "publicUrl": "https://img.example/photo.png",
            }],
            "cloudflare-imgbed",
            "https://imgbed.example",
        )
        self.assertEqual(result, "https://img.example/photo.png")

    def test_cloudflare_imgbed_resolves_relative_fallback_url(self):
        result = picbed.parse_picbed_upload_response(
            [{"src": "/file/photo.png"}],
            "cloudflare-imgbed",
            "https://imgbed.example",
        )
        self.assertEqual(result, "https://imgbed.example/file/photo.png")

    def test_profile_storage_keeps_each_provider_separate(self):
        config = {
            "picBedProfiles": {
                "dusays": {"url": "https://dusays.example", "token": "dusays-token"},
                "cloudflare-imgbed": {"url": "https://imgbed.example/", "token": "imgbed-token"},
            }
        }
        self.assertEqual(
            picbed.get_picbed_profile(config, "dusays"),
            {"url": "https://dusays.example", "token": "dusays-token"},
        )
        self.assertEqual(
            picbed.get_picbed_profile(config, "cloudflare-imgbed"),
            {"url": "https://imgbed.example", "token": "imgbed-token"},
        )

    def test_cloudflare_connection_probe_uses_bearer_token(self):
        calls = []
        fake_client = FakeAsyncClient(
            FakeResponse(200, {"files": [], "totalCount": 42}),
            calls,
        )

        with patch.object(picbed.httpx, "AsyncClient", return_value=fake_client):
            result = asyncio.run(picbed.test_picbed_connection({
                "provider": "cloudflare-imgbed",
                "url": "https://imgbed.example/",
                "token": "imgbed_secret",
            }))

        self.assertTrue(result["success"])
        self.assertIn("42", result["message"])
        self.assertEqual(calls[0][0], "GET")
        self.assertEqual(
            calls[0][1],
            "https://imgbed.example/api/manage/list?start=0&count=1",
        )
        self.assertEqual(calls[0][2]["Authorization"], "Bearer imgbed_secret")

    def test_cloudflare_upload_uses_active_profile_and_public_url(self):
        calls = []
        fake_client = FakeAsyncClient(
            FakeResponse(200, [{
                "src": "https://imgbed.example/file/photo.png",
                "publicUrl": "https://img.example/photo.png",
            }]),
            calls,
        )
        config = {
            "picBedProvider": "cloudflare-imgbed",
            "picBedProfiles": {
                "cloudflare-imgbed": {
                    "url": "https://imgbed.example",
                    "token": "imgbed_secret",
                },
            },
        }

        with (
            patch.object(picbed, "load_config", return_value=config),
            patch.object(picbed.httpx, "AsyncClient", return_value=fake_client),
        ):
            result = asyncio.run(picbed.upload_image(FakeUpload(), "", "", ""))

        self.assertTrue(result["success"])
        self.assertEqual(result["url"], "https://img.example/photo.png")
        self.assertEqual(calls[0][0], "POST")
        self.assertEqual(
            calls[0][1],
            "https://imgbed.example/upload?uploadChannel=cfr2&returnFormat=full&autoRetry=false",
        )
        self.assertEqual(calls[0][2]["Authorization"], "Bearer imgbed_secret")
        self.assertEqual(calls[0][3]["file"][0], "photo.png")

    def test_cloudflare_upload_passes_custom_path_and_returns_normalized_path(self):
        calls = []
        fake_client = FakeAsyncClient(
            FakeResponse(200, [{"publicUrl": "https://img.example/photo.png"}]),
            calls,
        )
        config = {
            "picBedProvider": "cloudflare-imgbed",
            "picBedProfiles": {
                "cloudflare-imgbed": {
                    "url": "https://imgbed.example",
                    "token": "imgbed_secret",
                },
            },
        }

        with (
            patch.object(picbed, "load_config", return_value=config),
            patch.object(picbed.httpx, "AsyncClient", return_value=fake_client),
        ):
            result = asyncio.run(picbed.upload_image(FakeUpload(), "", "", "", "/photos/2026"))

        self.assertTrue(result["success"])
        self.assertEqual(result["path"], "/photos/2026")
        self.assertIn("uploadFolder=photos/2026", calls[0][1])


if __name__ == "__main__":
    unittest.main()
