import * as vscode from 'vscode'
import { TracePointTreeDataProvider } from '../TracePointTreeDataProvider'

export function registerExpandSelected(
  context: vscode.ExtensionContext,
  treeView: vscode.TreeView<vscode.TreeItem>,
  treeDataProvider: TracePointTreeDataProvider
) {
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'codeTraceTree.expandSelected',
      async (item: vscode.TreeItem) => {
        const selected = item ? [item] : treeView.selection
        if (selected.length === 0) {
          vscode.window.showWarningMessage('No trace points selected.')
          return
        }
        await treeDataProvider.expandSelectedAndChildren(treeView)
      }
    )
  )
}
