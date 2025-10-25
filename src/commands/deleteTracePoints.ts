import * as vscode from 'vscode';
import { TracePointService } from '../TracePointService';
import { TracePointTreeDataProvider } from '../TracePointTreeDataProvider';

export function registerDeleteTracePoints(context: vscode.ExtensionContext, service: TracePointService, treeView: vscode.TreeView<vscode.TreeItem>, treeDataProvider: TracePointTreeDataProvider) {
  context.subscriptions.push(vscode.commands.registerCommand('codeTraceTree.deleteTracePoints', async (item: vscode.TreeItem) => {
    // Get selected IDs from TracePointService
    const selectedIds = service.getSelectedTracePointIds();
    
    // Debug: Log the number of selected items
    // console.log(`[CodeTraceTree] Delete command triggered. Selected items: ${selectedIds.length}, IDs: ${selectedIds.join(', ')}`);

    if (selectedIds.length === 0) {
      vscode.window.showWarningMessage('No trace points selected.');
      return;
    }

    // Confirm deletion
    const confirm = await vscode.window.showWarningMessage(
      `Are you sure you want to delete ${selectedIds.length} trace point(s) and their children?`,
      { modal: true },
      'Delete'
    );
    if (confirm !== 'Delete') return;

    await service.deleteTracePointsWithChildren(selectedIds);
    treeDataProvider.refresh();
    vscode.window.showInformationMessage(`Deleted ${selectedIds.length} trace point(s).`);
  }));
}