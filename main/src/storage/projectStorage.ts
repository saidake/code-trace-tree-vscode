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
import * as fs from 'fs'
import * as path from 'path'
import { v4 as uuidv4 } from 'uuid'
import { DEFAULT_PROFILE_NAME, PROJECT_DOCUMENT_VERSION } from '../domain/constants'
import { ProjectDocument, TraceProfile } from '../domain/types'
import { resolveAppDir } from './globalStoragePaths'
import {
  cloneProfiles,
  parseProjectFile,
  writeProjectDocumentAtomic
} from './projectDataXml'
import * as ProjectIdFiles from './projectIdFiles'

/**
 * Resolves and persists hybrid project storage (local project id + global XML).
 *
 * Resolution on project open:
 * - Case A: match by project id → update path/updatedAt
 * - Case B: match by path (copy-on-write) → new id + new XML file
 * - Case C: create a fresh project document with profile "main"
 */
export class ProjectStorage {
  private boundFile: string | undefined
  private boundProjectId: string | undefined
  private readonly projectBase: string

  constructor(projectBasePath: string) {
    this.projectBase = path.resolve(projectBasePath)
  }

  resolveAndLoad(): ProjectDocument {
    fs.mkdirSync(resolveAppDir(), { recursive: true })

    const existingId = ProjectIdFiles.readProjectId(this.projectBase)

    // Case A: match by id
    if (existingId) {
      const byId = this.findDocumentByProjectId(existingId)
      if (byId) {
        // Ensure VS Code has its own id file when we only found the JetBrains one
        const vscodeIdPath = ProjectIdFiles.vscodeIdPath(this.projectBase)
        if (!fs.existsSync(vscodeIdPath)) {
          ProjectIdFiles.writeProjectId(this.projectBase, existingId)
        }
        const updated: ProjectDocument = {
          ...byId,
          path: this.projectBase,
          updatedAt: Date.now(),
          storageFile: byId.storageFile
        }
        this.bind(updated)
        this.saveDocument(updated)
        return updated
      }
    }

    // Case B: match by path (copy-on-write)
    const byPath = this.findDocumentByPath(this.projectBase)
    if (byPath) {
      const newId = uuidv4()
      const newFile = this.allocateStorageFile(path.basename(this.projectBase))
      const copied: ProjectDocument = {
        version: PROJECT_DOCUMENT_VERSION,
        projectId: newId,
        path: this.projectBase,
        updatedAt: Date.now(),
        profiles: cloneProfiles(byPath.profiles),
        activeProfileName: byPath.activeProfileName || DEFAULT_PROFILE_NAME,
        descriptionAreaOpened: byPath.descriptionAreaOpened,
        highlightingEnabled: byPath.highlightingEnabled,
        storageFile: newFile
      }
      ProjectIdFiles.writeProjectId(this.projectBase, newId)
      this.bind(copied)
      this.saveDocument(copied)
      return copied
    }

    // Case C: new project
    const newId = uuidv4()
    const newFile = this.allocateStorageFile(path.basename(this.projectBase))
    const fresh: ProjectDocument = {
      version: PROJECT_DOCUMENT_VERSION,
      projectId: newId,
      path: this.projectBase,
      updatedAt: Date.now(),
      profiles: [{ name: DEFAULT_PROFILE_NAME, tracePointNodes: [], expandedTracePointIds: [] }],
      activeProfileName: DEFAULT_PROFILE_NAME,
      descriptionAreaOpened: false,
      highlightingEnabled: true,
      storageFile: newFile
    }
    ProjectIdFiles.writeProjectId(this.projectBase, newId)
    this.bind(fresh)
    this.saveDocument(fresh)
    return fresh
  }

  save(
    profiles: TraceProfile[],
    activeProfileName: string,
    descriptionAreaOpened: boolean,
    highlightingEnabled: boolean
  ): void {
    const file = this.boundFile
    const projectId = this.boundProjectId
    if (!file || !projectId) return

    const doc: ProjectDocument = {
      version: PROJECT_DOCUMENT_VERSION,
      projectId,
      path: this.projectBase,
      updatedAt: Date.now(),
      profiles: profiles.map((p) => ({
        name: p.name || DEFAULT_PROFILE_NAME,
        tracePointNodes: p.tracePointNodes,
        expandedTracePointIds: [...p.expandedTracePointIds]
      })),
      activeProfileName,
      descriptionAreaOpened,
      highlightingEnabled,
      storageFile: file
    }
    this.saveDocument(doc)
  }

  private saveDocument(doc: ProjectDocument): void {
    const file = doc.storageFile || this.boundFile
    if (!file) return
    writeProjectDocumentAtomic(doc, file)
    this.bind({ ...doc, storageFile: file })
  }

  private bind(doc: ProjectDocument): void {
    this.boundFile = doc.storageFile
    this.boundProjectId = doc.projectId
  }

  private allocateStorageFile(folderName: string): string {
    const dir = resolveAppDir()
    fs.mkdirSync(dir, { recursive: true })
    const safeName = (folderName || 'project').replace(/[<>:"/\\|?*]/g, '_')
    let candidate = path.join(dir, `${safeName}.xml`)
    let index = 1
    while (fs.existsSync(candidate)) {
      candidate = path.join(dir, `${safeName}-${index}.xml`)
      index++
    }
    return candidate
  }

  private listProjectXmlFiles(): string[] {
    const dir = resolveAppDir()
    if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) return []
    return fs
      .readdirSync(dir)
      .filter((name) => name.endsWith('.xml') && !name.endsWith('.tmp'))
      .map((name) => path.join(dir, name))
      .filter((file) => fs.statSync(file).isFile())
  }

  private findDocumentByProjectId(projectId: string): ProjectDocument | undefined {
    for (const file of this.listProjectXmlFiles()) {
      try {
        const doc = parseProjectFile(file)
        if (doc.projectId === projectId) {
          return { ...doc, storageFile: file }
        }
      } catch {
        // Skip unreadable storage files
      }
    }
    return undefined
  }

  private findDocumentByPath(absolutePath: string): ProjectDocument | undefined {
    const normalized = this.normalizePath(absolutePath)
    for (const file of this.listProjectXmlFiles()) {
      try {
        const doc = parseProjectFile(file)
        if (this.normalizePath(doc.path) === normalized) {
          return { ...doc, storageFile: file }
        }
      } catch {
        // Skip unreadable storage files
      }
    }
    return undefined
  }

  private normalizePath(p: string): string {
    if (!p) return ''
    try {
      const normalized = path.resolve(p)
      return process.platform === 'win32' ? normalized.toLowerCase() : normalized
    } catch {
      return process.platform === 'win32' ? p.toLowerCase() : p
    }
  }
}
