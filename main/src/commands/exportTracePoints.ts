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
import { exportAllProfilesXml, exportSingleProfileXml } from '../utils/traceProfileXml'

export function registerExportTracePoints(
  context: vscode.ExtensionContext,
  service: TracePointService
) {
  context.subscriptions.push(
    vscode.commands.registerCommand('codeTraceTree.exportTracePoints', async () => {
      // Choose current profile vs all profiles
      const choice = await vscode.window.showQuickPick(
        [
          {
            label: 'Current Profile',
            description: `Export "${service.getActiveProfileName()}" as a single-profile file`,
            value: 'current' as const
          },
          {
            label: 'All Profiles',
            description: 'Export every profile in a multi-profile file',
            value: 'all' as const
          }
        ],
        { title: 'Export Trace Points', placeHolder: 'Choose what to export' }
      )
      if (!choice) return

      const exportAll = choice.value === 'all'
      const defaultName = exportAll
        ? 'code-trace-tree-profiles.xml'
        : `code-trace-tree-${service.getActiveProfileName()}.xml`

      const uri = await vscode.window.showSaveDialog({
        defaultUri: vscode.Uri.file(defaultName),
        filters: { XML: ['xml'] }
      })
      if (!uri) return

      const xml = exportAll
        ? exportAllProfilesXml(service.getProfilesSnapshot(), service.getActiveProfileName())
        : exportSingleProfileXml(
            service.getActiveProfileName(),
            service.getTracePointNodes(),
            service.getExpandedTracePointIds()
          )

      await vscode.workspace.fs.writeFile(uri, new TextEncoder().encode(xml))
      const scope = exportAll
        ? 'all profiles'
        : `profile "${service.getActiveProfileName()}"`
      vscode.window.showInformationMessage(`Exported ${scope}.`)
    })
  )
}
