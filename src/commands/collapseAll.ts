import * as vscode from 'vscode';
import { TracePointTreeDataProvider } from '../TracePointTreeDataProvider';

export function registerCollapseAll(
  context: vscode.ExtensionContext, 
  treeView: vscode.TreeView<vscode.TreeItem>,
  treeDataProvider: TracePointTreeDataProvider
) {
  context.subscriptions.push(vscode.commands.registerCommand('codeTraceTree.collapseAll', async () => {
    await treeDataProvider.collapseAll();
    vscode.window.showInformationMessage('All trace points collapsed.');
  }));
}