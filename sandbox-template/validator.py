"""Static AST-based safety check for AI/user-authored scene code.

Baked into the E2B sandbox image (see e2b.Dockerfile) and run as the first
command of every render, before manim ever touches the file — a real parse
of the actual code that's about to execute, from inside the same isolation
boundary. The Node-side pre-filter (apps/api/src/validation/astGuard.ts) is
a cheap regex reject that runs before a sandbox is even created; this is
the authoritative check.
"""

import ast
from dataclasses import dataclass

ALLOWED_MODULES = {"manim", "numpy", "math"}

DISALLOWED_NAMES = {
    "eval",
    "exec",
    "__import__",
    "compile",
    "open",
    "globals",
    "locals",
    "vars",
    "exit",
    "quit",
    "input",
}


@dataclass
class ValidationResult:
    ok: bool
    reason: str | None = None


def _root_module(name: str) -> str:
    return name.split(".")[0]


def validate_scene(code: str) -> ValidationResult:
    try:
        tree = ast.parse(code)
    except SyntaxError as e:
        return ValidationResult(ok=False, reason=f"Syntax error: {e}")

    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            for alias in node.names:
                root = _root_module(alias.name)
                if root not in ALLOWED_MODULES:
                    return ValidationResult(ok=False, reason=f"Disallowed import: {alias.name}")

        elif isinstance(node, ast.ImportFrom):
            if node.level and node.level > 0:
                return ValidationResult(ok=False, reason="Relative imports are not allowed")
            root = _root_module(node.module or "")
            if root not in ALLOWED_MODULES:
                return ValidationResult(ok=False, reason=f"Disallowed import: {node.module}")

        elif isinstance(node, ast.Name):
            if node.id in DISALLOWED_NAMES:
                return ValidationResult(ok=False, reason=f"Disallowed name: {node.id}")

        elif isinstance(node, ast.Attribute):
            if node.attr.startswith("__") and node.attr.endswith("__"):
                return ValidationResult(ok=False, reason=f"Disallowed attribute access: {node.attr}")

    return ValidationResult(ok=True)


if __name__ == "__main__":
    # CLI entrypoint: `python3 validator.py <path-to-scene.py>`. Always
    # exits 0 and prints a JSON verdict on stdout — a rejection is an
    # expected outcome, not a process error, so it shouldn't be signaled
    # via exit code (the caller reads the JSON either way).
    import json
    import sys

    scene_path = sys.argv[1]
    with open(scene_path, "r", encoding="utf-8") as f:
        scene_code = f.read()

    result = validate_scene(scene_code)
    print(json.dumps({"ok": result.ok, "reason": result.reason}))
