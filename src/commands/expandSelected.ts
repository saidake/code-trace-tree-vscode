import * as vscode from 'vscode';

export function registerExpandSelected(context: vscode.ExtensionContext, treeView: vscode.TreeView<vscode.TreeItem>) {
  context.subscriptions.push(vscode.commands.registerCommand('codeTraceTree.expandSelected', async () => {
    const selected = await treeView.selection;
    selected.forEach(item => {
      treeView.reveal(item, { expand: true });
    });
  }));
}