/*
 * Copyright (C) 2025-2026 Code Trace Tree Contributors
 *
 * SPDX-License-Identifier: MIT
 */
export type NodeListenerEventType = 'refresh' | 'update-description'

export type NodeListener = (nodes: Set<TracePointNode | null> | null) => void

export type ProfileListener = () => void

export type TraceType = 'LINE' | 'FILE' | 'DIRECTORY'

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

export interface AdvancedSettings {
  highlightLineBackgroundLight: string
  highlightLineBackgroundDark: string
}

export const DEFAULT_HIGHLIGHT_LIGHT = '#FFFFC8'
export const DEFAULT_HIGHLIGHT_DARK = '#646400'

export function defaultAdvancedSettings(): AdvancedSettings {
  return {
    highlightLineBackgroundLight: DEFAULT_HIGHLIGHT_LIGHT,
    highlightLineBackgroundDark: DEFAULT_HIGHLIGHT_DARK
  }
}

export function isDefaultAdvancedSettings(settings: AdvancedSettings): boolean {
  return (
    normalizeHighlightHex(settings.highlightLineBackgroundLight) === DEFAULT_HIGHLIGHT_LIGHT &&
    normalizeHighlightHex(settings.highlightLineBackgroundDark) === DEFAULT_HIGHLIGHT_DARK
  )
}

export function normalizeHighlightHex(raw: string | undefined | null): string | undefined {
  if (raw == null) return undefined
  const t = String(raw).trim().toUpperCase()
  const withHash = t.startsWith('#') ? t : `#${t}`
  return /^#[0-9A-F]{6}$/.test(withHash) ? withHash : undefined
}

export function advancedSettingsFromXml(
  lightRaw: string | undefined | null,
  darkRaw: string | undefined | null
): AdvancedSettings {
  return {
    highlightLineBackgroundLight:
      normalizeHighlightHex(lightRaw) ?? DEFAULT_HIGHLIGHT_LIGHT,
    highlightLineBackgroundDark: normalizeHighlightHex(darkRaw) ?? DEFAULT_HIGHLIGHT_DARK
  }
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
  advancedSettings: AdvancedSettings
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
