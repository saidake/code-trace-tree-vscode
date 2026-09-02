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
import { AgentSkillNoticeStatus } from '../skill/agentSkill'

export interface GlobalSettingsFile {
  highlightLineBackgroundLight: string
  highlightLineBackgroundDark: string
  agentSkillVersion?: string
  agentSkillNoticeStatus?: AgentSkillNoticeStatus
}

export function settingsFilePath(): string {
  return path.join(resolveAppDir(), GLOBAL_SETTINGS_FILE_NAME)
}

export function globalSettingsExist(): boolean {
  const file = settingsFilePath()
  return fs.existsSync(file) && fs.statSync(file).isFile()
}

export function readGlobalSettingsFile(): GlobalSettingsFile | undefined {
  const file = settingsFilePath()
  if (!fs.existsSync(file) || !fs.statSync(file).isFile()) return undefined
  try {
    return parseGlobalSettingsXml(fs.readFileSync(file, 'utf8'))
  } catch {
    return undefined
  }
}

export function parseGlobalSettingsXml(xml: string): GlobalSettingsFile | undefined {
  const parsed = parseXml(xml)
  const root = parsed.settings
  if (!root) return undefined
  const colors = advancedSettingsFromXml(
    xmlText(root.highlightLineBackground?.light),
    xmlText(root.highlightLineBackground?.dark)
  )
  const skill = root.agentSkill
  const version = xmlText(skill?.version)?.trim() || undefined
  const statusRaw = xmlText(skill?.noticeStatus)?.trim()
  const status: AgentSkillNoticeStatus | undefined =
    statusRaw === 'dismissed' || statusRaw === 'opened'
      ? statusRaw
      : statusRaw === 'installed'
        ? 'opened'
        : undefined
  return {
    highlightLineBackgroundLight: colors.highlightLineBackgroundLight,
    highlightLineBackgroundDark: colors.highlightLineBackgroundDark,
    agentSkillVersion: version,
    agentSkillNoticeStatus: status
  }
}

export function serializeGlobalSettingsXml(doc: GlobalSettingsFile): string {
  const settings: Record<string, unknown> = {
    highlightLineBackground: {
      light: doc.highlightLineBackgroundLight,
      dark: doc.highlightLineBackgroundDark
    }
  }
  if (doc.agentSkillVersion || doc.agentSkillNoticeStatus) {
    const agentSkill: Record<string, string> = {}
    if (doc.agentSkillVersion) agentSkill.version = doc.agentSkillVersion
    if (doc.agentSkillNoticeStatus) agentSkill.noticeStatus = doc.agentSkillNoticeStatus
    settings.agentSkill = agentSkill
  }
  return serializeXml({
    '?xml': { '@_version': '1.0', '@_encoding': 'UTF-8' },
    settings
  })
}

export function readGlobalSettings(): AdvancedSettings | undefined {
  const doc = readGlobalSettingsFile()
  if (!doc) return undefined
  return {
    highlightLineBackgroundLight: doc.highlightLineBackgroundLight,
    highlightLineBackgroundDark: doc.highlightLineBackgroundDark
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
 * Preserves agent-skill notice fields when the file already exists.
 */
export function ensureAndWriteGlobalSettings(
  settings: AdvancedSettings,
  legacy?: AdvancedSettings
): AdvancedSettings {
  const existing = readGlobalSettingsFile()
  const colors = existing
    ? normalizeSettings(settings)
    : migrateOnCreate(settings, legacy)
  writeGlobalSettingsFile({
    ...colors,
    agentSkillVersion: existing?.agentSkillVersion,
    agentSkillNoticeStatus: existing?.agentSkillNoticeStatus
  })
  return colors
}

/** Persist skill-notice state. Creates `settings.xml` if needed (seeds colors). */
export function upsertAgentSkillNotice(
  version: string,
  status: AgentSkillNoticeStatus,
  colorSeed: AdvancedSettings
): void {
  const existing = readGlobalSettingsFile()
  const colors = existing
    ? {
        highlightLineBackgroundLight: existing.highlightLineBackgroundLight,
        highlightLineBackgroundDark: existing.highlightLineBackgroundDark
      }
    : normalizeSettings(colorSeed)
  writeGlobalSettingsFile({
    ...colors,
    agentSkillVersion: version,
    agentSkillNoticeStatus: status
  })
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

function writeGlobalSettingsFile(doc: GlobalSettingsFile): void {
  const filePath = settingsFilePath()
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  const xml = serializeGlobalSettingsXml(doc)
  const tmp = filePath + '.tmp'
  fs.writeFileSync(tmp, xml, 'utf8')
  try {
    fs.renameSync(tmp, filePath)
  } catch {
    fs.copyFileSync(tmp, filePath)
    fs.unlinkSync(tmp)
  }
}

function xmlText(value: unknown): string | undefined {
  if (value == null) return undefined
  if (typeof value === 'string' || typeof value === 'number') return String(value)
  if (typeof value === 'object' && value !== null && '#text' in value) {
    return String((value as { '#text': unknown })['#text'])
  }
  return undefined
}
