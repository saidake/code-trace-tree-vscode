import * as vscode from 'vscode';
import { TracePointService } from '../TracePointService';
import { serializeXml } from '../utils/xmlUtils';

export function registerExportTracePoints(context: vscode.ExtensionContext, service: TracePointService) {
  context.subscriptions.push(vscode.commands.registerCommand('codeTraceTree.exportTracePoints', async () => {
    // Read state
    const state = context.workspaceState.get<any>(CODE_TRACE_TREE_STATE_KEY) || {
      tracePoints: [],
      selectedTracePointIds: [],
      expandedTracePointIds: [],
      highlightingEnabled: true,
      descriptionAreaOpened: false,
    };

    // Prompt
    const uri = await vscode.window.showSaveDialog({
      defaultUri: vscode.Uri.file('code-trace-tree-config.xml'),
      filters: { 'XML': ['xml'] },
    });
    if (!uri) return;
    // Convert state to xml data
    const xml = serializeXml({
      TracePointState: {
        tracePoints: state.tracePoints,
        selectedTracePointIds: state.selectedTracePointIds, 
        expandedTracePointIds: state.expandedTracePointIds,
        highlightingEnabled: state.highlightingEnabled,
        descriptionAreaOpened: state.descriptionAreaOpened,
      },
    });

    await vscode.workspace.fs.writeFile(uri, new TextEncoder().encode(xml));
    vscode.window.showInformationMessage('Trace points exported.');
  }));
}