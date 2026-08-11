/*
 * Copyright (C) 2025-2026 Code Trace Tree Contributors
 *
 * SPDX-License-Identifier: MIT
 */
import * as vscode from 'vscode'
import { TracePointService } from '../TracePointService'
import { formatDisplayText } from '../utils/displayText'
import { resolveTracePointCommandIds } from './commandArgs'

export function registerCopyTracePointText(
  context: vscode.ExtensionContext,
  service: TracePointService
) {
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'codeTraceTree.copyTracePointText',
      async (arg?: string | vscode.TreeItem) => {
        const ids = resolveTracePointCommandIds(service, arg)
        if (ids.length === 0) return
        const lines: string[] = []
        for (const id of ids) {
          const node = service.getTracePointNodeById(id)
          if (node) lines.push(formatDisplayText(node.tracePoint))
        }
        if (lines.length === 0) return
        await vscode.env.clipboard.writeText(lines.join('\n'))
      }
    )
  )
}
