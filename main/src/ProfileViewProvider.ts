/*
 * Copyright (C) 2025-2026 Code Trace Tree Contributors
 *
 * SPDX-License-Identifier: MIT
 */
import * as vscode from 'vscode'
import { TracePointService } from './TracePointService'

/**
 * Profile selector shown above the Trace Points tree: select + Add button.
 * Expanded dropdown rows show a delete control (except when only one profile remains).
 */
export class ProfileViewProvider implements vscode.WebviewViewProvider {
  private _view?: vscode.WebviewView

  constructor(
    private _extensionUri: vscode.Uri,
    private service: TracePointService
  ) {
    this.service.addProfileListener(() => this.refresh())
  }

  resolveWebviewView(webviewView: vscode.WebviewView) {
    this._view = webviewView
    webviewView.webview.options = { enableScripts: true }
    webviewView.webview.html = this._getHtml()

    webviewView.webview.onDidReceiveMessage(async (msg) => {
      switch (msg.command) {
        case 'switchProfile':
          await this.service.switchProfile(msg.name)
          break
        case 'addProfile':
          await this.promptAddProfile()
          break
        case 'deleteProfile':
          await this.confirmDeleteProfile(msg.name)
          break
        case 'ready':
          this.refresh()
          break
      }
    })

    this.refresh()
  }

  public refresh() {
    if (!this._view) return
    this._view.webview.postMessage({
      command: 'setProfiles',
      profiles: this.service.getProfileNames(),
      active: this.service.getActiveProfileName()
    })
  }

  private async promptAddProfile() {
    const name = await vscode.window.showInputBox({
      title: 'Add Trace Profile',
      prompt: 'Enter a name for the new trace profile:',
      validateInput: (value) => {
        if (!value.trim()) return 'Profile name cannot be empty.'
        return null
      }
    })
    if (name == null) return
    const ok = await this.service.addProfile(name)
    if (!ok) {
      vscode.window.showWarningMessage(`A profile named "${name.trim()}" already exists.`)
    }
  }

  private async confirmDeleteProfile(name: string) {
    if (this.service.getProfileNames().length <= 1) return
    const choice = await vscode.window.showWarningMessage(
      `Delete profile "${name}" and all of its trace points?`,
      { modal: true },
      'Delete'
    )
    if (choice !== 'Delete') return
    await this.service.deleteProfile(name)
  }

  private _getHtml(): string {
    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8" />
  <style>
    :root {
      color-scheme: light dark;
    }
    body {
      margin: 0;
      padding: 6px 8px;
      font-family: var(--vscode-font-family);
      font-size: var(--vscode-font-size);
      color: var(--vscode-foreground);
      background: transparent;
    }
    .row {
      display: flex;
      align-items: center;
      gap: 8px;
      min-height: 24px;
    }
    .label {
      flex: 0 0 auto;
      opacity: 0.9;
    }
    .combo {
      position: relative;
      flex: 1 1 auto;
      min-width: 0;
    }
    .combo-btn {
      display: flex;
      align-items: center;
      justify-content: space-between;
      width: 100%;
      box-sizing: border-box;
      padding: 2px 8px;
      height: 24px;
      border: 1px solid var(--vscode-dropdown-border, var(--vscode-input-border));
      background: var(--vscode-dropdown-background, var(--vscode-input-background));
      color: var(--vscode-dropdown-foreground, var(--vscode-foreground));
      cursor: pointer;
      border-radius: 2px;
    }
    .combo-btn:hover { filter: brightness(1.05); }
    .combo-value {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .chevron {
      margin-left: 6px;
      opacity: 0.7;
      font-size: 10px;
    }
    .menu {
      display: none;
      position: absolute;
      left: 0;
      right: 0;
      top: calc(100% + 2px);
      z-index: 10;
      max-height: 220px;
      overflow-y: auto;
      border: 1px solid var(--vscode-dropdown-border, var(--vscode-input-border));
      background: var(--vscode-dropdown-background, var(--vscode-editor-background));
      box-shadow: 0 2px 8px rgba(0,0,0,0.25);
    }
    .menu.open { display: block; }
    .item {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 6px;
      padding: 4px 8px;
      cursor: pointer;
      min-height: 22px;
    }
    .item:hover, .item.active {
      background: var(--vscode-list-hoverBackground);
    }
    .item.selected {
      background: var(--vscode-list-activeSelectionBackground);
      color: var(--vscode-list-activeSelectionForeground);
    }
    .item-name {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      flex: 1 1 auto;
    }
    .delete-btn {
      flex: 0 0 auto;
      border: none;
      background: transparent;
      color: inherit;
      cursor: pointer;
      padding: 0 2px;
      opacity: 0.55;
      line-height: 1;
      font-size: 14px;
    }
    .delete-btn:hover { opacity: 1; color: var(--vscode-errorForeground); }
    .add-btn {
      flex: 0 0 auto;
      width: 24px;
      height: 24px;
      border: none;
      background: transparent;
      color: var(--vscode-foreground);
      cursor: pointer;
      font-size: 16px;
      line-height: 1;
      opacity: 0.85;
      border-radius: 2px;
    }
    .add-btn:hover {
      opacity: 1;
      background: var(--vscode-toolbar-hoverBackground);
    }
  </style>
</head>
<body>
  <div class="row">
    <span class="label">Profile:</span>
    <div class="combo" id="combo">
      <button type="button" class="combo-btn" id="comboBtn" title="Switch profile">
        <span class="combo-value" id="comboValue"></span>
        <span class="chevron">▾</span>
      </button>
      <div class="menu" id="menu"></div>
    </div>
    <button type="button" class="add-btn" id="addBtn" title="Add Trace Profile">+</button>
  </div>
  <script>
    const vscode = acquireVsCodeApi();
    let profiles = [];
    let active = '';
    let open = false;

    const comboBtn = document.getElementById('comboBtn');
    const comboValue = document.getElementById('comboValue');
    const menu = document.getElementById('menu');
    const addBtn = document.getElementById('addBtn');

    function render() {
      comboValue.textContent = active || '';
      menu.innerHTML = '';
      profiles.forEach((name) => {
        const row = document.createElement('div');
        row.className = 'item' + (name === active ? ' selected' : '');
        const label = document.createElement('span');
        label.className = 'item-name';
        label.textContent = name;
        row.appendChild(label);

        if (profiles.length > 1) {
          const del = document.createElement('button');
          del.type = 'button';
          del.className = 'delete-btn';
          del.title = 'Delete profile';
          del.textContent = '×';
          del.addEventListener('click', (e) => {
            e.stopPropagation();
            setOpen(false);
            vscode.postMessage({ command: 'deleteProfile', name });
          });
          row.appendChild(del);
        }

        row.addEventListener('click', () => {
          setOpen(false);
          if (name !== active) {
            vscode.postMessage({ command: 'switchProfile', name });
          }
        });
        menu.appendChild(row);
      });
    }

    function setOpen(next) {
      open = next;
      menu.classList.toggle('open', open);
    }

    comboBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      setOpen(!open);
    });
    addBtn.addEventListener('click', () => {
      setOpen(false);
      vscode.postMessage({ command: 'addProfile' });
    });
    document.addEventListener('click', () => setOpen(false));

    window.addEventListener('message', (event) => {
      const msg = event.data;
      if (msg.command === 'setProfiles') {
        profiles = msg.profiles || [];
        active = msg.active || '';
        render();
      }
    });

    vscode.postMessage({ command: 'ready' });
  </script>
</body>
</html>`
  }
}
