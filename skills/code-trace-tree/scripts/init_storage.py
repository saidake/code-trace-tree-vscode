#!/usr/bin/env python3
"""
Ensure Code Trace Tree storage exists for a project.

Resolves existing storage first (prefer `.idea/code-trace-tree.project.id`, else path).
Only when missing: Case C create XML with <path> + <projectId>.
If `.idea` id exists but XML is gone, recreates with that same projectId (not a new UUID).
Does **not** create/overwrite `.idea/code-trace-tree.project.id`.

Use before writing traces when the project has never used the plugin.
Mutating `trace_tree` commands (add / ensure / move / delete / rebind) also call this
automatically via ensure_storage.
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
        storage_xml = create_fresh_storage(project_root)
        created = True

    project_id = read_project_id(project_root)
    app_dir = global_app_dir()

    print_json(
        {
            "created": created,
            "project_root": str(project_root),
            "global_dir": str(app_dir),
            "project_id": project_id or None,
            "storage_xml": str(storage_xml) if storage_xml else None,
        }
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
