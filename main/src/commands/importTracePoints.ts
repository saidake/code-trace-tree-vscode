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
import { TracePointNode, TraceProfile } from '../domain/types'
import { isParsedSingle, parseExportXml } from '../utils/traceProfileXml'

/**
 * Import single-profile (`<traceProfile>`) or multi-profile (`<traceProfiles>`) files.
 * Always asks how to apply the data — never auto-overwrites.
 */
export function registerImportTracePoints(
  context: vscode.ExtensionContext,
  service: TracePointService
) {
  context.subscriptions.push(
    vscode.commands.registerCommand('codeTraceTree.importTracePoints', async () => {
      const uri = await vscode.window.showOpenDialog({
        canSelectMany: false,
        filters: { XML: ['xml'] },
        openLabel: 'Import'
      })
      if (!uri?.[0]) return

      const projectPath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || ''
      try {
        const data = await vscode.workspace.fs.readFile(uri[0])
        const xml = new TextDecoder().decode(data)
        const parsed = parseExportXml(xml, projectPath)

        if (isParsedSingle(parsed)) {
          await importSingle(service, parsed.profileName, parsed.nodes, parsed.expandedIds)
        } else {
          await importMulti(service, parsed.activeProfileName, parsed.profiles)
        }
      } catch (e) {
        vscode.window.showErrorMessage(`Failed to import: ${e}`)
      }
    })
  )
}

async function importSingle(
  service: TracePointService,
  profileName: string | undefined,
  nodes: TracePointNode[],
  expandedIds: string[]
) {
  const nameHint = profileName ? ` ("${profileName}")` : ''
  const choice = await vscode.window.showQuickPick(
    [
      {
        label: 'Replace Current Profile',
        description: `Overwrite "${service.getActiveProfileName()}"`,
        value: 'replace' as const
      },
      {
        label: 'Import as New Profile',
        description: 'Keep existing profiles and add a new one',
        value: 'new' as const
      }
    ],
    {
      title: 'Import Trace Points',
      placeHolder: `This file contains a single profile${nameHint}`
    }
  )
  if (!choice) return

  if (choice.value === 'replace') {
    await service.replaceActiveProfileTree(nodes, expandedIds)
    vscode.window.showInformationMessage(
      `Replaced profile "${service.getActiveProfileName()}".`
    )
    return
  }

  const name = await service.importAsNewProfile(profileName || 'imported', nodes, expandedIds)
  vscode.window.showInformationMessage(`Imported as new profile "${name}".`)
}

async function importMulti(
  service: TracePointService,
  activeProfileName: string | undefined,
  profiles: TraceProfile[]
) {
  const names = profiles.map((p) => `"${p.name}"`).join(', ')
  const choice = await vscode.window.showQuickPick(
    [
      {
        label: 'Import as New Profiles',
        description: 'Add all; rename on name conflicts',
        value: 'new' as const
      },
      {
        label: 'Merge All Profiles',
        description: 'Overwrite same-named; add the rest; keep local-only',
        value: 'merge' as const
      },
      {
        label: 'Replace All Profiles',
        description: 'Discard local profiles and use the file’s profiles',
        value: 'replace' as const
      }
    ],
    {
      title: 'Import Trace Points',
      placeHolder: `This file contains ${profiles.length} profile(s): ${names}`
    }
  )
  if (!choice) return

  if (choice.value === 'new') {
    const created = await service.importAsNewProfiles(profiles)
    vscode.window.showInformationMessage(
      `Imported ${created.length} profile(s): ${created.map((n) => `"${n}"`).join(', ')}.`
    )
    return
  }

  if (choice.value === 'merge') {
    await service.mergeProfiles(profiles, activeProfileName)
    vscode.window.showInformationMessage(
      `Merged ${profiles.length} profile(s) into the project.`
    )
    return
  }

  const confirm = await vscode.window.showWarningMessage(
    'This will delete all existing local profiles and replace them with the file’s profiles. Continue?',
    { modal: true },
    'Replace'
  )
  if (confirm !== 'Replace') return

  await service.replaceAllProfiles(profiles, activeProfileName)
  vscode.window.showInformationMessage(
    `Replaced all profiles with ${profiles.length} profile(s) from the file.`
  )
}
