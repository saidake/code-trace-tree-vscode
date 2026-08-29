#!/usr/bin/env python3
"""Create a nested Code Trace Tree in one call.

Ensures only nodes that may already exist (payload roots, then children of
already-present nodes). Once a node is created, its descendants are added
without ensure. Prefer --tree-file over inline --tree on PowerShell.
"""
from __future__ import annotations

import argparse
import json
import sys
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Optional

from trace_tree import (
    apply_shared_defaults,
    bump_updated_at,
    child_text,
    configure_stdio_utf8,
    infer_path_kind,
    load_context,
    node_to_row,
    node_trace,
    parent_refs_from_args,
    place_node,
    print_json,
    refresh_line_occurrence_fields,
    request_refresh_profile,
    resolve_parent_path,
    write_atomic,
)


@dataclass
class NodeSpec:
    kind: Optional[str]
    file: str
    line: Optional[int] = None
    content: Optional[str] = None
    name: str = ""
    description: str = ""
    children: list["NodeSpec"] = field(default_factory=list)


def parse_tree_payload(raw: Any) -> list[NodeSpec]:
    if isinstance(raw, dict):
        return [parse_spec(raw)]
    if isinstance(raw, list):
        if not raw:
            return []
        return [parse_spec(item) for item in raw]
    raise SystemExit(
        "ERROR: tree JSON must be a node object or an array of node objects"
    )


def parse_spec(raw: Any) -> NodeSpec:
    if not isinstance(raw, dict):
        raise SystemExit(
            "ERROR: each tree node (including children) must be a JSON object "
            'with "file" and "type" (LINE needs "line" and "content"). '
            f"Got {raw!r}"
        )

    file = raw.get("file")
    if file is None:
        raise SystemExit(f"ERROR: tree node needs file, got {raw!r}")
    file = str(file)
    line = raw.get("line")
    content = raw.get("content")
    name = str(raw.get("name") or raw.get("trace-name") or raw.get("traceName") or "")
    description = str(raw.get("description") or "")
    kind_raw = raw.get("type")
    kind: Optional[str]
    if kind_raw is None:
        kind = "LINE" if (line is not None or content is not None) else None
    else:
        kind = str(kind_raw).upper()
        if kind not in ("LINE", "FILE", "DIRECTORY"):
            raise SystemExit(f"ERROR: unknown type {kind!r}")
    if kind == "LINE":
        if line is None or content is None:
            raise SystemExit(
                "ERROR: LINE tree node needs file, line, and content "
                f"(got {raw!r})"
            )
        line = int(line)
        content = str(content)
    children_raw = raw.get("children") or []
    if not isinstance(children_raw, list):
        raise SystemExit("ERROR: children must be an array of node objects")
    return NodeSpec(
        kind=kind,
        file=file,
        line=line,
        content=content,
        name=name,
        description=description,
        children=[parse_spec(child) for child in children_raw],
    )


def insert_spec(
    project_root: Path,
    roots_el: Any,
    spec: NodeSpec,
    parent: Any,
    *,
    ensure: bool,
    line_tips: set[tuple[str, str]],
) -> dict:
    kind = spec.kind
    if kind is None:
        kind = infer_path_kind(project_root, spec.file)
    if kind not in ("LINE", "FILE", "DIRECTORY"):
        raise SystemExit(f"ERROR: unknown type {kind}")

    node, skipped, resolve_meta = place_node(
        project_root,
        roots_el,
        kind=kind,
        file=spec.file,
        line=spec.line,
        content=spec.content,
        name=spec.name,
        description=spec.description,
        parent=parent,
        get_or_add=ensure,
    )
    created = not skipped
    if created and kind == "LINE":
        tp = node_trace(node)
        line_tips.add((child_text(tp, "tracePath"), child_text(tp, "lineContent")))

    child_ensure = ensure if skipped else False
    child_rows = [
        insert_spec(
            project_root,
            roots_el,
            child,
            node,
            ensure=child_ensure,
            line_tips=line_tips,
        )
        for child in spec.children
    ]
    parent_id = child_text(node, "parentId")
    row = {
        "skipped": skipped,
        "created": created,
        "node": node_to_row(node, 0, parent_id),
        "children": child_rows,
    }
    if resolve_meta is not None:
        row["resolve"] = resolve_meta
    return row


