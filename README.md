# Code Trace Tree
![Build](https://github.com/saidake/code-trace-tree-vscode/workflows/Build/badge.svg)
[![License: GPL-3.0-or-later](https://img.shields.io/badge/License-GPL%20v3%20or%20later-blue.svg)](./LICENSE)

<img src="docs/assets/logo.png" width="100" alt="Code Trace Tree logo">

----

<!-- Plugin description -->
<p>
  Code Trace Tree is a VS Code extension that lets you trace code in a tree structure.
  Double-click any trace point to navigate to its source, with full support for hierarchical parent-child structure.
</p>
<p>
  Pair it with the Agent Skill so Claude Code, Cursor, GitHub Copilot, Codex, or Gemini CLI can search,
  add, move, and rebind traces, refresh the IDE, and—when <b>Agent Notes</b> is enabled—auto-sync
  topic-related workflow points as you discuss code.<br/>
  This extension does <b>not</b> include an AI agent; install your preferred agent separately first, then
  add the Code Trace Tree skill.
</p>
<!-- Plugin description end -->

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
  Shared skill source in this repo: <code>skills/code-trace-tree/</code>
  (same package for every agent; only the extract path differs).
  Releases attach <code>code-trace-tree-skill-&lt;version&gt;.zip</code>.
</p>

<h2>Install skill — extract locations</h2>
<p>
  Download <code>code-trace-tree-skill-0.0.1.zip</code> from the GitHub Release
  (one zip for all agents).
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

<h2>Install example (Claude Code, Linux &amp; macOS)</h2>
<pre><code>curl -L https://github.com/saidake/code-trace-tree-vscode/releases/download/v0.0.1/code-trace-tree-skill-0.0.1.zip -o code-trace-tree-skill-0.0.1.zip</code>
<code>rm -rf ~/.claude/skills/code-trace-tree</code>
<code>mkdir -p ~/.claude/skills</code>
<code>unzip code-trace-tree-skill-0.0.1.zip -d ~/.claude/skills/</code>
<code>rm code-trace-tree-skill-0.0.1.zip</code>
</pre>
<p>Project-local: extract into <code>.claude/skills/</code> instead of <code>~/.claude/skills/</code>. For other agents, use the same zip and extract into that agent’s folder from the table above.</p>

<h2>Install example (Claude Code, Windows PowerShell)</h2>
<pre><code>Invoke-WebRequest -Uri "https://github.com/saidake/code-trace-tree-vscode/releases/download/v0.0.1/code-trace-tree-skill-0.0.1.zip" -OutFile "code-trace-tree-skill-0.0.1.zip"</code>
<code>Remove-Item -Recurse -Force "$HOME\.claude\skills\code-trace-tree" -ErrorAction SilentlyContinue</code>
<code>New-Item -ItemType Directory -Force -Path "$HOME\.claude\skills" | Out-Null</code>
<code>Expand-Archive -Path "code-trace-tree-skill-0.0.1.zip" -DestinationPath "$HOME\.claude\skills" -Force</code>
<code>Remove-Item "code-trace-tree-skill-0.0.1.zip"</code>
</pre>
<p>Project-local: extract into <code>.claude\skills\</code>. For Cursor / Copilot / Codex / Gemini, use the same zip and change the destination path using the table above.</p>

<h1>Storage</h1>
<p>Trace data is stored in a shared global folder:</p>
<ul>
  <li>Windows: <code>%LOCALAPPDATA%\code-trace-tree</code></li>
  <li>macOS: <code>~/Library/Application Support/code-trace-tree</code></li>
  <li>Linux: <code>$XDG_CONFIG_HOME/code-trace-tree</code> or <code>~/.config/code-trace-tree</code></li>
</ul>
<!-- Plugin description end -->

# Development

- Open the project root in VS Code / Cursor
- Install deps: `cd main && yarn install`
- Press **F5** to launch an Extension Development Host
- Shared agent skill source: `skills/code-trace-tree/`

# License

This project is licensed under the [GNU General Public License v3.0 or later](./LICENSE).
