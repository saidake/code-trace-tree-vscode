/*
 * Copyright (C) 2025-2026 Code Trace Tree Contributors
 *
 * SPDX-License-Identifier: MIT
 */
import * as vscode from 'vscode'
import { TracePointService } from '../TracePointService'

export function registerToggleHighlights(
  context: vscode.ExtensionContext,
  service: TracePointService
) {
  context.subscriptions.push(
    vscode.commands.registerCommand('codeTraceTree.toggleHighlights', () => {
      const enabled = !service.isHighlightingEnabled()
      service.setHighlightingEnabled(enabled)
      vscode.window.showInformationMessage(`Highlights ${enabled ? 'enabled' : 'disabled'}.`)
    })
  )
}
