/*
 * Copyright (C) 2025-2026 Code Trace Tree Contributors
 *
 * SPDX-License-Identifier: MIT
 */
import * as vscode from 'vscode'
import { TracePointService } from '../TracePointService'
import { TracePointTreeDataProvider } from '../TracePointTreeDataProvider'
import { TracePointNode } from '../domain/types'
import { moveSiblingsDown } from '../domain/treeOps'

export function registerMoveDown(
  context: vscode.ExtensionContext,
  service: TracePointService,
  treeView: vscode.TreeView<vscode.TreeItem>,
  treeDataProvider: TracePointTreeDataProvider
) {
  context.subscriptions.push(
    vscode.commands.registerCommand('codeTraceTree.moveDown', async () => {
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

      for (const [parentId] of groupedByParent.entries()) {
        const parentNode = service.getTracePointNodeById(parentId)
        affectedParentNodes.add(parentNode)
        const originalSiblings = service.getTracePointSiblingsByParentId(parentId)
        moveSiblingsDown(originalSiblings, selectedIds)
      }

      // Save updated order back to the service
      service.notifyListeners('refresh', affectedParentNodes)
      service.saveStructureState()
    })
  )
}
