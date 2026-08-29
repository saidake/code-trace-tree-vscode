/*
 * Copyright (C) 2025-2026 Code Trace Tree Contributors
 *
 * SPDX-License-Identifier: MIT
 */

/** LINE-tip fields used by rebind and typing-shift (no vscode dependency). */
export interface LineAnchor {
  lineNumber: number
  lineContent?: string | null
  isValid: boolean
  totalOccurrences: number
  occurrenceIndex: number
}

export function matchingLineNumbers(lines: string[], content: string): number[] {
  const matches: number[] = []
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].trim() === content) matches.push(i + 1)
  }
  return matches
}
