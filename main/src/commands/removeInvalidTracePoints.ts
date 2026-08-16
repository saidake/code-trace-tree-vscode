/*
 * Copyright (C) 2025-2026 Code Trace Tree Contributors
 *
 * SPDX-License-Identifier: MIT
 */
import * as vscode from 'vscode'
import { TracePointService } from '../TracePointService'

export function registerRemoveInvalidTracePoints(
  context: vscode.ExtensionContext,
  service: TracePointService
) {
  context.subscriptions.push(
    vscode.commands.registerCommand('codeTraceTree.removeInvalidTracePoints', async () => {
      const count = service.countInvalidTracePoints()
      if (count === 0) {
        vscode.window.showInformationMessage('No invalid trace points in the current profile.')
        return
      }
      const confirm = await vscode.window.showWarningMessage(
        `Remove ${count} invalid trace point(s) from profile "${service.getActiveProfileName()}"? Valid children stay and are reparented.`,
        { modal: true },
        'Remove'
      )
      if (confirm !== 'Remove') return
      const removed = await service.removeInvalidTracePoints()
      vscode.window.showInformationMessage(
        removed === 0
          ? 'No invalid trace points to remove.'
          : `Removed ${removed} invalid trace point(s).`
      )
    })
  )
}
