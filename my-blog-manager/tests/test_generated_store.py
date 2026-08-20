import tempfile
import unittest
from pathlib import Path

from cms_core.generated_store import atomic_write_text, require_list


class GeneratedStoreTests(unittest.TestCase):
    def test_atomic_write_replaces_existing_content(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            target = Path(temp_dir) / "data" / "friends.ts"
            atomic_write_text(target, "old")
            atomic_write_text(target, "new")
            self.assertEqual(target.read_text(encoding="utf-8"), "new")
            self.assertEqual(list(target.parent.glob(".friends.ts.*.tmp")), [])

    def test_require_list_rejects_missing_or_object_payloads(self):
        self.assertEqual(require_list({"friends": []}, "friends"), [])
        with self.assertRaises(ValueError):
            require_list({}, "friends")
        with self.assertRaises(ValueError):
            require_list({"friends": {}}, "friends")


if __name__ == "__main__":
    unittest.main()
