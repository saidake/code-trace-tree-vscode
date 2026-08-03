/*
 * Copyright (C) 2025-2026 Code Trace Tree Contributors
 *
 * SPDX-License-Identifier: MIT
 */
import * as vscode from 'vscode'
import { TracePointService } from '../TracePointService'

export function registerGoToTracePoint(
  context: vscode.ExtensionContext,
  service: TracePointService,
  treeView: vscode.TreeView<vscode.TreeItem>
) {
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'codeTraceTree.goToTracePoint',
      async (item: vscode.TreeItem) => {
        const selected = item ? [item] : await treeView.selection
        if (selected.length !== 1) {
          vscode.window.showWarningMessage('Select exactly one trace point.')
          return
        }
        const nodeId = service.resolveNodeId(selected[0].id)
        const tp = nodeId ? service.getTracePointNodeById(nodeId) : null
        if (tp) {
          await service.navigateToTracePoint(tp, treeView)
        }
      }
    )
  )
}
