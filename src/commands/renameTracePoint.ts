import * as vscode from 'vscode';
import { TracePointService } from '../TracePointService';
import { TracePointTreeDataProvider } from '../TracePointTreeDataProvider';

export function registerRenameTracePoint(context: vscode.ExtensionContext, service: TracePointService, treeView: vscode.TreeView<vscode.TreeItem>, treeDataProvider: TracePointTreeDataProvider) {
  context.subscriptions.push(vscode.commands.registerCommand('codeTraceTree.renameTracePoint', async (item: vscode.TreeItem) => {
    const selected = item ? [item] : await treeView.selection;
    if (selected.length !== 1) {
      vscode.window.showWarningMessage('Select exactly one trace point to rename.');
      return;
    }
    const tp = service.getTracePoints().find(tp => tp.id === selected[0].id);
    if (!tp) return;
    const newName = await vscode.window.showInputBox({ prompt: 'Enter new name (optional)', placeHolder: 'Leave empty for no name', value: tp.name });
    // Allow empty string or undefined
    await service.renameTracePoint(tp.id, newName ?? '');
    treeDataProvider.refresh();
  }));
}