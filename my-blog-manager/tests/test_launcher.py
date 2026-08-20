import tempfile
import unittest
from pathlib import Path

from launcher import get_free_port, prepare_standalone_assets


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


if __name__ == "__main__":
    unittest.main()
