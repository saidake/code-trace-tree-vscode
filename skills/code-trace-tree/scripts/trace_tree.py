#!/usr/bin/env python3
"""
Code Trace Tree ops for Claude: search / add / ensure / move / delete / rename / rebind.

LINE nodes are stored as [file, line, full-trimmed-line-content].
Callers must pass --file, --line, and --content (a substring of that line is OK).
This script expands --content to the full trimmed line and computes
totalOccurrences / occurrenceIndex. Never pass occurrence fields.
After disk edits, run `rebind` so line numbers stay aligned (DocumentListener will not fire).
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import time
import uuid
import xml.etree.ElementTree as ET
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Iterable, List, Optional, Sequence, Tuple


def configure_stdio_utf8() -> None:
    """Avoid UnicodeEncodeError on Windows consoles (often cp1252) when printing JSON."""
    for stream in (sys.stdout, sys.stderr):
        reconfigure = getattr(stream, "reconfigure", None)
        if not callable(reconfigure):
            continue
        try:
            reconfigure(encoding="utf-8", errors="replace")
        except Exception:
            pass


def print_json(payload: dict) -> None:
    configure_stdio_utf8()
    print(json.dumps(payload, indent=2, ensure_ascii=False))



# ---------------------------------------------------------------------------
# Resolve project + storage
# ---------------------------------------------------------------------------


def find_project_root(start: Path) -> Path:
    cur = start.resolve()
    if cur.is_file():
        cur = cur.parent
    while True:
        if (cur / ".idea").is_dir() or (cur / ".vscode").is_dir() or (cur / ".git").exists():
            return cur
        if cur.parent == cur:
            raise SystemExit(f"ERROR: could not locate project root from {start}")
        cur = cur.parent


def global_app_dir() -> Path:
    if sys.platform == "darwin":
        return Path.home() / "Library" / "Application Support" / "code-trace-tree"
    if sys.platform == "win32":
        base = os.environ.get("LOCALAPPDATA") or str(Path.home() / "AppData" / "Local")
        return Path(base) / "code-trace-tree"
    base = os.environ.get("XDG_CONFIG_HOME") or str(Path.home() / ".config")
    return Path(base) / "code-trace-tree"


def read_local_project_id_file(project_root: Path) -> str:
    """Read IDE-local `.idea/code-trace-tree.project.id` when present. Agents never write it."""
    p = project_root / ".idea" / "code-trace-tree.project.id"
    if p.is_file():
        return p.read_text(encoding="utf-8").strip()
    return ""


def find_path_matched_xmls(project_root: Path) -> list[Path]:
    app_dir = global_app_dir()
    if not app_dir.is_dir():
        return []
    target = normalize_path_key(str(project_root.resolve()))
    matched: list[Path] = []
    for xml in sorted(app_dir.glob("*.xml")):
        stored = xml_tag_text(xml, "path")
        if stored and normalize_path_key(stored) == target:
            matched.append(xml)
    return matched


def find_xml_by_project_id(project_id: str) -> Optional[Path]:
    if not project_id:
        return None
    app_dir = global_app_dir()
    if not app_dir.is_dir():
        return None
    canonical = app_dir / f"{project_id}.xml"
    if canonical.is_file() and xml_tag_text(canonical, "projectId") == project_id:
        return canonical
    for xml in sorted(app_dir.glob("*.xml")):
        if xml_tag_text(xml, "projectId") == project_id:
            return xml
    return None


def read_project_id(project_root: Path) -> str:
    """
    Prefer IDE-local `.idea/code-trace-tree.project.id` when present; else path-matched XML.
    """
    local = read_local_project_id_file(project_root)
    if local:
        return local
    matches = find_path_matched_xmls(project_root)
    if not matches:
        return ""
    if len(matches) == 1:
        return xml_tag_text(matches[0], "projectId")
    latest = max(matches, key=lambda x: int(xml_tag_text(x, "updatedAt") or "0"))
    return xml_tag_text(latest, "projectId")


def xml_tag_text(path: Path, tag: str) -> str:
    try:
        root = ET.parse(path).getroot()
    except ET.ParseError:
        return ""
    el = root.find(tag)
    return (el.text or "").strip() if el is not None else ""


def normalize_path_key(p: str) -> str:
    s = p.replace("\\", "/").rstrip("/")
    if sys.platform == "win32":
        return s.lower()
    return s


def sanitize_folder_name(name: str) -> str:
    import re

    s = re.sub(r'[<>:"/\\|?*\x00-\x1f]', "", name).strip()
    return s or "project"


def allocate_folder_name_xml(app_dir: Path, project_root: Path) -> Path:
    base = sanitize_folder_name(project_root.name)
    candidate = app_dir / f"{base}.xml"
    if not candidate.exists():
        return candidate
    i = 1
    while (app_dir / f"{base}{i}.xml").exists():
        i += 1
    return app_dir / f"{base}{i}.xml"


def write_project_id_files(project_root: Path, project_id: str) -> list[Path]:
    """
    Path mode: agents never write `.idea/code-trace-tree.project.id`.
    The IDE may create that cache itself after binding by path.
    """
    return []


def create_fresh_storage(project_root: Path) -> Path:
    """
    Case C (path mode): create empty global XML (`main`) when storage is missing.
    If `.idea/code-trace-tree.project.id` exists but XML is gone, recreate with that same id
    at `<projectId>.xml`. Otherwise allocate a new id + folder-named XML.
    Sets XML <path> to the project root. Does not write `.idea/code-trace-tree.project.id`.
    Idempotent if storage already resolves.
    """
    from resolve_storage import resolve_storage

    existing = resolve_storage(project_root)
    if existing is not None:
        return existing

    local_id = read_local_project_id_file(project_root)
    project_id = local_id or str(uuid.uuid4())
    app_dir = global_app_dir()
    app_dir.mkdir(parents=True, exist_ok=True)
    # Prefer canonical id-named file when recovering an existing local bind.
    storage_xml = (
        app_dir / f"{project_id}.xml"
        if local_id
        else allocate_folder_name_xml(app_dir, project_root)
    )
    write_project_id_files(project_root, project_id)

    root = ET.Element("project", {"version": "4"})
    ET.SubElement(root, "projectId").text = project_id
    ET.SubElement(root, "path").text = str(project_root.resolve())
    ET.SubElement(root, "updatedAt").text = str(int(time.time() * 1000))
    ET.SubElement(root, "activeProfileName").text = "main"
    ET.SubElement(root, "highlightingEnabled").text = "true"
    ET.SubElement(root, "namePromptEnabled").text = "true"
    ET.SubElement(root, "descriptionAreaOpened").text = "false"
    profiles = ET.SubElement(root, "traceProfiles")
    profile = ET.SubElement(profiles, "traceProfile")
    ET.SubElement(profile, "name").text = "main"
    ET.SubElement(profile, "tracePointNodes")

    tree = ET.ElementTree(root)
    write_atomic(tree, storage_xml)
    return storage_xml


def ensure_storage(project_root: Path) -> Path:
    """Return existing storage (local id or path), or create Case C when missing."""
    from resolve_storage import resolve_storage

    existing = resolve_storage(project_root)
    if existing is not None:
        return existing
    return create_fresh_storage(project_root)


def norm_rel(path: str) -> str:
    return path.replace("\\", "/").strip().lstrip("./")


# ---------------------------------------------------------------------------
# Locators
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class LineLocator:
    """Canonical LINE identity: full trimmed line text at a concrete line."""

    file: str
    line: int
    content: str

    @staticmethod
    def from_parts(file: str, line: int, content: str) -> "LineLocator":
        return LineLocator(norm_rel(file), int(line), content.strip())


@dataclass(frozen=True)
class NodeRef:
    """Flexible node reference for CLI / parent paths (not yet resolved)."""

    id: Optional[str] = None
    file: Optional[str] = None
    line: Optional[int] = None
    content: Optional[str] = None

    def describe(self) -> str:
        if self.id:
            return f"id={self.id}"
        parts: List[Any] = [self.file or ""]
        if self.line is not None:
            parts.append(self.line)
        if self.content is not None:
            parts.append(self.content)
        return repr(parts)


def parse_node_ref(item: Any) -> NodeRef:
    """Parse a parent-path / locator item.

    Accepted forms:
      - "uuid"
      - [file, line, content]
      - {"id": "..."} / {"file","line","content"}
    """
    if isinstance(item, str):
        text = item.strip()
        if not text:
            raise SystemExit("ERROR: empty parent-path id string")
        return NodeRef(id=text)

    if isinstance(item, dict):
        node_id = item.get("id")
        if node_id:
            return NodeRef(id=str(node_id).strip())
        file = item.get("file")
        content = item.get("content")
        line = item.get("line")
        if file is None or content is None:
            raise SystemExit(
                f"ERROR: object locator needs file+line+content or id, got {item!r}"
            )
        if line is None:
            raise SystemExit(
                "ERROR: LINE locator object needs file, line, and content "
                "(the script computes occurrenceIndex/totalOccurrences)"
            )
        return NodeRef(
            file=norm_rel(str(file)),
            line=int(line),
            content=str(content).strip(),
        )

    if isinstance(item, (list, tuple)):
        if len(item) == 2:
            raise SystemExit(
                "ERROR: LINE locator must be [file, line, content]; "
                "got [file, content]. Pass the 1-based line. "
                "Do not pass occurrenceIndex/totalOccurrences — the script computes them."
            )
        if len(item) == 3:
            return NodeRef(
                file=norm_rel(str(item[0])),
                line=int(item[1]),
                content=str(item[2]).strip(),
            )
        if len(item) >= 4:
            raise SystemExit(
                "ERROR: do not pass occurrenceIndex/totalOccurrences in locators. "
                "Use [file, line, content]; the script computes occurrences."
            )
        raise SystemExit(
            f"ERROR: LINE locator must be [file, line, content], got {item!r}"
        )

    raise SystemExit(f"ERROR: unsupported locator item: {item!r}")


def parse_parent_path(raw: Optional[str]) -> List[NodeRef]:
    if raw is None or raw.strip() == "":
        return []
    try:
        data = json.loads(raw)
    except json.JSONDecodeError as e:
        raise SystemExit(f"ERROR: invalid --parent JSON: {e}") from e
    if not isinstance(data, list):
        raise SystemExit(
            "ERROR: --parent must be a JSON array of ids / [file,line,content]"
        )
    return [parse_node_ref(item) for item in data]


def parent_refs_from_args(args: argparse.Namespace, *, required: bool) -> List[NodeRef]:
    """Prefer repeated --parent-id (shell-safe); optional --parent JSON for locators.

    Do not mix --parent-id and --parent. Omit both on add → root. On move, one form
    is required (`--parent []` for root).
    """
    ids = getattr(args, "parent_ids", None)
    raw = getattr(args, "parent", None)
    if ids and raw is not None:
        raise SystemExit(
            "ERROR: use either repeated --parent-id or --parent, not both"
        )
    if ids is not None:
        refs: List[NodeRef] = []
        for pid in ids:
            text = (pid or "").strip()
            if not text:
                raise SystemExit("ERROR: empty --parent-id")
            refs.append(NodeRef(id=text))
        return refs
    if raw is not None:
        return parse_parent_path(raw)
    if required:
        raise SystemExit(
            "ERROR: move requires --parent-id ID [--parent-id ID ...] "
            "or --parent JSON (use --parent [] for root)"
        )
    return []


# ---------------------------------------------------------------------------
# Occurrences + source resolution (script-only; Claude never supplies these)
# ---------------------------------------------------------------------------


def read_source_lines(project_root: Path, rel_file: str) -> Optional[List[str]]:
    abs_file = project_root / rel_file
    if not abs_file.is_file():
        return None
    try:
        text = abs_file.read_text(encoding="utf-8")
    except UnicodeDecodeError:
        text = abs_file.read_text(encoding="utf-8", errors="replace")
    return text.splitlines()


def match_lines(lines: Sequence[str], content: str) -> List[int]:
    content = content.strip()
    return [i + 1 for i, ln in enumerate(lines) if ln.strip() == content]


@dataclass(frozen=True)
class SourceResolve:
    locator: LineLocator
    reason: str  # exact | substring_on_line
    needle: str


def resolve_source_locator(
    project_root: Path,
    rel_file: str,
    line: Optional[int],
    content: str,
) -> SourceResolve:
    """Resolve a LINE tip against the source line given by `--line`.

    Requires `--line`. Checks the trimmed text at that line:
      - exact match → store as-is
      - `--content` is a substring of that line → store the full trimmed line
    Duplicate trimmed lines are distinct because `--line` picks which copy.
    Occurrence fields are computed afterward from the file, not from the caller.
    """
    needle = content.strip()
    if not needle:
        raise SystemExit("ERROR: LINE content must be non-empty")
    if line is None:
        raise SystemExit(
            "ERROR: LINE locator requires --line (1-based). "
            "Do not pass occurrenceIndex/totalOccurrences — the script computes them."
        )
    rel_file = norm_rel(rel_file)
    lines = read_source_lines(project_root, rel_file)
    if lines is None:
        raise SystemExit(f"ERROR: source file not found: {rel_file}")
    if line < 1 or line > len(lines):
        raise SystemExit(
            f"ERROR: line {line} is out of range for {rel_file} (1..{len(lines)})"
        )
    actual = lines[line - 1].strip()
    if not actual:
        raise SystemExit(f"ERROR: line {line} in {rel_file} is empty")
    if actual == needle:
        loc = LineLocator.from_parts(rel_file, line, actual)
        return SourceResolve(loc, "exact", needle)
    if needle in actual:
        loc = LineLocator.from_parts(rel_file, line, actual)
        return SourceResolve(loc, "substring_on_line", needle)
    raise SystemExit(
        f"ERROR: LINE content {needle!r} does not match line {line} in {rel_file}; "
        f"line {line} is currently {actual!r}"
    )


def compute_occurrences(
    project_root: Path, rel_file: str, line: int, content: str
) -> Tuple[int, int]:
    content = content.strip()
    lines = read_source_lines(project_root, rel_file)
    if lines is None:
        raise SystemExit(f"ERROR: source file not found: {rel_file}")
    if line < 1 or line > len(lines):
        raise SystemExit(f"ERROR: line {line} out of range for {rel_file} (1..{len(lines)})")
    actual = lines[line - 1].strip()
    if actual != content:
        raise SystemExit(
            f"ERROR: line {line} in {rel_file} is {actual!r}, expected {content!r}"
        )
    matches = match_lines(lines, content)
    total = len(matches)
    index = matches.index(line) + 1
    return total, index


@dataclass
class RebindResult:
    status: str  # updated | unchanged | invalid
    id: str
    file: str
    old_line: int
    new_line: int
    content: str
    total_occurrences: int
    occurrence_index: int
    reason: str


def rebind_line_locator(
    lines: Optional[Sequence[str]],
    node_id: str,
    rel_file: str,
    old_line: int,
    content: str,
    old_total: int,
    old_index: int,
) -> Tuple[RebindResult, Optional[Tuple[int, int, int]]]:
    """
    Apply shared rebind rules.
    Returns (result, (new_line, total, index) or None if invalid/unwritable).
    """
    content = content.strip()
    if lines is None:
        return (
            RebindResult(
                "invalid",
                node_id,
                rel_file,
                old_line,
                old_line,
                content,
                0,
                0,
                "file_missing",
            ),
            None,
        )

    matches = match_lines(lines, content)
    total = len(matches)

    if not matches:
        return (
            RebindResult(
                "invalid",
                node_id,
                rel_file,
                old_line,
                old_line,
                content,
                0,
                0,
                "content_gone",
            ),
            None,
        )

    # 1) Still exact at old line
    if 1 <= old_line <= len(lines) and lines[old_line - 1].strip() == content:
        new_line = old_line
        new_index = matches.index(new_line) + 1
        reason = "exact"
    # 2) Unique content
    elif total == 1:
        new_line = matches[0]
        new_index = 1
        reason = "unique"
    # 3) Stable occurrence count + index
    elif total == old_total and 1 <= old_index <= total:
        new_line = matches[old_index - 1]
        new_index = old_index
        reason = "stable_occurrence"
    # 4) Nearest match to old line
    else:
        new_line = min(matches, key=lambda m: abs(m - old_line))
        new_index = matches.index(new_line) + 1
        reason = "nearest"

    values = (new_line, total, new_index)
    if new_line == old_line and total == old_total and new_index == old_index:
        return (
            RebindResult(
                "unchanged",
                node_id,
                rel_file,
                old_line,
                new_line,
                content,
                total,
                new_index,
                reason,
            ),
            values,
        )
    return (
        RebindResult(
            "updated",
            node_id,
            rel_file,
            old_line,
            new_line,
            content,
            total,
            new_index,
            reason,
        ),
        values,
    )


# ---------------------------------------------------------------------------
# XML tree helpers
# ---------------------------------------------------------------------------


def child_text(el: ET.Element, tag: str, default: str = "") -> str:
    c = el.find(tag)
    if c is None or c.text is None:
        return default
    return c.text.strip()


def set_child_text(el: ET.Element, tag: str, value: str) -> None:
    c = el.find(tag)
    if c is None:
        c = ET.SubElement(el, tag)
    c.text = value


def ensure_child(el: ET.Element, tag: str) -> ET.Element:
    c = el.find(tag)
    if c is None:
        c = ET.SubElement(el, tag)
    return c


def iter_nodes(container: ET.Element) -> Iterable[ET.Element]:
    """Yield tracePointNode elements under a roots list or children list."""
    for node in list(container.findall("tracePointNode")):
        yield node


def walk_tree(
    roots_el: ET.Element, depth: int = 0, parent_id: str = ""
) -> Iterable[Tuple[ET.Element, int, str, ET.Element]]:
    """
    Yield (node, depth, parent_id, container) for every node.
    container is the element that directly holds this node (tracePointNodes or children).
    """
    for node in iter_nodes(roots_el):
        yield node, depth, parent_id, roots_el
        nid = child_text(node, "id")
        children = node.find("children")
        if children is not None:
            yield from walk_tree(children, depth + 1, nid)


def node_trace(node: ET.Element) -> ET.Element:
    tp = node.find("tracePoint")
    if tp is None:
        raise SystemExit(f"ERROR: node {child_text(node, 'id')} missing <tracePoint>")
    return tp


def matches_line_locator(node: ET.Element, loc: LineLocator, *, strict_line: bool = True) -> bool:
    tp = node_trace(node)
    if child_text(tp, "traceType") != "LINE":
        return False
    if norm_rel(child_text(tp, "tracePath")) != loc.file:
        return False
    if child_text(tp, "lineContent") != loc.content:
        return False
    if strict_line and child_text(tp, "lineNumber") != str(loc.line):
        return False
    return True


def node_matches_ref(node: ET.Element, ref: NodeRef) -> bool:
    """Match parent / target lookup. LINE refs require file + line + content (substring OK)."""
    if ref.id:
        return child_text(node, "id") == ref.id

    tp = node_trace(node)
    kind = child_text(tp, "traceType")
    if ref.file is None:
        return False
    if norm_rel(child_text(tp, "tracePath")) != norm_rel(ref.file):
        return False

    if kind != "LINE":
        # Path node: file alone (or with empty content) identifies it
        return ref.content is None or ref.content == ""

    stored = child_text(tp, "lineContent")
    needle = (ref.content or "").strip()
    if not needle:
        return False
    if ref.line is not None and child_text(tp, "lineNumber") != str(ref.line):
        return False
    if stored == needle:
        return True
    # Allow either side to be a substring tip from the caller
    return needle in stored or stored in needle


def matches_path_locator(node: ET.Element, path: str, type_filter: Optional[str]) -> bool:
    tp = node_trace(node)
    kind = child_text(tp, "traceType")
    if type_filter and kind != type_filter:
        return False
    if kind not in ("FILE", "DIRECTORY"):
        return False
    return norm_rel(child_text(tp, "tracePath")) == norm_rel(path)


def _looks_like_uuid(value: str) -> bool:
    text = value.strip()
    if len(text) != 36:
        return False
    parts = text.split("-")
    if len(parts) != 5 or [len(p) for p in parts] != [8, 4, 4, 4, 12]:
        return False
    hexdigits = set("0123456789abcdefABCDEF")
    return all(c in hexdigits for c in text if c != "-")


def find_by_id(roots_el: ET.Element, node_id: str) -> Tuple[ET.Element, ET.Element, str]:
    matches = [(n, c, p) for n, _, p, c in walk_tree(roots_el) if child_text(n, "id") == node_id]
    if not matches:
        if _looks_like_uuid(node_id):
            raise SystemExit(f"ERROR: no node with id {node_id}")
        raise SystemExit(
            f"ERROR: no node with id {node_id!r}. "
            "Bare --parent strings are node UUIDs, not traceName labels. "
            "Use an id from search/add, or a locator "
            "[file, line, content]."
        )
    if len(matches) > 1:
        raise SystemExit(f"ERROR: duplicate id {node_id}")
    return matches[0]


def _rank_line_match(node: ET.Element, ref: NodeRef) -> Tuple[int, int]:
    """Lower is better. Prefer exact content, then exact line, then shorter content distance."""
    tp = node_trace(node)
    stored = child_text(tp, "lineContent")
    needle = (ref.content or "").strip()
    content_rank = 0 if stored == needle else 1
    try:
        stored_line = int(child_text(tp, "lineNumber") or "0")
    except ValueError:
        stored_line = 0
    line_dist = abs(stored_line - ref.line) if ref.line is not None else 0
    return (content_rank, line_dist)


def find_nodes_by_ref(
    candidates: Sequence[ET.Element], ref: NodeRef
) -> List[ET.Element]:
    matches = [n for n in candidates if node_matches_ref(n, ref)]
    if len(matches) <= 1 or ref.id or not ref.content:
        return matches
    # Disambiguate LINE matches by exactness / nearest line
    ranked = sorted(matches, key=lambda n: _rank_line_match(n, ref))
    best = _rank_line_match(ranked[0], ref)
    top = [n for n in ranked if _rank_line_match(n, ref) == best]
    return top


def find_by_line_locator(
    roots_el: ET.Element, loc: LineLocator
) -> Tuple[ET.Element, ET.Element, str]:
    # Prefer exact file+line+content, then file+content (ignore stale line)
    exact = [
        (n, c, p)
        for n, _, p, c in walk_tree(roots_el)
        if matches_line_locator(n, loc, strict_line=True)
    ]
    if len(exact) == 1:
        return exact[0]
    loose = [
        (n, c, p)
        for n, _, p, c in walk_tree(roots_el)
        if matches_line_locator(n, loc, strict_line=False)
    ]
    if not loose:
        # Last resort: substring content match in tree
        ref = NodeRef(file=loc.file, line=loc.line, content=loc.content)
        soft = [
            (n, c, p)
            for n, _, p, c in walk_tree(roots_el)
            if node_matches_ref(n, ref)
        ]
        soft_nodes = find_nodes_by_ref([n for n, _, _ in soft], ref)
        soft = [(n, c, p) for n, c, p in soft if n in soft_nodes]
        if not soft:
            raise SystemExit(
                f"ERROR: no LINE node matching [{loc.file!r}, {loc.line}, {loc.content!r}]"
            )
        if len(soft) > 1:
            ids = ", ".join(child_text(n, "id") for n, _, _ in soft)
            raise SystemExit(
                f"ERROR: multiple LINE nodes match [{loc.file!r}, {loc.line}, {loc.content!r}]: {ids}"
            )
        return soft[0]
    if len(loose) > 1:
        by_line = [
            (n, c, p)
            for n, c, p in loose
            if child_text(node_trace(n), "lineNumber") == str(loc.line)
        ]
        if len(by_line) == 1:
            return by_line[0]
        ids = ", ".join(child_text(n, "id") for n, _, _ in loose)
        raise SystemExit(
            f"ERROR: multiple LINE nodes match [{loc.file!r}, {loc.content!r}] "
            f"(duplicate content; pass --line or --id): {ids}"
        )
    return loose[0]


def resolve_parent_path(
    roots_el: ET.Element, path: Sequence[NodeRef]
) -> Optional[ET.Element]:
    """Return immediate parent node element, or None for root placement."""
    if not path:
        return None
    current: Optional[ET.Element] = None
    for i, ref in enumerate(path):
        if current is None:
            # Search whole tree for step 0 so Claude need not start at a root-only match
            # when using an id; for LINE refs still walk all nodes.
            pool = [n for n, _, _, _ in walk_tree(roots_el)]
        else:
            children = current.find("children")
            pool = list(iter_nodes(children)) if children is not None else []

        matches = find_nodes_by_ref(pool, ref)
        if not matches and current is not None and ref.id:
            # Allow id lookup anywhere if scoped child search missed (stale path shape)
            matches = find_nodes_by_ref([n for n, _, _, _ in walk_tree(roots_el)], ref)
        if not matches:
            if ref.id and not _looks_like_uuid(ref.id):
                raise SystemExit(
                    f"ERROR: parent path step {i} not found: {ref.describe()}. "
                    "Bare strings are node UUIDs, not traceName labels. "
                    "Use an id from search/add, or "
                    "[file, line, content]."
                )
            hint = ""
            if ref.file and ref.content and ref.line is None:
                hint = " LINE locators must be [file, line, content]."
            raise SystemExit(
                f"ERROR: parent path step {i} not found: {ref.describe()}.{hint}"
            )
        if len(matches) > 1:
            ids = ", ".join(child_text(n, "id") for n in matches)
            hint = ""
            if ref.file and ref.content and ref.line is None:
                hint = " Pass [file, line, content] (line is required)."
            raise SystemExit(
                f"ERROR: parent path step {i} is ambiguous ({ids}): "
                f"{ref.describe()}.{hint}"
            )
        current = matches[0]
    return current


def find_existing_line_node(
    roots_el: ET.Element,
    loc: LineLocator,
    occurrence_index: int,
) -> Optional[ET.Element]:
    """Same occurrence: file + trimmed content + occurrenceIndex (1-based)."""
    matches: List[ET.Element] = []
    for n, _, _, _ in walk_tree(roots_el):
        if not matches_line_locator(n, loc, strict_line=False):
            continue
        tp = node_trace(n)
        try:
            stored_index = int(child_text(tp, "occurrenceIndex") or "0")
        except ValueError:
            stored_index = 0
        if stored_index == occurrence_index:
            matches.append(n)
        elif stored_index <= 0 and child_text(tp, "lineNumber") == str(loc.line):
            matches.append(n)
    if not matches:
        return None
    if len(matches) > 1:
        ids = ", ".join(child_text(n, "id") for n in matches)
        raise SystemExit(
            f"ERROR: multiple LINE nodes share "
            f"[{loc.file!r}, {loc.content!r}, occurrenceIndex={occurrence_index}]: {ids}"
        )
    return matches[0]


def refresh_line_occurrence_fields(
    roots_el: ET.Element,
    project_root: Path,
    rel_file: str,
    content: str,
) -> None:
    """Recompute totalOccurrences / occurrenceIndex for all LINE nodes with this tip."""
    content = content.strip()
    rel_file = norm_rel(rel_file)
    lines = read_source_lines(project_root, rel_file)
    if lines is None:
        return
    match_nums = match_lines(lines, content)
    total = len(match_nums)
    for n, _, _, _ in walk_tree(roots_el):
        tp = node_trace(n)
        if child_text(tp, "traceType") != "LINE":
            continue
        if norm_rel(child_text(tp, "tracePath")) != rel_file:
            continue
        if child_text(tp, "lineContent") != content:
            continue
        set_child_text(tp, "totalOccurrences", str(total))
        try:
            ln = int(child_text(tp, "lineNumber") or "0")
        except ValueError:
            continue
        if ln in match_nums:
            set_child_text(tp, "occurrenceIndex", str(match_nums.index(ln) + 1))


def find_existing_path_node(
    roots_el: ET.Element, rel_path: str, kind: str
) -> Optional[ET.Element]:
    matches = [
        n
        for n, _, _, _ in walk_tree(roots_el)
        if matches_path_locator(n, rel_path, kind)
    ]
    if not matches:
        return None
    if len(matches) > 1:
        ids = ", ".join(child_text(n, "id") for n in matches)
        raise SystemExit(f"ERROR: multiple {kind} nodes for {rel_path!r}: {ids}")
    return matches[0]


def collect_descendant_ids(node: ET.Element) -> List[str]:
    ids = [child_text(node, "id")]
    children = node.find("children")
    if children is not None:
        for child in iter_nodes(children):
            ids.extend(collect_descendant_ids(child))
    return ids


def detach_node(container: ET.Element, node: ET.Element) -> None:
    container.remove(node)


def attach_under(parent: Optional[ET.Element], roots_el: ET.Element, node: ET.Element) -> None:
    parent_id = child_text(parent, "id") if parent is not None else ""
    set_child_text(node, "parentId", parent_id)
    if parent is None:
        roots_el.append(node)
    else:
        children = ensure_child(parent, "children")
        children.append(node)


def get_or_create_profile(root: ET.Element, name: str) -> ET.Element:
    profiles = ensure_child(root, "traceProfiles")
    for profile in profiles.findall("traceProfile"):
        if child_text(profile, "name") == name:
            return profile
    profile = ET.SubElement(profiles, "traceProfile")
    set_child_text(profile, "name", name)
    ET.SubElement(profile, "tracePointNodes")
    ET.SubElement(profile, "expandedTracePointIds")
    return profile


def resolve_profile_name(root: ET.Element, override: Optional[str]) -> str:
    if override:
        return override
    active = child_text(root, "activeProfileName", "main")
    return active or "main"

def profile_roots(profile: ET.Element) -> ET.Element:
    return ensure_child(profile, "tracePointNodes")


def build_line_node(
    project_root: Path,
    loc: LineLocator,
    parent_id: str,
    name: str,
    description: str,
) -> ET.Element:
    total, index = compute_occurrences(project_root, loc.file, loc.line, loc.content)
    node_id = str(uuid.uuid4())
    node = ET.Element("tracePointNode")
    set_child_text(node, "id", node_id)
    set_child_text(node, "parentId", parent_id)
    tp = ET.SubElement(node, "tracePoint")
    set_child_text(tp, "traceName", name)
    set_child_text(tp, "traceType", "LINE")
    set_child_text(tp, "baseName", Path(loc.file).name)
    set_child_text(tp, "tracePath", loc.file)
    set_child_text(tp, "lineNumber", str(loc.line))
    set_child_text(tp, "lineContent", loc.content)
    set_child_text(tp, "totalOccurrences", str(total))
    set_child_text(tp, "occurrenceIndex", str(index))
    if description:
        set_child_text(tp, "description", description)
    return node


def build_path_node(
    project_root: Path,
    rel_path: str,
    kind: str,
    parent_id: str,
    name: str,
    description: str,
) -> ET.Element:
    abs_path = project_root / rel_path
    if kind == "FILE" and not abs_path.is_file():
        raise SystemExit(f"ERROR: file not found: {rel_path}")
    if kind == "DIRECTORY" and not abs_path.is_dir():
        raise SystemExit(f"ERROR: directory not found: {rel_path}")
    node_id = str(uuid.uuid4())
    node = ET.Element("tracePointNode")
    set_child_text(node, "id", node_id)
    set_child_text(node, "parentId", parent_id)
    tp = ET.SubElement(node, "tracePoint")
    set_child_text(tp, "traceName", name)
    set_child_text(tp, "traceType", kind)
    set_child_text(tp, "baseName", Path(rel_path).name)
    set_child_text(tp, "tracePath", norm_rel(rel_path))
    if description:
        set_child_text(tp, "description", description)
    return node


def infer_path_kind(project_root: Path, rel_path: str) -> str:
    abs_path = project_root / rel_path
    if abs_path.is_dir():
        return "DIRECTORY"
    if abs_path.is_file():
        return "FILE"
    raise SystemExit(f"ERROR: path not found: {rel_path}")


def bump_updated_at(root: ET.Element) -> None:
    set_child_text(root, "updatedAt", str(int(time.time() * 1000)))


def write_atomic(tree: ET.ElementTree, storage_xml: Path) -> None:
    tmp = storage_xml.with_suffix(storage_xml.suffix + ".tmp")
    if hasattr(ET, "indent"):
        ET.indent(tree.getroot(), space="  ")
    tree.write(tmp, encoding="utf-8", xml_declaration=True)
    os.replace(tmp, storage_xml)


def signals_dir() -> Path:
    return global_app_dir() / "signals"


def write_storage_ready(project_root: Path) -> Optional[Path]:
    """
    Case C bind handshake: `signals/<projectId>.storage-ready` (no TTL).
    Body = absolute project path (same as XML `<path>`) so IDEs can filter without
    opening XML; empty/legacy body falls back to reading XML `<path>`.
    """
    project_id = read_project_id(project_root)
    if not project_id:
        return None
    dest = signals_dir()
    dest.mkdir(parents=True, exist_ok=True)
    req = dest / f"{project_id}.storage-ready"
    req.write_text(str(project_root.resolve()) + "\n", encoding="utf-8")
    return req


def request_refresh(project_root: Path) -> Optional[Path]:
    """Full project reload signal (all profiles + toolbar flags). TTL uses file mtime."""
    project_id = read_project_id(project_root)
    if not project_id:
        return None
    dest = signals_dir()
    dest.mkdir(parents=True, exist_ok=True)
    req = dest / f"{project_id}.request_refresh"
    # Body unused; overwrite so mtime advances (TTL).
    req.write_text("1\n", encoding="utf-8")
    # Wake Case C IDE windows: bind via <projectId>.storage-ready, then replay refresh.
    write_storage_ready(project_root)
    return req


def request_refresh_profile(
    project_root: Path, profile_name: Optional[str] = None
) -> Optional[Path]:
    """
    Reload one profile from XML into the IDE.
    Body = profile name (one line). Empty body → IDE refreshes its active profile.
    Does not change activeProfileName or project toolbar flags.
    """
    project_id = read_project_id(project_root)
    if not project_id:
        return None
    dest = signals_dir()
    dest.mkdir(parents=True, exist_ok=True)
    req = dest / f"{project_id}.request_refresh_profile"
    body = (profile_name or "").strip()
    req.write_text((body + "\n") if body else "", encoding="utf-8")
    write_storage_ready(project_root)
    return req

def request_refresh_settings(project_root: Path) -> Optional[Path]:
    """Reload toolbar flags / activeProfileName only."""
    project_id = read_project_id(project_root)
    if not project_id:
        return None
    dest = signals_dir()
    dest.mkdir(parents=True, exist_ok=True)
    req = dest / f"{project_id}.request_refresh_settings"
    req.write_text("1\n", encoding="utf-8")
    write_storage_ready(project_root)
    return req

def request_select(project_root: Path, ids: Sequence[str]) -> Path:
    project_id = read_project_id(project_root)
    if not project_id:
        raise SystemExit(
            "ERROR: no bound project id. Run resolve_storage.py or create data in the IDE first."
        )
    dest = signals_dir()
    dest.mkdir(parents=True, exist_ok=True)
    req = dest / f"{project_id}.select_trace_points"
    lines = [i.strip() for i in ids if i and i.strip()]
    req.write_text(("\n".join(lines) + ("\n" if lines else "")), encoding="utf-8")
    return req


def load_context(
    project: Optional[str],
    profile: Optional[str],
    *,
    ensure: bool = False,
):
    start = Path(project or ".")
    project_root = find_project_root(start)
    if ensure:
        storage_xml = ensure_storage(project_root)
    else:
        from resolve_storage import resolve_storage

        storage_xml = resolve_storage(project_root)
        if storage_xml is None:
            raise SystemExit(
                "ERROR: no Code Trace Tree storage XML found. "
                "Run resolve_storage.py, or create a trace point / profile in the IDE, "
                "or import plugin data first."
            )
    tree = ET.parse(storage_xml)
    root = tree.getroot()
    profile_name = resolve_profile_name(root, profile)
    profile_el = get_or_create_profile(root, profile_name)
    roots_el = profile_roots(profile_el)
    return project_root, storage_xml, tree, root, profile_name, roots_el


def node_to_row(node: ET.Element, depth: int, parent_id: str) -> dict:
    tp = node_trace(node)
    children = node.find("children")
    child_count = len(list(iter_nodes(children))) if children is not None else 0
    return {
        "id": child_text(node, "id"),
        "parentId": parent_id,
        "type": child_text(tp, "traceType"),
        "file": child_text(tp, "tracePath"),
        "line": child_text(tp, "lineNumber") or "",
        "content": child_text(tp, "lineContent"),
        "name": child_text(tp, "traceName"),
        "depth": depth,
        "childCount": child_count,
    }


# ---------------------------------------------------------------------------
# Commands
# ---------------------------------------------------------------------------


def cmd_search(args: argparse.Namespace) -> int:
    project_root, storage_xml, tree, root, profile_name, roots_el = load_context(
        args.project, args.profile
    )
    rows = []
    for node, depth, parent_id, _ in walk_tree(roots_el):
        tp = node_trace(node)
        kind = child_text(tp, "traceType")
        if args.type and kind != args.type:
            continue
        nid = child_text(node, "id")
        if args.id and nid != args.id:
            continue
        path = norm_rel(child_text(tp, "tracePath"))
        if args.file and path != norm_rel(args.file):
            continue
        if args.line is not None and child_text(tp, "lineNumber") != str(args.line):
            continue
        content = child_text(tp, "lineContent")
        if args.content is not None and args.content not in content:
            continue
        name = child_text(tp, "traceName")
        if args.trace_name is not None and args.trace_name not in name:
            continue
        rows.append(node_to_row(node, depth, parent_id))

    print(
        json.dumps(
            {
                "project_root": str(project_root),
                "storage_xml": str(storage_xml),
                "profile": profile_name,
                "matches": rows,
            },
            indent=2,
            ensure_ascii=False,
        )
    )
    return 0


def place_node(
    project_root: Path,
    roots_el: ET.Element,
    *,
    kind: str,
    file: Optional[str],
    line: Optional[int],
    content: Optional[str],
    name: str,
    description: str,
    parent: Optional[ET.Element],
    get_or_add: bool,
) -> Tuple[ET.Element, bool, Optional[dict]]:
    """Create a node under parent (None = profile roots).

    When get_or_add is True, return an existing identity match without attaching
    (skipped=True). Otherwise always build and attach a new UUID.
    Returns (element, skipped, resolve_meta).
    """
    kind = (kind or "LINE").upper()
    parent_id = child_text(parent, "id") if parent is not None else ""
    resolve_meta: Optional[dict] = None

    if kind == "LINE":
        if not file or content is None or line is None:
            raise SystemExit(
                "ERROR: LINE add/ensure requires --file, --line, and --content "
                "(the script computes occurrenceIndex/totalOccurrences)"
            )
        resolved = resolve_source_locator(project_root, file, line, content)
        loc = resolved.locator
        total, occ_index = compute_occurrences(
            project_root, loc.file, loc.line, loc.content
        )
        resolve_meta = {
            "reason": resolved.reason,
            "needle": resolved.needle,
            "resolved": [loc.file, loc.line, loc.content],
            "totalOccurrences": total,
            "occurrenceIndex": occ_index,
        }
        if get_or_add:
            existing = find_existing_line_node(roots_el, loc, occ_index)
            if existing is not None:
                return existing, True, resolve_meta
        node = build_line_node(
            project_root, loc, parent_id, name or "", description or ""
        )
    elif kind in ("FILE", "DIRECTORY"):
        path = file
        if not path:
            raise SystemExit(f"ERROR: {kind} add/ensure requires --file (path)")
        rel = norm_rel(path)
        if get_or_add:
            existing = find_existing_path_node(roots_el, rel, kind)
            if existing is not None:
                return existing, True, None
        node = build_path_node(
            project_root,
            rel,
            kind,
            parent_id,
            name or "",
            description or "",
        )
    else:
        raise SystemExit(f"ERROR: unknown --type {kind}")

    attach_under(parent, roots_el, node)
    return node, False, resolve_meta


def _print_add_result(payload: dict) -> None:
    print(json.dumps(payload, indent=2, ensure_ascii=False))


def cmd_add(args: argparse.Namespace) -> int:
    return _cmd_add_or_ensure(args, get_or_add=False)


def cmd_ensure(args: argparse.Namespace) -> int:
    return _cmd_add_or_ensure(args, get_or_add=True)


def _cmd_add_or_ensure(args: argparse.Namespace, *, get_or_add: bool) -> int:
    action = "ensure" if get_or_add else "add"
    kind = (args.type or "LINE").upper()
    if kind == "LINE":
        if not args.file or args.content is None or args.line is None:
            raise SystemExit(
                "ERROR: LINE add/ensure requires --file, --line, and --content "
                "(the script computes occurrenceIndex/totalOccurrences)"
            )
    project_root, storage_xml, tree, root, profile_name, roots_el = load_context(
        args.project, args.profile, ensure=True
    )
    parent_path = parent_refs_from_args(args, required=False)
    parent = resolve_parent_path(roots_el, parent_path)
    parent_id = child_text(parent, "id") if parent is not None else ""

    node, skipped, resolve_meta = place_node(
        project_root,
        roots_el,
        kind=kind,
        file=args.file,
        line=args.line,
        content=args.content,
        name=args.trace_name or "",
        description=args.description or "",
        parent=parent,
        get_or_add=get_or_add,
    )

    if skipped:
        _print_add_result(
            {
                "action": action,
                "skipped": True,
                "reason": "already_exists",
                "profile": profile_name,
                "id": child_text(node, "id"),
                "parentId": child_text(node, "parentId"),
                **({"resolve": resolve_meta} if resolve_meta is not None else {}),
                "node": node_to_row(node, 0, child_text(node, "parentId")),
            }
        )
        return 0

    if args.dry_run:
        payload: dict = {
            "action": action,
            "dry_run": True,
            "profile": profile_name,
            "parentId": parent_id,
            "node": node_to_row(node, 0, parent_id),
        }
        if resolve_meta is not None:
            payload["resolve"] = resolve_meta
        _print_add_result(payload)
        return 0

    if kind == "LINE":
        loc_file = child_text(node_trace(node), "tracePath")
        loc_content = child_text(node_trace(node), "lineContent")
        refresh_line_occurrence_fields(roots_el, project_root, loc_file, loc_content)
    bump_updated_at(root)
    write_atomic(tree, storage_xml)
    if not args.no_refresh:
        request_refresh_profile(project_root, profile_name)

    payload = {
        "action": action,
        "profile": profile_name,
        "storage_xml": str(storage_xml),
        "parentId": parent_id,
        "node": node_to_row(node, 0, parent_id),
        "refreshed": not args.no_refresh,
    }
    if get_or_add:
        payload["skipped"] = False
    if resolve_meta is not None:
        payload["resolve"] = resolve_meta
    _print_add_result(payload)
    return 0


def resolve_target_node(
    roots_el: ET.Element,
    args: argparse.Namespace,
    project_root: Optional[Path] = None,
) -> Tuple[ET.Element, ET.Element, str]:
    if args.id:
        return find_by_id(roots_el, args.id)
    if args.file and args.content is not None:
        if args.line is None:
            raise SystemExit(
                "ERROR: LINE locator requires --file, --line, and --content "
                "(or use --id)"
            )
        loc: Optional[LineLocator] = None
        if project_root is not None:
            loc = resolve_source_locator(
                project_root, args.file, args.line, args.content
            ).locator
        else:
            loc = LineLocator.from_parts(args.file, args.line, args.content)
        return find_by_line_locator(roots_el, loc)
    if args.file and args.line is None and args.content is None:
        path = norm_rel(args.file)
        matches = [
            (n, c, p)
            for n, _, p, c in walk_tree(roots_el)
            if matches_path_locator(n, path, None)
        ]
        if not matches:
            raise SystemExit(f"ERROR: no FILE/DIRECTORY node matching path {path!r}")
        if len(matches) > 1:
            ids = ", ".join(child_text(n, "id") for n, _, _ in matches)
            raise SystemExit(f"ERROR: multiple path nodes match {path!r}: {ids}")
        return matches[0]
    raise SystemExit(
        "ERROR: provide --id or LINE locator (--file --line --content)"
    )


def cmd_move(args: argparse.Namespace) -> int:
    project_root, storage_xml, tree, root, profile_name, roots_el = load_context(
        args.project, args.profile, ensure=True
    )
    node, container, _old_parent = resolve_target_node(roots_el, args, project_root)
    parent_path = parent_refs_from_args(args, required=True)
    new_parent = resolve_parent_path(roots_el, parent_path)

    moved_ids = set(collect_descendant_ids(node))
    if new_parent is not None and child_text(new_parent, "id") in moved_ids:
        raise SystemExit("ERROR: cannot move a node under itself or its descendant")

    if args.dry_run:
        print(
            json.dumps(
                {
                    "action": "move",
                    "dry_run": True,
                    "profile": profile_name,
                    "id": child_text(node, "id"),
                    "newParentId": child_text(new_parent, "id") if new_parent else "",
                },
                indent=2,
            )
        )
        return 0

    detach_node(container, node)
    attach_under(new_parent, roots_el, node)
    bump_updated_at(root)
    write_atomic(tree, storage_xml)
    if not args.no_refresh:
        request_refresh_profile(project_root, profile_name)

    print(
        json.dumps(
            {
                "action": "move",
                "profile": profile_name,
                "id": child_text(node, "id"),
                "newParentId": child_text(new_parent, "id") if new_parent else "",
                "refreshed": not args.no_refresh,
            },
            indent=2,
        )
    )
    return 0


def cmd_delete(args: argparse.Namespace) -> int:
    project_root, storage_xml, tree, root, profile_name, roots_el = load_context(
        args.project, args.profile, ensure=True
    )
    node, container, _ = resolve_target_node(roots_el, args, project_root)
    deleted = collect_descendant_ids(node)

    if args.dry_run:
        print(
            json.dumps(
                {
                    "action": "delete",
                    "dry_run": True,
                    "profile": profile_name,
                    "deletedIds": deleted,
                },
                indent=2,
            )
        )
        return 0

    detach_node(container, node)
    # Drop empty <children> containers left behind when removing last child — optional cleanup
    bump_updated_at(root)
    write_atomic(tree, storage_xml)
    if not args.no_refresh:
        request_refresh_profile(project_root, profile_name)

    print(
        json.dumps(
            {
                "action": "delete",
                "profile": profile_name,
                "deletedIds": deleted,
                "refreshed": not args.no_refresh,
            },
            indent=2,
        )
    )
    return 0


def cmd_rename(args: argparse.Namespace) -> int:
    project_root, storage_xml, tree, root, profile_name, roots_el = load_context(
        args.project, args.profile, ensure=True
    )
    node, _container, parent_id = resolve_target_node(roots_el, args, project_root)
    tp = node_trace(node)
    new_name = args.trace_name

    if args.dry_run:
        print(
            json.dumps(
                {
                    "action": "rename",
                    "dry_run": True,
                    "profile": profile_name,
                    "id": child_text(node, "id"),
                    "name": new_name,
                    "node": {**node_to_row(node, 0, parent_id), "name": new_name},
                },
                indent=2,
                ensure_ascii=False,
            )
        )
        return 0

    set_child_text(tp, "traceName", new_name)
    bump_updated_at(root)
    write_atomic(tree, storage_xml)
    if not args.no_refresh:
        request_refresh_profile(project_root, profile_name)

    print(
        json.dumps(
            {
                "action": "rename",
                "profile": profile_name,
                "id": child_text(node, "id"),
                "name": new_name,
                "node": node_to_row(node, 0, parent_id),
                "refreshed": not args.no_refresh,
            },
            indent=2,
            ensure_ascii=False,
        )
    )
    return 0


def cmd_rebind(args: argparse.Namespace) -> int:
    project_root, storage_xml, tree, root, profile_name, roots_el = load_context(
        args.project, args.profile, ensure=True
    )
    file_filters = {norm_rel(f) for f in (args.file or [])}

    updated: List[dict] = []
    invalid: List[dict] = []
    unchanged = 0
    dirty = False

    for node, _, _, _ in walk_tree(roots_el):
        tp = node_trace(node)
        if child_text(tp, "traceType") != "LINE":
            continue
        rel_file = norm_rel(child_text(tp, "tracePath"))
        if file_filters and rel_file not in file_filters:
            continue

        old_line = int(child_text(tp, "lineNumber") or "0")
        content = child_text(tp, "lineContent")
        old_total = int(child_text(tp, "totalOccurrences") or "0")
        old_index = int(child_text(tp, "occurrenceIndex") or "0")
        node_id = child_text(node, "id")

        lines = read_source_lines(project_root, rel_file)
        result, values = rebind_line_locator(
            lines, node_id, rel_file, old_line, content, old_total, old_index
        )
        row = {
            "id": result.id,
            "file": result.file,
            "oldLine": result.old_line,
            "newLine": result.new_line,
            "content": result.content,
            "totalOccurrences": result.total_occurrences,
            "occurrenceIndex": result.occurrence_index,
            "reason": result.reason,
        }
        if result.status == "invalid":
            invalid.append(row)
            continue
        assert values is not None
        new_line, total, index = values
        if result.status == "unchanged":
            # Still refresh occurrence fields if XML was stale but locator equal
            if (
                child_text(tp, "totalOccurrences") != str(total)
                or child_text(tp, "occurrenceIndex") != str(index)
            ):
                if not args.dry_run:
                    set_child_text(tp, "totalOccurrences", str(total))
                    set_child_text(tp, "occurrenceIndex", str(index))
                    dirty = True
                updated.append({**row, "reason": "refresh_occurrences"})
            else:
                unchanged += 1
            continue

        if not args.dry_run:
            set_child_text(tp, "lineNumber", str(new_line))
            set_child_text(tp, "totalOccurrences", str(total))
            set_child_text(tp, "occurrenceIndex", str(index))
            dirty = True
        updated.append(row)

    if dirty and not args.dry_run:
        bump_updated_at(root)
        write_atomic(tree, storage_xml)
        if not args.no_refresh:
            request_refresh_profile(project_root, profile_name)

    print(
        json.dumps(
            {
                "action": "rebind",
                "dry_run": bool(args.dry_run),
                "profile": profile_name,
                "storage_xml": str(storage_xml),
                "updated": updated,
                "invalid": invalid,
                "unchanged": unchanged,
                "refreshed": dirty and not args.dry_run and not args.no_refresh,
            },
            indent=2,
            ensure_ascii=False,
        )
    )
    return 0


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------


def add_shared_flags(p: argparse.ArgumentParser, *, suppress_defaults: bool = False) -> None:
    # SUPPRESS on subparsers so pre-subcommand flags from the root parser are not wiped.
    default: Any = argparse.SUPPRESS if suppress_defaults else None
    p.add_argument("--project", default=default, help="Project path (default: cwd)")
    p.add_argument("--profile", default=default, help="Profile name override")
    dry_default = argparse.SUPPRESS if suppress_defaults else False
    refresh_default = argparse.SUPPRESS if suppress_defaults else False
    p.add_argument(
        "--dry-run",
        action="store_true",
        default=dry_default,
        help="Do not write XML or refresh",
    )
    p.add_argument(
        "--no-refresh",
        action="store_true",
        default=refresh_default,
        help="Skip IDE refresh signal",
    )


def add_locator_flags(p: argparse.ArgumentParser, required_line: bool = False) -> None:
    p.add_argument("--id", help="Node UUID")
    p.add_argument("--file", help="Relative file/directory path")
    p.add_argument("--line", type=int, help="1-based line number (required for LINE)")
    p.add_argument("--content", help="Trimmed line content (LINE)")


def add_insert_flags(p: argparse.ArgumentParser) -> None:
    p.add_argument(
        "pos_args",
        nargs="*",
        help="Positional: FILE LINE CONTENT  or  path (FILE/DIRECTORY)",
    )
    p.add_argument("--file")
    p.add_argument("--line", type=int)
    p.add_argument("--content")
    p.add_argument(
        "--parent-id",
        action="append",
        dest="parent_ids",
        default=None,
        metavar="ID",
        help=(
            "Parent node UUID; repeat rootward → immediate parent "
            "(shell-safe; preferred over --parent). Omit for root."
        ),
    )
    p.add_argument(
        "--parent",
        default=None,
        help=(
            'Optional JSON parent path: ids and/or ["file",line,"content"]. '
            "Prefer repeated --parent-id. "
            "Do not combine with --parent-id."
        ),
    )
    p.add_argument("--trace-name", default="")
    p.add_argument("--description", default="")
    p.add_argument("--type", choices=["LINE", "FILE", "DIRECTORY"], default=None)


def apply_shared_defaults(args: argparse.Namespace) -> None:
    if not hasattr(args, "project"):
        args.project = None
    if not hasattr(args, "profile"):
        args.profile = None
    if not hasattr(args, "dry_run"):
        args.dry_run = False
    if not hasattr(args, "no_refresh"):
        args.no_refresh = False


def build_parser() -> argparse.ArgumentParser:
    # Shared flags on a parent so both of these work:
    #   trace_tree.py --project /path search
    #   trace_tree.py search --project /path
    shared_root = argparse.ArgumentParser(add_help=False)
    add_shared_flags(shared_root, suppress_defaults=False)
    shared_sub = argparse.ArgumentParser(add_help=False)
    add_shared_flags(shared_sub, suppress_defaults=True)

    parser = argparse.ArgumentParser(
        description="Search / add / ensure / move / delete / rename / rebind Code Trace Tree nodes (no occurrence args).",
        parents=[shared_root],
    )
    sub = parser.add_subparsers(dest="command", required=True)

    p_search = sub.add_parser(
        "search",
        parents=[shared_sub],
        help="Find nodes in the target profile",
    )
    p_search.add_argument("--id")
    p_search.add_argument("--file")
    p_search.add_argument("--line", type=int)
    p_search.add_argument("--content", help="Substring match on lineContent")
    p_search.add_argument("--trace-name", help="Substring match on traceName")
    p_search.add_argument("--type", choices=["LINE", "FILE", "DIRECTORY"])
    p_search.set_defaults(func=cmd_search)

    p_add = sub.add_parser(
        "add",
        parents=[shared_sub],
        help="Always create a new node (new UUID)",
    )
    add_insert_flags(p_add)
    p_add.set_defaults(func=cmd_add)

    p_ensure = sub.add_parser(
        "ensure",
        parents=[shared_sub],
        help="Get existing node by identity, or add if missing",
    )
    add_insert_flags(p_ensure)
    p_ensure.set_defaults(func=cmd_ensure)

    p_move = sub.add_parser(
        "move",
        parents=[shared_sub],
        help="Reparent a node (subtree moves with it)",
    )
    add_locator_flags(p_move)
    p_move.add_argument(
        "--parent-id",
        action="append",
        dest="parent_ids",
        default=None,
        metavar="ID",
        help=(
            "New parent node UUID; repeat rootward → immediate parent "
            "(shell-safe; preferred). For root, use --parent [] instead."
        ),
    )
    p_move.add_argument(
        "--parent",
        default=None,
        help=(
            'JSON parent path (use [] for root): ids and/or '
            '["file",line,"content"]. '
            "Prefer repeated --parent-id. Do not combine with --parent-id."
        ),
    )
    p_move.set_defaults(func=cmd_move)

    p_delete = sub.add_parser(
        "delete",
        parents=[shared_sub],
        help="Delete a node and its subtree",
    )
    add_locator_flags(p_delete)
    p_delete.set_defaults(func=cmd_delete)

    p_rename = sub.add_parser(
        "rename",
        parents=[shared_sub],
        help="Set a node's traceName (empty string clears the label)",
    )
    add_locator_flags(p_rename)
    p_rename.add_argument(
        "--trace-name",
        required=True,
        help="New traceName. Pass an empty string to clear the label.",
    )
    p_rename.set_defaults(func=cmd_rename)

    p_rebind = sub.add_parser(
        "rebind",
        parents=[shared_sub],
        help="Repair LINE lineNumbers after disk edits (content-based; no occurrence args)",
    )
    p_rebind.add_argument(
        "--file",
        action="append",
        default=[],
        help="Limit to relative path(s); repeatable. Default: all LINE nodes in profile.",
    )
    p_rebind.set_defaults(func=cmd_rebind)

    return parser


def normalize_add_args(args: argparse.Namespace) -> None:
    if args.command not in ("add", "ensure"):
        return
    pos = list(getattr(args, "pos_args", None) or [])
    if args.file is None and pos:
        if len(pos) == 1:
            args.file = pos[0]
        elif len(pos) == 2:
            raise SystemExit(
                "ERROR: positional LINE form is FILE LINE CONTENT; "
                "got FILE CONTENT. Pass a 1-based line number."
            )
        elif len(pos) >= 3:
            args.file = pos[0]
            if args.line is None:
                try:
                    args.line = int(pos[1])
                except ValueError as e:
                    raise SystemExit(
                        f"ERROR: positional LINE form is FILE LINE CONTENT; "
                        f"got non-integer line {pos[1]!r}"
                    ) from e
            if args.content is None:
                args.content = pos[2]
        else:
            pass
    if args.type is None:
        if args.line is not None or args.content is not None:
            args.type = "LINE"
        elif args.file:
            args.type = None


def main(argv: Optional[Sequence[str]] = None) -> int:
    configure_stdio_utf8()
    parser = build_parser()
    args = parser.parse_args(argv)
    apply_shared_defaults(args)
    normalize_add_args(args)
    if args.command in ("add", "ensure") and args.type is None and args.file:
        # Infer FILE vs DIRECTORY when no line/content
        start = Path(args.project or ".")
        try:
            project_root = find_project_root(start)
            args.type = infer_path_kind(project_root, norm_rel(args.file))
        except SystemExit:
            args.type = "FILE"
    try:
        return args.func(args)
    except BrokenPipeError:
        return 0


if __name__ == "__main__":
    sys.exit(main())
