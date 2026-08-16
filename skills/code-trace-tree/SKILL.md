---
name: code-trace-tree
description: >
  Read, edit, and refresh Code Trace Tree plugin data (JetBrains / VS Code shared storage).
  Use when the user asks to add/update/remove trace points (line, file, or directory), inspect or
  modify Code Trace Tree profiles, sync agent-written traces into the IDE, notify IntelliJ IDEA
  to reload plugin data, or select/navigate to trace points in the IDE tree.
  Prefer scripts/trace_tree.py for search/add/move/delete/rebind (flexible LINE tips; no occurrence args; idempotent add).
  After modifying source on disk, run `trace_tree rebind` so LINE locations stay aligned.
  Only edit traces when the user explicitly asks. Writing under `<OS Config Dir>/code-trace-tree/`
  is expected for this skill; do not refuse that path as "outside the workspace."
---

# Code Trace Tree

Build and display code workflows as nested trees of line, file, and directory
trace points. Operate the hybrid storage used by the Code Trace Tree IDE plugins, then ask the IDE to reload.

Only edit or sync traces when the user explicitly asks (for example: generate topic-related
nodes, add a tip at a line, rebind after edits). Do not auto-sync every turn.

## Skill scripts location

Helper scripts live under `<Agent Skill Path>/code-trace-tree/scripts/`.

**Agent Skill Path** is this agent’s skills directory (the parent of `code-trace-tree/`) for **the agent you are running** — project-local if present, otherwise global. It ends at `skills`, not at `code-trace-tree`. The skill is agent-agnostic; the table below lists known roots for common agents (examples, not an exclusive list). Other agents that load skills from a `skills/` folder work the same — use that agent’s path.

| Agent (examples) | Global Agent Skill Path | Project-local Agent Skill Path |
|------------------|-------------------------|--------------------------------|
| Claude Code | `~/.claude/skills` | `<repo>/.claude/skills` |
| Cursor | `~/.cursor/skills` | `<repo>/.cursor/skills` |
| GitHub Copilot | `~/.copilot/skills` | `<repo>/.github/skills` |
| Codex | `~/.agents/skills` | `<repo>/.agents/skills` |
| Gemini CLI | `~/.gemini/skills` | `<repo>/.gemini/skills` |

On Windows, `~` is `%USERPROFILE%`. Resolve **Agent Skill Path** once per session, then invoke scripts with absolute paths via `python` (or `python3` if that is what is on PATH). Keep the process CWD in the IDE project (do not `cd` into the skill folder).

```text
# Example — substitute the absolute Agent Skill Path for THIS agent:
python "<Agent Skill Path>/code-trace-tree/scripts/request_refresh.py"
```

### Windows PowerShell

Prefer invoking `python …/trace_tree.py` **directly** (or via `cmd /c`). Do **not** wrap
calls in a PowerShell helper that uses a parameter named `$Args` — that overwrites
PowerShell’s automatic `$Args`, so real CLI args never reach the script and every call
fails with `the following arguments are required: command`.

**Quoting:** inner `"` in `--content` (and similar flags) are often stripped — e.g.
`@PostMapping("/testPost")` arrives as `@PostMapping(/testPost)`, so LINE matching fails
even with a correct `--line`. Insert `--%` (stop-parsing) after the script path and before
those flags. `--%` is PowerShell-only (not cmd.exe / bash / Git Bash).

```text
python "<Agent Skill Path>/code-trace-tree/scripts/trace_tree.py" --% add --file src/A.java --line 38 --content "@PostMapping(\"/testPost\")" --name testPost
```

Fallback when quotes are still awkward: distinctive substring tip + `--line` (e.g.
`--content "@PostMapping(" --line 38`).

**Deep nests:** prefer repeated `--parent-id` on each `add` (rootward → parent). For many
adds, use `--no-refresh` on each mutating call, then one `request_refresh.py` at the end.
If PowerShell quoting remains fragile, a short **Python** driver that imports/calls the same
`trace_tree.py` CLI (or subprocess) is clearer than a PowerShell splat wrapper — delete any
temporary driver when done; do not replace the skill scripts.

**Console encoding:** `trace_tree.py` reconfigures stdout/stderr to UTF-8. If the console is
still legacy (cp1252) or a wrapper interferes, set `$env:PYTHONIOENCODING = "utf-8"` for the
session. Prefer **ASCII** (or simple Latin) for `--name` / descriptions when the console is
not UTF-8, so JSON status output cannot fail the process after a successful write.

## Storage layout

