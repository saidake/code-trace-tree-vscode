/*
 * Copyright (C) 2025-2026 Code Trace Tree Contributors
 *
 * SPDX-License-Identifier: MIT
 */
import * as fs from 'fs'
import * as path from 'path'
import {
  AGENT_PROFILE_NAME,
  CLAUDE_PROFILE_NAME,
  DEFAULT_PROFILE_NAME,
  PROJECT_DOCUMENT_VERSION
} from '../domain/constants'
import { ClaudeAssistTarget, ProjectDocument, TraceProfile } from '../domain/types'
import {
  nodeFromXml,
  nodeToXml,
  profileFromXmlShape,
  profileToXmlShape
} from '../utils/traceProfileXml'
import { asArray, parseXml, serializeXml } from '../utils/xmlUtils'

/** Storage value CLAUDE is accepted on read and migrated to AGENT. */
function parseClaudeAssistTarget(raw: unknown): ClaudeAssistTarget {
  const value = String(raw ?? '')
    .trim()
    .toUpperCase()
  return value === 'AGENT' || value === CLAUDE_PROFILE_NAME ? 'AGENT' : 'CURRENT'
}

/**
 * Renames a legacy `CLAUDE` profile to `AGENT` when needed.
 * @returns updated active profile name and whether any rename occurred
 */
export function migrateClaudeProfileToAgent(
  profiles: TraceProfile[],
  activeProfileName: string
): { active: string; changed: boolean } {
  let changed = false
  let active = activeProfileName
  const agent = profiles.find((p) => p.name.toLowerCase() === AGENT_PROFILE_NAME.toLowerCase())
  const legacy = profiles.find((p) => p.name.toLowerCase() === CLAUDE_PROFILE_NAME.toLowerCase())
  if (legacy && !agent) {
    const wasActive = active.toLowerCase() === legacy.name.toLowerCase()
    legacy.name = AGENT_PROFILE_NAME
    if (wasActive) active = AGENT_PROFILE_NAME
    changed = true
  } else if (legacy && agent) {
    if (active.toLowerCase() === legacy.name.toLowerCase()) {
      active = AGENT_PROFILE_NAME
      changed = true
    }
    if (agent.name !== AGENT_PROFILE_NAME) {
      agent.name = AGENT_PROFILE_NAME
      changed = true
    }
  } else if (agent && agent.name !== AGENT_PROFILE_NAME) {
    const wasActive = active.toLowerCase() === agent.name.toLowerCase()
    agent.name = AGENT_PROFILE_NAME
    if (wasActive) active = AGENT_PROFILE_NAME
    changed = true
  }
  return { active, changed }
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

  const profileList: TraceProfile[] =
    profiles.length > 0
      ? profiles
      : [{ name: DEFAULT_PROFILE_NAME, tracePointNodes: [], expandedTracePointIds: [] }]

  let activeProfileName =
    String(root.activeProfileName || '').trim() ||
    profileList[0]?.name ||
    DEFAULT_PROFILE_NAME
  activeProfileName = migrateClaudeProfileToAgent(profileList, activeProfileName).active

  return {
    version: Number(root['@_version'] ?? PROJECT_DOCUMENT_VERSION),
    projectId,
    path: projectPath,
    updatedAt: Number(root.updatedAt ?? 0),
    profiles: profileList,
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
