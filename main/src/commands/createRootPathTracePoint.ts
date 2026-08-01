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
        await service.addPathTracePoint(name, target)
        service.notifyListeners()
        service.saveState()
      }
    )
  )
}
