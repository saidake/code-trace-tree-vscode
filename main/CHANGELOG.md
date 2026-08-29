## v1.3.3

- Agent skill `create_tree.py` generates a nested workflow in one call (ensures existing nodes, adds new ones)
- LINE locators require `--file`, `--line`, and `--content`; the script computes occurrence
- Mutating skill ops auto-create missing storage
- Select every requested trace point in the tree, not only the first
- Remove the skill before `npx skills add` (add does not overwrite)

## v1.3.2

- Toolbar Advanced Settings uses a gear icon
- Tree context menu **Go to Trace Point** is first (jumps to source)
- Install the Agent Skill from the dedicated repo: `npx skills add saidake/code-trace-tree-skill`
- Update Marketplace preview screenshots

## v1.3.1

- Highlight line colors are a global preference (`settings.xml`), shared across projects and IDEs; dark default is `#236C60`
- First Advanced Settings save creates `settings.xml` and migrates leftover project colors; peers reload via `request_refresh_global_settings`
- README: Open VSX listing, shorter skill install copy, and simpler example prompts

## v1.3.0

- Split skill `add` vs `ensure`; slim skill docs to script ops
- Disable trace highlights and editor context menus in Git diff panes
- Skill: do not delete existing traces unless the user asks
- Clarify Agent Skill install: extract the zip into the agent skills directory (replace `code-trace-tree` if present)
- Update Marketplace preview screenshots

## v1.2.9

- **Recheck Trace Availability**: reload bound XML and validate all traces; tiered peer refresh (full / profile / settings)
- Rebind LINE traces on file open; content-rebind after bulk external edits
- Toolbar: **Remove Invalid Trace Points**; Import/Export moved into Advanced Settings; context menu **Copy Label**
- Preserve tree selection across self profile-refresh echoes; scope disk watching to open LINE buffers and path tips

## v1.2.8

- Add Plugin home page button linking to the VS Marketplace
- Document the Agent Skill as agent-agnostic (listed agents are examples)
- Clarify skill auto-load (project/global) and real-time IDE sync in README

## v1.2.7

- Double-click restore of expand/collapse state after the host toggles the node

## v1.2.6

- Trace Points webview list

## v1.2.5

- Editor and Explorer Code Trace Tree actions only for files under the workspace root (relative `tracePath`)
- After create, select the new node in the tree without jumping to source
- Path-mode storage: `storage-ready` carries project path; recreate missing XML with the same id

## v1.2.4

- Always show **Go to the Trace Point in the tree panel (Only matching)** in the editor context menu; no-ops when nothing matches

## v1.2.3

- Advanced Settings: persist highlight line background colors (light/dark) in shared project XML
- Toolbar Advanced Settings action; editor highlights use the configured theme colors

## v1.2.2

- Empty-state Import gating; expand the parent after adding a child

## v1.2.1

- Empty-state UI and path-bind storage

## v1.2.0

- Bind Case C (unbound) windows via global `<projectId>.storage-ready` when agents create storage
- Poll agent signal files so rapid refreshes are not missed on Windows
- Agent-driven reloads bypass the self-write ignore window
- Folder-name XML on lazy create; empty-tree import of stored projects

## v1.1.12

- Align README Agent Skill install links and zip names with v1.1.12

## v1.1.11

- Tree context menu **Show Line Content** for LINE nodes (copyable)
- Block creating or updating LINE traces on empty lines
- Update README preview and badges

## v1.1.10

- Marketplace categories, tags, and banner

## v1.1.9

- Extension id `code-trace-tree-vscode`; Marketplace README packaging

## v1.1.8

- Agents edit traces only when asked via the skill (no auto-sync toolbar toggle)
- Document how to prompt the `code-trace-tree` skill in the README

## v1.1.7

- Reset the description area when switching profiles

## v1.1.6

- Agent Skill: do not refuse OS Config Dir writes as outside-workspace
- Agent Skill: add repeatable `--parent-id`; disambiguate duplicate LINE tips by occurrence

## v1.1.5

- Store project data in global XML; agent refresh/select signals under `signals/` with a 60s TTL
- Ship one shared Agent Skill zip (`code-trace-tree-skill-X.Y.Z.zip`)
