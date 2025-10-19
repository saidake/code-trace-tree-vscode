import * as vscode from 'vscode';
import { TracePointService } from '../TracePointService';
import { TracePointTreeDataProvider } from '../TracePointTreeDataProvider';

export function registerToggleDescription(context: vscode.ExtensionContext, service: TracePointService, treeDataProvider: TracePointTreeDataProvider) {
  context.subscriptions.push(vscode.commands.registerCommand('codeTraceTree.toggleDescription', () => {
    const opened = !service.isDescriptionAreaOpened();
    service.setDescriptionAreaOpened(opened);
    treeDataProvider.refresh(); // Refresh to show/hide descriptions if needed
    vscode.window.showInformationMessage(`Description area ${opened ? 'shown' : 'hidden'}.`);
  }));
}