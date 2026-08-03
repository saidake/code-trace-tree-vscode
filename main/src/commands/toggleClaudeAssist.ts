/*
 * Copyright (C) 2025-2026 Code Trace Tree Contributors
 *
 * SPDX-License-Identifier: MIT
 */
import * as vscode from 'vscode'
import { TracePointService } from '../TracePointService'

const AGENT_NOTES_NO_AI =
  'This extension does not include an AI agent—install one separately and add the Code Trace Tree skill.'

export function registerToggleClaudeAssist(
  context: vscode.ExtensionContext,
  service: TracePointService
) {
  context.subscriptions.push(
    vscode.commands.registerCommand('codeTraceTree.toggleClaudeAssist', async () => {
      if (service.isClaudeAssistEnabled()) {
        service.setClaudeAssistEnabled(false)
        vscode.window.showInformationMessage(`Agent Notes disabled. ${AGENT_NOTES_NO_AI}`)
        return
      }

      const choice = await vscode.window.showQuickPick(
        [
          {
            label: 'Current Profile',
            description: 'Write topic-related traces into the active profile',
            target: 'CURRENT' as const
          },
          {
            label: 'AGENT Profile',
            description: 'Create/switch to the AGENT profile',
            target: 'AGENT' as const
          }
        ],
        {
          title: 'Enable Agent Notes',
          placeHolder:
            'External AI agent may sync topic-related traces each turn that touched code. ' +
            AGENT_NOTES_NO_AI
        }
      )
      if (!choice) return
      await service.enableClaudeAssist(choice.target)
      const targetLabel =
        choice.target === 'AGENT' ? 'AGENT profile' : 'current profile'
      vscode.window.showInformationMessage(
        `Agent Notes enabled (${targetLabel}). ${AGENT_NOTES_NO_AI}`
      )
    })
  )
}
