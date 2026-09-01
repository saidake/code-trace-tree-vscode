#!/usr/bin/env python3
"""Ask the IDE (Code Trace Tree plugin) to select trace points by id.

With exactly one valid id, the IDE also navigates to the source location.
"""
from __future__ import annotations

import sys
from pathlib import Path

from trace_tree import find_project_root, print_json, request_select


def main(argv: list[str] | None = None) -> int:
    args = list(sys.argv[1:] if argv is None else argv)
    if not args:
        print(
            f"Usage: {Path(sys.argv[0]).name} <trace-point-id> [trace-point-id...]",
            file=sys.stderr,
        )
        return 1

    try:
        project_root = find_project_root(Path("."))
        request_select(project_root, args)
    except SystemExit as exc:
        print(exc, file=sys.stderr)
        # Distinguish missing project id (exit 2) from missing project root (exit 1).
        msg = str(exc)
        return 2 if "project id" in msg else 1

    print_json({"ids": args})
    return 0


if __name__ == "__main__":
    sys.exit(main())
