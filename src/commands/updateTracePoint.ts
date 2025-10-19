import * as vscode from 'vscode';
import { TracePointService } from '../TracePointService';

export function registerUpdateTracePoint(context: vscode.ExtensionContext, service: TracePointService, treeView: vscode.TreeView<vscode.TreeItem>) {
  context.subscriptions.push(vscode.commands.registerCommand('codeTraceTree.updateTracePoint', async () => {
    const selected = await treeView.selection;
    if (selected.length === 0) {
      vscode.window.showWarningMessage('No trace points selected.');
      return;
    }
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      vscode.window.showWarningMessage('No active editor.');
      return;
    }
    const lineNumber = editor.selection.active.line + 1;
    const lineContent = editor.document.lineAt(lineNumber - 1).text.trim();
    const fileName = vscode.workspace.asRelativePath(editor.document.uri);
    const projectPath = vscode.workspace.workspaceFolders?.[0].uri.fsPath || '';
    const [totalOccurrences, matchingLines] = service.getLineOccurrences(editor.document, lineContent);
    const occurrenceIndex = matchingLines.indexOf(lineNumber) + 1;
    const selectedIds = selected.map(item => item.id!);
    const updatedTracePoints = service.getTracePoints().map(tp => {
      if (selectedIds.includes(tp.id)) {
        return { ...tp, fileName, projectPath, lineNumber, lineContent, isValid: true, totalOccurrenceCount: totalOccurrences, occurrenceIndex };
      }
      return tp;
    });
    await service.updateTracePoints(updatedTracePoints);
    service.selectTracePoints(selectedIds);
    vscode.window.visibleTextEditors.forEach(ed => {
      if (ed.document.uri.fsPath === editor.document.uri.fsPath) {
        service.highlightTracePointsInFile(ed.document);
      }
    });
  }));
}