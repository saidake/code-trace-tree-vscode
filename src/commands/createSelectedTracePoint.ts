import * as vscode from 'vscode';
import { TracePointService } from '../TracePointService';
import { TracePointTreeDataProvider } from '../TracePointTreeDataProvider';

export function registerCreateSelectedTracePoint(context: vscode.ExtensionContext, service: TracePointService, treeDataProvider: TracePointTreeDataProvider, treeView: vscode.TreeView<vscode.TreeItem>) {
  context.subscriptions.push(vscode.commands.registerCommand('codeTraceTree.createSelectedTracePoint', async () => {
    const selected = treeView.selection;
    // const selected = await vscode.window.activeTreeView?.selection;
    if (!selected || selected.length !== 1) {
      vscode.window.showWarningMessage('Select exactly one trace point.');
      return;
    }
    
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      vscode.window.showWarningMessage('No active editor.');
      return;
    }
    
    const lineNumber = editor.selection.active.line + 1;
    const parentId = selected[selected.length-1].id!;
    const name = await vscode.window.showInputBox({ 
      prompt: 'Enter name for the child trace point (optional)', 
      placeHolder: 'Leave empty for no name' 
    });

    // Allow empty string or undefined
    await service.addTracePoint(name ?? '', editor.document.uri, lineNumber, parentId);
  }));
}