import * as vscode from 'vscode';
import { TracePointService } from '../TracePointService';
import { TracePointTreeDataProvider } from '../TracePointTreeDataProvider';

export function registerCreateTracePoint(context: vscode.ExtensionContext, service: TracePointService, treeDataProvider: TracePointTreeDataProvider) {
  context.subscriptions.push(vscode.commands.registerCommand('codeTraceTree.createTracePoint', async () => {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      vscode.window.showWarningMessage('No active editor.');
      return;
    }
    const lineNumber = editor.selection.active.line + 1;
    const name = await vscode.window.showInputBox({ prompt: 'Enter name for the trace point (optional)', placeHolder: 'Leave empty for no name' });
    // Allow empty string or undefined
    await service.addTracePoint(name ?? '', editor.document.uri, lineNumber);
    treeDataProvider.refresh();
  }));
}