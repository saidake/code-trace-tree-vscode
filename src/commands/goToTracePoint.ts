import * as vscode from 'vscode';
import { TracePointService } from '../TracePointService';

export function registerGoToTracePoint(context: vscode.ExtensionContext, service: TracePointService, treeView: vscode.TreeView<vscode.TreeItem>) {
  context.subscriptions.push(vscode.commands.registerCommand('codeTraceTree.goToTracePoint', async (item: vscode.TreeItem) => {
    const selected = item ? [item] : await treeView.selection;
    if (selected.length !== 1) {
      vscode.window.showWarningMessage('Select exactly one trace point.');
      return;
    }
    const tp = service.getTracePoints().find(tp => tp.id === selected[0].id);
    if (tp) {
      await service.navigateToTracePoint(tp);
      // Re-select and focus the tree item to retain blue highlight
      service.selectTracePoints([selected[0].id!]);
      await treeView.reveal(selected[0], { select: true, focus: true });
    }
  }));
}