/*
 * Copyright (C) 2025-2026 Code Trace Tree Contributors
 *
 * SPDX-License-Identifier: MIT
 */
import * as assert from 'assert'
import { applyLineRebind, pathTraceIsValid } from '../src/domain/lineRebind'
import { recheckTrace } from '../src/domain/recheck'
import { tip } from './helpers/anchors'

describe('LINE rebind (file open, Recheck, external editor)', () => {
  it('keeps the tip when the exact line still matches', () => {
    const lines = ['a()', 'target()', 'c()']
    const rebound = applyLineRebind(tip({ lineNumber: 2, lineContent: 'target()' }), lines)
    assert.strictEqual(rebound.lineNumber, 2)
    assert.strictEqual(rebound.isValid, true)
    assert.strictEqual(rebound.occurrenceIndex, 1)
  })

  it('moves the tip when unique content appears elsewhere (file open / disk rewrite)', () => {
    const lines = ['a()', 'b()', 'target()']
    const rebound = applyLineRebind(
      tip({ lineNumber: 2, lineContent: 'target()', totalOccurrences: 1, occurrenceIndex: 1 }),
      lines
    )
    assert.strictEqual(rebound.lineNumber, 3)
    assert.strictEqual(rebound.isValid, true)
    assert.strictEqual(rebound.occurrenceIndex, 1)
  })

  it('uses a stable occurrence index when the same line is duplicated', () => {
    // Old line no longer matches (rule 1), but occurrence count is unchanged (rule 3).
    const lines = ['target()', 'x', 'target()', 'y', 'changed()', 'z', 'target()']
    const rebound = applyLineRebind(
      tip({
        lineNumber: 5,
        lineContent: 'target()',
        totalOccurrences: 3,
        occurrenceIndex: 2
      }),
      lines
    )
    assert.strictEqual(rebound.lineNumber, 3)
    assert.strictEqual(rebound.occurrenceIndex, 2)
    assert.strictEqual(rebound.totalOccurrences, 3)
  })

  it('picks the nearest remaining match when occurrence count changed', () => {
    const lines = ['x', 'target()', 'y', 'target()']
    const rebound = applyLineRebind(
      tip({
        lineNumber: 10,
        lineContent: 'target()',
        totalOccurrences: 1,
        occurrenceIndex: 1
      }),
      lines
    )
    assert.strictEqual(rebound.lineNumber, 4)
    assert.strictEqual(rebound.isValid, true)
  })

  it('marks the tip invalid when content is gone', () => {
    const rebound = applyLineRebind(tip({ lineNumber: 2, lineContent: 'target()' }), ['a()', 'b()'])
    assert.strictEqual(rebound.isValid, false)
    assert.strictEqual(rebound.totalOccurrences, 0)
    assert.strictEqual(rebound.occurrenceIndex, 0)
  })

  it('marks the tip invalid when lineContent is empty', () => {
    const rebound = applyLineRebind(tip({ lineNumber: 1, lineContent: '  ' }), ['target()'])
    assert.strictEqual(rebound.isValid, false)
  })
})

describe('toolbar Recheck (LINE + FILE + DIRECTORY)', () => {
  it('rebinds LINE against current file bytes', () => {
    const result = recheckTrace('LINE', tip({ lineNumber: 1, lineContent: 'target()' }), {
      exists: true,
      isDirectory: false,
      lines: ['a()', 'target()']
    })
    assert.strictEqual(result.lineNumber, 2)
    assert.strictEqual(result.isValid, true)
  })

  it('invalidates LINE when the file is missing', () => {
    const result = recheckTrace('LINE', tip({ lineNumber: 2 }), {
      exists: false,
      isDirectory: false
    })
    assert.strictEqual(result.isValid, false)
  })

  it('accepts FILE when the path is a file and rejects a directory', () => {
    assert.strictEqual(pathTraceIsValid('FILE', true, false), true)
    assert.strictEqual(pathTraceIsValid('FILE', true, true), false)
    assert.strictEqual(pathTraceIsValid('FILE', false, false), false)
  })

  it('accepts DIRECTORY when the path is a directory', () => {
    assert.strictEqual(pathTraceIsValid('DIRECTORY', true, true), true)
    assert.strictEqual(pathTraceIsValid('DIRECTORY', true, false), false)
    const result = recheckTrace('DIRECTORY', tip({ lineNumber: 0, lineContent: null }), {
      exists: true,
      isDirectory: true
    })
    assert.strictEqual(result.isValid, true)
  })
})
