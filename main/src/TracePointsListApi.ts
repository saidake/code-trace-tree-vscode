/*
 * Copyright (C) 2025-2026 Code Trace Tree Contributors
 *
 * SPDX-License-Identifier: MIT
 */
import { TracePointNode } from './domain/types'

/** Sidebar list facade replacing TreeView reveal/selection/expand. */
export interface TracePointsListApi {
  selectAndReveal(
    ids: string[],
    options?: { expand?: boolean; focus?: boolean }
  ): Promise<void>
  expandParents(parents: Iterable<TracePointNode | null>): Promise<void>
  expandSelectedRecursively(): Promise<void>
  collapseAll(): Promise<void>
  /** Push current visible rows to the webview (full sync of the visible list). */
  sync(): void
}

/** One visible row in the Trace Points webview list. */
export interface TracePointsListRow {
  id: string
  label: string
  description: string
  /** Full display text for hover tooltip when the row is truncated. */
  tooltip: string
  depth: number
  hasChildren: boolean
  expanded: boolean
  selected: boolean
  valid: boolean
  traceType: 'LINE' | 'FILE' | 'DIRECTORY'
}
