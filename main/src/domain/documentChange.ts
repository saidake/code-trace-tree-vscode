/*
 * Copyright (C) 2025-2026 Code Trace Tree Contributors
 *
 * SPDX-License-Identifier: MIT
 */
import { LineAnchor, matchingLineNumbers } from './lineAnchor'

export interface DocumentChangeShape {
  rangeOffset: number
  rangeLength: number
  startLine: number
  endLine: number
  text: string
}

/** Bulk / agent rewrite from file start — offset math would collapse tips to line 1. */
export function shouldContentRebindDocumentChange(
  changes: DocumentChangeShape[],
  newDocumentLength: number
): boolean {
  if (changes.length !== 1) return changes.length > 1
  const change = changes[0]
  if (change.rangeOffset !== 0) return false
  const oldLen = newDocumentLength - change.text.length + change.rangeLength
  if (oldLen > 0 && change.rangeLength === oldLen) return true
  const oldLineSpan = change.endLine - change.startLine
  const newLineBreaks = (change.text.match(/\r?\n/g) ?? []).length
  return oldLineSpan >= 1 || newLineBreaks >= 2
}

export type TypingShiftResult<T extends LineAnchor> =
  | { kind: 'rebind-all' }
  | { kind: 'update'; tip: T }
  | { kind: 'skip' }

/**
 * Incremental typing: Enter at line start, edit on the tip line, or insert/delete above.
 */
export function applyTypingLineShift<T extends LineAnchor>(
  tp: T,
  newLines: string[],
  lineOffset: number,
  changedLine: number,
  isEnterAtLineStart: boolean
): TypingShiftResult<T> {
  if (!tp.isValid) {
    const valid = newLines[tp.lineNumber - 1]?.trim() === tp.lineContent?.trim()
    if (valid) return { kind: 'update', tip: { ...tp, isValid: true } }
    return { kind: 'skip' }
  }

  if (tp.lineNumber === changedLine && isEnterAtLineStart && lineOffset > 0) {
    const newLineNumber = tp.lineNumber + lineOffset
    const content = tp.lineContent?.trim() ?? ''
    const matches = matchingLineNumbers(newLines, content)
    const occIdx = matches.indexOf(newLineNumber) + 1
    return {
      kind: 'update',
      tip: {
        ...tp,
        lineNumber: newLineNumber,
        isValid: occIdx > 0,
        totalOccurrences: matches.length,
        occurrenceIndex: occIdx >= 0 ? occIdx : 0
      }
    }
  }

  if (tp.lineNumber === changedLine && lineOffset === 0) {
    const newContent = newLines[tp.lineNumber - 1]?.trim() ?? null
    const matches = matchingLineNumbers(newLines, newContent ?? '')
    const occIdx =
      newContent === tp.lineContent ? tp.occurrenceIndex : matches.indexOf(changedLine) + 1
    return {
      kind: 'update',
      tip: {
        ...tp,
        lineContent: newContent ?? '',
        isValid: newContent !== null,
        totalOccurrences: matches.length,
        occurrenceIndex: occIdx >= 0 ? occIdx : 0
      }
    }
  }

  if (tp.lineNumber > changedLine && lineOffset !== 0) {
    const newLineNumber = tp.lineNumber + lineOffset
    if (newLineNumber < 1) return { kind: 'rebind-all' }
    const content = tp.lineContent?.trim() ?? ''
    const matches = matchingLineNumbers(newLines, content)
    const occIdx = matches.indexOf(newLineNumber) + 1
    const stillThere = occIdx > 0
    return {
      kind: 'update',
      tip: {
        ...tp,
        lineNumber: stillThere ? newLineNumber : tp.lineNumber,
        isValid: stillThere,
        totalOccurrences: matches.length,
        occurrenceIndex: stillThere ? occIdx : 0
      }
    }
  }

  return { kind: 'skip' }
}
