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
import { TracePointTreeDataProvider } from '../TracePointTreeDataProvider'

export function registerRenameTracePoint(
  context: vscode.ExtensionContext,
  service: TracePointService,
  treeView: vscode.TreeView<vscode.TreeItem>,
  treeDataProvider: TracePointTreeDataProvider
) {
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'codeTraceTree.renameTracePoint',
      async (item: vscode.TreeItem) => {
        const selected = item ? [item] : treeView.selection
        if (selected.length !== 1) {
          vscode.window.showWarningMessage('Select exactly one trace point to rename.')
          return
        }
        // Look up by id in the full tree map (not just roots)
        const nodeId = service.resolveNodeId(selected[0].id)
        const tp = nodeId ? service.getTracePointNodeById(nodeId) : null
        if (!tp) return
        const newName = await vscode.window.showInputBox({
          prompt: 'Enter new name (optional)',
          placeHolder: 'Leave empty for no name',
          value: tp.tracePoint.name
        })
        // Allow empty string or undefined
        await service.renameTracePoint(tp.id, newName ?? '')
      }
    )
  )
}
