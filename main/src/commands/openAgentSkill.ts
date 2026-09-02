/*
 * Copyright (C) 2025-2026 Code Trace Tree Contributors
 *
 * SPDX-License-Identifier: MIT
 */
import * as vscode from 'vscode'
import { TracePointService } from '../TracePointService'
import { upsertAgentSkillNotice } from '../storage/globalSettingsXml'
import {
  AGENT_DEFS,
  bundledSkillVersion,
  detectPython3,
  installSkillForAgents,
  removeSkillForAgents,
  agentsWithInstalledSkill,
  resolveBundledSkillDir,
  scanAgentStatuses,
  shouldOfferSkillNotice
} from '../skill/agentSkill'

let panel: vscode.WebviewPanel | undefined
let noticeShownThisSession = false

export function registerOpenAgentSkill(
  context: vscode.ExtensionContext,
  service: TracePointService
) {
  context.subscriptions.push(
    vscode.commands.registerCommand('codeTraceTree.openAgentSkill', () => {
      openAgentSkillPanel(context, service)
    })
  )
}

export function maybeNotifyAgentSkill(
  context: vscode.ExtensionContext,
  service: TracePointService
): void {
  if (noticeShownThisSession) return
  if (!vscode.workspace.workspaceFolders?.length) return
  const bundledDir = resolveBundledSkillDir(context.extensionPath)
  const bundled = bundledSkillVersion(context.extensionPath)
  if (!bundledDir || !bundled) return
  const statuses = scanAgentStatuses(bundled)
  const lastHandled = service.getAgentSkillNoticeVersion()
  if (!shouldOfferSkillNotice(bundled, statuses, lastHandled)) return

  noticeShownThisSession = true
  const kind = statuses.some((s) => s.detected && s.state === 'outdated') ? 'update' : 'install'
  const verb = kind === 'update' ? 'Update' : 'Install'
  void vscode.window
    .showInformationMessage(
      `${verb} the Code Trace Tree agent skill (v${bundled}) for your coding agents.`,
      'Install',
      'Dismiss'
    )
    .then((choice) => {
      if (choice === 'Dismiss') {
        upsertAgentSkillNotice(bundled, 'dismissed', service.getAdvancedSettings())
        return
      }
      if (choice === 'Install') {
        openAgentSkillPanel(context, service)
      }
    })
}

function openAgentSkillPanel(
  context: vscode.ExtensionContext,
  service: TracePointService
) {
  const bundled = bundledSkillVersion(context.extensionPath)
  if (bundled) {
    upsertAgentSkillNotice(bundled, 'opened', service.getAdvancedSettings())
  }
  if (panel) {
    panel.reveal(vscode.ViewColumn.Beside)
    postState(panel, context)
    return
  }

  panel = vscode.window.createWebviewPanel(
    'codeTraceTree.agentSkill',
    'Code Trace Tree — Agent Skill',
    vscode.ViewColumn.Beside,
    { enableScripts: true, retainContextWhenHidden: true }
  )
  panel.webview.html = getHtml()
  panel.webview.onDidReceiveMessage(
    (msg) => {
      if (msg?.command === 'refresh') {
        postState(panel!, context)
        return
      }
      if (msg?.command === 'choose') {
        void runInstall(context, 'choose')
        return
      }
      if (msg?.command === 'install') {
        void runInstall(context, 'table')
        return
      }
      if (msg?.command === 'remove') {
        void runRemove(context)
      }
    },
    undefined,
    context.subscriptions
  )
  panel.onDidDispose(
    () => {
      panel = undefined
    },
    undefined,
    context.subscriptions
  )
  postState(panel, context)
}

