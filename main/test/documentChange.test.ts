/*
 * Copyright (C) 2025-2026 Code Trace Tree Contributors
 *
 * SPDX-License-Identifier: MIT
 */
import * as assert from 'assert'
import {
  applyTypingLineShift,
  shouldContentRebindDocumentChange
} from '../src/domain/documentChange'
import { applyLineRebind } from '../src/domain/lineRebind'
import { tip } from './helpers/anchors'

describe('external editor / bulk rewrite → content rebind', () => {
  it('content-rebinds a full document replace (disk reload)', () => {
    const newText = 'alpha\nbeta\n'
    assert.strictEqual(
      shouldContentRebindDocumentChange(
        [{ rangeOffset: 0, rangeLength: 20, startLine: 0, endLine: 3, text: newText }],
        newText.length
      ),
      true
    )
  })

  it('content-rebinds a multi-span change', () => {
    assert.strictEqual(
      shouldContentRebindDocumentChange(
        [
          { rangeOffset: 0, rangeLength: 1, startLine: 0, endLine: 0, text: 'a' },
          { rangeOffset: 4, rangeLength: 1, startLine: 1, endLine: 1, text: 'b' }
        ],
        10
      ),
      true
    )
  })

  it('content-rebinds a multi-line insert from offset 0 (agent rewrite)', () => {
    assert.strictEqual(
      shouldContentRebindDocumentChange(
        [{ rangeOffset: 0, rangeLength: 0, startLine: 0, endLine: 0, text: 'one\ntwo\nthree\n' }],
        14
      ),
      true
    )
  })

  it('does not content-rebind a single-line type in the middle of the file', () => {
    assert.strictEqual(
      shouldContentRebindDocumentChange(
        [{ rangeOffset: 40, rangeLength: 0, startLine: 4, endLine: 4, text: 'x' }],
        50
      ),
      false
    )
  })

  it('after an external rewrite, unique content is rebound to the new line', () => {
    const before = tip({ lineNumber: 2, lineContent: 'target()' })
    const afterDisk = ['header()', 'other()', 'target()']
    const rebound = applyLineRebind(before, afterDisk)
    assert.strictEqual(rebound.lineNumber, 3)
    assert.strictEqual(rebound.isValid, true)
  })
})

describe('typing in the editor updates LINE index', () => {
  it('shifts the tip down when Enter is pressed at the start of the tip line', () => {
    const lines = ['', 'target()', 'tail()']
    const result = applyTypingLineShift(
      tip({ lineNumber: 1, lineContent: 'target()', totalOccurrences: 1, occurrenceIndex: 1 }),
      lines,
      1,
      1,
      true
    )
    assert.strictEqual(result.kind, 'update')
    if (result.kind === 'update') {
      assert.strictEqual(result.tip.lineNumber, 2)
      assert.strictEqual(result.tip.lineContent, 'target()')
      assert.strictEqual(result.tip.isValid, true)
    }
  })

  it('updates lineContent when the user edits the tip line', () => {
    const lines = ['target(1)', 'tail()']
    const result = applyTypingLineShift(
      tip({ lineNumber: 1, lineContent: 'target()', totalOccurrences: 1, occurrenceIndex: 1 }),
      lines,
      0,
      1,
      false
    )
    assert.strictEqual(result.kind, 'update')
    if (result.kind === 'update') {
      assert.strictEqual(result.tip.lineNumber, 1)
      assert.strictEqual(result.tip.lineContent, 'target(1)')
    }
  })

  it('shifts lineNumber when the user inserts a line above the tip', () => {
    const lines = ['new()', 'header()', 'target()']
    const result = applyTypingLineShift(
      tip({ lineNumber: 2, lineContent: 'target()', totalOccurrences: 1, occurrenceIndex: 1 }),
      lines,
      1,
      1,
      false
    )
    assert.strictEqual(result.kind, 'update')
    if (result.kind === 'update') {
      assert.strictEqual(result.tip.lineNumber, 3)
      assert.strictEqual(result.tip.lineContent, 'target()')
      assert.strictEqual(result.tip.isValid, true)
    }
  })

  it('requests a full rebind when a delete above would move the tip before line 1', () => {
    const result = applyTypingLineShift(
      tip({ lineNumber: 2, lineContent: 'target()' }),
      ['target()'],
      -3,
      1,
      false
    )
    assert.strictEqual(result.kind, 'rebind-all')
  })

  it('revives an invalid tip when the stored line matches again', () => {
    const result = applyTypingLineShift(
      tip({ lineNumber: 1, lineContent: 'target()', isValid: false }),
      ['target()'],
      0,
      2,
      false
    )
    assert.strictEqual(result.kind, 'update')
    if (result.kind === 'update') {
      assert.strictEqual(result.tip.isValid, true)
    }
  })

  it('ignores typing on a later line that does not affect the tip', () => {
    const result = applyTypingLineShift(
      tip({ lineNumber: 1, lineContent: 'target()' }),
      ['target()', 'changed()'],
      0,
      2,
      false
    )
    assert.strictEqual(result.kind, 'skip')
  })
})
