/*
 * Copyright (C) 2025-2026 Code Trace Tree Contributors
 *
 * SPDX-License-Identifier: MIT
 */
import * as vscode from 'vscode'
import { TracePointService } from './TracePointService'

export class DescriptionViewProvider implements vscode.WebviewViewProvider {
  private _view?: vscode.WebviewView
  private _messageDisposable?: vscode.Disposable

  constructor(
    private _extensionUri: vscode.Uri,
    private service: TracePointService
  ) {
    this.service.addNodeListener('update-description', () => {
      this.updateView()
    })
  }

  resolveWebviewView(webviewView: vscode.WebviewView) {
    this._view = webviewView
    webviewView.webview.options = { enableScripts: true }

    webviewView.webview.html = this._getHtml()

    // Avoid stacking handlers if the view is resolved again after hide/show.
    this._messageDisposable?.dispose()
    this._messageDisposable = webviewView.webview.onDidReceiveMessage(async (msg) => {
      if (msg.command !== 'descriptionChanged') return
      const itemId = typeof msg.itemId === 'string' ? msg.itemId : ''
      if (!itemId) return
      const description = typeof msg.description === 'string' ? msg.description : ''
      await this.service.updateTracePointDescription(itemId, description)
    })

    this.updateView()
  }

  public updateView() {
    if (!this._view) return

    const selectedIds = this.service.getSelectedTracePointIds()
    if (selectedIds.length !== 1) {
      this._view.webview.postMessage({
        command: 'updateDescription',
        description: '',
        disabled: true,
        itemId: ''
      })
      return
    }

    const tp = this.service.getTracePointNodeById(selectedIds[0])
    this._view.webview.postMessage({
      command: 'updateDescription',
      description: tp?.tracePoint.description || '',
      disabled: false,
      itemId: tp?.id || ''
    })
  }

  private _getHtml(): string {
    return `
        <html>
        <body style="padding: 10px; height: 100vh; box-sizing: border-box; margin: 0;">
            <textarea 
                id="desc"
                style="
                    width: 100%;
                    height: 100%;
                    box-sizing: border-box;
                    resize: none;
                    font-family: inherit;
                    border: 1px solid var(--vscode-editorWidget-border);
                    color: var(--vscode-editor-foreground);
                    background-color: rgba(240, 240, 240, 0.1);
                    transition: background-color 0.2s ease;
                "
                disabled
            ></textarea>
            <style>
                textarea:not(:disabled) {
                    background-color: rgba(240, 240, 240, 0.15);
                }

                textarea:disabled {
                    background-color: rgba(128, 128, 128, 0.15);
                    color: rgba(200, 200, 200, 0.6);
                    cursor: not-allowed;
                    opacity: 0.7;
                }

                textarea:focus {
                    outline: 1px solid var(--vscode-focusBorder);
                    background-color: rgba(240, 240, 240, 0.2);
                }
            </style>
            <script>
                const vscode = acquireVsCodeApi();
                window.currentItemId = '';
                let applyingFromHost = false;

                const textarea = document.getElementById('desc');
                textarea.addEventListener('input', () => {
                    // Ignore host-driven updates (selection switch / clear) so we never
                    // persist an empty value against the previous node.
                    if (applyingFromHost) return;
                    const itemId = window.currentItemId;
                    if (!itemId) return;
                    vscode.postMessage({
                        command: 'descriptionChanged',
                        description: textarea.value,
                        itemId
                    });
                });

                window.addEventListener('message', event => {
                    const { command, description, disabled, itemId } = event.data;
                    if (command !== 'updateDescription') return;
                    applyingFromHost = true;
                    try {
                        // Bind identity before mutating value so any spurious input
                        // cannot attribute the new text to the previous node.
                        window.currentItemId = itemId || '';
                        textarea.disabled = !!disabled;
                        textarea.value = description || '';
                    } finally {
                        applyingFromHost = false;
                    }
                });
            </script>
        </body>
        </html>`
  }
}
