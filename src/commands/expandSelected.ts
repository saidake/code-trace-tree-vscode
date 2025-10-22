import * as vscode from 'vscode';
import { TracePointTreeDataProvider } from '../TracePointTreeDataProvider';

export function registerExpandSelected(
  context: vscode.ExtensionContext, 
  treeView: vscode.TreeView<vscode.TreeItem>,
  treeDataProvider: TracePointTreeDataProvider
) {
  context.subscriptions.push(vscode.commands.registerCommand('codeTraceTree.expandSelected', async () => {
    const expandedCount = await treeDataProvider.expandSelectedAndChildren(treeView);
    
    if (expandedCount === 0) {
      vscode.window.showWarningMessage('No trace points selected.');
    } else {
      vscode.window.showInformationMessage(`Expanded ${expandedCount} trace point(s) and all children.`);
    }
  }));
}