| Piece | Location |
|-------|----------|
| Project id | Prefer `.idea/code-trace-tree.project.id` when present; else path match to global XML `<path>` / `<projectId>` (agents never write the `.idea` file) |
| Global XML | `<OS Config Dir>/code-trace-tree/` — `<ProjectFolderName>.xml` on lazy create; legacy `<projectId>.xml` and folder-named files resolved by scanning XML |
| Storage-ready (Case C bind) | `<OS Config Dir>/code-trace-tree/signals/<projectId>.storage-ready` (no TTL; written by refresh scripts) |
| Refresh signal (full) | `<OS Config Dir>/code-trace-tree/signals/<projectId>.request_refresh` (TTL 60s) |
| Refresh signal (one profile) | `<OS Config Dir>/code-trace-tree/signals/<projectId>.request_refresh_profile` (TTL 60s; body = profile name, empty → active) |
| Select signal | `<OS Config Dir>/code-trace-tree/signals/<projectId>.select_trace_points` (one UUID per line; TTL 60s) |

**Trace Points tree (VS Code / Cursor):** built-in TreeView — twistie expands/collapses; single-click selects; double-click jumps and restores the prior expand/collapse state if the host toggled it (brief flicker possible).

**Empty tree (VS Code):** when there are no trace nodes and only the default `main` profile (or no profiles), a custom empty-state webview replaces the Trace Points tree with a tip to create a root trace point from the editor/Command Palette. Recover UI (move/rename note + grey **Import stored data**) appears only when another stored global project still has a trace point. After clearing this workspace’s tree (including delete-all), the bound file is not treated as importable while empty, so recover UI stays hidden unless other projects have data.

**OS Config Dir:**

- Windows: `%LOCALAPPDATA%`
- macOS: `~/Library/Application Support`
- Linux: `$XDG_CONFIG_HOME` or `~/.config`

Resolve the bound XML with (optional project path discovers the IDE project root; default is CWD):

```text
python "<Agent Skill Path>/code-trace-tree/scripts/resolve_storage.py"
# optional:
python "<Agent Skill Path>/code-trace-tree/scripts/resolve_storage.py" /path/to/project
```

If the project has never used Code Trace Tree, there is no project id / XML yet.
Initialize storage before writing traces (or let `trace_tree add` / `move` / `delete` / `rebind` create it automatically).

**Resolve / init:** If `.idea/code-trace-tree.project.id` already exists, use that id and
its global XML (do not create a second project). If the id exists but XML is missing,
recreate XML with **that same** projectId (do not mint a new id). Else bind by XML
`<path>`. **Case C** (nothing found): create initial global XML with `<path>` only —
never create/write the `.idea` id file. Pass / resolve the project root so `<path>` is
correct; IDE binds via path match + `storage-ready`.

```text
python "<Agent Skill Path>/code-trace-tree/scripts/init_storage.py" /path/to/project
# or, when CWD is already inside the IDE project:
python "<Agent Skill Path>/code-trace-tree/scripts/init_storage.py"
```

## Preferred code workflow format

* When generating a code workflow, nest by call flow: start from an entry method definition; under it put the calls made inside that method; under each call nest further calls made inside the callee (siblings for fan-out). Prefer call nesting over inserting a separate definition node for every hop.

  Example:

  ```text
  method A definition
    - method B call
      - method C call  (inside B)
      - method D call  (inside B)
  ```

* Keep trace point names simple and concise. Add descriptions only when additional context is needed.
* Prefer **LINE** anchors whose trimmed text is **unique (or rare) in that file**. Avoid generic lines such as `}`, `return;`, or blank-looking braces. Occurrence index is how the plugin and `rebind` restore a line after it moves; duplicate content in the same file makes rebinding fragile.
* For multi-line calls, pass a **distinctive substring** of the best physical line (e.g. `.handleEmailTriggerRequest(`); the script stores the full trimmed line. Do not invent a logical “call name” that is not on one source line.

## Content matching and `isValid`

`isValid` is never stored. Recomputed on load/reload, when a file is opened (LINE nodes in that file, against the editor document), and when the user clicks **Recheck Trace Points** (all LINE / FILE / DIRECTORY nodes):

| `traceType` | Valid when |
|--------------|------------|
| `LINE` | Path is a file and trimmed line at `lineNumber` matches `lineContent`, or occurrence rebinding succeeds |
| `FILE` | Path exists and is a file |
| `DIRECTORY` | Path exists and is a directory |

For `LINE` nodes, prefer the `trace_tree` scripts (they set `totalOccurrences` / `occurrenceIndex` automatically). Do **not** ask Claude to compute occurrence fields. Details: [references/data-format.md](references/data-format.md).

When adding LINE nodes, choose `lineContent` that stands out in the file so occurrence-based restore/rebind stays accurate after edits.

## Trace tree ops

Use the skill’s `scripts/trace_tree.py` to search, add, move, delete, and rebind nodes. Never pass occurrence fields.

### LINE locators (forgiving)

