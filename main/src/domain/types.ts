export type NodeListenerEventType = 'refresh' | 'update-description'

export type NodeListener = (nodes: Set<TracePointNode | null> | null) => void

export interface TracePoint {
  name: string
  fileName: string
  filePath: string
  lineNumber: number

  projectPath: string

  lineContent?: string
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

export interface TracePointState {
  tracePointNodes: TracePointNode[]
  expandedTracePointIds: string[]
  highlightingEnabled: boolean
}

export interface TracePointNodeExport {
  id: string
  tracePoint: TracePoint
  parentId?: string
  children: {
    tracePointNode: TracePointNodeExport[]
  }
}

export interface TracePointExportState {
  tracePointState: {
    tracePointNodes: {
      tracePointNode: TracePointNodeExport[]
    }
    expandedTracePointIds: {
      id: string[]
    }
  }
}
