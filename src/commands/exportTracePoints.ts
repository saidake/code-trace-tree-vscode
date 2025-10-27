import * as vscode from 'vscode';
import { TracePointService } from '../TracePointService';
import { serializeXml } from '../utils/xmlUtils';
import { CODE_TRACE_TREE_STATE_KEY } from '../domain/constants';
import { TracePointExportState, TracePointState } from '../domain/types';

export function registerExportTracePoints(context: vscode.ExtensionContext, service: TracePointService) {
  context.subscriptions.push(vscode.commands.registerCommand('codeTraceTree.exportTracePoints', async () => {
    // Read state
    const state = context.workspaceState.get<TracePointState>(CODE_TRACE_TREE_STATE_KEY) || {
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
    const exportState: TracePointExportState = {
      tracePointState: {
        tracePoints: {
          tracePoint: state.tracePoints
        },
        expandedTracePointIds: {
          id: Array.from(service.getExpandedTracePointIds())
        },
      },
    };
    const xml = serializeXml(exportState);

    await vscode.workspace.fs.writeFile(uri, new TextEncoder().encode(xml));
    vscode.window.showInformationMessage('Trace points exported.');
  }));
}