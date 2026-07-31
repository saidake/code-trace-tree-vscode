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
import { TracePointTreeDataProvider } from '../TracePointTreeDataProvider'

export function registerExpandSelected(
  context: vscode.ExtensionContext,
  treeView: vscode.TreeView<vscode.TreeItem>,
  treeDataProvider: TracePointTreeDataProvider
) {
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'codeTraceTree.expandSelected',
      async (item: vscode.TreeItem) => {
        const selected = item ? [item] : treeView.selection
        if (selected.length === 0) {
          vscode.window.showWarningMessage('No trace points selected.')
          return
        }
        await treeDataProvider.expandSelectedAndChildren(treeView)
      }
    )
  )
}
