import * as vscode from 'vscode';
import { TracePointService } from '../TracePointService';
import { TracePointTreeDataProvider } from '../TracePointTreeDataProvider';

export function registerAddChildTracePoint(context: vscode.ExtensionContext, service: TracePointService, treeView: vscode.TreeView<vscode.TreeItem>, treeDataProvider: TracePointTreeDataProvider) {
  context.subscriptions.push(vscode.commands.registerCommand('codeTraceTree.addChildTracePoint', async (item: vscode.TreeItem) => {
    const selected = item ? [item] : await treeView.selection;
    if (selected.length !== 1) {
      vscode.window.showWarningMessage('Select exactly one trace point to add child.');
      return;
    }
    const parentId = selected[0].id!;
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      vscode.window.showWarningMessage('No active editor.');
      return;
    }
    const lineNumber = editor.selection.active.line + 1;
    const name = await vscode.window.showInputBox({ prompt: 'Enter name for child trace point' });
    if (name !== undefined) {
      await service.addTracePoint(name, editor.document.uri, lineNumber, parentId);
      treeDataProvider.refresh();
    }
  }));
}