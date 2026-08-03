#!/usr/bin/env python3
"""
Create Code Trace Tree project id + empty global XML when none exist yet (Case C).

Use before writing traces when the project has never used the plugin.
Mutating `trace_tree` commands (add / move / delete / rebind) also call this
automatically via ensure_storage.
"""
from __future__ import annotations

import sys
from pathlib import Path

from trace_tree import (
    create_fresh_storage,
    find_project_root,
    global_app_dir,
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

    print(f"created={'true' if created else 'false'}")
    print(f"project_root={project_root}")
    print(f"global_dir={app_dir}")
    print(f"project_id={project_id}")
    if project_id:
        print(f"refresh_signal={app_dir / 'signals' / f'{project_id}.request_refresh'}")
        print(f"select_signal={app_dir / 'signals' / f'{project_id}.select_trace_points'}")
    else:
        print("refresh_signal=")
        print("select_signal=")
    print(f"storage_xml={storage_xml}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
