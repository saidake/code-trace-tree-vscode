/*
 * Copyright (C) 2025-2026 Code Trace Tree Contributors
 *
 * SPDX-License-Identifier: MIT
 */
import * as vscode from 'vscode'
import { TracePointService } from '../TracePointService'
import { resolveTracePointCommandIds } from './commandArgs'

export function registerShowLineContent(
  context: vscode.ExtensionContext,
  service: TracePointService
) {
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'codeTraceTree.showLineContent',
      async (arg?: string | vscode.TreeItem) => {
        const ids = resolveTracePointCommandIds(service, arg)
        if (ids.length === 0) return

        const lines: string[] = []
        for (const id of ids) {
          const node = service.getTracePointNodeById(id)
          if (!node || node.tracePoint.traceType !== 'LINE') continue
          const content = node.tracePoint.lineContent?.trim() ?? ''
          lines.push(content)
        }

        if (lines.length === 0) {
          vscode.window.showWarningMessage(
            'Select a line trace point to show its saved line content.'
          )
          return
        }

        await vscode.window.showInputBox({
          title: 'Line Content',
          prompt: 'Saved trimmed line content (select and copy as needed)',
          value: lines.join('\n')
        })
      }
    )
  )
}
