/*
 * Copyright (C) 2025-2026 Code Trace Tree Contributors
 *
 * SPDX-License-Identifier: MIT
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
 * Global file naming: `<projectId>.xml`.
 * Legacy `FolderName.xml` files (previous releases) are still found by scanning
 * `<projectId>` inside XML and best-effort renamed to the canonical name.
 *
 * Resolution on project open:
 * - Case A: match by project id → update path/updatedAt
 * - Case B: match by path (copy-on-write) → new id + new XML file
 * - Case C: no match → return undefined (do not create id/XML until first real use)
 *
 * Call {@link ensureCreated} before the first persist that should bind storage
 * (create trace point, add profile, import, or toolbar toggle).
 */
export class ProjectStorage {
  private boundFile: string | undefined
  private boundProjectId: string | undefined
  private readonly projectBase: string

  constructor(projectBasePath: string) {
    this.projectBase = path.resolve(projectBasePath)
  }

  getBoundStorageFile(): string | undefined {
    return this.boundFile
  }

  getBoundProjectId(): string | undefined {
    return this.boundProjectId
  }

  /** Re-read the bound XML without rebinding project id. */
  reloadBoundDocument(): ProjectDocument | undefined {
    const file = this.boundFile
    if (!file || !fs.existsSync(file) || !fs.statSync(file).isFile()) return undefined
    try {
      const doc = parseProjectFile(file)
      const rebound: ProjectDocument = { ...doc, storageFile: file }
      this.bind(rebound)
      return rebound
    } catch {
      return undefined
    }
  }

  /**
   * Resolve existing storage (Case A / B). Returns undefined when nothing exists yet
   * (lazy Case C — no disk writes).
   */
  resolveAndLoad(): ProjectDocument | undefined {
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
      const newFile = this.allocateStorageFile(newId)
      const copied: ProjectDocument = {
        version: PROJECT_DOCUMENT_VERSION,
        projectId: newId,
        path: this.projectBase,
        updatedAt: Date.now(),
        profiles: cloneProfiles(byPath.profiles),
        activeProfileName: byPath.activeProfileName || DEFAULT_PROFILE_NAME,
        descriptionAreaOpened: byPath.descriptionAreaOpened,
        highlightingEnabled: byPath.highlightingEnabled,
        namePromptEnabled: byPath.namePromptEnabled,
        storageFile: newFile
      }
      ProjectIdFiles.writeProjectId(this.projectBase, newId)
      this.bind(copied)
      this.saveDocument(copied)
      return copied
    }

    // Case C: deferred — no project id / XML until ensureCreated()
    return undefined
  }

  /**
   * Bind storage for a new project (Case C) if not already bound.
   * Writes the local project id file and allocates the global XML path;
   * the first {@link save} writes the XML from in-memory state.
   * @returns true when this call newly bound storage
   */
  ensureCreated(): boolean {
    if (this.boundFile && this.boundProjectId) return false

    fs.mkdirSync(resolveAppDir(), { recursive: true })
    if (this.resolveAndLoad()) return true

    const newId = uuidv4()
    const newFile = this.allocateStorageFile(newId)
    ProjectIdFiles.writeProjectId(this.projectBase, newId)
    this.boundProjectId = newId
    this.boundFile = newFile
    return true
  }

  save(
    profiles: TraceProfile[],
    activeProfileName: string,
    descriptionAreaOpened: boolean,
    highlightingEnabled: boolean,
    namePromptEnabled: boolean
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
      namePromptEnabled,
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

  /** Canonical global storage path: `<appDir>/<projectId>.xml`. */
  private allocateStorageFile(projectId: string): string {
    const dir = resolveAppDir()
    fs.mkdirSync(dir, { recursive: true })
    return path.join(dir, `${projectId}.xml`)
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

  /**
   * Case A lookup:
   * 1. Fast path — open `<projectId>.xml` when present
   * 2. Legacy fallback — scan other `*.xml` for matching `<projectId>`
   * 3. Best-effort rename legacy file → `<projectId>.xml`
   */
  private findDocumentByProjectId(projectId: string): ProjectDocument | undefined {
    const canonical = this.allocateStorageFile(projectId)

    if (fs.existsSync(canonical) && fs.statSync(canonical).isFile()) {
      try {
        const doc = parseProjectFile(canonical)
        if (doc.projectId === projectId) {
          return { ...doc, storageFile: canonical }
        }
      } catch {
        // Fall through to legacy scan
      }
    }

    for (const file of this.listProjectXmlFiles()) {
      if (path.resolve(file) === path.resolve(canonical)) continue
      try {
        const doc = parseProjectFile(file)
        if (doc.projectId !== projectId) continue
        const migrated = this.migrateLegacyStorageFile(file, canonical)
        return { ...doc, storageFile: migrated }
      } catch {
        // Skip unreadable storage files
      }
    }
    return undefined
  }

  /** Rename legacy FolderName.xml → projectId.xml when the target is free. */
  private migrateLegacyStorageFile(legacyFile: string, canonicalFile: string): string {
    if (path.resolve(legacyFile) === path.resolve(canonicalFile)) return legacyFile
    if (fs.existsSync(canonicalFile)) return legacyFile
    try {
      fs.renameSync(legacyFile, canonicalFile)
      return canonicalFile
    } catch {
      return legacyFile
    }
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
