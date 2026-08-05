/*
 * Copyright (C) 2025-2026 Code Trace Tree Contributors
 *
 * SPDX-License-Identifier: MIT
 */
import * as vscode from 'vscode'
import { TracePointService } from '../TracePointService'
import { TracePointNode, TraceProfile } from '../domain/types'
import { isParsedSingle, parseExportXml } from '../utils/traceProfileXml'
import { ProjectStorage } from '../storage/projectStorage'

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
          await promptImportMulti(service, parsed.activeProfileName, parsed.profiles)
        }
      } catch (e) {
        vscode.window.showErrorMessage(`Failed to import: ${e}`)
      }
    })
  )
}

export function registerBrowseStoredProjects(
  context: vscode.ExtensionContext,
  service: TracePointService
) {
  context.subscriptions.push(
    vscode.commands.registerCommand('codeTraceTree.browseStoredProjects', async () => {
      const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath
      if (!workspaceRoot) {
        vscode.window.showWarningMessage(
          'Code Trace Tree: open a workspace folder to import stored data.'
        )
        return
      }

      const stored = service.listStoredProjects()
      if (stored.length === 0) {
        vscode.window.showInformationMessage('No stored Code Trace Tree projects found.')
        return
      }

      const items = stored.map((entry) => ({
        label: entry.path || '(no path)',
        description: formatUpdatedAt(entry.updatedAt),
        detail: entry.storageFile,
        entry
      }))

      const picked = await vscode.window.showQuickPick(items, {
        title: 'Stored Code Trace Tree Projects',
        placeHolder: 'Select a project to import its profiles into this workspace'
      })
      if (!picked) return

      const storage = new ProjectStorage(workspaceRoot)
      const doc = storage.loadDocumentFromFile(picked.entry.storageFile)
      if (!doc) {
        vscode.window.showErrorMessage('Failed to read the selected storage file.')
        return
      }

      const wasUnbound = !service.getBoundProjectId()
      service.prepareBindStoredProject(picked.entry.storageFile, doc.projectId)
      const imported = await promptImportMulti(service, doc.activeProfileName, doc.profiles)
      if (!imported) {
        if (wasUnbound) {
          service.clearPreparedStoredProjectBind()
        }
        return
      }

      service.finalizeStoredProjectBind(wasUnbound)
      vscode.window.showInformationMessage(
        `Imported profiles from stored project and bound storage to this workspace.`
      )
    })
  )
}

function formatUpdatedAt(epochMs: number): string {
  if (!epochMs) return 'Unknown date'
  try {
    return new Date(epochMs).toLocaleString()
  } catch {
    return String(epochMs)
  }
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

/** Multi-profile import choices; returns false when the user cancels. */
export async function promptImportMulti(
  service: TracePointService,
  activeProfileName: string | undefined,
  profiles: TraceProfile[]
): Promise<boolean> {
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
  if (!choice) return false

  if (choice.value === 'new') {
    const created = await service.importAsNewProfiles(profiles)
    vscode.window.showInformationMessage(
      `Imported ${created.length} profile(s): ${created.map((n) => `"${n}"`).join(', ')}.`
    )
    return true
  }

  if (choice.value === 'merge') {
    await service.mergeProfiles(profiles, activeProfileName)
    vscode.window.showInformationMessage(
      `Merged ${profiles.length} profile(s) into the project.`
    )
    return true
  }

  const confirm = await vscode.window.showWarningMessage(
    'This will delete all existing local profiles and replace them with the file’s profiles. Continue?',
    { modal: true },
    'Replace'
  )
  if (confirm !== 'Replace') return false

  await service.replaceAllProfiles(profiles, activeProfileName)
  vscode.window.showInformationMessage(
    `Replaced all profiles with ${profiles.length} profile(s) from the file.`
  )
  return true
}
