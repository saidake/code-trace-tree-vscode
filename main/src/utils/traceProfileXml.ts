/*
 * Copyright (C) 2025-2026 Code Trace Tree Contributors
 *
 * SPDX-License-Identifier: MIT
 */
import { v4 as uuidv4 } from 'uuid'
import { DEFAULT_PROFILE_NAME } from '../domain/constants'
import {
  TracePoint,
  TracePointNode,
  TracePointNodeXml,
  TraceProfile,
  TraceProfileXmlShape,
  TraceType
} from '../domain/types'
import { asArray, parseXml, serializeXml } from './xmlUtils'

export const ROOT_SINGLE = 'traceProfile'
export const ROOT_MULTI = 'traceProfiles'

export interface ParsedSingle {
  profileName: string | undefined
  nodes: TracePointNode[]
  expandedIds: string[]
}

export interface ParsedMulti {
  activeProfileName: string | undefined
  profiles: TraceProfile[]
}

function parseTraceType(raw: unknown): TraceType {
  const value = String(raw ?? '')
    .trim()
    .toUpperCase()
  if (value === 'FILE' || value === 'DIRECTORY' || value === 'LINE') return value
  return 'LINE'
}

/** Build XML-friendly node tree (omit isValid / projectPath). */
export function nodeToXml(node: TracePointNode, parentId: string | undefined): TracePointNodeXml {
  const tp = node.tracePoint
  const xmlTp: TracePointNodeXml['tracePoint'] = {
    traceName: tp.traceName ?? '',
    traceType: tp.traceType ?? 'LINE',
    baseName: tp.baseName ?? '',
    tracePath: tp.tracePath ?? ''
  }
  if (tp.traceType === 'LINE') {
    xmlTp.lineNumber = tp.lineNumber
    xmlTp.lineContent = tp.lineContent ?? ''
    xmlTp.totalOccurrences = tp.totalOccurrences
    xmlTp.occurrenceIndex = tp.occurrenceIndex
  }
  if (tp.description) {
    xmlTp.description = tp.description
  }
  const xml: TracePointNodeXml = {
    id: node.id,
    parentId: parentId ?? '',
    tracePoint: xmlTp
  }
  if (node.children.length > 0) {
    xml.children = {
      tracePointNode: node.children.map((child) => nodeToXml(child, node.id))
    }
  }
  return xml
}

/** Parse a node from XML; projectPath is filled later from the workspace. */
export function nodeFromXml(nodeXml: TracePointNodeXml, projectPath: string): TracePointNode {
  const tpXml = nodeXml.tracePoint ?? {}
  const id = String(nodeXml.id || uuidv4())
  const parentIdRaw = nodeXml.parentId
  const parentId =
    parentIdRaw != null && String(parentIdRaw).trim() !== '' ? String(parentIdRaw) : undefined

  // Backward-compat: old name/fileName/filePath without traceType → LINE
  const hasLegacy =
    tpXml.traceType == null &&
    (tpXml.name != null || tpXml.fileName != null || tpXml.filePath != null)
  const traceType = hasLegacy ? 'LINE' : parseTraceType(tpXml.traceType)
  const traceName = String(tpXml.traceName ?? tpXml.name ?? '')
  const baseName = String(tpXml.baseName ?? tpXml.fileName ?? '')
  const tracePath = String(tpXml.tracePath ?? tpXml.filePath ?? '')

  let tracePoint: TracePoint
  if (traceType === 'FILE' || traceType === 'DIRECTORY') {
    tracePoint = {
      traceName,
      traceType,
      baseName,
      tracePath,
      lineNumber: 0,
      projectPath,
      lineContent: null,
      isValid: true,
      totalOccurrences: 0,
      occurrenceIndex: 0,
      description: tpXml.description != null ? String(tpXml.description) : undefined
    }
  } else {
    tracePoint = {
      traceName,
      traceType: 'LINE',
      baseName,
      tracePath,
      lineNumber: Number(tpXml.lineNumber ?? -1),
      projectPath,
      lineContent: tpXml.lineContent != null ? String(tpXml.lineContent) : '',
      isValid: true,
      totalOccurrences: Number(tpXml.totalOccurrences ?? 1),
      occurrenceIndex: Number(tpXml.occurrenceIndex ?? 1),
      description: tpXml.description != null ? String(tpXml.description) : undefined
    }
  }

  const childrenXml = asArray(nodeXml.children?.tracePointNode)
  const children = childrenXml.map((child) => {
    const parsed = nodeFromXml(child, projectPath)
    if (!parsed.parentId) parsed.parentId = id
    return parsed
  })

  return { id, tracePoint, parentId, children }
}

