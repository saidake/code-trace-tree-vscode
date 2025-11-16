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
        const parentId = item.id!
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
