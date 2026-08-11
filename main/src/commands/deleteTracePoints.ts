/*
 * Copyright (C) 2025-2026 Code Trace Tree Contributors
 *
 * SPDX-License-Identifier: MIT
 */
import * as vscode from 'vscode'
import { TracePointService } from '../TracePointService'

export function registerDeleteTracePoints(
  context: vscode.ExtensionContext,
  service: TracePointService
) {
  context.subscriptions.push(
    vscode.commands.registerCommand('codeTraceTree.deleteTracePoints', async () => {
      const selectedIds = service.getSelectedTracePointIds()

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
    })
  )
}
