/*
 * Copyright (C) 2025-2026 Code Trace Tree Contributors
 *
 * SPDX-License-Identifier: MIT
 */
import * as fs from 'fs'
import * as path from 'path'
import {
  REFRESH_SUFFIX,
  SELECT_SUFFIX,
  SIGNAL_TTL_MS,
  SIGNALS_DIR_NAME
} from '../domain/constants'
import { resolveAppDir } from './globalStoragePaths'

/**
 * Global agent notify signals under `<appDir>/signals/`.
 *
 * - `<projectId>.request_refresh`
 * - `<projectId>.select_trace_points`
 *
 * Files older than SIGNAL_TTL_MS are ignored and deleted so a late IDE open does
 * not replay a stale select/refresh. Fresh signals are left in place so every
 * open IDE window for the same projectId can observe them; agents overwrite on
 * the next notify.
 */
export function signalsDir(): string {
  return path.join(resolveAppDir(), SIGNALS_DIR_NAME)
}

export function refreshFileName(projectId: string): string {
  return `${projectId}${REFRESH_SUFFIX}`
}

export function selectFileName(projectId: string): string {
  return `${projectId}${SELECT_SUFFIX}`
}

export function refreshPath(projectId: string): string {
  return path.join(signalsDir(), refreshFileName(projectId))
}

export function selectPath(projectId: string): string {
  return path.join(signalsDir(), selectFileName(projectId))
}

export function deleteQuietly(filePath: string): void {
  try {
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath)
  } catch {
    // ignore
  }
}

/**
 * Returns true when path exists and is within TTL.
 * Stale files are deleted and yield false.
 */
export function isFresh(filePath: string): boolean {
  try {
    if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) return false
    const ageMs = Date.now() - fs.statSync(filePath).mtimeMs
    if (ageMs > SIGNAL_TTL_MS) {
      deleteQuietly(filePath)
      return false
    }
    return true
  } catch {
    deleteQuietly(filePath)
    return false
  }
}
