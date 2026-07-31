/*
 * Copyright (C) 2025-2026 Code Trace Tree Contributors
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program. If not, see <https://www.gnu.org/licenses/>.
 */
import * as vscode from 'vscode'
import { TracePointService } from './TracePointService'

export class DescriptionViewProvider implements vscode.WebviewViewProvider {
  private _view?: vscode.WebviewView

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

    webviewView.webview.onDidReceiveMessage(async (msg) => {
      if (msg.command === 'descriptionChanged') {
        await this.service.updateTracePointDescription(msg.itemId, msg.description)
      }
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
                oninput="vscode.postMessage({command: 'descriptionChanged', description: this.value, itemId: window.currentItemId})"
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

                window.addEventListener('message', event => {
                    const { command, description, disabled, itemId } = event.data;
                    if (command === 'updateDescription') {
                        const textarea = document.getElementById('desc');
                        textarea.value = description;
                        textarea.disabled = disabled;
                        window.currentItemId = itemId;
                    }
                });
            </script>
        </body>
        </html>`
  }
}
