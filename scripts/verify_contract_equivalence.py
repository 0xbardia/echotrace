#!/usr/bin/env python3
"""Verify that the two EchoTrace contract variants differ only at runner edges.

This is a source-level check, not a proof that two GenLayer runtimes have
identical implementations.  It removes only the explicitly approved stable /
release-candidate compatibility regions, then compares the complete remaining
Python AST and all non-approved comments.
"""

from __future__ import annotations

import ast
import difflib
import hashlib
import io
import json
import re
import sys
import tokenize
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
STABLE_PATH = ROOT / "contracts" / "echotrace.py"
STUDIO_PATH = ROOT / "contracts" / "echotrace_studio_dev.py"

DEPENDENCY_RE = re.compile(r'^# \{ "Depends": "py-genlayer:[^"]+" \}$')
STABLE_DOCSTRING = """EchoTrace — consensus source-independence registry.

A sealed set of HTTPS sources is fetched and classified by every validator.
The persisted result is a provenance relation graph plus deterministic groups.
It does not decide whether a factual claim is true.
"""
STUDIO_DOCSTRING = """EchoTrace — consensus source-independence registry.

Studio-dev runner port of contracts/echotrace.py. Grounding, relations, groups,
and the equivalence comparison are the same. This file exists because Studionet
and the Studio development preview currently accept different py-genlayer runners.
It does not decide whether a factual claim is true.
"""

EXPECTED_STABLE_IMPORTS = [
    ("ImportFrom", "genlayer", [("*", None)]),
]
EXPECTED_STUDIO_IMPORTS = [
    ("Import", None, [("genlayer", "gl")]),
    ("ImportFrom", "genlayer.types", [("*", None)]),
    (
        "ImportFrom",
        "genlayer.storage",
        [("TreeMap", None), ("allow", "allow_storage")],
    ),
]

APPROVED_DIFFERENCES = [
    "py-genlayer dependency pin",
    "preview-specific module metadata/docstring",
    "GenLayer import/binding form",
    "EchoTrace contract base-class binding",
    "nondeterministic consensus entry-point binding",
]


class VerificationError(RuntimeError):
    """Raised when a source difference is outside the approved allowlist."""


def fail(message: str) -> None:
    raise VerificationError(message)


def import_key(node: ast.AST) -> tuple[str, str | None, list[tuple[str, str | None]]]:
    if isinstance(node, ast.Import):
        return (
            "Import",
            None,
            [(alias.name, alias.asname) for alias in node.names],
        )
    if isinstance(node, ast.ImportFrom):
        return (
            "ImportFrom",
            node.module,
            [(alias.name, alias.asname) for alias in node.names],
        )
    fail(f"unexpected import node: {type(node).__name__}")


def is_genlayer_import(node: ast.AST) -> bool:
    if isinstance(node, ast.Import):
        return any(alias.name == "genlayer" or alias.name.startswith("genlayer.") for alias in node.names)
    if isinstance(node, ast.ImportFrom):
        return (node.module or "").startswith("genlayer")
    return False


def validate_imports(tree: ast.Module, variant: str) -> None:
    imports = [
        import_key(node)
        for node in tree.body
        if isinstance(node, (ast.Import, ast.ImportFrom)) and is_genlayer_import(node)
    ]
    expected = EXPECTED_STABLE_IMPORTS if variant == "stable" else EXPECTED_STUDIO_IMPORTS
    if imports != expected:
        fail(f"{variant} GenLayer import/binding form changed: {imports!r}")


def validate_header_and_docstring(text: str, variant: str) -> None:
    lines = text.splitlines()
    if not lines or not DEPENDENCY_RE.fullmatch(lines[0]):
        fail(f"{variant} dependency declaration is missing or malformed")
    tree = ast.parse(text)
    if not tree.body or not isinstance(tree.body[0], ast.Expr):
        fail(f"{variant} module docstring is missing")
    value = tree.body[0].value
    if not isinstance(value, ast.Constant) or not isinstance(value.value, str):
        fail(f"{variant} module docstring is not a string")
    expected = STABLE_DOCSTRING if variant == "stable" else STUDIO_DOCSTRING
    if value.value != expected:
        fail(f"{variant} module metadata/docstring changed outside the approved preview text")


def comments_without_dependency_line(text: str) -> list[str]:
    result: list[str] = []
    try:
        tokens = tokenize.generate_tokens(io.StringIO(text).readline)
        for token in tokens:
            if token.type == tokenize.COMMENT and token.start[0] != 1:
                result.append(token.string)
    except tokenize.TokenError as error:
        fail(f"could not tokenize comments: {error}")
    return result


def is_run_nondet_call(node: ast.AST) -> bool:
    if not isinstance(node, ast.Call) or not isinstance(node.func, ast.Attribute):
        return False
    vm = node.func.value
    return (
        node.func.attr in {"run_nondet", "run_nondet_unsafe"}
        and isinstance(vm, ast.Attribute)
        and vm.attr == "vm"
        and isinstance(vm.value, ast.Name)
        and vm.value.id == "gl"
    )


