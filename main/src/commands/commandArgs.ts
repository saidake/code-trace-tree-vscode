/*
 * Copyright (C) 2025-2026 Code Trace Tree Contributors
 *
 * SPDX-License-Identifier: MIT
 */
import * as vscode from 'vscode'
import { TracePointService } from '../TracePointService'

/** Resolve node ids from a webview string arg, legacy TreeItem, or current selection. */
export function resolveTracePointCommandIds(
  service: TracePointService,
  arg?: string | vscode.TreeItem
): string[] {
  if (typeof arg === 'string' && arg) return [arg]
  if (arg && typeof arg === 'object' && arg.id) {
    const id = service.resolveNodeId(arg.id)
    return id ? [id] : []
  }
  return service.getSelectedTracePointIds()
}
