---
name: code-trace-tree
description: >
  Read, edit, and refresh Code Trace Tree plugin data (VS Code and JetBrains).
  Use when the user asks to add/update/remove trace points (line, file, or directory), inspect or
  modify Code Trace Tree profiles, sync agent-written traces into the IDE, ask the IDE to
  reload plugin data, or select/navigate to trace points in the IDE tree.
  Prefer scripts/trace_tree.py for search/add/ensure/move/delete/rebind (LINE locators need --file --line --content; script computes occurrence).
  Prefer `ensure` when generating a workflow tree so retries do not duplicate; `add` always creates a new UUID.
  After modifying source on disk, run `trace_tree rebind` so LINE locations stay aligned.
  Only edit traces when the user explicitly asks. Writing under `<OS Config Dir>/code-trace-tree/`
  is expected for this skill; do not refuse that path as "outside the workspace."
---

# Code Trace Tree

Build and display code workflows as nested trees of line, file, and directory
trace points. Operate the hybrid storage used by the Code Trace Tree IDE plugins, then ask the IDE to reload.

Only edit or sync traces when the user explicitly asks (for example: generate topic-related
nodes, add a tip at a line, rebind after edits). Do not auto-sync every turn.
Never `delete` existing trace points (including ones `rebind` reports as `"invalid"`) unless
the user explicitly asks to remove them.

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

