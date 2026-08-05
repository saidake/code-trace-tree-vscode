#!/usr/bin/env python3
"""Ask the IDE to fully reload Code Trace Tree storage (all profiles + toolbar flags)."""
from __future__ import annotations

import sys
from pathlib import Path

from trace_tree import find_project_root, read_project_id, request_refresh


def main(argv: list[str] | None = None) -> int:
    args = list(sys.argv[1:] if argv is None else argv)
    start = Path(args[0] if args else ".")
    try:
        project_root = find_project_root(start)
    except SystemExit as exc:
        print(exc, file=sys.stderr)
        return 1

    if not read_project_id(project_root):
        print(
            "ERROR: no bound project id. Run init_storage.py or create data in the IDE first.",
            file=sys.stderr,
        )
        return 2

    wrote = request_refresh(project_root)
    if wrote is None:
        print(
            "ERROR: no bound project id. Run init_storage.py or create data in the IDE first.",
            file=sys.stderr,
        )
        return 2

    print(f"wrote={wrote}")
    print(
        "IDE should fully reload Code Trace Tree data if the project is open "
        "with the plugin (signal TTL 60s)."
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
