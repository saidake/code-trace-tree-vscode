import * as vscode from 'vscode'
import { TracePointService } from '../TracePointService'
import { TracePointTreeDataProvider } from '../TracePointTreeDataProvider'
import { TracePointNode } from '../domain/types'

export function registerMoveUp(
  context: vscode.ExtensionContext,
  service: TracePointService,
  treeView: vscode.TreeView<vscode.TreeItem>,
  treeDataProvider: TracePointTreeDataProvider
) {
  context.subscriptions.push(
    vscode.commands.registerCommand('codeTraceTree.moveUp', async () => {
      const selected = await treeView.selection
      if (selected.length === 0) return
      const selectedIds = new Set(
        selected.map((item) => service.resolveNodeId(item.id)).filter((id): id is string => !!id)
      )
      let affectedParentNodes: Set<TracePointNode | null> = new Set<TracePointNode | null>()

      const groupedByParent = new Map<string | undefined, TracePointNode[]>()
      for (const id of selectedIds) {
        const node = service.getTracePointNodeById(id)
        if (!node) continue
        const parentId = node.parentId
        if (!groupedByParent.has(parentId)) groupedByParent.set(parentId, [])
        groupedByParent.get(parentId)!.push(node)
      }

      for (const [parentId, nodes] of groupedByParent.entries()) {
        const parentNode = service.getTracePointNodeById(parentId)
        affectedParentNodes.add(parentNode)
        const originalSiblings = service.getTracePointSiblingsByParentId(parentId)

        const orderedSelected = nodes
          .slice()
          .sort((a, b) => originalSiblings.indexOf(a) - originalSiblings.indexOf(b))

        for (let i = 0; i < orderedSelected.length; i++) {
          const node = orderedSelected[i]
          const originalIndex = originalSiblings.indexOf(node)

          if (originalIndex > 0 && !selectedIds.has(originalSiblings[originalIndex - 1].id)) {
            ;[originalSiblings[originalIndex], originalSiblings[originalIndex - 1]] = [
              originalSiblings[originalIndex - 1],
              originalSiblings[originalIndex]
            ]
          }
        }
      }

      // Save updated order back to the service
      service.notifyListeners('refresh', affectedParentNodes)
      service.saveState()
    })
  )
}
