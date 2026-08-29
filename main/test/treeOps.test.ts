/*
 * Copyright (C) 2025-2026 Code Trace Tree Contributors
 *
 * SPDX-License-Identifier: MIT
 */
import * as assert from 'assert'
import {
  moveSiblingsDown,
  moveSiblingsUp,
  pruneInvalidNodes,
  toggleToolbarFlag,
  TreeOpNode
} from '../src/domain/treeOps'

function node(id: string, valid = true, children: TreeOpNode[] = []): TreeOpNode {
  return { id, children, tracePoint: { isValid: valid } }
}

describe('toolbar Move Up / Move Down', () => {
  it('swaps a selected sibling with the one above', () => {
    const siblings = [node('a'), node('b'), node('c')]
    moveSiblingsUp(siblings, new Set(['b']))
    assert.deepStrictEqual(siblings.map((n) => n.id), ['b', 'a', 'c'])
  })

  it('does not swap when the sibling above is also selected', () => {
    const siblings = [node('a'), node('b'), node('c')]
    moveSiblingsUp(siblings, new Set(['a', 'b']))
    assert.deepStrictEqual(siblings.map((n) => n.id), ['a', 'b', 'c'])
  })

  it('swaps a selected sibling with the one below', () => {
    const siblings = [node('a'), node('b'), node('c')]
    moveSiblingsDown(siblings, new Set(['a']))
    assert.deepStrictEqual(siblings.map((n) => n.id), ['b', 'a', 'c'])
  })

  it('does not swap when the sibling below is also selected', () => {
    const siblings = [node('a'), node('b'), node('c')]
    moveSiblingsDown(siblings, new Set(['b', 'c']))
    assert.deepStrictEqual(siblings.map((n) => n.id), ['a', 'b', 'c'])
  })
})

describe('toolbar Remove Invalid', () => {
  it('drops invalid nodes and reparents valid children', () => {
    const child = node('child')
    child.parentId = 'parent'
    const parent = node('parent', false, [child])
    const roots = [parent, node('ok')]
    const removed = pruneInvalidNodes(roots)
    assert.deepStrictEqual(removed, ['parent'])
    assert.deepStrictEqual(roots.map((n) => n.id), ['child', 'ok'])
    assert.strictEqual(child.parentId, undefined)
  })

  it('keeps a valid tree unchanged', () => {
    const roots = [node('a', true, [node('b')])]
    const removed = pruneInvalidNodes(roots)
    assert.deepStrictEqual(removed, [])
    assert.strictEqual(roots[0].id, 'a')
    assert.strictEqual(roots[0].children[0].id, 'b')
  })
})

describe('toolbar toggles', () => {
  it('flips highlight, name-prompt, and description flags independently', () => {
    let flags = {
      highlightingEnabled: true,
      namePromptEnabled: true,
      descriptionAreaOpened: false
    }
    flags = toggleToolbarFlag(flags, 'highlightingEnabled')
    assert.strictEqual(flags.highlightingEnabled, false)
    flags = toggleToolbarFlag(flags, 'namePromptEnabled')
    assert.strictEqual(flags.namePromptEnabled, false)
    flags = toggleToolbarFlag(flags, 'descriptionAreaOpened')
    assert.strictEqual(flags.descriptionAreaOpened, true)
    assert.strictEqual(flags.highlightingEnabled, false)
  })
})
