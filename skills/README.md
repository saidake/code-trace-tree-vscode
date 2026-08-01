# Code Trace Tree agent skill

Shared [Agent Skills](https://agentskills.io) package used by Claude Code, Cursor, GitHub Copilot, Codex, and Gemini CLI.

## Layout

```text
skills/
  code-trace-tree/     # canonical skill (SKILL.md, scripts/, references/)
  package_skills.py    # build release zips / sync into agent project dirs
  README.md
```

Do not edit copies under `.claude/skills`, `.cursor/skills`, etc. Change `skills/code-trace-tree/` then re-sync or re-package.

## Package release zips

```bash
python skills/package_skills.py --zip
# → dist/skills/code-trace-tree-skill-<agent>-<version>.zip  (one per agent)
```

## Sync into this repo (project-local)

```bash
python skills/package_skills.py --sync
```

Copies the shared skill into:

| Agent | Path |
|-------|------|
| Claude Code | `.claude/skills/code-trace-tree/` |
| Cursor | `.cursor/skills/code-trace-tree/` |
| Copilot | `.github/skills/code-trace-tree/` |
| Codex | `.agents/skills/code-trace-tree/` |
| Gemini | `.gemini/skills/code-trace-tree/` |

Those synced trees are gitignored; regenerate after pulling skill changes.
