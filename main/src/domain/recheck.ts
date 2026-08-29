/*
 * Copyright (C) 2025-2026 Code Trace Tree Contributors
 *
 * SPDX-License-Identifier: MIT
 */
import { LineAnchor } from './lineAnchor'
import { applyLineRebind, pathTraceIsValid } from './lineRebind'

export type RecheckKind = 'LINE' | 'FILE' | 'DIRECTORY'

export interface RecheckFileState {
  exists: boolean
  isDirectory: boolean
  /** Present when the path exists as a file (LINE rebind / Recheck / file open). */
  lines?: string[]
}

/**
 * Toolbar Recheck / load validate: LINE uses content rebind; FILE/DIRECTORY use path kind.
 * File-open and external-editor reload use the same LINE path with the current buffer.
 */
export function recheckTrace(kind: RecheckKind, tip: LineAnchor, file: RecheckFileState): LineAnchor {
  if (kind === 'LINE') {
    if (!file.exists || file.isDirectory || !file.lines) {
      return { ...tip, isValid: false, totalOccurrences: 0, occurrenceIndex: 0 }
    }
    return applyLineRebind(tip, file.lines)
  }
  return {
    ...tip,
    isValid: pathTraceIsValid(kind, file.exists, file.isDirectory),
    totalOccurrences: 0,
    occurrenceIndex: 0
  }
}
