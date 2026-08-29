#!/usr/bin/env python3
"""
Resolve Code Trace Tree project id + bound global XML for the current project.

If storage is missing, create it (Case C). If `.idea/code-trace-tree.project.id`
exists but XML is gone, recreates XML with that same projectId.
Does not create/overwrite `.idea/code-trace-tree.project.id`.

The inspect function `resolve_storage()` in trace_tree.py stays read-only
(`trace_tree search` does not auto-create).
"""
from __future__ import annotations

import sys
from pathlib import Path

from trace_tree import (
    create_fresh_storage,
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

    created = False
    try:
        storage_xml = resolve_storage(project_root)
    except SystemExit:
        try:
            storage_xml = create_fresh_storage(project_root)
            created = True
        except SystemExit as exc:
            print(exc, file=sys.stderr)
            return 1

    project_id = read_project_id(project_root)
    print_json(
        {
            "created": created,
            "project_root": str(project_root),
            "global_dir": str(global_app_dir()),
            "project_id": project_id or None,
            "storage_xml": str(storage_xml) if storage_xml else None,
        }
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
