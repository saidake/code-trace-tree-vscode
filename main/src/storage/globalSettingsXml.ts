/*
 * Copyright (C) 2025-2026 Code Trace Tree Contributors
 *
 * SPDX-License-Identifier: MIT
 */
import * as fs from 'fs'
import * as path from 'path'
import { GLOBAL_SETTINGS_FILE_NAME } from '../domain/constants'
import {
  AdvancedSettings,
  DEFAULT_HIGHLIGHT_DARK,
  DEFAULT_HIGHLIGHT_LIGHT,
  advancedSettingsFromXml,
  defaultAdvancedSettings,
  normalizeHighlightHex
} from '../domain/types'
import { resolveAppDir } from './globalStoragePaths'
import { parseXml, serializeXml } from '../utils/xmlUtils'

export function settingsFilePath(): string {
  return path.join(resolveAppDir(), GLOBAL_SETTINGS_FILE_NAME)
}

export function globalSettingsExist(): boolean {
  const file = settingsFilePath()
  return fs.existsSync(file) && fs.statSync(file).isFile()
}

export function readGlobalSettings(): AdvancedSettings | undefined {
  const file = settingsFilePath()
  if (!fs.existsSync(file) || !fs.statSync(file).isFile()) return undefined
  try {
    const xml = fs.readFileSync(file, 'utf8')
    const parsed = parseXml(xml)
    const root = parsed.settings
    if (!root) return undefined
    return advancedSettingsFromXml(
      root.highlightLineBackground?.light,
      root.highlightLineBackground?.dark
    )
  } catch {
    return undefined
  }
}

/**
 * `settings.xml` if present; else leftover project `<advancedSettings>`; else code defaults.
 * Does not create the file.
 */
export function resolveGlobalSettings(legacy?: AdvancedSettings): AdvancedSettings {
  return readGlobalSettings() ?? legacy ?? defaultAdvancedSettings()
}

/**
 * Ensure `settings.xml` exists (seed from leftover project colors on first create), then write.
 */
export function ensureAndWriteGlobalSettings(
  settings: AdvancedSettings,
  legacy?: AdvancedSettings
): AdvancedSettings {
  const file = settingsFilePath()
  fs.mkdirSync(path.dirname(file), { recursive: true })
  const toWrite = globalSettingsExist()
    ? normalizeSettings(settings)
    : migrateOnCreate(settings, legacy)
  writeAtomic(toWrite, file)
  return toWrite
}

/** First settings.xml: leftover project colors as seed, then overlay dialog values. */
function migrateOnCreate(dialog: AdvancedSettings, legacy?: AdvancedSettings): AdvancedSettings {
  const seeded = legacy ?? defaultAdvancedSettings()
  return {
    highlightLineBackgroundLight:
      normalizeHighlightHex(dialog.highlightLineBackgroundLight) ??
      seeded.highlightLineBackgroundLight,
    highlightLineBackgroundDark:
      normalizeHighlightHex(dialog.highlightLineBackgroundDark) ??
      seeded.highlightLineBackgroundDark
  }
}

function normalizeSettings(settings: AdvancedSettings): AdvancedSettings {
  return {
    highlightLineBackgroundLight:
      normalizeHighlightHex(settings.highlightLineBackgroundLight) ?? DEFAULT_HIGHLIGHT_LIGHT,
    highlightLineBackgroundDark:
      normalizeHighlightHex(settings.highlightLineBackgroundDark) ?? DEFAULT_HIGHLIGHT_DARK
  }
}

function writeAtomic(settings: AdvancedSettings, filePath: string): void {
  const obj = {
    '?xml': { '@_version': '1.0', '@_encoding': 'UTF-8' },
    settings: {
      highlightLineBackground: {
        light: settings.highlightLineBackgroundLight,
        dark: settings.highlightLineBackgroundDark
      }
    }
  }
  const xml = serializeXml(obj)
  const tmp = filePath + '.tmp'
  fs.writeFileSync(tmp, xml, 'utf8')
  try {
    fs.renameSync(tmp, filePath)
  } catch {
    fs.copyFileSync(tmp, filePath)
    fs.unlinkSync(tmp)
  }
}
