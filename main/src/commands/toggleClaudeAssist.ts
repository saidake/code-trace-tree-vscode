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

export function registerToggleClaudeAssist(
  context: vscode.ExtensionContext,
  service: TracePointService
) {
  context.subscriptions.push(
    vscode.commands.registerCommand('codeTraceTree.toggleClaudeAssist', async () => {
      if (service.isClaudeAssistEnabled()) {
        service.setClaudeAssistEnabled(false)
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
            label: 'CLAUDE Profile',
            description: 'Create/switch to the CLAUDE profile',
            target: 'CLAUDE' as const
          }
        ],
        {
          title: 'Enable Claude Assist',
          placeHolder:
            'Claude will add/update/remove topic-related traces each turn that touched code'
        }
      )
      if (!choice) return
      await service.enableClaudeAssist(choice.target)
    })
  )
}
