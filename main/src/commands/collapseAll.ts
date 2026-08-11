/*
 * Copyright (C) 2025-2026 Code Trace Tree Contributors
 *
 * SPDX-License-Identifier: MIT
 */
import * as vscode from 'vscode'
import { TracePointTreeDataProvider } from '../TracePointTreeDataProvider'

export function registerCollapseAll(
  context: vscode.ExtensionContext,
  treeDataProvider: TracePointTreeDataProvider
) {
  context.subscriptions.push(
    vscode.commands.registerCommand('codeTraceTree.collapseAll', async () => {
      await treeDataProvider.collapseAll()
    })
  )
}
