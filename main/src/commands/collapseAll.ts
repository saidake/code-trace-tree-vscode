/*
 * Copyright (C) 2025-2026 Code Trace Tree Contributors
 *
 * SPDX-License-Identifier: MIT
 */
import * as vscode from 'vscode'
import { TracePointsListApi } from '../TracePointsListApi'

export function registerCollapseAll(
  context: vscode.ExtensionContext,
  listView: TracePointsListApi
) {
  context.subscriptions.push(
    vscode.commands.registerCommand('codeTraceTree.collapseAll', async () => {
      await listView.collapseAll()
    })
  )
}
