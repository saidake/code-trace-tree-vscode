#!/usr/bin/env python3
"""
Resolve Code Trace Tree project id + bound global XML for the current project.

If storage is missing, create it (Case C). If `.idea/code-trace-tree.project.id`
exists but XML is gone, recreates XML with that same projectId.
Does not create/overwrite `.idea/code-trace-tree.project.id`.

`resolve_storage()` is read-only (`trace_tree search` does not auto-create).
This CLI creates storage when lookup fails.
"""
from __future__ import annotations

import sys
from pathlib import Path
from typing import Optional

from trace_tree import (
    find_path_matched_xmls,
    find_project_root,
    find_xml_by_project_id,
    global_app_dir,
    print_json,
    read_local_project_id_file,
    read_project_id,
    xml_tag_text,
)


def resolve_storage(project_root: Path) -> Optional[Path]:
    """
    1. `.idea/code-trace-tree.project.id` -> that project's XML (reuse existing bind)
    2. Else XML whose `<path>` matches the project root
    3. Else None (missing is expected; caller may Case C create)
    """
    local_id = read_local_project_id_file(project_root)
    if local_id:
        by_id = find_xml_by_project_id(local_id)
        if by_id is not None:
            return by_id

    matches = find_path_matched_xmls(project_root)
    if len(matches) == 1:
        return matches[0]
    if len(matches) > 1:
        return max(matches, key=lambda x: int(xml_tag_text(x, "updatedAt") or "0"))
    return None


def main(argv: list[str] | None = None) -> int:
    args = list(sys.argv[1:] if argv is None else argv)
    start = Path(args[0] if args else ".")
    try:
        project_root = find_project_root(start)
    except SystemExit as exc:
        print(exc, file=sys.stderr)
        return 1

    created = False
    storage_xml = resolve_storage(project_root)
    if storage_xml is None:
        from trace_tree import create_fresh_storage

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
