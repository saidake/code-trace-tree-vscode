/*
 * Copyright (C) 2025-2026 Code Trace Tree Contributors
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program. If not, see <https://www.gnu.org/licenses/>.
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
