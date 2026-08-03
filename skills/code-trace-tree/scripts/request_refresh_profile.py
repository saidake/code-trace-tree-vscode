#!/usr/bin/env python3
"""
Ask the IDE to reload one Code Trace Tree profile from disk.

Usage:
  request_refresh_profile.py [project_path] [profile_name]

- profile_name omitted or empty → IDE refreshes its current active profile
- Does not change activeProfileName or toolbar flags (use request_refresh.py for that)

Signal file body: first line = profile name (may be empty).
"""
from __future__ import annotations

import sys
from pathlib import Path

from trace_tree import find_project_root, read_project_id, request_refresh_profile


def main(argv: list[str] | None = None) -> int:
    args = list(sys.argv[1:] if argv is None else argv)
    start = Path(".")
    profile_name = ""
    if args:
        # If first arg looks like a path that exists or contains separators, treat as project.
        # Otherwise treat as profile name when only one arg and no project path needed.
        if len(args) == 1:
            candidate = Path(args[0])
            if candidate.exists() or "/" in args[0] or "\\" in args[0] or args[0] in (".", ".."):
                start = candidate
            else:
                profile_name = args[0]
        else:
            start = Path(args[0])
            profile_name = args[1]

    try:
        project_root = find_project_root(start)
    except SystemExit as exc:
        print(exc, file=sys.stderr)
        return 1

    if not read_project_id(project_root):
        print(
            "ERROR: no project id file. Run init_storage.py or create data in the IDE first.",
            file=sys.stderr,
        )
        return 2

    wrote = request_refresh_profile(project_root, profile_name or None)
    if wrote is None:
        print(
            "ERROR: no project id file. Run init_storage.py or create data in the IDE first.",
            file=sys.stderr,
        )
        return 2

    print(f"wrote={wrote}")
    print(f"profile={profile_name or '(active)'}")
    print(
        "IDE should reload that profile if the project is open with the plugin "
        "(signal TTL 60s)."
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
