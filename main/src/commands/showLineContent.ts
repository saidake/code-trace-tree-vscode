/*
 * Copyright (C) 2025-2026 Code Trace Tree Contributors
 *
 * SPDX-License-Identifier: MIT
 */
import * as vscode from 'vscode'
import { TracePointService } from '../TracePointService'

export function registerShowLineContent(
  context: vscode.ExtensionContext,
  service: TracePointService,
  treeView: vscode.TreeView<vscode.TreeItem>
) {
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'codeTraceTree.showLineContent',
      async (item?: vscode.TreeItem) => {
        const selected = item ? [item] : treeView.selection
        if (selected.length === 0) return

        const lines: string[] = []
        for (const treeItem of selected) {
          const id = service.resolveNodeId(treeItem.id)
          const node = id ? service.getTracePointNodeById(id) : null
          if (!node || node.tracePoint.traceType !== 'LINE') continue
          const content = node.tracePoint.lineContent?.trim() ?? ''
          lines.push(content)
        }

        if (lines.length === 0) {
          vscode.window.showWarningMessage('Select a line trace point to show its saved line content.')
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
