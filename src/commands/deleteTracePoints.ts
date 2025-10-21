import * as vscode from 'vscode';
import { TracePointService } from '../TracePointService';
import { TracePointTreeDataProvider } from '../TracePointTreeDataProvider';

export function registerDeleteTracePoints(context: vscode.ExtensionContext, service: TracePointService, treeView: vscode.TreeView<vscode.TreeItem>, treeDataProvider: TracePointTreeDataProvider) {
  context.subscriptions.push(vscode.commands.registerCommand('codeTraceTree.deleteTracePoints', async (item: vscode.TreeItem) => {
    const selected = item ? [item] : await treeView.selection;
    if (selected.length === 0) return;
    const ids = selected.map(item => item.id!);
    await service.deleteTracePoints(ids);
    treeDataProvider.refresh();
  }));
}