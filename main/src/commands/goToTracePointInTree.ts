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
import { TracePointService } from '../TracePointService'

/** True when the editor selection spans at most one line (caret-only counts). */
function isSingleLineSelection(editor: vscode.TextEditor): boolean {
  const { start, end } = editor.selection
  if (editor.selection.isEmpty) return true
  const endLine = end.character === 0 && end.line > start.line ? end.line - 1 : end.line
  return start.line === endLine
}

/**
 * Reveal matching trace point(s) for the caret line in the Trace Points tree.
 * Visible in the editor context menu only when a valid match exists.
 */
export function registerGoToTracePointInTree(
  context: vscode.ExtensionContext,
  service: TracePointService,
  treeView: vscode.TreeView<vscode.TreeItem>
) {
  context.subscriptions.push(
    vscode.commands.registerCommand('codeTraceTree.goToTracePointInTree', async () => {
      const editor = vscode.window.activeTextEditor
      if (!editor || !isSingleLineSelection(editor)) return

      const filePath = vscode.workspace.asRelativePath(editor.document.uri)
      const lineNumber = editor.selection.active.line + 1
      const matches = service.findValidTracePointsAt(filePath, lineNumber)
      if (matches.length === 0) return

      // Focus the Trace Points view, then expand ancestors and select matches
      await vscode.commands.executeCommand('codeTraceTree.view.focus')

      const ids = matches.map((m) => m.id)
      for (const id of ids) {
        const item = service.getTreeNodeById(id)
        if (!item) continue
        await treeView.reveal(item, { expand: true, select: false, focus: false })
      }

      const first = service.getTreeNodeById(ids[0])
      if (first) {
        await treeView.reveal(first, { expand: true, select: true, focus: true })
      }
      // Keep service selection in sync (covers multi-match when tree UI selects one)
      service.selectTracePoints(ids)
    })
  )
}

/** Update `codeTraceTree.hasTracePointAtCaret` for the editor context menu when clause. */
export function updateTracePointAtCaretContext(service: TracePointService) {
  const editor = vscode.window.activeTextEditor
  let hasMatch = false
  if (editor && isSingleLineSelection(editor)) {
    const filePath = vscode.workspace.asRelativePath(editor.document.uri)
    const lineNumber = editor.selection.active.line + 1
    hasMatch = service.findValidTracePointsAt(filePath, lineNumber).length > 0
  }
  void vscode.commands.executeCommand('setContext', 'codeTraceTree.hasTracePointAtCaret', hasMatch)
}
