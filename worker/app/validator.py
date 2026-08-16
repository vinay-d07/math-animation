"""Static AST-based safety check for AI/user-authored scene code.

This runs before a job is ever enqueued for execution. It is defense-in-depth,
not a sandbox: it rejects code that references disallowed modules or builtins,
but it never executes anything. Real isolation (no network egress, capped
resources, ephemeral fs) still has to happen at the execution boundary — this
just keeps obviously hostile code from reaching that boundary at all.
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
