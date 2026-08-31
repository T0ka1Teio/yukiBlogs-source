import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import launcher
from launcher import WindowAPI, get_free_port, prepare_standalone_assets


class FakeWindow:
    def __init__(self):
        self.calls = []

    def maximize(self):
        self.calls.append("maximize")

    def restore(self):
        self.calls.append("restore")

    def resize(self, width, height):
        self.calls.append(("resize", width, height))


class StandaloneAssetsTests(unittest.TestCase):
    def test_backend_port_excludes_stable_frontend_port(self):
        frontend_port = get_free_port()
        self.assertNotEqual(get_free_port({frontend_port}), frontend_port)

    def test_static_and_public_assets_are_copied_into_standalone_runtime(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / ".next" / "standalone").mkdir(parents=True)
            (root / ".next" / "static" / "chunks").mkdir(parents=True)
            (root / ".next" / "static" / "chunks" / "app.js").write_text("chunk", encoding="utf-8")
            (root / "public").mkdir()
            (root / "public" / "logo.svg").write_text("logo", encoding="utf-8")

            self.assertTrue(prepare_standalone_assets(str(root)))
            self.assertEqual(
                (root / ".next" / "standalone" / ".next" / "static" / "chunks" / "app.js").read_text(encoding="utf-8"),
                "chunk",
            )
            self.assertEqual(
                (root / ".next" / "standalone" / "public" / "logo.svg").read_text(encoding="utf-8"),
                "logo",
            )


class WindowApiTests(unittest.TestCase):
    def test_maximize_toggles_between_native_maximize_and_restore(self):
        fake_window = FakeWindow()
        api = WindowAPI()
        with (
            patch.object(launcher.webview, "windows", [fake_window]),
            patch.object(launcher, "load_window_size", return_value={"width": 1440, "height": 900}),
        ):
            self.assertEqual(api.maximize_window(), {"maximized": True, "width": 1440, "height": 900})
            self.assertEqual(api.maximize_window(), {"maximized": False, "width": 1440, "height": 900})

        self.assertEqual(fake_window.calls, ["maximize", "restore"])

    def test_resize_restores_a_maximized_window_first(self):
        fake_window = FakeWindow()
        api = WindowAPI()
        with (
            patch.object(launcher.webview, "windows", [fake_window]),
            patch.object(launcher, "load_window_size", return_value={"width": 1200, "height": 800}),
            patch.object(launcher, "save_window_size") as save_window_size,
        ):
            api.maximize_window()
            state = api.resize_window(1200, 800)

        self.assertEqual(state, {"maximized": False, "width": 1200, "height": 800})
        save_window_size.assert_called_once_with(1200, 800)
        self.assertEqual(fake_window.calls, ["maximize", "restore", ("resize", 1200, 800)])


if __name__ == "__main__":
    unittest.main()
