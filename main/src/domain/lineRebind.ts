/*
 * Copyright (C) 2025-2026 Code Trace Tree Contributors
 *
 * SPDX-License-Identifier: MIT
 */
import { LineAnchor, matchingLineNumbers } from './lineAnchor'

/**
 * Content-based LINE rebind (file open, Recheck, external reload).
 * 1 exact line, 2 unique content, 3 stable occurrence, 4 nearest match, else invalid.
 */
export function applyLineRebind<T extends LineAnchor>(tp: T, lines: string[]): T {
  const content = tp.lineContent?.trim()
  if (!content) {
    return { ...tp, isValid: false, totalOccurrences: 0, occurrenceIndex: 0 }
  }
  const matches = matchingLineNumbers(lines, content)
  const total = matches.length
  if (total === 0) {
    return { ...tp, isValid: false, totalOccurrences: 0, occurrenceIndex: 0 }
  }
  const oldLine = tp.lineNumber
  let newLine: number
  let newIndex: number
  if (oldLine >= 1 && oldLine <= lines.length && lines[oldLine - 1].trim() === content) {
    newLine = oldLine
    newIndex = matches.indexOf(oldLine) + 1
  } else if (total === 1) {
    newLine = matches[0]
    newIndex = 1
  } else if (
    total === tp.totalOccurrences &&
    tp.occurrenceIndex >= 1 &&
    tp.occurrenceIndex <= total
  ) {
    newLine = matches[tp.occurrenceIndex - 1]
    newIndex = tp.occurrenceIndex
  } else {
    newLine = matches.reduce((best, n) =>
      Math.abs(n - oldLine) < Math.abs(best - oldLine) ? n : best
    )
    newIndex = matches.indexOf(newLine) + 1
  }
  return {
    ...tp,
    lineNumber: newLine,
    totalOccurrences: total,
    occurrenceIndex: newIndex,
    isValid: true
  }
}

/** FILE exists and is not a directory; DIRECTORY exists and is a directory. */
export function pathTraceIsValid(
  kind: 'FILE' | 'DIRECTORY',
  exists: boolean,
  isDirectory: boolean
): boolean {
  if (!exists) return false
  return kind === 'DIRECTORY' ? isDirectory : !isDirectory
}
