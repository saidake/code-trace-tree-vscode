/*
 * Copyright (C) 2025-2026 Code Trace Tree Contributors
 *
 * SPDX-License-Identifier: MIT
 */
import * as vscode from 'vscode'
import { TracePointService } from '../TracePointService'
import { TracePointTreeDataProvider } from '../TracePointTreeDataProvider'
import { TracePointNode } from '../domain/types'
import { isTraceEditorUri } from '../utils/editorEligibility'
import { resolveNewTracePointName } from './tracePointNamePrompt'

export function registerCreateTracePointUnderSelected(
  context: vscode.ExtensionContext,
  service: TracePointService,
  _treeDataProvider: TracePointTreeDataProvider,
  treeView: vscode.TreeView<vscode.TreeItem>
) {
  context.subscriptions.push(
    vscode.commands.registerCommand('codeTraceTree.createTracePointUnderSelected', async () => {
      const selected = treeView.selection
      const editor = vscode.window.activeTextEditor
      if (!editor) {
        vscode.window.showWarningMessage('No active editor.')
        return
      }
      if (!isTraceEditorUri(editor.document.uri, service.getWorkspaceRoot())) return
      if (selected.length === 0) {
        vscode.window.showWarningMessage('No trace points selected.')
        return
      }
      const lineNumber = editor.selection.active.line + 1
      if (!editor.document.lineAt(lineNumber - 1).text.trim()) {
        vscode.window.showWarningMessage('Cannot create a line trace point on an empty line.')
        return
      }
      const name = await resolveNewTracePointName(
        service,
        'Enter name for the child trace point (optional)'
      )
      if (name === undefined) return
      const affectedParentNodes: Set<TracePointNode | null> = new Set<TracePointNode | null>()
      const createdIds: string[] = []
      for (const item of selected) {
        const parentId = service.resolveNodeId(item.id)
        if (!parentId) continue
        const id = await service.addTracePoint(
          name,
          editor.document.uri,
          lineNumber,
          parentId
        )
        if (id) createdIds.push(id)
        const parentNode = service.getTracePointNodeById(parentId)
        affectedParentNodes.add(parentNode)
      }
      service.highlightTracePointsInFile(editor.document)
      service.notifyListeners('refresh', affectedParentNodes)
      service.saveState()
      await service.expandParentsInTree(treeView, affectedParentNodes)
      if (createdIds.length > 0) {
        await service.selectTracePointsInTree(treeView, createdIds)
      }
    })
  )
}
