/*
 * Copyright (C) 2025-2026 Code Trace Tree Contributors
 *
 * SPDX-License-Identifier: MIT
 */
import * as vscode from 'vscode'
import { TracePointService } from '../TracePointService'
import { formatDisplayText } from '../utils/displayText'

export function registerCopyTracePointText(
  context: vscode.ExtensionContext,
  service: TracePointService,
  treeView: vscode.TreeView<vscode.TreeItem>
) {
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'codeTraceTree.copyTracePointText',
      async (item?: vscode.TreeItem) => {
        const selected = item ? [item] : treeView.selection
        if (selected.length === 0) return
        const lines: string[] = []
        for (const treeItem of selected) {
          const id = service.resolveNodeId(treeItem.id)
          const node = id ? service.getTracePointNodeById(id) : null
          if (node) lines.push(formatDisplayText(node.tracePoint))
        }
        if (lines.length === 0) return
        await vscode.env.clipboard.writeText(lines.join('\n'))
      }
    )
  )
}
