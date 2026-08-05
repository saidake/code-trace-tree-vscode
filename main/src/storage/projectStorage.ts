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
  parseProjectFile,
  writeProjectDocumentAtomic
} from './projectDataXml'

export interface StoredProjectSummary {
  storageFile: string
  projectId: string
  path: string
  updatedAt: number
}

/**
 * Resolves and persists global XML project storage bound by workspace path.
 *
 * Resolution on project open:
 * - Case B: match global XML `<path>` to workspace → bind in place (reuse `<projectId>`)
 * - Case C: no match → return undefined (lazy; no disk writes until first real use)
 *
 * Lazy create ({@link ensureCreated}): `<ProjectFolderName>.xml` (or `Name1.xml`, …)
 * with a new UUID `<projectId>`.
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

  getProjectBase(): string {
    return this.projectBase
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

  /** Load a global XML file without binding. */
  loadDocumentFromFile(file: string): ProjectDocument | undefined {
    if (!fs.existsSync(file) || !fs.statSync(file).isFile()) return undefined
    try {
      const doc = parseProjectFile(file)
      return { ...doc, storageFile: file }
    } catch {
      return undefined
    }
  }

  /** Bind in memory before import/persist (e.g. browse stored projects). */
  prepareBind(storageFile: string, projectId: string): void {
    this.boundFile = storageFile
    this.boundProjectId = projectId
  }

  /** Clear an in-memory bind when the user cancels stored-project import. */
  clearInMemoryBind(): void {
    this.boundFile = undefined
    this.boundProjectId = undefined
  }

  /**
   * Resolve existing storage (Case B). Returns undefined when nothing exists yet
   * (lazy Case C — no disk writes).
   */
  resolveAndLoad(): ProjectDocument | undefined {
    fs.mkdirSync(resolveAppDir(), { recursive: true })

    const matches = this.findDocumentsByPath(this.projectBase)
    if (matches.length === 0) return undefined

    const chosen =
      matches.length === 1
        ? matches[0]
        : matches.reduce((a, b) => (a.updatedAt >= b.updatedAt ? a : b))

    return this.bindExistingDocument(chosen)
  }

  /** Bind an existing global XML to this workspace; refresh `<path>` / `<updatedAt>`. */
  bindExistingDocument(doc: ProjectDocument): ProjectDocument {
    const updated: ProjectDocument = {
      ...doc,
      path: this.projectBase,
      updatedAt: Date.now(),
      storageFile: doc.storageFile
    }
    this.bind(updated)
    this.saveDocument(updated)
    return updated
  }

  /**
   * Bind storage for a new project (Case C) if not already bound.
   * Allocates a folder-named global XML path; first {@link save} writes content.
   * @returns true when this call newly bound storage
   */
  ensureCreated(): boolean {
    if (this.boundFile && this.boundProjectId) return false

    fs.mkdirSync(resolveAppDir(), { recursive: true })
    if (this.resolveAndLoad()) return true

    const newId = uuidv4()
    const newFile = this.allocateFolderNameStorageFile()
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

  /** Find global XML by `<projectId>` (scan all `*.xml`; no rename/migrate). */
  findDocumentByProjectId(projectId: string): ProjectDocument | undefined {
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

  /** List global project XMLs that contain at least one trace point (any profile). */
  static listStoredProjects(): StoredProjectSummary[] {
    const dir = resolveAppDir()
    if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) return []

    const summaries: StoredProjectSummary[] = []
    for (const name of fs.readdirSync(dir)) {
      if (!name.endsWith('.xml') || name.endsWith('.tmp')) continue
      const file = path.join(dir, name)
      if (!fs.statSync(file).isFile()) continue
      try {
        const doc = parseProjectFile(file)
        if (!documentHasTracePoints(doc)) continue
        summaries.push({
          storageFile: file,
          projectId: doc.projectId,
          path: doc.path,
          updatedAt: doc.updatedAt
        })
      } catch {
        // Skip unreadable storage files
      }
    }
    return summaries.sort((a, b) => b.updatedAt - a.updatedAt)
  }

  pathsMatch(storedPath: string, workspacePath?: string): boolean {
    const target = workspacePath ?? this.projectBase
    return this.normalizePath(storedPath) === this.normalizePath(target)
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

  private allocateFolderNameStorageFile(): string {
    const dir = resolveAppDir()
    fs.mkdirSync(dir, { recursive: true })
    const baseName = this.sanitizeFolderName(path.basename(this.projectBase))
    let candidate = path.join(dir, `${baseName}.xml`)
    if (!fs.existsSync(candidate)) return candidate

    let i = 1
    while (fs.existsSync(path.join(dir, `${baseName}${i}.xml`))) {
      i++
    }
    return path.join(dir, `${baseName}${i}.xml`)
  }

  private sanitizeFolderName(name: string): string {
    const sanitized = name.replace(/[<>:"/\\|?*\u0000-\u001f]/g, '').trim()
    return sanitized || 'project'
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

  private findDocumentsByPath(absolutePath: string): ProjectDocument[] {
    const normalized = this.normalizePath(absolutePath)
    const matches: ProjectDocument[] = []
    for (const file of this.listProjectXmlFiles()) {
      try {
        const doc = parseProjectFile(file)
        if (this.normalizePath(doc.path) === normalized) {
          matches.push({ ...doc, storageFile: file })
        }
      } catch {
        // Skip unreadable storage files
      }
    }
    return matches
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

function documentHasTracePoints(doc: ProjectDocument): boolean {
  return doc.profiles.some((profile) => profile.tracePointNodes.length > 0)
}
