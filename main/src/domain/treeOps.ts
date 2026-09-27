/*
 * Copyright (C) 2025-2026 Code Trace Tree Contributors
 *
 * SPDX-License-Identifier: MIT
 */

export interface TreeOpNode<T = unknown> {
  id: string
  parentId?: string
  children: TreeOpNode<T>[]
  tracePoint: T & { isValid: boolean }
}

/** Toolbar Move Up: swap each selected node with the sibling above, unless that sibling is also selected. */
export function moveSiblingsUp<T extends { id: string }>(
  siblings: T[],
  selectedIds: Set<string>
): void {
  const ordered = siblings
    .filter((n) => selectedIds.has(n.id))
    .sort((a, b) => siblings.indexOf(a) - siblings.indexOf(b))
  for (const node of ordered) {
    const index = siblings.indexOf(node)
    if (index > 0 && !selectedIds.has(siblings[index - 1].id)) {
      ;[siblings[index], siblings[index - 1]] = [siblings[index - 1], siblings[index]]
    }
  }
}

/** Toolbar Move Down: swap each selected node with the sibling below, unless that sibling is also selected. */
export function moveSiblingsDown<T extends { id: string }>(
  siblings: T[],
  selectedIds: Set<string>
): void {
  const ordered = siblings
    .filter((n) => selectedIds.has(n.id))
    .sort((a, b) => siblings.indexOf(b) - siblings.indexOf(a))
  for (const node of ordered) {
    const index = siblings.indexOf(node)
    if (index >= 0 && index < siblings.length - 1 && !selectedIds.has(siblings[index + 1].id)) {
      ;[siblings[index], siblings[index + 1]] = [siblings[index + 1], siblings[index]]
    }
  }
}

/**
 * Toolbar Remove Invalid: drop invalid nodes; valid children are reparented in place.
 * @returns removed ids
 */
export function pruneInvalidNodes<T extends TreeOpNode>(
  nodes: T[],
  parentId?: string
): string[] {
  const removed: string[] = []
  for (let i = nodes.length - 1; i >= 0; i--) {
    const node = nodes[i]
    removed.push(...pruneInvalidNodes(node.children as T[], node.id))
    if (!node.tracePoint.isValid) {
      removed.push(node.id)
      for (const child of node.children) {
        child.parentId = parentId
      }
      nodes.splice(i, 1, ...(node.children as T[]))
    }
  }
  return removed
}

/**
 * Drag-and-drop: keep only selection roots — selected nodes with no selected ancestor.
 * Moving a parent already moves its descendants; re-moving nested selections would flatten the tree.
 */
export function selectionRoots(
  selectedIds: Iterable<string>,
  parentIdOf: (id: string) => string | undefined
): string[] {
  const selected = selectedIds instanceof Set ? selectedIds : new Set(selectedIds)
  const roots: string[] = []
  for (const id of selected) {
    let parentId = parentIdOf(id)
    let hasSelectedAncestor = false
    while (parentId) {
      if (selected.has(parentId)) {
        hasSelectedAncestor = true
        break
      }
      parentId = parentIdOf(parentId)
    }
    if (!hasSelectedAncestor) roots.push(id)
  }
  return roots
}

export interface ToolbarFlags {
  highlightingEnabled: boolean
  namePromptEnabled: boolean
  descriptionAreaOpened: boolean
}

export function toggleToolbarFlag(
  flags: ToolbarFlags,
  key: keyof ToolbarFlags
): ToolbarFlags {
  return { ...flags, [key]: !flags[key] }
}
