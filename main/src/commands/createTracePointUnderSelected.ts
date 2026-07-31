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
import { TracePointTreeDataProvider } from '../TracePointTreeDataProvider'
import { TracePointNode } from '../domain/types'

export function registerCreateTracePointUnderSelected(
  context: vscode.ExtensionContext,
  service: TracePointService,
  treeDataProvider: TracePointTreeDataProvider,
  treeView: vscode.TreeView<vscode.TreeItem>
) {
  context.subscriptions.push(
    vscode.commands.registerCommand('codeTraceTree.createTracePointUnderSelected', async () => {
      const selected = treeView.selection
      // const selected = await vscode.window.activeTreeView?.selection;

      const editor = vscode.window.activeTextEditor
      if (!editor) {
        vscode.window.showWarningMessage('No active editor.')
        return
      }
      if (selected.length === 0) {
        vscode.window.showWarningMessage('No trace points selected.')
        return
      }
      const lineNumber = editor.selection.active.line + 1
      const name = await vscode.window.showInputBox({
        prompt: 'Enter name for the child trace point (optional)',
        placeHolder: 'Leave empty for no name'
      })
      let affectedParentNodes: Set<TracePointNode | null> = new Set<TracePointNode | null>()
      // Allow empty string or undefined
      for (const item of selected) {
        const parentId = service.resolveNodeId(item.id)
        if (!parentId) continue
        await service.addTracePoint(name ?? '', editor.document.uri, lineNumber, parentId)
        const parentNode = service.getTracePointNodeById(parentId)
        affectedParentNodes.add(parentNode)
      }
      service.highlightTracePointsInFile(editor.document)
      service.notifyListeners('refresh', affectedParentNodes)
      service.saveState()
    })
  )
}
