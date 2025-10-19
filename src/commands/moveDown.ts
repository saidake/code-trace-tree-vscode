import * as vscode from 'vscode';
import { TracePointService } from '../TracePointService';
import { TracePointTreeDataProvider } from '../TracePointTreeDataProvider';

export function registerMoveDown(context: vscode.ExtensionContext, service: TracePointService, treeView: vscode.TreeView<vscode.TreeItem>, treeDataProvider: TracePointTreeDataProvider) {
  context.subscriptions.push(vscode.commands.registerCommand('codeTraceTree.moveDown', async () => {
    const selected = await treeView.selection;
    if (selected.length === 0) return;
    const tracePoints = service.getTracePoints();
    const selectedIds = selected.map(item => item.id!);
    // Similar to moveUp but reverse order and direction
    const grouped = new Map<string | undefined, {id: string, index: number}[]>();
    tracePoints.forEach((tp, index) => {
      if (selectedIds.includes(tp.id)) {
        const parentId = tp.parentId;
        if (!grouped.has(parentId)) grouped.set(parentId, []);
        grouped.get(parentId)!.push({ id: tp.id, index });
      }
    });
    const updated = [...tracePoints];
    grouped.forEach((items, parentId) => {
      const siblings = tracePoints.filter(tp => tp.parentId === parentId);
      items.sort((a, b) => b.index - a.index); // Reverse for down
      items.forEach(({ id }) => {
        const currentIndex = siblings.findIndex(tp => tp.id === id);
        if (currentIndex < siblings.length - 1 && !selectedIds.includes(siblings[currentIndex + 1].id)) {
          [updated[tracePoints.findIndex(tp => tp.id === id)], updated[tracePoints.findIndex(tp => tp.id === siblings[currentIndex + 1].id)]] =
            [updated[tracePoints.findIndex(tp => tp.id === siblings[currentIndex + 1].id)], updated[tracePoints.findIndex(tp => tp.id === id)]];
        }
      });
    });
    await service.updateTracePoints(updated);
    service.selectTracePoints(selectedIds);
    treeDataProvider.refresh();
  }));
}