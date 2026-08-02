/*
 * Copyright (C) 2025-2026 Code Trace Tree Contributors
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program. If not, see <https://www.gnu.org/licenses/>.
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
