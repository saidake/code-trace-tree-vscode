#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Write <projectId>.request_refresh_settings for peer IDE settings reload."""
from __future__ import annotations

import sys
from pathlib import Path

_SCRIPTS = Path(__file__).resolve().parent
if str(_SCRIPTS) not in sys.path:
    sys.path.insert(0, str(_SCRIPTS))

from trace_tree import find_project_root, print_json, request_refresh_settings  # noqa: E402


def main() -> int:
    project = Path(sys.argv[1]).resolve() if len(sys.argv) > 1 else None
    root = find_project_root(project)
    wrote = request_refresh_settings(root)
    if not wrote:
        print("ERROR: no bound project id", file=sys.stderr)
        return 1
    print_json({"ok": True})
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
