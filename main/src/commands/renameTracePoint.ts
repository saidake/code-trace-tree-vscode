/*
 * Copyright (C) 2025-2026 Code Trace Tree Contributors
 *
 * SPDX-License-Identifier: MIT
 */
import * as vscode from 'vscode'
import { TracePointService } from '../TracePointService'
import { resolveTracePointCommandIds } from './commandArgs'

export function registerRenameTracePoint(
  context: vscode.ExtensionContext,
  service: TracePointService
) {
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'codeTraceTree.renameTracePoint',
      async (arg?: string | vscode.TreeItem) => {
        const ids = resolveTracePointCommandIds(service, arg)
        if (ids.length !== 1) {
          vscode.window.showWarningMessage('Select exactly one trace point to rename.')
          return
        }
        const tp = service.getTracePointNodeById(ids[0])
        if (!tp) return
        const newName = await vscode.window.showInputBox({
          prompt: 'Enter new name (optional)',
          placeHolder: 'Leave empty for no name',
          value: tp.tracePoint.traceName
        })
        await service.renameTracePoint(tp.id, newName ?? '')
      }
    )
  )
}
