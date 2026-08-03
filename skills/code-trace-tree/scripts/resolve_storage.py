#!/usr/bin/env python3
"""Resolve Code Trace Tree project id + bound global XML for the current project."""
from __future__ import annotations

import sys
from pathlib import Path

from trace_tree import (
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

    app_dir = global_app_dir()
    project_id = read_project_id(project_root)
    storage_xml = ""
    try:
        storage_xml = str(resolve_storage(project_root))
    except SystemExit:
        storage_xml = ""

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

    if not storage_xml:
        print(
            "ERROR: no Code Trace Tree storage XML found. "
            "Open the project once in the IDE with the plugin installed.",
            file=sys.stderr,
        )
        return 2
    return 0


if __name__ == "__main__":
    sys.exit(main())
