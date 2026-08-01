# Code Trace Tree
![Build](https://github.com/saidake/code-trace-tree-vscode/workflows/Build/badge.svg)
[![License: GPL-3.0-or-later](https://img.shields.io/badge/License-GPL%20v3%20or%20later-blue.svg)](./LICENSE)

<!-- Plugin description -->
<p>
  Code Trace Tree is a VS Code extension that lets you trace code in a tree structure.
  Double-click any trace point to navigate to its source, with full support for hierarchical parent-child structure.
</p>
<p>
  Pair it with the Agent Skill so Claude Code, Cursor, GitHub Copilot, Codex, or Gemini CLI can search,
  add, move, and rebind traces, refresh the IDE, and—when <b>Agent Notes</b> is enabled—auto-sync
  topic-related workflow points as you discuss code.
  This extension does <b>not</b> include an AI agent; install your preferred agent separately first, then
  add the Code Trace Tree skill.
</p>
<!-- Plugin description end -->

<img src="docs/assets/logo.png" width="100">

----

<!-- Plugin description -->
<h1>Agent Skill</h1>
<p>
  This extension does <b>not</b> ship an AI agent. Install one of the supported agents first, then add the
  Code Trace Tree skill so the agent can talk to the extension.
</p>
<p>Supported agents:</p>
<ul>
  <li><a href="https://claude.com/claude-code">Claude Code</a></li>
  <li><a href="https://cursor.com">Cursor</a></li>
  <li><a href="https://docs.github.com/en/copilot">GitHub Copilot</a> (agent skills)</li>
  <li><a href="https://developers.openai.com/codex">Codex</a></li>
  <li><a href="https://geminicli.com">Gemini CLI</a></li>
</ul>
<p>The skill lets the agent:</p>
<ul>
  <li>Resolve the bound global storage XML for the project</li>
  <li>Search, add, move, and delete trace points</li>
  <li>Rebind line locations after source edits on disk</li>
  <li>Ask the IDE to reload / refresh plugin data</li>
  <li>Select or navigate to nodes in the Code Trace Tree view</li>
  <li>Auto-sync topic-related traces when <b>Agent Notes</b> is enabled in the IDE</li>
</ul>
<p>
  <b>Python required:</b> the main skill ops (<code>trace_tree</code> search / add / move / delete / rebind)
  run <code>trace_tree.py</code>, so <b>Python 3</b> must be on your <code>PATH</code>
  (<code>python3</code> or <code>python</code>).
  Resolve / refresh / select helper scripts are plain shell or batch and do not need Python.
</p>
<p>
  Shared skill source in this repo: <code>skills/code-trace-tree/</code>.
  Release zips are built with <code>python skills/package_skills.py --zip</code>.
</p>

<h2>Install skill — extract locations</h2>
<p>
  Download <code>code-trace-tree-skill-&lt;agent&gt;-X.Y.Z.zip</code> from the GitHub Release
  (for example <code>code-trace-tree-skill-claude-0.0.1.zip</code>,
  <code>code-trace-tree-skill-cursor-0.0.1.zip</code>).
  Remove any existing <code>code-trace-tree</code> skill folder first, then extract into the
  skills directory for your agent:
</p>
<table>
  <thead>
    <tr><th>Agent</th><th>Global</th><th>Project-local</th></tr>
  </thead>
  <tbody>
    <tr><td>Claude Code</td><td><code>~/.claude/skills/</code></td><td><code>.claude/skills/</code></td></tr>
    <tr><td>Cursor</td><td><code>~/.cursor/skills/</code></td><td><code>.cursor/skills/</code></td></tr>
    <tr><td>GitHub Copilot</td><td><code>~/.copilot/skills/</code></td><td><code>.github/skills/</code></td></tr>
    <tr><td>Codex</td><td><code>~/.agents/skills/</code></td><td><code>.agents/skills/</code></td></tr>
    <tr><td>Gemini CLI</td><td><code>~/.gemini/skills/</code></td><td><code>.gemini/skills/</code></td></tr>
  </tbody>
</table>

<h1>Storage</h1>
<p>Trace data is stored in a shared global folder:</p>
<ul>
  <li>Windows: <code>%LOCALAPPDATA%\code-trace-tree</code></li>
  <li>macOS: <code>~/Library/Application Support/code-trace-tree</code></li>
  <li>Linux: <code>$XDG_CONFIG_HOME/code-trace-tree</code> or <code>~/.config/code-trace-tree</code></li>
</ul>
<p>
  Each project keeps only a small id file under <code>.vscode/code-trace-tree.project.id</code>
  (falls back to <code>.idea/code-trace-tree.project.id</code> when present).
  Old unused XML files are not deleted automatically — remove them from that folder if you no longer need them.
</p>
<p>
  External agents can edit the global XML and ask the IDE to reload by writing
  <code>signals/&lt;projectId&gt;.request_refresh</code> under the global storage folder
  (or by saving the XML while the project is open).
  To select nodes in the view (and navigate when exactly one id is listed), write one
  node UUID per line to <code>signals/&lt;projectId&gt;.select_trace_points</code>.
  Signal files expire after 60 seconds. All open IDE windows for that project watch the same
  signals folder. See <code>skills/code-trace-tree/</code> for the shared agent skill and helper scripts.
</p>
<!-- Plugin description end -->

# Development

- Open the project root in VS Code / Cursor
- Install deps: `cd main && yarn install`
- Press **F5** to launch an Extension Development Host
- Shared agent skill source: `skills/code-trace-tree/` (see [skills/README.md](skills/README.md))
  - Package zips: `python skills/package_skills.py --zip`
  - Sync into local agent dirs: `python skills/package_skills.py --sync`

# License

This project is licensed under the [GNU General Public License v3.0 or later](./LICENSE).
