import * as vscode from 'vscode';
import { TracePointService } from '../TracePointService';
import { TracePointTreeDataProvider } from '../TracePointTreeDataProvider';

export function registerMoveUp(context: vscode.ExtensionContext, service: TracePointService, treeView: vscode.TreeView<vscode.TreeItem>, treeDataProvider: TracePointTreeDataProvider) {
  context.subscriptions.push(vscode.commands.registerCommand('codeTraceTree.moveUp', async () => {
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

      // Sort in ascending order of sibling index (because we are moving up)
      const sortedIds = ids
        .map(id => ({ id, index: siblingTracePoints.findIndex(tp => tp.id === id) }))
        .sort((a, b) => a.index - b.index);

      for (const { id } of sortedIds) {
        const currentIndex = siblingTracePoints.findIndex(tp => tp.id === id);

        // Only move if there is a previous sibling and it is not selected
        if (currentIndex > 0) {
          const previousSibling = siblingTracePoints[currentIndex - 1];
          if (selectedIds.has(previousSibling.id)) continue;

          // Get global indexes of current and previous sibling
          const currentGlobalIndex = globalIndexMap.get(id)!;
          const previousGlobalIndex = globalIndexMap.get(previousSibling.id)!;

          // Swap positions in the global array
          [allTracePoints[currentGlobalIndex], allTracePoints[previousGlobalIndex]] =
            [allTracePoints[previousGlobalIndex], allTracePoints[currentGlobalIndex]];

          // Swap positions in sibling array
          [siblingTracePoints[currentIndex], siblingTracePoints[currentIndex - 1]] =
            [siblingTracePoints[currentIndex - 1], siblingTracePoints[currentIndex]];

          // Update global index map
          globalIndexMap.set(id, previousGlobalIndex);
          globalIndexMap.set(previousSibling.id, currentGlobalIndex);
        }
      }
    }

    // Save updated order back to the service
    service.saveTracePoints(allTracePoints);
  }));
}