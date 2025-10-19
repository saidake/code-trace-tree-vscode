import * as vscode from 'vscode';

export function registerCollapseAll(context: vscode.ExtensionContext, treeView: vscode.TreeView<vscode.TreeItem>) {
  context.subscriptions.push(vscode.commands.registerCommand('codeTraceTree.collapseAll', () => {
    vscode.commands.executeCommand('workbench.action.collapseAllInView', 'codeTraceTree.view');
  }));
}