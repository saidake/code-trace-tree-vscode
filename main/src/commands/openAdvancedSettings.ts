/*
 * Copyright (C) 2025-2026 Code Trace Tree Contributors
 *
 * SPDX-License-Identifier: MIT
 */
import * as vscode from 'vscode'
import { TracePointService } from '../TracePointService'
import {
  AdvancedSettings,
  DEFAULT_HIGHLIGHT_DARK,
  DEFAULT_HIGHLIGHT_LIGHT,
  normalizeHighlightHex
} from '../domain/types'

let panel: vscode.WebviewPanel | undefined

export function registerOpenAdvancedSettings(
  context: vscode.ExtensionContext,
  service: TracePointService
) {
  context.subscriptions.push(
    vscode.commands.registerCommand('codeTraceTree.openAdvancedSettings', () => {
      openAdvancedSettingsPanel(context, service)
    })
  )
}

function openAdvancedSettingsPanel(
  context: vscode.ExtensionContext,
  service: TracePointService
) {
  if (panel) {
    panel.reveal(vscode.ViewColumn.Beside)
    postSettings(panel, service.getAdvancedSettings())
    return
  }

  panel = vscode.window.createWebviewPanel(
    'codeTraceTree.advancedSettings',
    'Code Trace Tree — Advanced Settings',
    vscode.ViewColumn.Beside,
    { enableScripts: true, retainContextWhenHidden: true }
  )

  panel.webview.html = getHtml(service.getAdvancedSettings())
  panel.webview.onDidReceiveMessage(
    (msg) => {
      if (msg?.command === 'cancel') {
        panel?.dispose()
        return
      }
      if (msg?.command === 'export') {
        void vscode.commands.executeCommand('codeTraceTree.exportTracePoints')
        return
      }
      if (msg?.command === 'import') {
        void vscode.commands.executeCommand('codeTraceTree.importTracePoints')
        return
      }
      if (msg?.command !== 'save') return
      const light =
        normalizeHighlightHex(msg.light) ?? DEFAULT_HIGHLIGHT_LIGHT
      const dark = normalizeHighlightHex(msg.dark) ?? DEFAULT_HIGHLIGHT_DARK
      const settings: AdvancedSettings = {
        highlightLineBackgroundLight: light,
        highlightLineBackgroundDark: dark
      }
      service.setAdvancedSettings(settings)
      vscode.window.showInformationMessage('Advanced settings saved.')
      panel?.dispose()
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
}

function postSettings(p: vscode.WebviewPanel, settings: AdvancedSettings) {
  p.webview.postMessage({
    command: 'load',
    light: settings.highlightLineBackgroundLight,
    dark: settings.highlightLineBackgroundDark
  })
}

function getHtml(settings: AdvancedSettings): string {
  const light = settings.highlightLineBackgroundLight
  const dark = settings.highlightLineBackgroundDark
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
    h1 {
      font-size: 14px;
      font-weight: 600;
      margin: 0 0 16px;
    }
    h2 {
      font-size: 13px;
      font-weight: 600;
      margin: 24px 0 10px;
    }
    .row {
      display: flex;
      align-items: center;
      gap: 12px;
      margin-bottom: 14px;
    }
    .row label {
      flex: 1;
      min-width: 0;
    }
    input[type="color"] {
      width: 48px;
      height: 28px;
      padding: 0;
      border: 1px solid var(--vscode-editorWidget-border);
      background: transparent;
      cursor: pointer;
    }
    input[type="text"] {
      width: 88px;
      font-family: var(--vscode-editor-font-family);
      color: var(--vscode-input-foreground);
      background: var(--vscode-input-background);
      border: 1px solid var(--vscode-input-border, var(--vscode-editorWidget-border));
      padding: 4px 6px;
    }
    .hint {
      color: var(--vscode-descriptionForeground);
      font-size: 12px;
      margin: 8px 0 20px;
    }
    .actions {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
    }
    button {
      color: var(--vscode-button-foreground);
      background: var(--vscode-button-background);
      border: none;
      padding: 6px 14px;
      cursor: pointer;
    }
    button.secondary {
      color: var(--vscode-button-secondaryForeground);
      background: var(--vscode-button-secondaryBackground);
    }
    .divider {
      border: none;
      border-top: 1px solid var(--vscode-editorWidget-border);
      margin: 8px 0 0;
    }
  </style>
</head>
<body>
  <h1>Highlight line background</h1>
  <div class="row">
    <label for="lightPicker">Light theme</label>
    <input id="lightPicker" type="color" value="${light}" />
    <input id="lightText" type="text" maxlength="7" value="${light}" />
  </div>
  <div class="row">
    <label for="darkPicker">Dark theme</label>
    <input id="darkPicker" type="color" value="${dark}" />
    <input id="darkText" type="text" maxlength="7" value="${dark}" />
  </div>
  <p class="hint">Shared across projects and IDEs. Defaults: ${DEFAULT_HIGHLIGHT_LIGHT} (light), ${DEFAULT_HIGHLIGHT_DARK} (dark).</p>
  <div class="actions">
    <button id="save">Save</button>
    <button id="cancel" class="secondary">Cancel</button>
  </div>
  <hr class="divider" />
  <h2>Data</h2>
  <p class="hint">Export or import profile XML. Also available from the Command Palette.</p>
  <div class="actions">
    <button id="export" class="secondary">Export Trace Points</button>
    <button id="import" class="secondary">Import Trace Points</button>
  </div>
  <script>
    const vscode = acquireVsCodeApi();
    const lightPicker = document.getElementById('lightPicker');
    const lightText = document.getElementById('lightText');
    const darkPicker = document.getElementById('darkPicker');
    const darkText = document.getElementById('darkText');

    function syncPicker(picker, text) {
      const v = text.value.trim().toUpperCase();
      if (/^#[0-9A-F]{6}$/.test(v)) picker.value = v;
    }
    function syncText(picker, text) {
      text.value = picker.value.toUpperCase();
    }

    lightPicker.addEventListener('input', () => syncText(lightPicker, lightText));
    darkPicker.addEventListener('input', () => syncText(darkPicker, darkText));
    lightText.addEventListener('change', () => syncPicker(lightPicker, lightText));
    darkText.addEventListener('change', () => syncPicker(darkPicker, darkText));

    document.getElementById('save').addEventListener('click', () => {
      vscode.postMessage({
        command: 'save',
        light: lightText.value,
        dark: darkText.value
      });
    });
    document.getElementById('cancel').addEventListener('click', () => {
      vscode.postMessage({ command: 'cancel' });
    });
    document.getElementById('export').addEventListener('click', () => {
      vscode.postMessage({ command: 'export' });
    });
    document.getElementById('import').addEventListener('click', () => {
      vscode.postMessage({ command: 'import' });
    });

    window.addEventListener('message', (event) => {
      const msg = event.data;
      if (msg.command !== 'load') return;
      lightPicker.value = msg.light;
      lightText.value = msg.light;
      darkPicker.value = msg.dark;
      darkText.value = msg.dark;
    });
  </script>
</body>
</html>`
}
