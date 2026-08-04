/*
 * Copyright (C) 2025-2026 Code Trace Tree Contributors
 *
 * SPDX-License-Identifier: MIT
 */
import * as fs from 'fs'
import * as path from 'path'
import {
  REFRESH_PROFILE_SUFFIX,
  REFRESH_SUFFIX,
  SELECT_SUFFIX,
  SIGNAL_TTL_MS,
  SIGNALS_DIR_NAME,
  STORAGE_READY_SUFFIX
} from '../domain/constants'
import { resolveAppDir } from './globalStoragePaths'

/**
 * Global agent notify signals under `<appDir>/signals/`.
 *
 * - `<projectId>.request_refresh` — full project reload (all profiles + toolbar flags)
 * - `<projectId>.request_refresh_profile` — one profile; body = profile name
 *   (empty / missing name → active profile). Does not change activeProfileName or flags.
 * - `<projectId>.select_trace_points`
 * - `<projectId>.storage-ready` — Case C bind handshake (no TTL; agent overwrites)
 *
 * Refresh/select files older than SIGNAL_TTL_MS are ignored and deleted so a late
 * IDE open does not replay a stale select/refresh. Fresh refresh/select signals are
 * left in place so every open IDE window for the same projectId can observe them;
 * agents overwrite on the next notify.
 */
export { STORAGE_READY_SUFFIX }

export function signalsDir(): string {
  return path.join(resolveAppDir(), SIGNALS_DIR_NAME)
}

export function ensureSignalsDir(): string {
  const dir = signalsDir()
  fs.mkdirSync(dir, { recursive: true })
  return dir
}

export function refreshFileName(projectId: string): string {
  return `${projectId}${REFRESH_SUFFIX}`
}

export function refreshProfileFileName(projectId: string): string {
  return `${projectId}${REFRESH_PROFILE_SUFFIX}`
}

export function selectFileName(projectId: string): string {
  return `${projectId}${SELECT_SUFFIX}`
}

export function storageReadyFileName(projectId: string): string {
  return `${projectId}${STORAGE_READY_SUFFIX}`
}

export function refreshPath(projectId: string): string {
  return path.join(signalsDir(), refreshFileName(projectId))
}

export function refreshProfilePath(projectId: string): string {
  return path.join(signalsDir(), refreshProfileFileName(projectId))
}

export function selectPath(projectId: string): string {
  return path.join(signalsDir(), selectFileName(projectId))
}

export function storageReadyPath(projectId: string): string {
  return path.join(signalsDir(), storageReadyFileName(projectId))
}

/** Parse projectId from `<projectId>.storage-ready`; undefined if not that pattern. */
export function projectIdFromStorageReadyFileName(fileName: string): string | undefined {
  if (!fileName.endsWith(STORAGE_READY_SUFFIX)) return undefined
  const id = fileName.slice(0, -STORAGE_READY_SUFFIX.length)
  return id || undefined
}

/** First non-empty trimmed line of a profile-refresh signal (may be ""). */
export function readProfileRefreshName(filePath: string): string {
  try {
    const line = fs
      .readFileSync(filePath, 'utf8')
      .split(/\r?\n/)
      .map((l) => l.trim())
      .find(Boolean)
    return line || ''
  } catch {
    return ''
  }
}

export function deleteQuietly(filePath: string): void {
  try {
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath)
  } catch {
    // ignore
  }
}

export function exists(filePath: string): boolean {
  try {
    return fs.existsSync(filePath) && fs.statSync(filePath).isFile()
  } catch {
    return false
  }
}

/**
 * Returns true when path exists and is within TTL.
 * Stale files are deleted and yield false.
 * Do not use for storage-ready (no TTL).
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
