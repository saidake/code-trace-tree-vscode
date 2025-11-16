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
      const filePath = vscode.workspace.asRelativePath(editor.document.uri)
      const fileName = path.basename(filePath)
      const projectPath = vscode.workspace.workspaceFolders?.[0].uri.fsPath || ''
      const [totalOccurrences, matchingLines] = service.getLineOccurrences(
        editor.document,
        lineContent
      )
      const occurrenceIndex = matchingLines.indexOf(lineNumber) + 1

      let affectedParentNodes: Set<TracePointNode | null> = new Set<TracePointNode | null>()
      for (const treeItem of selected) {
        const tp = service.getTracePointNodeById(treeItem.id)
        if (!tp) continue
        affectedParentNodes.add(service.getTracePointNodeById(tp.parentId))
        const prevFilePath = tp.tracePoint.filePath
        tp.tracePoint = {
          ...tp.tracePoint,
          fileName,
          filePath,
          projectPath,
          lineNumber,
          lineContent,
          isValid: true,
          totalOccurrences: totalOccurrences,
          occurrenceIndex,
          description: undefined
        }
        service.updateTreeItem(tp)
        service.updateInFileNodesMap(prevFilePath, tp)
      }
      service.applyHighlightsToAllEditors(editor)
      service.notifyListeners('refresh', affectedParentNodes)
      service.saveState()
    })
  )
}
