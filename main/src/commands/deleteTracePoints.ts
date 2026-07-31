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

export function registerDeleteTracePoints(
  context: vscode.ExtensionContext,
  service: TracePointService,
  treeView: vscode.TreeView<vscode.TreeItem>,
  treeDataProvider: TracePointTreeDataProvider
) {
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'codeTraceTree.deleteTracePoints',
      async (item: vscode.TreeItem) => {
        // Get selected IDs from TracePointService
        const selectedIds = service.getSelectedTracePointIds()

        // Debug: Log the number of selected items
        // console.log(`[CodeTraceTree] Delete command triggered. Selected items: ${selectedIds.length}, IDs: ${selectedIds.join(', ')}`);

        if (selectedIds.length === 0) {
          vscode.window.showWarningMessage('No trace points selected.')
          return
        }

        // Confirm deletion
        const confirm = await vscode.window.showWarningMessage(
          `Are you sure you want to delete ${selectedIds.length} trace point(s) and their children?`,
          { modal: true },
          'Delete'
        )
        if (confirm !== 'Delete') return

        await service.deleteTracePointsWithChildren(selectedIds)
        vscode.window.showInformationMessage(`Deleted ${selectedIds.length} trace point(s).`)
      }
    )
  )
}
