/*
 * Copyright (C) 2025-2026 Code Trace Tree Contributors
 *
 * SPDX-License-Identifier: MIT
 */
import * as vscode from 'vscode'
import { TracePointService } from '../TracePointService'
import { TracePointTreeDataProvider } from '../TracePointTreeDataProvider'

function resolveDeleteTargets(
  service: TracePointService,
  treeView: vscode.TreeView<vscode.TreeItem>,
  item?: vscode.TreeItem
): string[] {
  // Context menu passes the clicked item; prefer that over service selection
  // (selection may still be empty / stale when right-clicking).
  const selection = [...treeView.selection]
  const items =
    item && selection.some((s) => s.id === item.id)
      ? selection
      : item
        ? [item]
        : selection

  const ids: string[] = []
  for (const treeItem of items) {
    const id = service.resolveNodeId(treeItem.id)
    if (id && service.getTracePointNodeById(id)) ids.push(id)
  }
  return ids
}

export function registerDeleteTracePoints(
  context: vscode.ExtensionContext,
  service: TracePointService,
  treeView: vscode.TreeView<vscode.TreeItem>,
  _treeDataProvider: TracePointTreeDataProvider
) {
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'codeTraceTree.deleteTracePoints',
      async (item?: vscode.TreeItem) => {
        const selectedIds = resolveDeleteTargets(service, treeView, item)

        if (selectedIds.length === 0) {
          vscode.window.showWarningMessage('No trace points selected.')
          return
        }

        const confirm = await vscode.window.showWarningMessage(
          `Are you sure you want to delete ${selectedIds.length} trace point(s) and their children?`,
          { modal: true },
          'Delete'
        )
        if (confirm !== 'Delete') return

        await service.deleteTracePointsWithChildren(selectedIds)
        vscode.window.showInformationMessage(`Deleted ${selectedIds.length} trace point(s).`)
      }
    )
  )
}
