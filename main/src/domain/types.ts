/*
 * Copyright (C) 2025-2026 Code Trace Tree Contributors
 *
 * SPDX-License-Identifier: MIT
 */
export type NodeListenerEventType = 'refresh' | 'update-description'

export type NodeListener = (nodes: Set<TracePointNode | null> | null) => void

export type ProfileListener = () => void

export type TraceType = 'LINE' | 'FILE' | 'DIRECTORY'

/** Where Agent Notes writes traces when enabled. Storage value CLAUDE migrates to AGENT. */
export type ClaudeAssistTarget = 'CURRENT' | 'AGENT'

export interface TracePoint {
  traceName: string
  traceType: TraceType
  baseName: string
  /** Relative to project root. */
  tracePath: string
  /** LINE only; 0 for FILE/DIRECTORY. */
  lineNumber: number

  /** Runtime-only: workspace root; not persisted to XML. */
  projectPath: string

  /** LINE only. */
  lineContent?: string | null
  /** Runtime-only: recomputed on load; not persisted to XML. */
  isValid: boolean
  totalOccurrences: number
  occurrenceIndex: number

  description?: string
}

export interface TracePointNode {
  id: string
  tracePoint: TracePoint
  parentId?: string
  children: TracePointNode[]
}

export interface TraceProfile {
  name: string
  tracePointNodes: TracePointNode[]
  expandedTracePointIds: string[]
}

export interface ProjectDocument {
  version: number
  projectId: string
  path: string
  updatedAt: number
  profiles: TraceProfile[]
  activeProfileName: string
  descriptionAreaOpened: boolean
  highlightingEnabled: boolean
  namePromptEnabled: boolean
  claudeAssistEnabled: boolean
  claudeAssistTarget: ClaudeAssistTarget
  /** Absolute path of the XML file this document is bound to. */
  storageFile?: string
}

/** XML-friendly node shape for fast-xml-parser build/parse. */
export interface TracePointNodeXml {
  id: string
  parentId: string
  tracePoint: {
    traceName?: string
    traceType?: string
    baseName?: string
    tracePath?: string
    /** @deprecated legacy field */
    name?: string
    /** @deprecated legacy field */
    fileName?: string
    /** @deprecated legacy field */
    filePath?: string
    lineNumber?: number | string
    lineContent?: string
    totalOccurrences?: number | string
    occurrenceIndex?: number | string
    description?: string
  }
  children?: {
    tracePointNode: TracePointNodeXml | TracePointNodeXml[]
  }
}

export interface TraceProfileXmlShape {
  name: string
  tracePointNodes?: {
    tracePointNode?: TracePointNodeXml | TracePointNodeXml[]
  }
  expandedTracePointIds?: {
    id?: string | string[]
  }
}
