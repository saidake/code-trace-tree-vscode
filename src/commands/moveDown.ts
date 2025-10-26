import * as vscode from 'vscode';
import { TracePointService } from '../TracePointService';
import { TracePointTreeDataProvider } from '../TracePointTreeDataProvider';

export function registerMoveDown(context: vscode.ExtensionContext, service: TracePointService, treeView: vscode.TreeView<vscode.TreeItem>, treeDataProvider: TracePointTreeDataProvider) {
  context.subscriptions.push(vscode.commands.registerCommand('codeTraceTree.moveDown', async () => {
    const selected = await treeView.selection;
    if (selected.length === 0) return;
    const tracePoints = service.getTracePoints();
    const selectedIds = new Set(selected.map(item => item.id!));

    // Make a mutable copy of all trace points
    const allTracePoints = [...tracePoints];
    // Build a global index map (id -> index)
    const globalIndexMap = new Map(allTracePoints.map((tp, i) => [tp.id, i]));
    // Group selected trace points by their parentId
    const nodesGroupedByParent = new Map<string | undefined, string[]>();
    for (const tp of tracePoints) {
      if (selectedIds.has(tp.id)) {
        const parentId = tp.parentId;
        if (!nodesGroupedByParent.has(parentId)) {
          nodesGroupedByParent.set(parentId, []);
        }
        nodesGroupedByParent.get(parentId)!.push(tp.id);
      }
    }

    // Process each parent group
    for (const [parentId, ids] of nodesGroupedByParent.entries()) {
      // Find all siblings under the same parent
      const siblingTracePoints = allTracePoints.filter(tp => tp.parentId === parentId);

      // Sort in descending order of sibling index (because we are moving down)
      const sortedIds = ids
        .map(id => ({ id, index: siblingTracePoints.findIndex(tp => tp.id === id) }))
        .sort((a, b) => b.index - a.index);

      for (const { id } of sortedIds) {
        const currentIndex = siblingTracePoints.findIndex(tp => tp.id === id);
        if (currentIndex < siblingTracePoints.length - 1) {
          const nextSibling = siblingTracePoints[currentIndex + 1];

          // Skip if the next sibling is also selected (we move blocks as one group)
          if (selectedIds.has(nextSibling.id)) continue;

          // Get global indexes of current and next sibling
          const currentGlobalIndex = globalIndexMap.get(id)!;
          const nextGlobalIndex = globalIndexMap.get(nextSibling.id)!;

          // Swap positions in the global array
          [allTracePoints[currentGlobalIndex], allTracePoints[nextGlobalIndex]] =
            [allTracePoints[nextGlobalIndex], allTracePoints[currentGlobalIndex]];

          // Swap positions in sibling list as well
          [siblingTracePoints[currentIndex], siblingTracePoints[currentIndex + 1]] =
            [siblingTracePoints[currentIndex + 1], siblingTracePoints[currentIndex]];

          // Update index map to reflect new order
          globalIndexMap.set(id, nextGlobalIndex);
          globalIndexMap.set(nextSibling.id, currentGlobalIndex);
        }
      }
    }

    // Save updated order back to the service
    service.setTracePoints(allTracePoints);

  }));
}