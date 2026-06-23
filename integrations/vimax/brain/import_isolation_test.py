import ast, os, sys, unittest

BRAIN = os.path.dirname(__file__)
REPO = os.path.abspath(os.path.join(BRAIN, "..", "..", ".."))
ORCH = os.path.join(REPO, "services", "vimax_native_orchestrator.py")

FORBIDDEN = {
    "langchain", "langchain_core", "tenacity", "pydantic", "requests",
    "cv2", "PIL", "vimax_broker_service", "services.vimax_broker_service",
}


def _read(path):
    with open(path, encoding="utf-8") as handle:
        return handle.read()


def _imports(path):
    tree = ast.parse(_read(path), filename=path)
    names = set()
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            for a in node.names:
                names.add(a.name.split(".")[0])
                names.add(a.name)
        elif isinstance(node, ast.ImportFrom) and node.module:
            names.add(node.module.split(".")[0])
            names.add(node.module)
    return names


class ImportIsolationTest(unittest.TestCase):
    def test_brain_modules_are_stdlib_only(self):
        for fname in os.listdir(BRAIN):
            if not fname.endswith(".py") or fname.endswith("_test.py"):
                continue
            bad = _imports(os.path.join(BRAIN, fname)) & FORBIDDEN
            self.assertFalse(bad, f"brain/{fname} imports forbidden: {bad}")

    def test_native_orchestrator_never_imports_broker_or_ledger(self):
        names = _imports(ORCH)
        for forbidden in ("vimax_broker_service", "services.vimax_broker_service"):
            self.assertNotIn(forbidden, names,
                             "native orchestrator must not import the broker (R-cost)")
        # It also must not write the ledger/ticket files (grep the source text).
        src = _read(ORCH)
        self.assertNotIn("vimax_ledger", src)
        self.assertNotIn("vimax_tickets", src)

    def test_no_dynamic_broker_import_anywhere(self):
        # Static import analysis above misses importlib.import_module(...) /
        # __import__(...); guard those by source-text scan across brain/* + orch.
        targets = [os.path.join(BRAIN, f) for f in os.listdir(BRAIN)
                   if f.endswith(".py") and not f.endswith("_test.py")] + [ORCH]
        for path in targets:
            src = _read(path)
            if "vimax_broker_service" in src:
                self.assertNotIn("import_module", src, f"{path}: dynamic broker import")
                self.assertNotIn("__import__", src, f"{path}: dynamic broker import")
            # A literal "vimax_broker_service" string anywhere in brain/orch is a
            # smell even if not a dynamic import - fail and force a human look.
            self.assertNotIn("vimax_broker_service", src,
                             f"{path}: references the broker module (R-cost isolation)")


if __name__ == "__main__":
    unittest.main()
