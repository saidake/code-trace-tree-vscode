/*
 * Copyright (C) 2025-2026 Code Trace Tree Contributors
 *
 * SPDX-License-Identifier: MIT
 */
import * as vscode from 'vscode'
import { TracePointService } from '../TracePointService'
import { isTraceEditorUri } from '../utils/editorEligibility'

/** True when the editor selection spans at most one line (caret-only counts). */
function isSingleLineSelection(editor: vscode.TextEditor): boolean {
  const { start, end } = editor.selection
  if (editor.selection.isEmpty) return true
  const endLine = end.character === 0 && end.line > start.line ? end.line - 1 : end.line
  return start.line === endLine
}

/**
 * Reveal matching trace point(s) for the caret line in the Trace Points list.
 * Available in the editor context menu for project files; no-ops when nothing matches.
 */
export function registerGoToTracePointInTree(
  context: vscode.ExtensionContext,
  service: TracePointService
) {
  context.subscriptions.push(
    vscode.commands.registerCommand('codeTraceTree.goToTracePointInTree', async () => {
      const editor = vscode.window.activeTextEditor
      if (!editor || !isSingleLineSelection(editor)) return
      if (!isTraceEditorUri(editor.document.uri, service.getWorkspaceRoot())) return

      const filePath = vscode.workspace.asRelativePath(editor.document.uri)
      const lineNumber = editor.selection.active.line + 1
      const matches = service.findValidTracePointsAt(filePath, lineNumber)
      if (matches.length === 0) return

      const ids = matches.map((m) => m.id)
      await service.selectTracePointsInTree(ids, { focus: true })
    })
  )
}