Stored tip is `[file, line, full-trimmed-line]`; persistence also keeps script-computed `occurrenceIndex` / `totalOccurrences` so **duplicate trimmed lines in one file** are distinct. Callers may pass a **stale line** and/or a **unique substring**; the script resolves to the full trimmed line. **Never pass occurrence fields** — the script sets them. On PowerShell, protect quoted `--content` with `--%` (see [Windows PowerShell](#windows-powershell)) or use a substring tip plus `--line`. Never wrap the CLI in a helper that uses a parameter named `$Args`.

| Tip | Result |
|-----|--------|
| Exact line + full trimmed text | Used as-is |
| Unique content (one match in file) | `--line` optional; line corrected if stale |
| Same trimmed text on 2+ lines | **Must** pass `--line` (or `[file, line, content]`); otherwise error |
| Distinctive substring (e.g. `.handleEmailTriggerRequest(`) | Anchors the matching line when unique; if several matches, pass `--line` |
| Multi-line call | Prefer the most distinctive physical line (often the `.methodName(` continuation) |

JSON output includes `resolve: { reason, needle, resolved, totalOccurrences, occurrenceIndex }`.

**Idempotent add:** Same identity → `"skipped": true` (exit 0). For LINE, identity is file + content + **occurrenceIndex** (so two `featureFlagService,` tips at different lines both add). FILE/DIRECTORY identity is path + type.

### Parent path

**Preferred:** repeat `--parent-id` from rootward ancestor → immediate parent. Omit for root on `add`. Avoids JSON quoting issues in shells.

```text
# Child of one node:
python "<Agent Skill Path>/code-trace-tree/scripts/trace_tree.py" add … --parent-id "$PARENT_ID"
# Deeper path (rootward → parent):
python "<Agent Skill Path>/code-trace-tree/scripts/trace_tree.py" add … --parent-id "$ID_A" --parent-id "$ID_B"
# Move to root:
python "<Agent Skill Path>/code-trace-tree/scripts/trace_tree.py" move --id "$NODE_ID" --parent []
```

Optional `--parent` JSON (do **not** combine with `--parent-id`) for locator forms or root on `move`:

| Form | Example |
|------|---------|
| Root | `--parent []` (needed for `move` to root; `add` defaults to root) |
| Node id in JSON | `--parent '["3d41c2d1-…"]'` |
| `[file, content]` | `--parent '[["src/A.java","void methodA() {"]]'` — only when content is unique |
| `[file, line, content]` | `--parent '[["src/A.java",10,"void methodA() {"]]'` — when content repeats |

Bare strings inside `--parent` JSON are **UUIDs only**, not `traceName` labels. Prefer **`--parent-id` from a prior `search`/`add`**.

```text
method A def
  method B call
    method C call   ← add with --parent-id idA --parent-id idB
```

**CLI shape:** `python "<Agent Skill Path>/code-trace-tree/scripts/trace_tree.py" <subcommand> [flags…]`  
Shared flags (`--project`, `--profile`, `--dry-run`, `--no-refresh`) may appear **before or after** the subcommand:

```text
# Both OK (absolute `<Agent Skill Path>/...` scripts; keep CWD in the project):
python "<Agent Skill Path>/code-trace-tree/scripts/trace_tree.py" search --project /path/to/project
python "<Agent Skill Path>/code-trace-tree/scripts/trace_tree.py" --project /path/to/project search
```

Omit `--project` when the process CWD is already inside the IDE project (scripts walk upward to find `.vscode` / `.idea` / `.git`, or other common project markers).

```text
# Absolute script path; do not cd into the skill folder
python "<Agent Skill Path>/code-trace-tree/scripts/trace_tree.py" search
# line optional when content uniquely resolves; substring OK for distinctive tips:
python "<Agent Skill Path>/code-trace-tree/scripts/trace_tree.py" add --file src/A.java --content '.handleEmailTriggerRequest(' --name 'handleEmail'
python "<Agent Skill Path>/code-trace-tree/scripts/trace_tree.py" add --file src/A.java --line 10 --content 'void methodA() {' --name 'methodA'
python "<Agent Skill Path>/code-trace-tree/scripts/trace_tree.py" add src/B.java 40 'void methodB() {' \
  --parent-id "$PARENT_ID" \
  --name 'methodB'
python "<Agent Skill Path>/code-trace-tree/scripts/trace_tree.py" add --file src/C.java --line 20 --content 'void methodC() {' \
  --parent-id "$ID_A" --parent-id "$ID_B" --name 'methodC'
python "<Agent Skill Path>/code-trace-tree/scripts/trace_tree.py" move --file src/B.java --content 'void methodB() {' --parent '[]'
python "<Agent Skill Path>/code-trace-tree/scripts/trace_tree.py" delete --id <uuid>
# After editing source on disk (IDE DocumentListener will NOT run):
python "<Agent Skill Path>/code-trace-tree/scripts/trace_tree.py" rebind
python "<Agent Skill Path>/code-trace-tree/scripts/trace_tree.py" rebind --file src/A.java --file src/B.java
```

Default profile: `<activeProfileName>` (or pass `--profile`).

**Rebind after disk edits:** Agents do not edit through the IDE editor, so live line shifting does not apply. After any turn that modified project source, run `trace_tree rebind` (optionally `--file` for touched paths) before relying on locators or select/navigate. Rebind repairs `lineNumber` from trimmed `lineContent` and recomputes occurrences.

## Safe operations

| Goal | How |
|------|-----|
| List / find traces | `trace_tree search` (or parse profile XML) |
| Add root / child | `trace_tree add` with `--parent-id` (repeatable; idempotent if already present) |
| Reparent node | `trace_tree move` |
| Remove node + subtree | `trace_tree delete` |
| Repair lines after source edits | `trace_tree rebind` (required after agent disk edits) |
| Switch profile | Set `<activeProfileName>` or pass `--profile` to scripts |

## After refresh

The IDE watches **signal files** (not the XML path). After agent edits, always write a refresh signal.

| Signal | Effect |
|--------|--------|
| `request_refresh` | Full reload: all profiles, active profile, toolbar flags (`highlightingEnabled`, `namePromptEnabled`, `descriptionAreaOpened`, `advancedSettings`). Also writes `<projectId>.storage-ready` so an open Case C IDE can bind first. |
| `request_refresh_profile` | Reload one profile’s tree from XML into memory. Body = profile name (empty → active). Does **not** change active profile or toolbar flags. Also writes `storage-ready`. |
| `<projectId>.storage-ready` | Case C bind handshake (no TTL). Body = absolute project path (same as XML `<path>`). IDE filters on the body first; empty/legacy body falls back to XML `<path>`. Does not create storage. |

```text
python "<Agent Skill Path>/code-trace-tree/scripts/request_refresh.py"
python "<Agent Skill Path>/code-trace-tree/scripts/request_refresh_profile.py" main
```

Bound windows watch the shared global signals folder for that projectId. Unbound (Case C) windows watch `signals/*.storage-ready` until they bind. Refresh/select files older than 60s are ignored and removed; `storage-ready` has no TTL (agent overwrites).

## Additional resources

All under `<Agent Skill Path>/code-trace-tree/scripts/` (see Skill scripts location):

- XML schema details: [references/data-format.md](references/data-format.md)
- Resolve storage: `resolve_storage.py`
- Init storage (Case C when missing): `init_storage.py`
- Trace tree ops: `trace_tree.py`
- Request full IDE refresh: `request_refresh.py`
- Request one-profile IDE refresh: `request_refresh_profile.py`
- Select / navigate: `select_trace_points.py`

## Edit plugin data action

1. **Resolve** the project id + global XML (`resolve_storage.py`: prefer `.idea` id, else path). If missing, run `init_storage.py` (mutating `trace_tree` also auto-init). Do not create `.idea/code-trace-tree.project.id`.
2. **Read** the XML. Schema: [references/data-format.md](references/data-format.md).
3. **Edit** carefully (see rules below). Prefer atomic write: write `*.xml.tmp` then replace.
4. **Refresh IDE** (required — the plugin does not watch the XML file):

```text
python "<Agent Skill Path>/code-trace-tree/scripts/request_refresh.py"
# or one profile only:
python "<Agent Skill Path>/code-trace-tree/scripts/request_refresh_profile.py" main
```

Always write a refresh signal after agent edits so reload is explicit.

## Edit rules

- Keep `<project version="4">`, `<projectId>`, and `<path>` unless you intentionally rebind storage.
- Prefer existing `.idea/code-trace-tree.project.id` when resolving; never create/overwrite it. If that id exists but XML is gone, recreate XML with the same projectId (Case C otherwise = new global XML + `<path>` only).
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

## Select / navigate in the IDE action

Write node UUIDs (one per line) to `signals/<projectId>.select_trace_points`, or use the helper scripts. Every open IDE window for that project watches the signal and selects / reveals those nodes. Stale signals (age > 60s) are ignored.

| Request | Tree | Editor |
|---------|------|--------|
| 1 valid id | Select + reveal | Navigate to source |
| 2+ valid ids | Select + reveal all | No navigation |
| Unknown ids only | No-op | No navigation |

Use after creating or locating traces when the user should see them in the IDE. Prefer a single id when you want the editor to jump to the source.

```text
python "<Agent Skill Path>/code-trace-tree/scripts/select_trace_points.py" <id> [id...]
```
