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
import { DEFAULT_PROFILE_NAME, PROJECT_DOCUMENT_VERSION } from '../domain/constants'
import { ClaudeAssistTarget, ProjectDocument, TraceProfile } from '../domain/types'
import {
  nodeFromXml,
  nodeToXml,
  profileFromXmlShape,
  profileToXmlShape
} from '../utils/traceProfileXml'
import { asArray, parseXml, serializeXml } from '../utils/xmlUtils'

function parseClaudeAssistTarget(raw: unknown): ClaudeAssistTarget {
  const value = String(raw ?? '')
    .trim()
    .toUpperCase()
  return value === 'CLAUDE' ? 'CLAUDE' : 'CURRENT'
}

/** Parse project document XML (`data.xml` design, version 4). */
export function parseProjectDocument(xml: string, storageFile?: string): ProjectDocument {
  const parsed = parseXml(xml)
  const root = parsed.project
  if (!root) {
    throw new Error('Expected <project> root')
  }

  const projectId = String(root.projectId || '').trim()
  if (!projectId) throw new Error('Missing <projectId>')

  const projectPath = String(root.path || '')
  const profiles = asArray(root.traceProfiles?.traceProfile).map((p) =>
    profileFromXmlShape(p, projectPath)
  )

  const activeProfileName =
    String(root.activeProfileName || '').trim() ||
    profiles[0]?.name ||
    DEFAULT_PROFILE_NAME

  return {
    version: Number(root['@_version'] ?? PROJECT_DOCUMENT_VERSION),
    projectId,
    path: projectPath,
    updatedAt: Number(root.updatedAt ?? 0),
    profiles:
      profiles.length > 0
        ? profiles
        : [{ name: DEFAULT_PROFILE_NAME, tracePointNodes: [], expandedTracePointIds: [] }],
    activeProfileName,
    descriptionAreaOpened: String(root.descriptionAreaOpened) === 'true',
    highlightingEnabled:
      root.highlightingEnabled == null ? true : String(root.highlightingEnabled) === 'true',
    namePromptEnabled:
      root.namePromptEnabled == null ? true : String(root.namePromptEnabled) === 'true',
    claudeAssistEnabled: String(root.claudeAssistEnabled) === 'true',
    claudeAssistTarget: parseClaudeAssistTarget(root.claudeAssistTarget),
    storageFile
  }
}

export function parseProjectFile(filePath: string): ProjectDocument {
  const xml = fs.readFileSync(filePath, 'utf8')
  return parseProjectDocument(xml, filePath)
}

/** Serialize project document to XML string. */
export function projectDocumentToXml(doc: ProjectDocument): string {
  const obj = {
    '?xml': { '@_version': '1.0', '@_encoding': 'UTF-8' },
    project: {
      '@_version': String(doc.version || PROJECT_DOCUMENT_VERSION),
      projectId: doc.projectId,
      path: doc.path,
      updatedAt: String(doc.updatedAt),
      activeProfileName: doc.activeProfileName,
      highlightingEnabled: String(doc.highlightingEnabled),
      namePromptEnabled: String(doc.namePromptEnabled),
      claudeAssistEnabled: String(doc.claudeAssistEnabled),
      claudeAssistTarget: doc.claudeAssistTarget,
      traceProfiles: {
        traceProfile: doc.profiles.map((p) => profileToXmlShape(p))
      },
      descriptionAreaOpened: String(doc.descriptionAreaOpened)
    }
  }
  return serializeXml(obj)
}

/** Atomic write: write `.tmp` then rename over the target. */
export function writeProjectDocumentAtomic(doc: ProjectDocument, filePath: string): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  const xml = projectDocumentToXml(doc)
  const tmp = filePath + '.tmp'
  fs.writeFileSync(tmp, xml, 'utf8')
  try {
    fs.renameSync(tmp, filePath)
  } catch {
    fs.copyFileSync(tmp, filePath)
    fs.unlinkSync(tmp)
  }
}

/** Deep-clone profiles for copy-on-write path matching. */
export function cloneProfiles(profiles: TraceProfile[]): TraceProfile[] {
  return profiles.map((p) => ({
    name: p.name || DEFAULT_PROFILE_NAME,
    tracePointNodes: p.tracePointNodes.map((n) =>
      nodeFromXml(nodeToXml(n, undefined), n.tracePoint.projectPath)
    ),
    expandedTracePointIds: [...p.expandedTracePointIds]
  }))
}
