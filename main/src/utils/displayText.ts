/*
 * Copyright (C) 2025-2026 Code Trace Tree Contributors
 *
 * SPDX-License-Identifier: MIT
 */
import { TracePoint } from '../domain/types'

/** Location suffix shown after the purple name (includes leading space via TreeItem.description). */
export function formatLocationSuffix(tp: TracePoint): string {
  const fileName = tp.baseName.includes('/')
    ? tp.baseName.substring(tp.baseName.lastIndexOf('/') + 1)
    : tp.baseName
  switch (tp.traceType) {
    case 'LINE':
      return `(${fileName}:${tp.lineNumber})`
    case 'FILE':
      return `(${fileName})`
    case 'DIRECTORY':
      return `(${fileName}/)`
  }
}

/** Plain display text for clipboard / menus. */
export function formatDisplayText(tp: TracePoint): string {
  return `${tp.traceName} ${formatLocationSuffix(tp)}`
}
