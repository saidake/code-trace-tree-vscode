/*
 * Copyright (C) 2025-2026 Code Trace Tree Contributors
 *
 * SPDX-License-Identifier: MIT
 */
import { LineAnchor } from '../src/domain/lineAnchor'

export function tip(partial: Partial<LineAnchor> & Pick<LineAnchor, 'lineNumber'>): LineAnchor {
  return {
    lineContent: 'target()',
    isValid: true,
    totalOccurrences: 1,
    occurrenceIndex: 1,
    ...partial
  }
}
