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
import * as path from 'path'
import * as vscode from 'vscode'
import { TracePointService } from '../TracePointService'
import { TracePointNode } from '../domain/types'

export function registerUpdateTracePoint(
  context: vscode.ExtensionContext,
  service: TracePointService,
  treeView: vscode.TreeView<vscode.TreeItem>
) {
  context.subscriptions.push(
    vscode.commands.registerCommand('codeTraceTree.updateTracePoint', async () => {
      const selected = await treeView.selection
      if (selected.length === 0) {
        vscode.window.showWarningMessage('No trace points selected.')
        return
      }
      const editor = vscode.window.activeTextEditor
      if (!editor) {
        vscode.window.showWarningMessage('No active editor.')
        return
      }
      const lineNumber = editor.selection.active.line + 1
      const lineContent = editor.document.lineAt(lineNumber - 1).text.trim()
      const tracePath = vscode.workspace.asRelativePath(editor.document.uri)
      const baseName = path.basename(tracePath)
      const projectPath = vscode.workspace.workspaceFolders?.[0].uri.fsPath || ''
      const [totalOccurrences, matchingLines] = service.getLineOccurrences(
        editor.document,
        lineContent
      )
      const occurrenceIndex = matchingLines.indexOf(lineNumber) + 1

      let affectedParentNodes: Set<TracePointNode | null> = new Set<TracePointNode | null>()
      for (const treeItem of selected) {
        const tp = service.getTracePointNodeById(service.resolveNodeId(treeItem.id))
        if (!tp) continue
        affectedParentNodes.add(service.getTracePointNodeById(tp.parentId))
        const prevPath = tp.tracePoint.tracePath
        tp.tracePoint = {
          ...tp.tracePoint,
          traceType: 'LINE',
          baseName,
          tracePath,
          projectPath,
          lineNumber,
          lineContent,
          isValid: true,
          totalOccurrences: totalOccurrences,
          occurrenceIndex,
          description: undefined
        }
        service.updateTreeItem(tp)
        service.updateInFileNodesMap(prevPath, tp)
      }
      service.applyHighlightsToAllEditors(editor)
      service.notifyListeners('refresh', affectedParentNodes)
      service.saveState()
    })
  )
}