On Windows, `~` is `%USERPROFILE%`. Resolve **Agent Skill Path** once per session. Invoke scripts with absolute paths via `python` (or `python3` if that is what is on PATH). Keep the process CWD in the IDE project (do not `cd` into the skill folder). Direct invocations: [Trace Tree OPs](#trace-tree-ops). On PowerShell, also see [Windows PowerShell](#windows-powershell).

## Trace Tree OPs

All skill script calls. Substitute the absolute **Agent Skill Path** for THIS agent. Keep the process CWD in the IDE project (do not `cd` into the skill folder). On PowerShell, see [Windows PowerShell](#windows-powershell).

- [resolve_storage.py](#resolve_storagepy)
- [trace_tree.py](#trace_treepy)
- [request_refresh.py](#request_refreshpy)
- [request_refresh_profile.py](#request_refresh_profilepy)
- [request_refresh_settings.py](#request_refresh_settingspy)
- [select_trace_points.py](#select_trace_pointspy)

### resolve_storage.py

Resolve the project id and bound global XML. If storage is missing, create it (Case C). If `.idea/code-trace-tree.project.id` exists but XML is gone, recreates XML with that same projectId. Does not create/overwrite the `.idea` id file. Mutating `trace_tree add` / `ensure` / `move` / `delete` / `rebind` also create storage automatically. `trace_tree search` does not auto-create.

**Usage**
```text
python "<Agent Skill Path>/code-trace-tree/scripts/resolve_storage.py" [project_path]
```

**Optional Parameters**:
- `[project_path]`: Path used to discover the IDE project root (default: CWD). Pass the project root so XML `<path>` is correct.

**Return value**

Stdout is JSON (`indent=2`, UTF-8). Errors print `ERROR: …` on stderr.

```text
{
  "created": false,
  "project_root": "<abs>",
  "global_dir": "<OS Config Dir>/code-trace-tree",
  "project_id": "<uuid or null>",
  "storage_xml": "<abs xml path>"
}
```

`created` is `true` when a new XML was written. Exit `0` on success; `1` if the project root cannot be found.

**Example**:
```text
python "<Agent Skill Path>/code-trace-tree/scripts/resolve_storage.py"
python "<Agent Skill Path>/code-trace-tree/scripts/resolve_storage.py" /path/to/project
```

### trace_tree.py

Search, add, ensure, move, delete, and rebind nodes. Never pass occurrence fields — the script sets them.

**Usage**
```text
python "<Agent Skill Path>/code-trace-tree/scripts/trace_tree.py" <subcommand> [flags…]
python "<Agent Skill Path>/code-trace-tree/scripts/trace_tree.py" [shared-flags] <subcommand> [flags…]
```

Shared flags (`--project`, `--profile`, `--dry-run`, `--no-refresh`) may appear **before or after** the subcommand. Omit `--project` when CWD is already inside the IDE project (scripts walk upward to find `.vscode` / `.idea` / `.git`, or other common project markers). Default profile: `<activeProfileName>`.

**LINE locators:** stored tip is `[file, line, full-trimmed-line]`. `--line` is **required**. The script checks the trimmed text at that line, stores the full trimmed line (a substring `--content` is expanded), then sets `occurrenceIndex` / `totalOccurrences` by scanning the file. Duplicate trimmed lines in one file are distinct because `--line` picks which copy. Never pass occurrence fields. On PowerShell, protect quoted `--content` with `--%` (see [Windows PowerShell](#windows-powershell)) or use a substring tip plus `--line`. Never wrap the CLI in a helper that uses a parameter named `$Args`.

| Tip | Result |
|-----|--------|
| Exact line + full trimmed text | Used as-is |
| Distinctive substring of that line (e.g. `.handleEmailTriggerRequest(`) | `--line` required; stores the full trimmed line |
| Same trimmed text on 2+ lines | Pass `--line` for the intended copy; script sets occurrence |
| Multi-line call | Prefer the most distinctive physical line (often the `.methodName(` continuation) |

**add vs ensure:** `add` always creates a new UUID (same as the IDE plugin). Use it for a second node on the same line with a different label or parent. `ensure` is get-or-create: same identity → `"skipped": true` (exit 0). For LINE, identity is file + trimmed `lineContent` + **occurrenceIndex** (so two `featureFlagService,` tips at different lines both ensure). FILE/DIRECTORY identity is path + type. `--trace-name`, description, and parent are not identity. Prefer `ensure` when generating a workflow tree.

**Parent path:** prefer repeated `--parent-id` from rootward ancestor → immediate parent. Omit for root on `add` / `ensure`. Do **not** combine `--parent-id` with `--parent`. Bare strings inside `--parent` JSON are **UUIDs only**, not `traceName` labels.

| `--parent` form | Example |
|-----------------|---------|
| Root | `--parent []` (needed for `move` to root; `add` / `ensure` default to root) |
| Node id in JSON | `--parent '["3d41c2d1-…"]'` |
| `[file, line, content]` | `--parent '[["src/A.java",10,"void methodA() {"]]'` |

```text
method A def
  method B call
    method C call   ← ensure with --parent-id idA --parent-id idB
```

**Rebind after disk edits:** Agents do not edit through the IDE editor, so live line shifting does not apply. After any turn that modified project source, run `rebind` (optionally `--file` for touched paths) before relying on locators or select/navigate. Rebind repairs `lineNumber` from trimmed `lineContent` and recomputes occurrences. The `"invalid"` array means those LINE locators were not found — leave those nodes in the tree; do not `delete` them unless the user asked to remove them.

For many mutating calls, use `--no-refresh` on each, then one `request_refresh.py` at the end.

**Required Subcommand**:
- `<subcommand>`: `search` | `add` | `ensure` | `move` | `delete` | `rebind`

**Parameters** (shared; all optional):
- `--project <path>`: Project path (default: CWD).
- `--profile <name>`: Profile name override (default: `<activeProfileName>`).
- `--dry-run`: Do not write XML or refresh.
- `--no-refresh`: Skip the IDE refresh signal.

**Parameters** (`search`; all optional):
- `--id <uuid>`: Node UUID.
- `--file <path>`: Relative file/directory path.
- `--line <n>`: 1-based line number.
- `--content <text>`: Substring match on `lineContent`.
- `--trace-name <text>`: Substring match on `traceName`.
- `--type <LINE|FILE|DIRECTORY>`: Filter by type.

**Parameters** (`add` / `ensure`):
- Locator (**required**): `--file` + `--line` + `--content` for LINE (substring of that line is OK); `--file` for FILE/DIRECTORY. Or positional `FILE LINE CONTENT`, or path.
- `--parent-id <uuid>` (**optional**): Parent node UUID; repeat rootward → immediate parent (preferred). Omit for root.
- `--parent <json>` (**optional**): JSON parent path (do not combine with `--parent-id`).
- `--trace-name <text>` (**optional**): Trace point label.
- `--description <text>` (**optional**): Description.
- `--type <LINE|FILE|DIRECTORY>` (**optional**): Type override (default: LINE).

**Parameters** (`move`):
- Locator (**required**): `--id`, or `--file` + `--line` + `--content`, or `--file` alone for FILE/DIRECTORY.
- New parent (**required**): `--parent-id` (repeat rootward → immediate parent) or `--parent` JSON. For root, use `--parent []`. Do not combine `--parent-id` with `--parent`.

**Parameters** (`delete`):
- Locator (**required**): `--id`, or `--file` + `--line` + `--content`, or `--file` alone for FILE/DIRECTORY.

**Parameters** (`rebind`; all optional):
- `--file <path>`: Limit to relative path(s); repeatable. Default: all LINE nodes in the profile.

**Return value**

Stdout is JSON (`indent=2`, UTF-8). Errors print `ERROR: …` on stderr and exit nonzero.

`node-object`:
```text
{
  "id": "<uuid>",
  "parentId": "<uuid or empty>",
  "type": "LINE|FILE|DIRECTORY",
  "file": "<relative path>",
  "line": "<n or empty>",
  "content": "<trimmed lineContent>",
  "name": "<traceName>",
  "depth": 0,
  "childCount": 0
}
```

`search`:
```text
{
  "project_root": "<abs>",
  "storage_xml": "<abs>",
  "profile": "<profile-name>",
  "matches": [ <node-object>, … ]
}
```

`add` (always created; no `"skipped"`):
```text
{
  "action": "add",
  "profile": "<profile-name>",
  "storage_xml": "<abs>",
  "parentId": "<uuid or empty>",
  "node": <node-object>,
  "refreshed": true,
  "resolve": <resolve-object>
}
```

`ensure` (created):
```text
{
  "action": "ensure",
  "skipped": false,
  "profile": "<profile-name>",
  "storage_xml": "<abs>",
  "parentId": "<uuid or empty>",
  "node": <node-object>,
  "refreshed": true,
  "resolve": <resolve-object>
}
```

`ensure` (already present, exit 0):
```text
{
  "action": "ensure",
  "skipped": true,
  "reason": "already_exists",
  "profile": "<profile-name>",
  "id": "<uuid>",
  "parentId": "<uuid or empty>",
  "node": <node-object>,
  "resolve": <resolve-object>
}
```

`resolve-object` (LINE only; omitted for FILE/DIRECTORY):
```text
{
  "reason": "<exact|substring_on_line>",
  "needle": "<passed --content>",
  "resolved": ["<file>", <line>, "<full trimmed line>"],
  "totalOccurrences": 1,
  "occurrenceIndex": 1
}
```

`move`:
```text
{
  "action": "move",
  "profile": "<profile-name>",
  "id": "<uuid>",
  "newParentId": "<uuid or empty>",
  "refreshed": true
}
```

`delete`:
```text
{
  "action": "delete",
  "profile": "<profile-name>",
  "deletedIds": ["<uuid>", …],
  "refreshed": true
}
```

`rebind`:
```text
{
  "action": "rebind",
  "dry_run": false,
  "profile": "<profile-name>",
  "storage_xml": "<abs>",
  "updated": [ <rebind-row-object>, … ],
  "invalid": [ <rebind-row-object>, … ],
  "unchanged": 0,
  "refreshed": true
}
```

`rebind-row-object`:
```text
{
  "id": "<uuid>",
  "file": "<relative path>",
  "oldLine": 10,
  "newLine": 12,
  "content": "<trimmed lineContent>",
  "totalOccurrences": 1,
  "occurrenceIndex": 1,
  "reason": "<exact|moved|refresh_occurrences|…>"
}
```

`--dry-run` adds `"dry_run": true` and does not write XML / refresh. Exit `0` on success (including skipped `ensure`). `add` never skips. Rebind `"invalid"` is a locator status, not a delete list.

**Example**:
```text
python "<Agent Skill Path>/code-trace-tree/scripts/trace_tree.py" search
python "<Agent Skill Path>/code-trace-tree/scripts/trace_tree.py" search --project /path/to/project
python "<Agent Skill Path>/code-trace-tree/scripts/trace_tree.py" --project /path/to/project search
python "<Agent Skill Path>/code-trace-tree/scripts/trace_tree.py" ensure --file src/A.java --line 42 --content '.handleEmailTriggerRequest(' --trace-name 'handleEmail'
python "<Agent Skill Path>/code-trace-tree/scripts/trace_tree.py" ensure --file src/A.java --line 10 --content 'void methodA() {' --trace-name 'methodA'
python "<Agent Skill Path>/code-trace-tree/scripts/trace_tree.py" ensure src/B.java 40 'void methodB() {' \
  --parent-id "$PARENT_ID" \
  --trace-name 'methodB'
python "<Agent Skill Path>/code-trace-tree/scripts/trace_tree.py" ensure --file src/C.java --line 20 --content 'void methodC() {' \
  --parent-id "$ID_A" --parent-id "$ID_B" --trace-name 'methodC'
python "<Agent Skill Path>/code-trace-tree/scripts/trace_tree.py" add --file src/A.java --line 10 --content 'void methodA() {' --trace-name 'methodA alt'
python "<Agent Skill Path>/code-trace-tree/scripts/trace_tree.py" move --file src/B.java --line 40 --content 'void methodB() {' --parent '[]'
python "<Agent Skill Path>/code-trace-tree/scripts/trace_tree.py" move --id "$NODE_ID" --parent []
python "<Agent Skill Path>/code-trace-tree/scripts/trace_tree.py" delete --id <uuid>
python "<Agent Skill Path>/code-trace-tree/scripts/trace_tree.py" rebind
python "<Agent Skill Path>/code-trace-tree/scripts/trace_tree.py" rebind --file src/A.java --file src/B.java
```

### request_refresh.py

Ask the IDE to fully reload Code Trace Tree storage (all profiles + toolbar flags). Also writes `storage-ready`. After agent edits, always write a refresh signal (the plugin does not watch the XML file).

**Usage**
```text
python "<Agent Skill Path>/code-trace-tree/scripts/request_refresh.py" [project_path]
```

**Optional Parameters**:
- `[project_path]`: Path used to discover the IDE project root (default: CWD).

**Return value**

Stdout is JSON (`indent=2`, UTF-8):

```text
{ "ok": true }
```

Exit `0` on success; `1` if the project root cannot be found; `2` if there is no bound project id (ERROR on stderr).

**Example**:
```text
python "<Agent Skill Path>/code-trace-tree/scripts/request_refresh.py"
```

### request_refresh_profile.py

Reload one profile’s tree from XML into memory. Does **not** change active profile or toolbar flags. Also writes `storage-ready`. Structure ops (`add` / `ensure` / `move` / `delete` / `rebind`) emit this.

**Usage**
```text
python "<Agent Skill Path>/code-trace-tree/scripts/request_refresh_profile.py" [project_path] [profile_name]
python "<Agent Skill Path>/code-trace-tree/scripts/request_refresh_profile.py" [profile_name]
```

With one argument: a path (exists, or contains `/` `\`) is treated as `project_path`; otherwise it is `profile_name`. Omitted or empty profile → IDE refreshes its current active profile.

**Optional Parameters**:
- `[project_path]`: Path used to discover the IDE project root (default: CWD).
- `[profile_name]`: Profile to reload (default: active).

**Return value**

Stdout is JSON (`indent=2`, UTF-8). `profile` is `null` when reloading the active profile.

```text
{ "profile": "<profile-name or null>" }
```

Exit `0` on success; `1` if the project root cannot be found; `2` if there is no bound project id (ERROR on stderr).

**Example**:
```text
python "<Agent Skill Path>/code-trace-tree/scripts/request_refresh_profile.py" main
python "<Agent Skill Path>/code-trace-tree/scripts/request_refresh_profile.py" /path/to/project main
```

### request_refresh_settings.py

Reload project toolbar flags / `activeProfileName` only (not profile trees or global highlight colors).

**Usage**
```text
python "<Agent Skill Path>/code-trace-tree/scripts/request_refresh_settings.py" [project_path]
```

**Optional Parameters**:
- `[project_path]`: Path used to discover the IDE project root (default: CWD).

**Return value**

Stdout is JSON (`indent=2`, UTF-8):

```text
{ "ok": true }
```

Exit `0` on success; `1` if there is no bound project id (ERROR on stderr).

**Example**:
```text
python "<Agent Skill Path>/code-trace-tree/scripts/request_refresh_settings.py"
```

### select_trace_points.py

Write node UUIDs to the select signal. Every open IDE window for that project selects / reveals those nodes. Prefer a single id when you want the editor to jump to the source. Uses CWD to discover the project root.

| Request | Tree | Editor |
|---------|------|--------|
| 1 valid id | Select + reveal | Navigate to source |
| 2+ valid ids | Select + reveal all | No navigation |
| Unknown ids only | No-op | No navigation |

**Usage**
```text
python "<Agent Skill Path>/code-trace-tree/scripts/select_trace_points.py" <id> [id...]
```

**Required Parameters**:
- `<id>`: Trace point node UUID (one or more).

**Return value**

Stdout is JSON (`indent=2`, UTF-8):

```text
{ "ids": ["<uuid>", …] }
```

Exit `0` on success; `1` if no ids were passed or the project root cannot be found; `2` if there is no bound project id (ERROR on stderr).

**Example**:
```text
python "<Agent Skill Path>/code-trace-tree/scripts/select_trace_points.py" 3d41c2d1-…
```

## Windows PowerShell

Prefer invoking `python …/trace_tree.py` **directly** (or via `cmd /c`). Do **not** wrap
calls in a PowerShell helper that uses a parameter named `$Args` — that overwrites
PowerShell’s automatic `$Args`, so real CLI args never reach the script and every call
fails with `the following arguments are required: command`.

**Quoting:** inner `"` in `--content` (and similar flags) are often stripped — e.g.
`@PostMapping("/testPost")` arrives as `@PostMapping(/testPost)`, so LINE matching fails
even with a correct `--line`. Insert `--%` (stop-parsing) after the script path and before
those flags. `--%` is PowerShell-only (not cmd.exe / bash / Git Bash).

```text
python "<Agent Skill Path>/code-trace-tree/scripts/trace_tree.py" --% add --file src/A.java --line 38 --content "@PostMapping(\"/testPost\")" --trace-name testPost
```

Fallback when quotes are still awkward: distinctive substring tip + `--line` (e.g.
`--content "@PostMapping(" --line 38`).

**Deep nests:** prefer repeated `--parent-id` on each `add` / `ensure` (rootward → parent). For many
adds, use `--no-refresh` on each mutating call, then one `request_refresh.py` at the end.
If PowerShell quoting remains fragile, a short **Python** driver that imports/calls the same
`trace_tree.py` CLI (or subprocess) is clearer than a PowerShell splat wrapper — delete any
temporary driver when done; do not replace the skill scripts.

**Console encoding:** `trace_tree.py` reconfigures stdout/stderr to UTF-8. If the console is
still legacy (cp1252) or a wrapper interferes, set `$env:PYTHONIOENCODING = "utf-8"` for the
session. Prefer **ASCII** (or simple Latin) for `--trace-name` / descriptions when the console is
not UTF-8, so JSON status output cannot fail the process after a successful write.

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
* For multi-line calls, pass **`--line` and a distinctive substring** of that physical line (e.g. `.handleEmailTriggerRequest(`); the script stores the full trimmed line. Do not invent a logical “call name” that is not on one source line.

## Edit plugin data action

Prefer scripts ([Trace Tree OPs](#trace-tree-ops)). Do not create `.idea/code-trace-tree.project.id`.

1. **Resolve** (creates if missing): `resolve_storage.py`. Mutating `trace_tree` also auto-init.
2. **Mutate** with `trace_tree.py` (`search` / `add` / `ensure` / `move` / `delete` / `rebind`). Prefer `ensure` for workflow trees. Use `delete` only when the user asked to remove nodes (never to “clean up” invalid tips or to replace a tree).
3. **Refresh** is automatic on mutating `trace_tree` calls unless `--no-refresh`. For a batch, use `--no-refresh` on each then one `request_refresh.py`. Settings-only: `request_refresh_settings.py`. One profile without a structure op: `request_refresh_profile.py`.

If scripts fail or storage looks corrupt, see [references/data-format.md](references/data-format.md).

## Select / navigate in the IDE action

Use `select_trace_points.py` ([Trace Tree OPs](#trace-tree-ops)) after creating or locating traces when the user should see them in the IDE. Prefer a single id when you want the editor to jump to the source.

| Request | Tree | Editor |
|---------|------|--------|
| 1 valid id | Select + reveal | Navigate to source |
| 2+ valid ids | Select + reveal all | No navigation |
| Unknown ids only | No-op | No navigation |

## Additional resources

If scripts fail, storage looks corrupt, or you must inspect or hand-edit XML: [references/data-format.md](references/data-format.md).
