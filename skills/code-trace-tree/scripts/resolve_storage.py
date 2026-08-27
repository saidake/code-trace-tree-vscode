#!/usr/bin/env python3
"""Resolve Code Trace Tree project id + bound global XML for the current project."""
from __future__ import annotations

import sys
from pathlib import Path

from trace_tree import (
    find_project_root,
    global_app_dir,
    print_json,
    read_project_id,
    resolve_storage,
)


def main(argv: list[str] | None = None) -> int:
    args = list(sys.argv[1:] if argv is None else argv)
    start = Path(args[0] if args else ".")
    try:
        project_root = find_project_root(start)
    except SystemExit as exc:
        print(exc, file=sys.stderr)
        return 1

    app_dir = global_app_dir()
    project_id = read_project_id(project_root)
    storage_xml = ""
    try:
        storage_xml = str(resolve_storage(project_root))
    except SystemExit:
        storage_xml = ""

    print_json(
        {
            "project_root": str(project_root),
            "global_dir": str(app_dir),
            "project_id": project_id or None,
            "storage_xml": storage_xml or None,
        }
    )

    if not storage_xml:
        print(
            "ERROR: no Code Trace Tree storage XML found. "
            "Run init_storage.py, or create a trace point / profile in the IDE, "
            "or import plugin data first.",
            file=sys.stderr,
        )
        return 2
    return 0


if __name__ == "__main__":
    sys.exit(main())