def normalized_tree(text: str, variant: str) -> ast.Module:
    tree = ast.parse(text)
    validate_imports(tree, variant)

    # The module docstring was validated above and is metadata, not logic.
    tree.body = tree.body[1:]

    # Remove only the approved GenLayer import nodes. Any other import remains
    # in the AST and therefore causes a mismatch if it differs.
    tree.body = [
        node
        for node in tree.body
        if not (
            isinstance(node, (ast.Import, ast.ImportFrom))
            and (
                (isinstance(node, ast.Import) and any(a.name == "genlayer" for a in node.names))
                or (isinstance(node, ast.ImportFrom) and (node.module or "").startswith("genlayer"))
            )
        )
    ]

    classes = [node for node in tree.body if isinstance(node, ast.ClassDef) and node.name == "EchoTrace"]
    if len(classes) != 1:
        fail(f"{variant} must contain exactly one EchoTrace class")
    contract = classes[0]
    expected_base = "gl.Contract" if variant == "stable" else "gl.contract.Contract"
    if len(contract.bases) != 1 or ast.unparse(contract.bases[0]) != expected_base:
        actual = [ast.unparse(base) for base in contract.bases]
        fail(f"{variant} EchoTrace base binding changed: {actual!r}")
    contract.bases = [ast.parse("gl.Contract", mode="eval").body]

    calls = [node for node in ast.walk(tree) if is_run_nondet_call(node)]
    expected_entry = "run_nondet_unsafe" if variant == "stable" else "run_nondet"
    if len(calls) != 1:
        fail(f"{variant} must contain exactly one nondeterministic entry-point call, found {len(calls)}")
    call = calls[0]
    if (
        not isinstance(call.func, ast.Attribute)
        or call.func.attr != expected_entry
        or call.keywords
        or len(call.args) != 2
        or [ast.unparse(arg) for arg in call.args] != ["leader_fn", "validator_fn"]
    ):
        fail(f"{variant} nondeterministic entry-point binding changed")
    call.func.attr = "run_nondet_unsafe"

    ast.fix_missing_locations(tree)
    return tree


def public_surface(tree: ast.Module) -> dict[str, Any]:
    writes: list[str] = []
    views: list[str] = []
    state_fields: list[dict[str, str]] = []
    storage_records: list[dict[str, Any]] = []
    for node in tree.body:
        if not isinstance(node, ast.ClassDef):
            continue
        fields: list[dict[str, str]] = []
        for child in node.body:
            if isinstance(child, ast.AnnAssign) and isinstance(child.target, ast.Name):
                fields.append({"name": child.target.id, "annotation": ast.unparse(child.annotation)})
            if isinstance(child, (ast.FunctionDef, ast.AsyncFunctionDef)):
                decorators = [ast.unparse(decorator) for decorator in child.decorator_list]
                if any("gl.public.write" in decorator for decorator in decorators):
                    writes.append(child.name)
                if any("gl.public.view" in decorator for decorator in decorators):
                    views.append(child.name)
        if node.name == "EchoTrace":
            state_fields = fields
        if node.name in {"Assessment", "Source", "Relation"}:
            storage_records.append({"name": node.name, "fields": fields})
    return {
        "writes": sorted(writes),
        "views": sorted(views),
        "state_fields": state_fields,
        "storage_records": storage_records,
    }


def normalized_dump(tree: ast.Module) -> str:
    return ast.dump(tree, annotate_fields=True, include_attributes=False)


def main() -> int:
    stable_bytes = STABLE_PATH.read_bytes()
    studio_bytes = STUDIO_PATH.read_bytes()
    stable_text = stable_bytes.decode("utf-8")
    studio_text = studio_bytes.decode("utf-8")
    stable_hash = hashlib.sha256(stable_bytes).hexdigest()
    studio_hash = hashlib.sha256(studio_bytes).hexdigest()

    validate_header_and_docstring(stable_text, "stable")
    validate_header_and_docstring(studio_text, "studio")
    if comments_without_dependency_line(stable_text) != comments_without_dependency_line(studio_text):
        fail("non-approved comments differ between contract variants")

    stable_normalized = normalized_tree(stable_text, "stable")
    studio_normalized = normalized_tree(studio_text, "studio")
    stable_dump = normalized_dump(stable_normalized)
    studio_dump = normalized_dump(studio_normalized)
    if stable_dump != studio_dump:
        fail("normalized application AST differs outside approved compatibility regions")

    stable_surface = public_surface(stable_normalized)
    studio_surface = public_surface(studio_normalized)
    if stable_surface != studio_surface:
        fail("public methods or storage surface differs between contract variants")

    normalized_hash = hashlib.sha256(stable_dump.encode("utf-8")).hexdigest()
    exact_diff = "".join(
        difflib.unified_diff(
            stable_text.splitlines(True),
            studio_text.splitlines(True),
            fromfile=str(STABLE_PATH.relative_to(ROOT)),
            tofile=str(STUDIO_PATH.relative_to(ROOT)),
        )
    )
    result = {
        "status": "PASS",
        "byte_identical": stable_bytes == studio_bytes,
        "stable_sha256": stable_hash,
        "studio_sha256": studio_hash,
        "normalized_logic_sha256": normalized_hash,
        "normalized_ast_identical": True,
        "approved_differences": APPROVED_DIFFERENCES,
        "public_surface": {
            "write_count": len(stable_surface["writes"]),
            "view_count": len(stable_surface["views"]),
            "writes": stable_surface["writes"],
            "views": stable_surface["views"],
            "state_fields": stable_surface["state_fields"],
            "storage_records": stable_surface["storage_records"],
        },
        "exact_diff": exact_diff,
    }
    print("PASS")
    print(json.dumps(result, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except VerificationError as error:
        print(f"FAIL: {error}", file=sys.stderr)
        raise SystemExit(1)