def load_tree_json(args: argparse.Namespace) -> Any:
    sources = [bool(args.tree), bool(args.tree_file), bool(args.tree_path)]
    if sum(sources) != 1:
        raise SystemExit(
            "ERROR: pass exactly one of --tree, --tree-file, or a positional JSON file"
        )
    if args.tree:
        try:
            return json.loads(args.tree)
        except json.JSONDecodeError as exc:
            raise SystemExit(f"ERROR: invalid --tree JSON: {exc}") from exc
    path = Path(args.tree_file or args.tree_path)
    if str(path) == "-":
        raw = sys.stdin.read()
    else:
        raw = path.read_text(encoding="utf-8")
    try:
        return json.loads(raw)
    except json.JSONDecodeError as exc:
        raise SystemExit(f"ERROR: invalid tree JSON: {exc}") from exc


def count_flags(rows: list[dict]) -> tuple[int, int]:
    created = skipped = 0
    for row in rows:
        if row.get("created"):
            created += 1
        if row.get("skipped"):
            skipped += 1
        c, s = count_flags(row.get("children") or [])
        created += c
        skipped += s
    return created, skipped


def collect_ids(rows: list[dict]) -> list[str]:
    ids: list[str] = []
    for row in rows:
        nid = (row.get("node") or {}).get("id")
        if nid:
            ids.append(nid)
        ids.extend(collect_ids(row.get("children") or []))
    return ids


def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(
        description=(
            "Create a nested trace-point tree. Ensures payload roots (and children "
            "of already-present nodes); adds the rest."
        )
    )
    p.add_argument("--project", default=None, help="Project path (default: cwd)")
    p.add_argument("--profile", default=None, help="Profile name override")
    p.add_argument("--dry-run", action="store_true", help="Do not write XML or refresh")
    p.add_argument("--no-refresh", action="store_true", help="Skip IDE refresh signal")
    p.add_argument(
        "--parent-id",
        action="append",
        dest="parent_ids",
        default=None,
        metavar="ID",
        help="Existing parent UUID; repeat rootward -> immediate parent. Omit for profile root.",
    )
    p.add_argument(
        "--parent",
        default=None,
        help='Optional JSON parent path of existing nodes. Do not combine with --parent-id.',
    )
    p.add_argument("--tree", default=None, help="Tree JSON string (node object or array of node objects)")
    p.add_argument(
        "--tree-file",
        default=None,
        help="Path to tree JSON (use - for stdin). Prefer this over --tree on PowerShell.",
    )
    p.add_argument(
        "tree_path",
        nargs="?",
        default=None,
        help="Positional tree JSON file (alternative to --tree-file)",
    )
    return p


def main(argv: list[str] | None = None) -> int:
    configure_stdio_utf8()
    parser = build_parser()
    args = parser.parse_args(argv)
    apply_shared_defaults(args)
    payload = load_tree_json(args)
    specs = parse_tree_payload(payload)
    if not specs:
        raise SystemExit("ERROR: tree JSON is empty")

    project_root, storage_xml, tree, root, profile_name, roots_el = load_context(
        args.project, args.profile, ensure=True
    )
    parent_path = parent_refs_from_args(args, required=False)
    parent = resolve_parent_path(roots_el, parent_path)
    parent_id = child_text(parent, "id") if parent is not None else ""

    line_tips: set[tuple[str, str]] = set()
    rows = [
        insert_spec(
            project_root,
            roots_el,
            spec,
            parent,
            ensure=True,
            line_tips=line_tips,
        )
        for spec in specs
    ]
    created, skipped = count_flags(rows)

    if not args.dry_run:
        for rel_file, content in sorted(line_tips):
            refresh_line_occurrence_fields(roots_el, project_root, rel_file, content)
        bump_updated_at(root)
        write_atomic(tree, storage_xml)
        if not args.no_refresh:
            request_refresh_profile(project_root, profile_name)

    print_json(
        {
            "action": "create_tree",
            "dry_run": bool(args.dry_run),
            "profile": profile_name,
            "storage_xml": str(storage_xml),
            "parentId": parent_id,
            "created": created,
            "skipped": skipped,
            "ids": collect_ids(rows),
            "roots": rows,
            "refreshed": (not args.dry_run) and (not args.no_refresh),
        }
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
