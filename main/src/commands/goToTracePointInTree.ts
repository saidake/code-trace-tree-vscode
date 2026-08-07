/*
 * Copyright (C) 2025-2026 Code Trace Tree Contributors
 *
 * SPDX-License-Identifier: MIT
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
 * Always available in the editor context menu; no-ops when nothing matches.
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
