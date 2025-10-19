import * as vscode from 'vscode';
import { TracePointService } from '../TracePointService';
import { serializeXml } from '../utils/xmlUtils';

export function registerExportTracePoints(context: vscode.ExtensionContext, service: TracePointService) {
  context.subscriptions.push(vscode.commands.registerCommand('codeTraceTree.exportTracePoints', async () => {
    const uri = await vscode.window.showSaveDialog({ defaultUri: vscode.Uri.file('code-trace-tree-config.xml'), filters: { 'XML': ['xml'] } });
    if (!uri) return;
    const state = {
      TracePointState: {
        tracePoints: service.getTracePoints(),
        selectedTracePointIds: [], // Don't export selection
        expandedTracePointIds: service.getExpandedTracePointIds(),
        highlightingEnabled: service.isHighlightingEnabled(),
        descriptionAreaOpened: service.isDescriptionAreaOpened(),
      }
    };
    const xml = serializeXml(state);
    await vscode.workspace.fs.writeFile(uri, new TextEncoder().encode(xml));
    vscode.window.showInformationMessage('Trace points exported.');
  }));
}