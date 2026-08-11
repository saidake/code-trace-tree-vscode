/*
 * Copyright (C) 2025-2026 Code Trace Tree Contributors
 *
 * SPDX-License-Identifier: MIT
 */
import * as vscode from 'vscode'
import { TracePointService } from './TracePointService'
import { TracePointNode } from './domain/types'
import { formatDisplayText, formatLocationSuffix } from './utils/displayText'
import { TracePointsListApi, TracePointsListRow } from './TracePointsListApi'

/**
 * Webview Trace Points list: twistie expands, single-click selects, double-click jumps.
 * Avoids VS Code TreeView double-click toggleCollapsed flicker.
 */
export class TracePointsViewProvider
  implements vscode.WebviewViewProvider, TracePointsListApi
{
  private view?: vscode.WebviewView
  private ready = false

  constructor(private service: TracePointService) {
    this.service.addNodeListener('refresh', () => this.sync())
    this.service.addProfileListener(() => this.sync())
  }

  resolveWebviewView(webviewView: vscode.WebviewView): void {
    this.view = webviewView
    webviewView.webview.options = { enableScripts: true }
    webviewView.webview.html = this.getHtml()

    webviewView.webview.onDidReceiveMessage(async (msg) => {
      switch (msg?.command) {
        case 'ready':
          this.ready = true
          this.sync()
          break
        case 'select':
          this.applySelection(Array.isArray(msg.ids) ? msg.ids.map(String) : [])
          this.sync()
          break
        case 'toggleExpand':
          await this.toggleExpand(String(msg.id ?? ''))
          break
        case 'activate':
          await this.activate(String(msg.id ?? ''))
          break
        case 'drop':
          await this.handleDrop(
            Array.isArray(msg.draggedIds) ? msg.draggedIds.map(String) : [],
            msg.targetId == null ? null : String(msg.targetId)
          )
          break
        case 'contextAction':
          await this.handleContextAction(String(msg.action ?? ''), String(msg.id ?? ''))
          break
      }
    })

    webviewView.onDidChangeVisibility(() => {
      if (webviewView.visible) this.sync()
    })

    this.sync()
  }

  sync(): void {
    if (!this.view || !this.ready) return
    this.view.webview.postMessage({
      command: 'setRows',
      rows: this.buildVisibleRows()
    })
  }

  async selectAndReveal(
    ids: string[],
    options?: { expand?: boolean; focus?: boolean }
  ): Promise<void> {
    if (options?.expand) {
      for (const id of ids) {
        this.expandAncestors(id)
        this.service.expandTreeItem(this.service.getTracePointNodeById(id))
      }
    }
    this.applySelection(ids)
    this.sync()
    if (options?.focus) {
      await vscode.commands.executeCommand('codeTraceTree.view.focus')
      this.view?.webview.postMessage({ command: 'scrollTo', id: ids[0] })
    } else if (ids[0]) {
      this.view?.webview.postMessage({ command: 'scrollTo', id: ids[0] })
    }
  }

  async expandParents(parents: Iterable<TracePointNode | null>): Promise<void> {
    for (const parent of parents) {
      if (!parent) continue
      this.service.expandTreeItem(parent)
    }
    this.service.saveState()
    this.sync()
  }

  async expandSelectedRecursively(): Promise<void> {
    const selected = this.service.getSelectedTracePointIds()
    if (selected.length === 0) {
      vscode.window.showWarningMessage('No trace points selected.')
      return
    }
    for (const id of selected) {
      this.expandSubtree(id)
    }
    this.service.saveState()
    this.sync()
  }

  async collapseAll(): Promise<void> {
    this.service.setExpandedTracePointIds(new Set())
    this.service.saveState()
    this.sync()
  }

  private applySelection(ids: string[]): void {
    this.service.selectTracePoints(ids)
  }

  private async toggleExpand(id: string): Promise<void> {
    if (!id) return
    const node = this.service.getTracePointNodeById(id)
    if (!node || node.children.length === 0) return
    const expanded = this.service.getExpandedTracePointIds()
    if (expanded.has(id)) {
      expanded.delete(id)
    } else {
      expanded.add(id)
    }
    this.service.setExpandedTracePointIds(expanded)
    this.service.saveState()
    this.sync()
  }

  private async activate(id: string): Promise<void> {
    if (!id) return
    const node = this.service.getTracePointNodeById(id)
    if (!node) return
    this.applySelection([id])
    this.sync()
    await this.service.navigateToTracePoint(node)
  }

  private async handleContextAction(action: string, id: string): Promise<void> {
    if (!id) return
    if (!this.service.getSelectedTracePointIds().includes(id)) {
      this.applySelection([id])
      this.sync()
    }
    switch (action) {
      case 'copy':
        await vscode.commands.executeCommand('codeTraceTree.copyTracePointText', id)
        break
      case 'rename':
        await vscode.commands.executeCommand('codeTraceTree.renameTracePoint', id)
        break
      case 'delete':
        await vscode.commands.executeCommand('codeTraceTree.deleteTracePoints', id)
        break
      case 'showLine':
        await vscode.commands.executeCommand('codeTraceTree.showLineContent', id)
        break
    }
  }

  private async handleDrop(draggedIds: string[], targetId: string | null): Promise<void> {
    const dropTargets = this.service.reparentTracePoints(draggedIds, targetId)
    if (dropTargets.size > 0) {
      await this.expandParents(dropTargets)
    } else {
      this.sync()
    }
  }

  private expandAncestors(id: string): void {
    let node = this.service.getTracePointNodeById(id)
    while (node?.parentId) {
      const parent = this.service.getTracePointNodeById(node.parentId)
      if (!parent) break
      this.service.expandTreeItem(parent)
      node = parent
    }
  }

  private expandSubtree(id: string): void {
    const node = this.service.getTracePointNodeById(id)
    if (!node) return
    this.service.expandTreeItem(node)
    for (const child of node.children) {
      this.expandSubtree(child.id)
    }
  }

  buildVisibleRows(): TracePointsListRow[] {
    const rows: TracePointsListRow[] = []
    const selected = new Set(this.service.getSelectedTracePointIds())
    const expanded = this.service.getExpandedTracePointIds()

    const walk = (nodes: TracePointNode[], depth: number) => {
      for (const node of nodes) {
        const tp = node.tracePoint
        const hasChildren = node.children.length > 0
        const isExpanded = hasChildren && expanded.has(node.id)
        rows.push({
          id: node.id,
          label: tp.traceName || '',
          description: formatLocationSuffix(tp),
          tooltip: formatDisplayText(tp),
          depth,
          hasChildren,
          expanded: isExpanded,
          selected: selected.has(node.id),
          valid: tp.isValid !== false,
          traceType: tp.traceType
        })
        if (isExpanded) walk(node.children, depth + 1)
      }
    }

    walk(this.service.getTracePointNodes(), 0)
    return rows
  }

  private getHtml(): string {
    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8" />
  <style>
    :root { color-scheme: light dark; }
    html, body {
      margin: 0;
      padding: 0;
      height: 100%;
      font-family: var(--vscode-font-family);
      font-size: var(--vscode-font-size);
      color: var(--vscode-foreground);
      background: transparent;
      user-select: none;
    }
    #list {
      outline: none;
      min-height: 100%;
      padding: 2px 0;
    }
    .row {
      display: flex;
      align-items: center;
      height: 22px;
      padding-right: 8px;
      cursor: default;
      white-space: nowrap;
      box-sizing: border-box;
    }
    .row:hover { background: var(--vscode-list-hoverBackground); }
    .row.selected {
      background: var(--vscode-list-activeSelectionBackground);
      color: var(--vscode-list-activeSelectionForeground);
    }
    .row.drop-target {
      outline: 1px solid var(--vscode-focusBorder);
      outline-offset: -1px;
    }
    .twistie {
      flex: 0 0 16px;
      width: 16px;
      height: 22px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      opacity: 0.8;
      font-size: 10px;
    }
    .twistie.empty { visibility: hidden; }
    .icon {
      flex: 0 0 14px;
      width: 14px;
      margin-right: 2px;
      opacity: 0.85;
      font-size: 12px;
      line-height: 1;
    }
    .name {
      flex: 0 1 auto;
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      color: var(--vscode-gitDecoration-modifiedResourceForeground, #c586c0);
    }
    .row.selected .name { color: inherit; }
    .row.invalid .name,
    .row.invalid .loc { opacity: 0.55; }
    .loc {
      flex: 0 1 auto;
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      opacity: 0.7;
    }
    .name + .loc { margin-left: 6px; }
    #menu {
      display: none;
      position: fixed;
      z-index: 100;
      min-width: 160px;
      padding: 4px 0;
      background: var(--vscode-menu-background, var(--vscode-editor-background));
      color: var(--vscode-menu-foreground, var(--vscode-foreground));
      border: 1px solid var(--vscode-menu-border, var(--vscode-widget-border));
      box-shadow: 0 2px 8px rgba(0,0,0,0.3);
    }
    #menu.open { display: block; }
    .menu-item {
      padding: 4px 12px;
      cursor: pointer;
    }
    .menu-item:hover {
      background: var(--vscode-menu-selectionBackground, var(--vscode-list-hoverBackground));
      color: var(--vscode-menu-selectionForeground, inherit);
    }
    .menu-item.disabled {
      opacity: 0.45;
      pointer-events: none;
    }
  </style>
</head>
<body>
  <div id="list" tabindex="0"></div>
  <div id="menu"></div>
  <script>
    const vscode = acquireVsCodeApi();
    const list = document.getElementById('list');
    const menu = document.getElementById('menu');
    /** @type {Map<string, HTMLElement>} */
    const rowEls = new Map();
    /** @type {any[]} */
    let rows = [];
    let anchorId = null;
    let dragIds = [];

    function esc(s) {
      return String(s ?? '').replace(/[&<>"']/g, (c) => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
      })[c]);
    }

    function twistieHtml(row) {
      if (!row.hasChildren) return '<span class="twistie empty"></span>';
      return '<span class="twistie" data-twistie="1">' + (row.expanded ? '▼' : '▶') + '</span>';
    }

    function fullTitle(row) {
      const tip = String(row.tooltip || '').trim();
      if (tip) return tip;
      const name = String(row.label || '').trim();
      const loc = String(row.description || '').trim();
      return [name, loc].filter(Boolean).join(' ');
    }

    function renderRow(row) {
      const el = document.createElement('div');
      el.className = 'row' + (row.selected ? ' selected' : '') + (row.valid ? '' : ' invalid');
      el.dataset.id = row.id;
      el.draggable = true;
      el.title = fullTitle(row);
      el.style.paddingLeft = (4 + row.depth * 12) + 'px';
      const invalid = (!row.valid && row.traceType === 'LINE')
        ? '<span class="icon" title="Invalid">⊘</span>'
        : '';
      const name = String(row.label || '').trim();
      const loc = String(row.description || '');
      // No empty name span — otherwise it reserves a blank column before the location.
      const nameHtml = name ? '<span class="name">' + esc(name) + '</span>' : '';
      const locHtml = loc ? '<span class="loc">' + esc(loc) + '</span>' : '';
      el.innerHTML = twistieHtml(row) + invalid + nameHtml + locHtml;
      return el;
    }

    function reconcile(nextRows) {
      const nextIds = new Set(nextRows.map((r) => r.id));
      for (const [id, el] of [...rowEls.entries()]) {
        if (!nextIds.has(id)) {
          el.remove();
          rowEls.delete(id);
        }
      }
      let prev = null;
      for (const row of nextRows) {
        let el = rowEls.get(row.id);
        if (!el) {
          el = renderRow(row);
          rowEls.set(row.id, el);
          if (prev && prev.nextSibling) list.insertBefore(el, prev.nextSibling);
          else if (prev) list.appendChild(el);
          else if (list.firstChild) list.insertBefore(el, list.firstChild);
          else list.appendChild(el);
        } else {
          const fresh = renderRow(row);
          el.className = fresh.className;
          el.title = fresh.title;
          el.style.paddingLeft = fresh.style.paddingLeft;
          el.innerHTML = fresh.innerHTML;
          if (prev) {
            if (prev.nextSibling !== el) list.insertBefore(el, prev.nextSibling);
          } else if (list.firstChild !== el) {
            list.insertBefore(el, list.firstChild);
          }
        }
        prev = rowEls.get(row.id);
      }
      rows = nextRows;
    }

    function selectedIds() {
      return rows.filter((r) => r.selected).map((r) => r.id);
    }

    function postSelect(ids) {
      vscode.postMessage({ command: 'select', ids });
    }

    function rangeIds(fromId, toId) {
      const a = rows.findIndex((r) => r.id === fromId);
      const b = rows.findIndex((r) => r.id === toId);
      if (a < 0 || b < 0) return [toId];
      const lo = Math.min(a, b), hi = Math.max(a, b);
      return rows.slice(lo, hi + 1).map((r) => r.id);
    }

    function hideMenu() {
      menu.classList.remove('open');
      menu.innerHTML = '';
    }

    function showMenu(x, y, row) {
      hideMenu();
      const items = [
        { action: 'copy', label: 'Copy Trace Point Text' },
        { action: 'rename', label: 'Rename Trace Point' },
        { action: 'delete', label: 'Delete Trace Points' }
      ];
      if (row.traceType === 'LINE') {
        items.push({ action: 'showLine', label: 'Show Line Content' });
      }
      for (const it of items) {
        const div = document.createElement('div');
        div.className = 'menu-item';
        div.textContent = it.label;
        div.addEventListener('click', (e) => {
          e.stopPropagation();
          hideMenu();
          vscode.postMessage({ command: 'contextAction', action: it.action, id: row.id });
        });
        menu.appendChild(div);
      }
      menu.style.left = Math.min(x, window.innerWidth - 180) + 'px';
      menu.style.top = Math.min(y, window.innerHeight - 120) + 'px';
      menu.classList.add('open');
    }

    list.addEventListener('click', (e) => {
      hideMenu();
      const target = e.target;
      const rowEl = target && target.closest ? target.closest('.row') : null;
      if (!rowEl) return;
      const id = rowEl.dataset.id;
      const row = rows.find((r) => r.id === id);
      if (!row) return;

      if (target.closest && target.closest('[data-twistie]')) {
        e.stopPropagation();
        vscode.postMessage({ command: 'toggleExpand', id });
        return;
      }

      let ids;
      if (e.shiftKey && anchorId) {
        ids = rangeIds(anchorId, id);
      } else if (e.ctrlKey || e.metaKey) {
        const cur = new Set(selectedIds());
        if (cur.has(id)) cur.delete(id); else cur.add(id);
        ids = [...cur];
        anchorId = id;
      } else {
        ids = [id];
        anchorId = id;
      }
      postSelect(ids);
    });

    list.addEventListener('dblclick', (e) => {
      hideMenu();
      const target = e.target;
      if (target.closest && target.closest('[data-twistie]')) return;
      const rowEl = target && target.closest ? target.closest('.row') : null;
      if (!rowEl) return;
      e.preventDefault();
      vscode.postMessage({ command: 'activate', id: rowEl.dataset.id });
    });

    list.addEventListener('contextmenu', (e) => {
      const rowEl = e.target && e.target.closest ? e.target.closest('.row') : null;
      if (!rowEl) return;
      e.preventDefault();
      const id = rowEl.dataset.id;
      const row = rows.find((r) => r.id === id);
      if (!row) return;
      if (!row.selected) {
        anchorId = id;
        postSelect([id]);
      }
      showMenu(e.clientX, e.clientY, row);
    });

    document.addEventListener('click', () => hideMenu());

    list.addEventListener('dragstart', (e) => {
      const rowEl = e.target && e.target.closest ? e.target.closest('.row') : null;
      if (!rowEl) return;
      const id = rowEl.dataset.id;
      const sel = selectedIds();
      dragIds = sel.includes(id) ? sel : [id];
      e.dataTransfer.setData('text/plain', dragIds.join('\\n'));
      e.dataTransfer.effectAllowed = 'move';
    });

    list.addEventListener('dragover', (e) => {
      e.preventDefault();
      const rowEl = e.target && e.target.closest ? e.target.closest('.row') : null;
      for (const el of rowEls.values()) el.classList.remove('drop-target');
      if (rowEl) rowEl.classList.add('drop-target');
    });

    list.addEventListener('dragleave', (e) => {
      if (e.target === list) {
        for (const el of rowEls.values()) el.classList.remove('drop-target');
      }
    });

    list.addEventListener('drop', (e) => {
      e.preventDefault();
      for (const el of rowEls.values()) el.classList.remove('drop-target');
      const rowEl = e.target && e.target.closest ? e.target.closest('.row') : null;
      const targetId = rowEl ? rowEl.dataset.id : null;
      vscode.postMessage({ command: 'drop', draggedIds: dragIds, targetId });
      dragIds = [];
    });

    window.addEventListener('message', (event) => {
      const msg = event.data;
      if (msg.command === 'setRows') {
        reconcile(msg.rows || []);
      } else if (msg.command === 'scrollTo' && msg.id) {
        const el = rowEls.get(msg.id);
        if (el) el.scrollIntoView({ block: 'nearest' });
      }
    });

    vscode.postMessage({ command: 'ready' });
  </script>
</body>
</html>`
  }
}
