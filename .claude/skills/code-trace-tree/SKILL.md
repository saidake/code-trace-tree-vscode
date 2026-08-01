---
name: code-trace-tree
description: >
  Read, edit, and refresh Code Trace Tree plugin data (JetBrains / VS Code shared storage).
  Use when the user asks to add/update/remove trace points (line, file, or directory), inspect or
  modify Code Trace Tree profiles, sync agent-written traces into the IDE, notify IntelliJ IDEA
  or VS Code to reload plugin data, or select/navigate to trace points in the IDE tree.
  Prefer scripts/trace_tree.py for search/add/move/delete/rebind (flexible LINE tips; no occurrence args; idempotent add).
  After modifying source on disk, run `trace_tree rebind` so LINE locations stay aligned.
  When `<claudeAssistEnabled>` is true, auto-sync topic-related traces each turn that touched code.
---

# Code Trace Tree

Operate the hybrid storage used by the Code Trace Tree IDE plugins, then ask the IDE to reload.

## Session startup: check Claude Assist

When this skill is loaded in the current session, resolve the project storage XML and read `<claudeAssistEnabled>` (and `<claudeAssistTarget>`). Keep those values for the rest of the session:

| `claudeAssistEnabled` | Behavior |
|-----------------------|----------|
| `true` | Follow [Claude Assist action](#claude-assist-action): auto-sync topic-related traces on turns that touch code |
| `false` or missing | Do **not** auto-sync; only edit traces when the user explicitly asks |

Re-check the flags if the user toggles Claude Assist in the IDE during the session (after a refresh / resolve).

## Skill scripts location

All helper scripts live in **this skill’s** `scripts/` directory (not the user’s project root):

| Install | Scripts directory |
|---------|-------------------|
| Global | `~/.claude/skills/code-trace-tree/scripts/` (Windows: `%USERPROFILE%\.claude\skills\code-trace-tree\scripts\`) |
| Project-local | `<repo>/.claude/skills/code-trace-tree/scripts/` |

In examples below, `scripts/...` means that skill path. From a project checkout that vendors the skill, `bash .claude/skills/code-trace-tree/scripts/resolve_storage.sh` also works. Prefer an absolute path or `cd` into the skill folder when unsure.

## Storage layout

| Piece | Location |
|-------|----------|
| Project id | `.idea/code-trace-tree.project.id` (prefer) or `.vscode/code-trace-tree.project.id` |
| Global XML | OS config dir + `/code-trace-tree/<FolderName>.xml` |
| Refresh signal | `.idea/` and `.vscode/code-trace-tree.refresh-request` (scripts write both) |
| Select signal | `.idea/` and `.vscode/code-trace-tree.select-request` (one node UUID per line) |

Global base directory:

- Windows: `%LOCALAPPDATA%\code-trace-tree`
- macOS: `~/Library/Application Support/code-trace-tree`
- Linux: `$XDG_CONFIG_HOME/code-trace-tree` or `~/.config/code-trace-tree`

Resolve the bound XML with (optional project path discovers the IDE project root; default is CWD):

```bash
# macOS / Linux — run from skill scripts dir, or use the full skill path
bash ~/.claude/skills/code-trace-tree/scripts/resolve_storage.sh
# optional: bash ~/.claude/skills/code-trace-tree/scripts/resolve_storage.sh /path/to/project
```

```bat
REM Windows
%USERPROFILE%\.claude\skills\code-trace-tree\scripts\resolve_storage.bat
REM optional: ...\resolve_storage.bat C:\path\to\project
```

## Preferred code workflow format

* When generating a code workflow, trace points with parent-child relationships should follow a clear nesting structure.
  For example, if the parent node represents a method, its direct child nodes should represent methods called within that method, and their direct child nodes should point to the corresponding method definitions.
  Example:
       method A definition
         - method B call
           - method B definition

* Keep trace point names simple and concise. Add descriptions only when additional context is needed.
* Prefer **LINE** anchors whose trimmed text is **unique (or rare) in that file**. Avoid generic lines such as `}`, `return;`, or blank-looking braces. Occurrence index is how the plugin and `rebind` restore a line after it moves; duplicate content in the same file makes rebinding fragile.
* For multi-line calls, pass a **distinctive substring** of the best physical line (e.g. `.handleEmailTriggerRequest(`); the script stores the full trimmed line. Do not invent a logical “call name” that is not on one source line.

## Content matching and `isValid`

`isValid` is never stored. On load/reload:

| `traceType` | Valid when |
|--------------|------------|
| `LINE` | Path is a file and trimmed line at `lineNumber` matches `lineContent`, or occurrence rebinding succeeds |
| `FILE` | Path exists and is a file |
| `DIRECTORY` | Path exists and is a directory |

For `LINE` nodes, prefer the `trace_tree` scripts (they set `totalOccurrences` / `occurrenceIndex` automatically). Do **not** ask Claude to compute occurrence fields. Details: [references/data-format.md](references/data-format.md).

When adding LINE nodes, choose `lineContent` that stands out in the file so occurrence-based restore/rebind stays accurate after edits.

## Trace tree ops

Use the skill’s `scripts/trace_tree.py` (via `trace_tree.sh` / `trace_tree.bat`) to search, add, move, delete, and rebind nodes. Never pass occurrence fields.

### LINE locators (forgiving)

Stored identity is still `[file, line, full-trimmed-line]`. Callers may pass a **stale line** and/or a **unique substring** of the line; the script resolves against the source file and stores the full trimmed line. `--line` is optional when `content` uniquely resolves.

| Tip | Result |
|-----|--------|
| Exact line + full trimmed text | Used as-is |
| Wrong/stale line + unique content | Line corrected (`unique_exact` / `nearest_exact`) |
| Distinctive substring (e.g. `.handleEmailTriggerRequest(`) | Anchors the matching line; stores full trimmed text |
| Multi-line call | Prefer the most distinctive physical line (often the `.methodName(` continuation), not a weak receiver-only line |

JSON output includes `resolve: { reason, needle, resolved }` so you can see what was stored.

**Idempotent add:** If a LINE/FILE/DIRECTORY node with the same identity already exists, `add` returns `"skipped": true` with the existing id (exit 0) instead of erroring. Search first only when you need to inspect the tree; re-adding the same tip is safe.

### Parent path

`--parent` is a JSON array from rootward ancestor → immediate parent (`[]` = root). Each step may be:

| Form | Example |
|------|---------|
| Node id (preferred) | `"3d41c2d1-…"` |
| `[file, content]` | `["src/A.java", "void methodA() {"]` |
| `[file, line, content]` | `["src/A.java", 10, "void methodA() {"]` |

Tree lookup tolerates stale lines and unique substrings. Prefer **ids from a prior `search`/`add`** for deep trees.

```text
method A def
  method B call
    method B def   ← add with parent [idA, idB]  or  [[file,"…A…"],[file,"…B…"]]
```

**CLI shape:** `trace_tree.py <subcommand> [flags…]`  
Shared flags (`--project`, `--profile`, `--dry-run`, `--no-refresh`) may appear **before or after** the subcommand:

```bash
# Both OK:
python3 …/scripts/trace_tree.py search --project /path/to/project
python3 …/scripts/trace_tree.py --project /path/to/project search
```

Omit `--project` when the process CWD is already inside the IDE project (scripts walk upward to find `.idea` / `.git`).

```bash
# macOS / Linux — set SKILL_SCRIPTS to whichever install you use:
#   global:        ~/.claude/skills/code-trace-tree/scripts
#   project-local: .claude/skills/code-trace-tree/scripts   (from repo root)
SKILL_SCRIPTS="${SKILL_SCRIPTS:-.claude/skills/code-trace-tree/scripts}"
bash "$SKILL_SCRIPTS/trace_tree.sh" search
# line optional when content uniquely resolves; substring OK for distinctive tips:
bash "$SKILL_SCRIPTS/trace_tree.sh" add --file src/A.java --content '.handleEmailTriggerRequest(' --name 'handleEmail'
bash "$SKILL_SCRIPTS/trace_tree.sh" add --file src/A.java --line 10 --content 'void methodA() {' --name 'methodA'
bash "$SKILL_SCRIPTS/trace_tree.sh" add src/B.java 40 'void methodB() {' \
  --parent '["'"$PARENT_ID"'"]' \
  --name 'methodB'
# or without ids: --parent '[["src/A.java","void methodA() {"],["src/A.java","methodB();"]]'
bash "$SKILL_SCRIPTS/trace_tree.sh" move --file src/B.java --content 'void methodB() {' --parent '[]'
bash "$SKILL_SCRIPTS/trace_tree.sh" delete --id <uuid>
# After editing source on disk (IDE DocumentListener will NOT run):
bash "$SKILL_SCRIPTS/trace_tree.sh" rebind
bash "$SKILL_SCRIPTS/trace_tree.sh" rebind --file src/A.java --file src/B.java
```

```bat
REM Windows — project-local (from repo root) or set to %%USERPROFILE%%\.claude\skills\code-trace-tree\scripts
if not defined SKILL_SCRIPTS set "SKILL_SCRIPTS=.claude\skills\code-trace-tree\scripts"
%SKILL_SCRIPTS%\trace_tree.bat search
%SKILL_SCRIPTS%\trace_tree.bat add --file src\A.java --content ".handleEmailTriggerRequest(" --name handleEmail
%SKILL_SCRIPTS%\trace_tree.bat move --id <uuid> --parent "[]"
%SKILL_SCRIPTS%\trace_tree.bat delete --file src\A.java --content "void methodA() {"
REM After editing source on disk:
%SKILL_SCRIPTS%\trace_tree.bat rebind
%SKILL_SCRIPTS%\trace_tree.bat rebind --file src\A.java
```

Default profile: Claude Assist target when enabled (`CLAUDE` / active); otherwise `<activeProfileName>`.

**Rebind after disk edits:** Claude does not edit through the IDE editor, so live line shifting does not apply. After any turn that modified project source, run `trace_tree rebind` (optionally `--file` for touched paths) before relying on locators or select/navigate. Rebind repairs `lineNumber` from trimmed `lineContent` and recomputes occurrences.

## Safe operations

| Goal | How |
|------|-----|
| List / find traces | `trace_tree search` (or parse profile XML) |
| Add root / child | `trace_tree add` with `--parent` (ids preferred; idempotent if already present) |
| Reparent node | `trace_tree move` |
| Remove node + subtree | `trace_tree delete` |
| Repair lines after source edits | `trace_tree rebind` (required after Claude disk edits) |
| Switch profile | Set `<activeProfileName>` or pass `--profile` to scripts |

## After refresh

IntelliJ or VS Code (with the plugin loaded) reloads the bound XML, refreshes the Code Trace Tree tool window, and re-applies highlights. The plugin deletes its IDE-local `code-trace-tree.refresh-request` after a successful reload.

## Additional resources

All under the skill’s `scripts/` directory (see Skill scripts location):

- XML schema details: [references/data-format.md](references/data-format.md)
- Resolve storage: `resolve_storage.sh` / `resolve_storage.bat`
- Trace tree ops: `trace_tree.sh` / `trace_tree.bat` → `trace_tree.py`
- Request IDE refresh: `request_refresh.sh` / `request_refresh.bat`
- Select / navigate: `select_trace_points.sh` / `select_trace_points.bat`

## Edit plugin data action

1. **Resolve** the project id + global XML (skill `scripts/resolve_storage.sh` / `.bat`; see Skill scripts location).
2. **Read** the XML. Schema: [references/data-format.md](references/data-format.md).
3. **Edit** carefully (see rules below). Prefer atomic write: write `*.xml.tmp` then replace.
4. **Refresh IDE** so IntelliJ / VS Code reloads in-memory state:

```bash
# macOS / Linux
bash ~/.claude/skills/code-trace-tree/scripts/request_refresh.sh
```

```bat
REM Windows
%USERPROFILE%\.claude\skills\code-trace-tree\scripts\request_refresh.bat
```

Editing the global XML alone is usually enough (the plugin watches it). Always write the refresh request after agent edits so reload is explicit.

## Edit rules

- Keep `<project version="4">`, `<projectId>`, and `<path>` unless you intentionally rebind storage.
- Bump `<updatedAt>` to the current epoch milliseconds when you change content.
- Every `<tracePoint>` needs `<traceType>`: `LINE`, `FILE`, or `DIRECTORY`.
- `traceName` is the user label; `baseName` is the last path segment; `tracePath` is **relative to the project root** (forward slashes preferred).
- For `LINE`: store trimmed `lineContent` and 1-based `lineNumber`. Prefer `trace_tree` scripts so `totalOccurrences` / `occurrenceIndex` are computed automatically.
- For `FILE` / `DIRECTORY`: omit line fields; `tracePath` is the file or directory path.
- Every `<tracePointNode>` needs `<id>` (UUID) and `<parentId>` (empty for roots).
- Nest children under `<children>`; child `parentId` must equal the parent node id.
- Do **not** persist `isValid` (runtime-only).
- Do not delete unrelated profiles. Default profile name is `main`.
- If the IDE has the project open, finish XML edits **before** writing the refresh request.

## Claude Assist action

Check project XML flags after resolving storage:

| Flag | Meaning |
|------|---------|
| `claudeAssistEnabled` | `true` → Claude may mutate traces; `false`/missing → do **not** auto-sync |
| `claudeAssistTarget` | `CURRENT` → edit `<activeProfileName>`; `CLAUDE` → edit/create profile named `CLAUDE` |

When **enabled** and the current turn **touched code** (read, edited, or discussed concrete source for the topic):

1. Resolve the target profile (`CURRENT` or `CLAUDE`; `trace_tree` honors assist flags by default).
2. Use `trace_tree add` / `move` / `delete` for the **discussed topic** only (follow Preferred code workflow format). Prefer scripts over hand-editing occurrence fields.
3. After modifying source files, run `trace_tree rebind` (with `--file` for touched paths when possible) so LINE locations track the new text.
4. Add short `--description` notes when extra context helps; keep `--name` concise.
5. Do not rewrite unrelated nodes or other profiles.
6. Scripts refresh the IDE by default; use select/navigate when a single new node should be shown.

When **disabled**, only edit traces if the user explicitly asks.

## Select / navigate in the IDE action

Write node UUIDs (one per line) to `.idea/` and/or `.vscode/code-trace-tree.select-request`, or use the helper scripts (they write both). The plugin shows the Code Trace Tree tool window, selects and reveals those nodes, then deletes the file.

| Request | Tree | Editor |
|---------|------|--------|
| 1 valid id | Select + reveal | Navigate to source |
| 2+ valid ids | Select + reveal all | No navigation |
| Unknown ids only | No-op (file still deleted) | No navigation |

Use after creating or locating traces when the user should see them in the IDE. Prefer a single id when you want the editor to jump to the source.

```bash
# macOS / Linux
bash scripts/select_trace_points.sh <id> [id...]
```

```bat
REM Windows
scripts\select_trace_points.bat <id> [id...]
```

