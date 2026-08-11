/*
 * Copyright (C) 2025-2026 Code Trace Tree Contributors
 *
 * SPDX-License-Identifier: MIT
 */
import * as path from 'path'
import * as vscode from 'vscode'
import { TracePointService } from '../TracePointService'
import { resolveNewTracePointName } from './tracePointNamePrompt'

export function registerCreateRootPathTracePoint(
  context: vscode.ExtensionContext,
  service: TracePointService
) {
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'codeTraceTree.createRootPathTracePoint',
      async (uri?: vscode.Uri) => {
        const target = uri ?? vscode.window.activeTextEditor?.document.uri
        if (!target) {
          vscode.window.showWarningMessage('Select a file or folder in the Explorer.')
          return
        }
        const kindLabel =
          (await vscode.workspace.fs.stat(target)).type & vscode.FileType.Directory
            ? 'directory'
            : 'file'
        const name = await resolveNewTracePointName(
          service,
          `Enter name for the ${kindLabel} trace point:`,
          path.basename(target.fsPath)
        )
        if (name === undefined) return
        const id = await service.addPathTracePoint(name, target)
        service.notifyListeners()
        service.saveState()
        if (id) await service.selectTracePointsInTree([id])
      }
    )
  )
}
