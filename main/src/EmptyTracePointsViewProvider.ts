/*
 * Copyright (C) 2025-2026 Code Trace Tree Contributors
 *
 * SPDX-License-Identifier: MIT
 */
import * as vscode from 'vscode'

/**
 * Empty Trace Points panel (shown when {@code codeTraceTree.showEmptyState}).
 * Custom webview so the Import button can use secondary/grey styling.
 */
export class EmptyTracePointsViewProvider implements vscode.WebviewViewProvider {
  private readonly importCommand: string

  constructor(importCommand: string) {
    this.importCommand = importCommand
  }

  resolveWebviewView(webviewView: vscode.WebviewView) {
    webviewView.webview.options = { enableScripts: true }
    webviewView.webview.html = this.getHtml()

    webviewView.webview.onDidReceiveMessage(async (msg) => {
      if (msg?.command === 'importStoredData') {
        await vscode.commands.executeCommand(this.importCommand)
      }
    })
  }

  private getHtml(): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <style>
    :root {
      color-scheme: light dark;
    }
    body {
      margin: 0;
      padding: 16px 18px;
      font-family: var(--vscode-font-family);
      font-size: var(--vscode-font-size);
      color: var(--vscode-foreground);
      background: transparent;
      line-height: 1.45;
    }
    p {
      margin: 0 0 12px;
    }
    .hint {
      opacity: 0.9;
    }
    .actions {
      margin-top: 16px;
    }
    button.import {
      display: inline-block;
      padding: 6px 14px;
      border-radius: 2px;
      border: 1px solid var(--vscode-button-border, transparent);
      cursor: pointer;
      font-family: inherit;
      font-size: inherit;
      background: var(--vscode-button-secondaryBackground, #5a5a5a);
      color: var(--vscode-button-secondaryForeground, #ffffff);
    }
    button.import:hover {
      background: var(--vscode-button-secondaryHoverBackground, #6e6e6e);
    }
    button.import:focus {
      outline: 1px solid var(--vscode-focusBorder);
      outline-offset: 2px;
    }
  </style>
</head>
<body>
  <p><strong>No trace points yet.</strong></p>
  <p class="hint">Put the caret on a line in the editor, then create a root trace point to start a workflow map (editor context menu or Command Palette).</p>
  <p class="hint">If your project data is lost after moving or renaming the project, you can import previously stored data.</p>
  <div class="actions">
    <button class="import" type="button" id="importBtn">Import stored data</button>
  </div>
  <script>
    const vscode = acquireVsCodeApi();
    document.getElementById('importBtn').addEventListener('click', () => {
      vscode.postMessage({ command: 'importStoredData' });
    });
  </script>
</body>
</html>`
  }
}
