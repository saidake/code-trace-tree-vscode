/*
 * Copyright (C) 2025-2026 Code Trace Tree Contributors
 *
 * SPDX-License-Identifier: MIT
 */
import * as vscode from 'vscode'
import { TracePointService } from '../TracePointService'

/** Max gap between two tree activations to treat as a double-click (singleClick openMode). */
const DOUBLE_CLICK_MS = 500

export function registerGoToTracePoint(
  context: vscode.ExtensionContext,
  service: TracePointService,
  treeView: vscode.TreeView<vscode.TreeItem>
) {
  let lastActivateId: string | undefined
  let lastActivateAt = 0

  const navigate = async (item: vscode.TreeItem | undefined) => {
    const selected = item ? [item] : [...treeView.selection]
    if (selected.length !== 1) {
      vscode.window.showWarningMessage('Select exactly one trace point.')
      return
    }
    // Arm before awaits — host already toggled expand on this double-click.
    service.armExpandEventSuppress()
    const nodeId = service.resolveNodeId(selected[0].id)
    const tp = nodeId ? service.getTracePointNodeById(nodeId) : null
    if (tp) {
      await service.navigateToTracePoint(tp, treeView)
    }
  }

  context.subscriptions.push(
    // Command Palette / explicit go-to: navigate immediately.
    vscode.commands.registerCommand(
      'codeTraceTree.goToTracePoint',
      async (item: vscode.TreeItem) => {
        await navigate(item)
      }
    ),
    // Tree item activation: double-click to jump (single-click only selects).
    vscode.commands.registerCommand(
      'codeTraceTree.activateTracePoint',
      async (item: vscode.TreeItem) => {
        if (!item) return
        const openMode = vscode.workspace
          .getConfiguration('workbench.list')
          .get<'singleClick' | 'doubleClick'>('openMode', 'singleClick')
        // When the workbench already requires a double-click to open, one activation = jump.
        if (openMode === 'doubleClick') {
          lastActivateId = undefined
          lastActivateAt = 0
          await navigate(item)
          return
        }

        const id = String(item.id ?? '')
        const now = Date.now()
        if (id && id === lastActivateId && now - lastActivateAt <= DOUBLE_CLICK_MS) {
          lastActivateId = undefined
          lastActivateAt = 0
          await navigate(item)
          return
        }
        lastActivateId = id
        lastActivateAt = now
      }
    )
  )
}
