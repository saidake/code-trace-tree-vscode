import * as vscode from 'vscode';
import { TracePointService } from '../TracePointService';
import { TracePointTreeDataProvider } from '../TracePointTreeDataProvider';
import { parseXml } from '../utils/xmlUtils';

export function registerImportTracePoints(context: vscode.ExtensionContext, service: TracePointService, treeDataProvider: TracePointTreeDataProvider) {
  context.subscriptions.push(vscode.commands.registerCommand('codeTraceTree.importTracePoints', async () => {
    const uri = await vscode.window.showOpenDialog({ canSelectMany: false, filters: { 'XML': ['xml'] } });
    if (!uri?.[0]) return;
    const data = await vscode.workspace.fs.readFile(uri[0]);
    const xml = new TextDecoder().decode(data);
    const state = parseXml(xml) as { TracePointState: any };
    const currentProjectPath = vscode.workspace.workspaceFolders?.[0].uri.fsPath || '';
    const updatedTracePoints = state.TracePointState.tracePoints.map((tp: any) => ({ ...tp, projectPath: currentProjectPath }));
    await service.updateTracePoints(updatedTracePoints);
    service.setExpandedTracePointIds(state.TracePointState.expandedTracePointIds || []);
    service.setHighlightingEnabled(state.TracePointState.highlightingEnabled ?? true);
    service.setDescriptionAreaOpened(state.TracePointState.descriptionAreaOpened ?? false);
    treeDataProvider.refresh();
    vscode.window.showInformationMessage('Trace points imported.');
  }));
}