async function runInstall(
  context: vscode.ExtensionContext,
  mode: 'table' | 'choose'
): Promise<void> {
  const bundledDir = resolveBundledSkillDir(context.extensionPath)
  const bundled = bundledSkillVersion(context.extensionPath)
  if (!bundledDir || !bundled) {
    vscode.window.showErrorMessage('Bundled Code Trace Tree skill was not found in the extension.')
    return
  }
  const statuses = scanAgentStatuses(bundled)
  let ids: string[]
  if (mode === 'table') {
    ids = agentsWithInstalledSkill(statuses).map((s) => s.id)
    if (ids.length === 0) {
      vscode.window.showWarningMessage('No agents are listed. Use Choose agents to install.')
      return
    }
  } else {
    const extra = statuses.filter((s) => s.state === 'missing')
    if (extra.length === 0) {
      vscode.window.showInformationMessage('The skill is already installed for all known agents.')
      return
    }
    const picked = await vscode.window.showQuickPick(
      extra.map((s) => ({
        label: s.label,
        description: s.detected ? 'detected' : 'not detected',
        id: s.id
      })),
      {
        canPickMany: true,
        title: 'Choose agents to install',
        placeHolder: 'Select one or more agents (global skills directory)'
      }
    )
    if (!picked || picked.length === 0) return
    ids = picked.map((p) => p.id)
  }
  try {
    const installed = installSkillForAgents(bundledDir, ids)
    vscode.window.showInformationMessage(
      `Installed code-trace-tree v${bundled} for ${installed.map((i) => labelFor(i.id)).join(', ')}.`
    )
    if (panel) postState(panel, context)
  } catch (e) {
    vscode.window.showErrorMessage(`Failed to install the agent skill: ${e}`)
  }
}

async function runRemove(context: vscode.ExtensionContext): Promise<void> {
  const bundled = bundledSkillVersion(context.extensionPath) || '0'
  const installed = agentsWithInstalledSkill(scanAgentStatuses(bundled))
  if (installed.length === 0) {
    vscode.window.showInformationMessage('The skill is not installed for any known agent.')
    return
  }
  const names = installed.map((s) => s.label).join(', ')
  const choice = await vscode.window.showWarningMessage(
    `Remove the code-trace-tree skill from ${names}? This deletes each agent's global code-trace-tree folder.`,
    { modal: true },
    'Remove'
  )
  if (choice !== 'Remove') return
  try {
    const removed = removeSkillForAgents(installed.map((s) => s.id))
    vscode.window.showInformationMessage(
      `Removed code-trace-tree from ${removed.map((i) => labelFor(i.id)).join(', ')}.`
    )
    if (panel) postState(panel, context)
  } catch (e) {
    vscode.window.showErrorMessage(`Failed to remove the agent skill: ${e}`)
  }
}

function labelFor(id: string): string {
  return AGENT_DEFS.find((a) => a.id === id)?.label || id
}

function postState(p: vscode.WebviewPanel, context: vscode.ExtensionContext) {
  const bundled = bundledSkillVersion(context.extensionPath) || 'unknown'
  const python = detectPython3()
  const agents = scanAgentStatuses(bundled === 'unknown' ? '0' : bundled)
  const installed = agentsWithInstalledSkill(agents)
  p.webview.postMessage({
    command: 'state',
    bundled,
    python,
    agents: installed,
    canChoose: agents.some((a) => a.state === 'missing'),
    canRemove: installed.length > 0
  })
}

