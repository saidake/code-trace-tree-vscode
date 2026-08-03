/*
 * Copyright (C) 2025-2026 Code Trace Tree Contributors
 *
 * SPDX-License-Identifier: MIT
 */
import * as vscode from 'vscode'
import { TracePointService } from '../TracePointService'

const AGENT_NOTES_PREREQ =
  'Prerequisite: the code-trace-tree skill must be loaded in the agent session. ' +
  'This extension does not include an AI agent—install one separately, then install and load the skill.'

export function registerToggleClaudeAssist(
  context: vscode.ExtensionContext,
  service: TracePointService
) {
  context.subscriptions.push(
    vscode.commands.registerCommand('codeTraceTree.toggleClaudeAssist', async () => {
      if (service.isClaudeAssistEnabled()) {
        service.setClaudeAssistEnabled(false)
        vscode.window.showInformationMessage(`Agent Notes disabled. ${AGENT_NOTES_PREREQ}`)
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
            'When on, an external AI agent with the code-trace-tree skill loaded may sync ' +
            'topic-related traces each turn that touched code. ' +
            AGENT_NOTES_PREREQ
        }
      )
      if (!choice) return
      await service.enableClaudeAssist(choice.target)
      const targetLabel =
        choice.target === 'AGENT' ? 'AGENT profile' : 'current profile'
      vscode.window.showInformationMessage(
        `Agent Notes enabled (${targetLabel}). ${AGENT_NOTES_PREREQ}`
      )
    })
  )
}
