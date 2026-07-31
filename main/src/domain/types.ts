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
export type NodeListenerEventType = 'refresh' | 'update-description'

export type NodeListener = (nodes: Set<TracePointNode | null> | null) => void

export type ProfileListener = () => void

export interface TracePoint {
  name: string
  fileName: string
  filePath: string
  lineNumber: number

  /** Runtime-only: workspace root; not persisted to XML. */
  projectPath: string

  lineContent?: string
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
  /** Absolute path of the XML file this document is bound to. */
  storageFile?: string
}

/** XML-friendly node shape for fast-xml-parser build/parse. */
export interface TracePointNodeXml {
  id: string
  parentId: string
  tracePoint: {
    name: string
    fileName: string
    filePath: string
    lineNumber: number | string
    lineContent?: string
    totalOccurrences: number | string
    occurrenceIndex: number | string
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
