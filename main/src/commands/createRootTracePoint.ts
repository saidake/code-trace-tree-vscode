/*
 * Copyright (C) 2025-2026 Code Trace Tree Contributors
 *
 * SPDX-License-Identifier: MIT
 */
import * as vscode from 'vscode'
import { TracePointService } from '../TracePointService'
import { TracePointTreeDataProvider } from '../TracePointTreeDataProvider'
import { isTraceEditorUri } from '../utils/editorEligibility'
import { resolveNewTracePointName } from './tracePointNamePrompt'

export function registerCreateRootTracePoint(
  context: vscode.ExtensionContext,
  service: TracePointService,
  _treeDataProvider: TracePointTreeDataProvider,
  treeView: vscode.TreeView<vscode.TreeItem>
) {
  context.subscriptions.push(
    vscode.commands.registerCommand('codeTraceTree.createRootTracePoint', async () => {
      const editor = vscode.window.activeTextEditor
      if (!editor) {
        vscode.window.showWarningMessage('No active editor.')
        return
      }
      if (!isTraceEditorUri(editor.document.uri, service.getWorkspaceRoot())) return
      const lineNumber = editor.selection.active.line + 1
      if (!editor.document.lineAt(lineNumber - 1).text.trim()) {
        vscode.window.showWarningMessage('Cannot create a line trace point on an empty line.')
        return
      }
      const name = await resolveNewTracePointName(
        service,
        'Enter name for the root trace point (optional)'
      )
      if (name === undefined) return
      const id = await service.addTracePoint(name, editor.document.uri, lineNumber)
      service.highlightTracePointsInFile(editor.document)
      service.notifyListeners()
      service.saveStructureState()
      if (id) await service.selectTracePointsInTree(treeView, [id])
    })
  )
}
