import * as vscode from 'vscode'
import { TracePointService } from '../TracePointService'

export function registerGoToTracePoint(
  context: vscode.ExtensionContext,
  service: TracePointService,
  treeView: vscode.TreeView<vscode.TreeItem>
) {
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'codeTraceTree.goToTracePoint',
      async (item: vscode.TreeItem) => {
        const selected = item ? [item] : await treeView.selection
        if (selected.length !== 1) {
          vscode.window.showWarningMessage('Select exactly one trace point.')
          return
        }
        const tp = selected[0].id ? service.getTracePointNodeById(selected[0].id) : null
        if (tp) {
          await service.navigateToTracePoint(tp, treeView)
        }
      }
    )
  )
}
