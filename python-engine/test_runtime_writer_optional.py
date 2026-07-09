import importlib
import os
import tempfile
import unittest
from pathlib import Path


class RuntimeWriterOptionalTest(unittest.TestCase):
    def load_modules(self, root):
        os.environ["PYTHON_ENGINE_RUNTIME_ROOT"] = str(root)
        import runtime_state
        import runtime.runtime_writer as runtime_writer

        importlib.reload(runtime_state)
        importlib.reload(runtime_writer)
        return runtime_writer

    def test_runtime_writer_is_noop_by_default(self):
        with tempfile.TemporaryDirectory() as directory:
            os.environ.pop("DEBUG_WRITE_RUNTIME_JSON", None)
            writer = self.load_modules(Path(directory))

            result = writer.write_runtime("user-a", "scan_results", {"ok": True})

            self.assertIsNone(result)
            self.assertEqual(list(Path(directory).rglob("*.json")), [])

    def test_runtime_writer_writes_only_when_debug_enabled(self):
        with tempfile.TemporaryDirectory() as directory:
            os.environ["DEBUG_WRITE_RUNTIME_JSON"] = "true"
            writer = self.load_modules(Path(directory))

            result = writer.write_runtime("user-a", "scan_results", {"ok": True})

            self.assertIsNotNone(result)
            self.assertTrue(Path(result).exists())


if __name__ == "__main__":
    unittest.main()
