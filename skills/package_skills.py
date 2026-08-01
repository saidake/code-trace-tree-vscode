#!/usr/bin/env python3
"""Package / sync the shared Code Trace Tree skill for multiple agents.

Canonical source: skills/code-trace-tree/

Examples:
  python skills/package_skills.py                  # per-agent zips into dist/skills/
  python skills/package_skills.py --version 1.1.4
  python skills/package_skills.py --sync           # copy into project agent skill dirs
  python skills/package_skills.py --zip --sync

Zip naming: code-trace-tree-skill-<agent>-<version>.zip
"""

from __future__ import annotations

import argparse
import re
import shutil
import sys
import zipfile
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
SKILL_NAME = "code-trace-tree"
SOURCE = Path(__file__).resolve().parent / SKILL_NAME
DIST = REPO_ROOT / "dist" / "skills"

# Agent id -> (project-relative skills parent, global home-relative skills parent for docs)
AGENTS: dict[str, dict[str, str]] = {
    "claude": {
        "project_skills_dir": ".claude/skills",
        "global_skills_dir": "~/.claude/skills",
        "label": "Claude Code",
    },
    "cursor": {
        "project_skills_dir": ".cursor/skills",
        "global_skills_dir": "~/.cursor/skills",
        "label": "Cursor",
    },
    "copilot": {
        "project_skills_dir": ".github/skills",
        "global_skills_dir": "~/.copilot/skills",
        "label": "GitHub Copilot",
    },
    "codex": {
        "project_skills_dir": ".agents/skills",
        "global_skills_dir": "~/.agents/skills",
        "label": "Codex",
    },
    "gemini": {
        "project_skills_dir": ".gemini/skills",
        "global_skills_dir": "~/.gemini/skills",
        "label": "Gemini CLI",
    },
}


def detect_version(explicit: str | None) -> str:
    if explicit:
        return explicit.lstrip("v")
    package_json = REPO_ROOT / "main" / "package.json"
    text = package_json.read_text(encoding="utf-8")
    m = re.search(r'"version"\s*:\s*"([^"]+)"', text)
    if not m:
        raise SystemExit("Could not detect version from main/package.json")
    return m.group(1)


def copy_skill_tree(dest_skill_dir: Path) -> None:
    if dest_skill_dir.exists():
        shutil.rmtree(dest_skill_dir)
    shutil.copytree(
        SOURCE,
        dest_skill_dir,
        ignore=shutil.ignore_patterns("__pycache__", "*.pyc", ".DS_Store"),
    )


def write_zip(zip_path: Path) -> None:
    zip_path.parent.mkdir(parents=True, exist_ok=True)
    if zip_path.exists():
        zip_path.unlink()
    with zipfile.ZipFile(zip_path, "w", compression=zipfile.ZIP_DEFLATED) as zf:
        for path in sorted(SOURCE.rglob("*")):
            if path.is_dir():
                continue
            if path.name in {".DS_Store"} or "__pycache__" in path.parts:
                continue
            arcname = Path(SKILL_NAME) / path.relative_to(SOURCE)
            zf.write(path, arcname.as_posix())


def package_zips(version: str, agents: list[str]) -> list[Path]:
    DIST.mkdir(parents=True, exist_ok=True)
    written: list[Path] = []
    for agent in agents:
        out = DIST / f"code-trace-tree-skill-{agent}-{version}.zip"
        write_zip(out)
        written.append(out)
        print(f"wrote {out.relative_to(REPO_ROOT)}  ({AGENTS[agent]['label']})")
    return written


def sync_project(agents: list[str]) -> None:
    for agent in agents:
        rel = AGENTS[agent]["project_skills_dir"]
        dest = REPO_ROOT / rel / SKILL_NAME
        dest.parent.mkdir(parents=True, exist_ok=True)
        copy_skill_tree(dest)
        print(f"synced -> {dest.relative_to(REPO_ROOT)}  ({AGENTS[agent]['label']})")


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--version", help="Skill/package version (default: main/package.json version)")
    parser.add_argument(
        "--agents",
        default=",".join(AGENTS.keys()),
        help=f"Comma-separated agents (default: all). Choices: {', '.join(AGENTS)}",
    )
    parser.add_argument(
        "--zip",
        action="store_true",
        help="Write per-agent skill zip files under dist/skills/ "
        "(code-trace-tree-skill-<agent>-VERSION.zip)",
    )
    parser.add_argument(
        "--sync",
        action="store_true",
        help="Copy the shared skill into each agent's project skills directory",
    )
    args = parser.parse_args(argv)

    if not SOURCE.is_dir() or not (SOURCE / "SKILL.md").is_file():
        print(f"ERROR: missing shared skill at {SOURCE}", file=sys.stderr)
        return 1

    agents = [a.strip().lower() for a in args.agents.split(",") if a.strip()]
    unknown = [a for a in agents if a not in AGENTS]
    if unknown:
        print(f"ERROR: unknown agents: {', '.join(unknown)}", file=sys.stderr)
        return 1

    if not args.zip and not args.sync:
        # Default: package zips for all agents
        args.zip = True

    version = detect_version(args.version)
    if args.zip:
        package_zips(version, agents)
    if args.sync:
        sync_project(agents)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