function getHtml(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <style>
    body {
      font-family: var(--vscode-font-family);
      color: var(--vscode-foreground);
      padding: 16px 20px;
      margin: 0;
    }
    h1 { font-size: 14px; font-weight: 600; margin: 0 0 12px; }
    h2 { font-size: 13px; font-weight: 600; margin: 20px 0 8px; }
    .hint { color: var(--vscode-descriptionForeground); font-size: 12px; margin: 0 0 12px; }
    table { border-collapse: collapse; width: 100%; font-size: 12px; }
    th, td { text-align: left; padding: 6px 8px 6px 0; vertical-align: top; }
    th { color: var(--vscode-descriptionForeground); font-weight: 600; }
    .actions { margin-top: 16px; }
    button {
      display: inline-block;
      padding: 6px 14px;
      margin: 0 8px 8px 0;
      border-radius: 2px;
      border: 1px solid var(--vscode-button-border, transparent);
      cursor: pointer;
      font-family: inherit;
      font-size: inherit;
      color: var(--vscode-button-foreground);
      background: var(--vscode-button-background);
    }
    button:hover { background: var(--vscode-button-hoverBackground); }
    button.secondary {
      background: var(--vscode-button-secondaryBackground, #5a5a5a);
      color: var(--vscode-button-secondaryForeground, #ffffff);
    }
    button.secondary:hover {
      background: var(--vscode-button-secondaryHoverBackground, #6e6e6e);
    }
    button:focus {
      outline: 1px solid var(--vscode-focusBorder);
      outline-offset: 2px;
    }
    button:disabled { opacity: 0.55; cursor: default; }
    button:disabled:hover { background: var(--vscode-button-background); }
    button.secondary:disabled:hover {
      background: var(--vscode-button-secondaryBackground, #5a5a5a);
    }
    .ok { color: var(--vscode-testing-iconPassed, #4caf50); }
    .warn { color: var(--vscode-editorWarning-foreground, #d7ba7d); }
  </style>
</head>
<body>
  <h1>Agent Skill</h1>
  <p class="hint">The plugin copies the bundled <code>code-trace-tree</code> skill into each agent's global skills folder. This extension does not include an AI agent.</p>
  <p>Bundled skill version: <b id="bundled">…</b></p>
  <h2>Python 3</h2>
  <p id="python">Checking…</p>
  <p class="hint">Python is required when an agent runs skill scripts, not to copy the files.</p>
  <h2>Agents (global)</h2>
  <table>
    <thead><tr><th>Agent</th><th>Installed</th></tr></thead>
    <tbody id="agents"></tbody>
  </table>
  <p class="hint" style="margin-top:16px">The table lists agents that already have this skill. Choose agents to install adds it; Install / Update refreshes the listed agents.</p>
  <div class="actions">
    <button type="button" id="choose">Choose agents to install</button>
    <button type="button" class="secondary" id="install">Install / Update</button>
    <button type="button" class="secondary" id="remove">Remove from installed agents</button>
    <button type="button" class="secondary" id="refresh">Refresh</button>
  </div>
  <script>
    const vscode = acquireVsCodeApi();
    document.getElementById('choose').addEventListener('click', () => {
      vscode.postMessage({ command: 'choose' });
    });
    document.getElementById('install').addEventListener('click', () => {
      vscode.postMessage({ command: 'install' });
    });
    document.getElementById('remove').addEventListener('click', () => {
      vscode.postMessage({ command: 'remove' });
    });
    document.getElementById('refresh').addEventListener('click', () => {
      vscode.postMessage({ command: 'refresh' });
    });
    function esc(s) {
      return String(s).replace(/[&<>]/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]));
    }
    window.addEventListener('message', (event) => {
      const msg = event.data;
      if (msg.command !== 'state') return;
      document.getElementById('bundled').textContent = msg.bundled;
      const py = msg.python;
      const pyEl = document.getElementById('python');
      if (py.ready) {
        pyEl.className = 'ok';
        pyEl.textContent = 'Ready: Python ' + py.version + ' (' + py.command + ')';
      } else {
        pyEl.className = 'warn';
        pyEl.textContent = 'Python 3 not found on PATH. Skill ops will fail until python3 or python is available.';
      }
      const body = document.getElementById('agents');
      const agents = msg.agents || [];
      document.getElementById('choose').disabled = !msg.canChoose;
      document.getElementById('install').disabled = agents.length === 0;
      document.getElementById('remove').disabled = !msg.canRemove;
      if (agents.length === 0) {
        body.innerHTML = '<tr><td colspan="2">The skill is not installed for any agent.</td></tr>';
        return;
      }
      body.innerHTML = agents.map((a) => {
        const installed =
          a.state === 'missing' || !a.installedVersion
            ? '—'
            : a.installedVersion + ' (' + (
                a.state === 'outdated' ? 'outdated' :
                a.state === 'newer' ? 'newer than bundle' : 'latest'
              ) + ')';
        return '<tr><td>' + esc(a.label) + '</td><td>' + esc(installed) + '</td></tr>';
      }).join('');
    });
  </script>
</body>
</html>`
}