export function profileToXmlShape(profile: TraceProfile): TraceProfileXmlShape {
  return {
    name: profile.name || DEFAULT_PROFILE_NAME,
    tracePointNodes: {
      tracePointNode: profile.tracePointNodes.map((n) => nodeToXml(n, undefined))
    },
    expandedTracePointIds: {
      id: [...profile.expandedTracePointIds]
    }
  }
}

export function profileFromXmlShape(
  shape: TraceProfileXmlShape,
  projectPath: string
): TraceProfile {
  const name = String(shape.name || '').trim() || DEFAULT_PROFILE_NAME
  const nodes = asArray(shape.tracePointNodes?.tracePointNode).map((n) =>
    nodeFromXml(n, projectPath)
  )
  const expandedTracePointIds = asArray(shape.expandedTracePointIds?.id).map(String).filter(Boolean)
  return { name, tracePointNodes: nodes, expandedTracePointIds }
}

export function exportSingleProfileXml(
  profileName: string,
  nodes: TracePointNode[],
  expandedIds: Iterable<string>
): string {
  const obj = {
    [ROOT_SINGLE]: {
      name: profileName,
      tracePointNodes: {
        tracePointNode: nodes.map((n) => nodeToXml(n, undefined))
      },
      expandedTracePointIds: {
        id: [...expandedIds]
      }
    }
  }
  return serializeXml(obj)
}

export function exportAllProfilesXml(profiles: TraceProfile[], activeProfileName: string): string {
  const obj = {
    [ROOT_MULTI]: {
      activeProfileName,
      traceProfile: profiles.map((p) => profileToXmlShape(p))
    }
  }
  return serializeXml(obj)
}

export function parseExportXml(xml: string, projectPath: string): ParsedSingle | ParsedMulti {
  const parsed = parseXml(xml)
  if (parsed[ROOT_SINGLE]) {
    return parseSingle(parsed[ROOT_SINGLE], projectPath)
  }
  if (parsed[ROOT_MULTI]) {
    return parseMulti(parsed[ROOT_MULTI], projectPath)
  }
  throw new Error(`Invalid file – root element must be <${ROOT_SINGLE}> or <${ROOT_MULTI}>`)
}

export function parseSingle(root: TraceProfileXmlShape, projectPath: string): ParsedSingle {
  const profileName = String(root.name || '').trim() || undefined
  const nodes = asArray(root.tracePointNodes?.tracePointNode).map((n) =>
    nodeFromXml(n, projectPath)
  )
  const expandedIds = asArray(root.expandedTracePointIds?.id).map(String).filter(Boolean)
  return { profileName, nodes, expandedIds }
}

export function parseMulti(
  root: {
    activeProfileName?: string
    traceProfile?: TraceProfileXmlShape | TraceProfileXmlShape[]
  },
  projectPath: string
): ParsedMulti {
  const profiles = asArray(root.traceProfile).map((p) => profileFromXmlShape(p, projectPath))
  if (profiles.length === 0) {
    throw new Error(`No <${ROOT_SINGLE}> elements found`)
  }
  const activeProfileName = String(root.activeProfileName || '').trim() || undefined
  return { activeProfileName, profiles }
}

export function isParsedSingle(value: ParsedSingle | ParsedMulti): value is ParsedSingle {
  return 'nodes' in value
}
