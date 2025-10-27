import { XMLParser } from 'fast-xml-parser';
import * as vscode from 'vscode';
import { TracePointService } from '../TracePointService';
import { TracePointTreeDataProvider } from '../TracePointTreeDataProvider';
import { parseXml } from '../utils/xmlUtils';
import { TracePointExportState } from '../domain/types';

export function registerImportTracePoints(
  context: vscode.ExtensionContext,
  service: TracePointService,
  treeDataProvider: TracePointTreeDataProvider
) {
  context.subscriptions.push(
    vscode.commands.registerCommand('codeTraceTree.importTracePoints', async () => {
      const uri = await vscode.window.showOpenDialog({
        canSelectMany: false,
        filters: { XML: ['xml'] },
      });
      if (!uri?.[0]) return;

      const data = await vscode.workspace.fs.readFile(uri[0]);
      const xml = new TextDecoder().decode(data);
      const parsed: TracePointExportState = parseXml(xml);
      // console.log("[CraigTest] parsed: ",parsed);

      const state = parsed.tracePointState;

      const tracePointsArray = state.tracePoints?.tracePoint ?? [];

      const currentProjectPath = vscode.workspace.workspaceFolders?.[0].uri.fsPath || '';

      const updatedTracePoints = tracePointsArray.map((tp: any) => ({
        ...tp,
        projectPath: currentProjectPath,
      }));

      const expandedIdsArray = state.expandedTracePointIds.id || [];
      service.setExpandedTracePointIds(new Set(expandedIdsArray));
      service.setHighlightingEnabled(true);

      await service.setTracePoints(updatedTracePoints, true);

      vscode.window.showInformationMessage('Trace points imported.');
    })
  );
}
