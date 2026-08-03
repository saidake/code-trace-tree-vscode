/*
 * Copyright (C) 2025-2026 Code Trace Tree Contributors
 *
 * SPDX-License-Identifier: MIT
 */
import * as vscode from 'vscode'
import { TracePointService } from '../TracePointService'

export function registerToggleNamePrompt(
  context: vscode.ExtensionContext,
  service: TracePointService
) {
  context.subscriptions.push(
    vscode.commands.registerCommand('codeTraceTree.toggleNamePrompt', () => {
      const enabled = !service.isNamePromptEnabled()
      service.setNamePromptEnabled(enabled)
      vscode.window.showInformationMessage(
        `Prompt for name ${enabled ? 'enabled' : 'disabled'}.`
      )
    })
  )
}
