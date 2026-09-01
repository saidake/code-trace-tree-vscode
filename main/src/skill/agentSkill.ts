/*
 * Copyright (C) 2025-2026 Code Trace Tree Contributors
 *
 * SPDX-License-Identifier: MIT
 */
import { spawnSync } from 'child_process'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'

export const SKILL_FOLDER_NAME = 'code-trace-tree'

export type AgentSkillNoticeStatus = 'dismissed' | 'installed'

export type AgentSkillState = 'missing' | 'outdated' | 'latest' | 'newer'

export interface AgentDef {
  id: string
  label: string
  /** Directory under the user home that indicates the agent is installed. */
  homeMarker: string
  /** Skills directory relative to the user home (global). */
  globalSkillsRel: string
}

export const AGENT_DEFS: readonly AgentDef[] = [
  { id: 'claude-code', label: 'Claude Code', homeMarker: '.claude', globalSkillsRel: path.join('.claude', 'skills') },
  { id: 'cursor', label: 'Cursor', homeMarker: '.cursor', globalSkillsRel: path.join('.cursor', 'skills') },
  { id: 'github-copilot', label: 'GitHub Copilot', homeMarker: '.copilot', globalSkillsRel: path.join('.copilot', 'skills') },
  { id: 'codex', label: 'Codex', homeMarker: '.agents', globalSkillsRel: path.join('.agents', 'skills') },
  { id: 'gemini-cli', label: 'Gemini CLI', homeMarker: '.gemini', globalSkillsRel: path.join('.gemini', 'skills') }
]

export interface AgentSkillStatus {
  id: string
  label: string
  detected: boolean
  skillsDir: string
  installedVersion?: string
  state: AgentSkillState
}

export interface PythonStatus {
  ready: boolean
  command?: string
  version?: string
}

export function parseSkillVersion(skillMd: string): string | undefined {
  const fm = skillMd.match(/^---\r?\n([\s\S]*?)\r?\n---/)
  if (!fm) return undefined
  const m = fm[1].match(/^version:\s*['"]?([0-9]+(?:\.[0-9]+)*)['"]?\s*$/m)
  return m?.[1]
}

/** Negative if a < b, 0 if equal, positive if a > b. Missing/empty is 0.0.0. */
export function compareSkillVersions(a: string | undefined, b: string | undefined): number {
  const pa = parseVersionParts(a)
  const pb = parseVersionParts(b)
  const len = Math.max(pa.length, pb.length)
  for (let i = 0; i < len; i++) {
    const d = (pa[i] || 0) - (pb[i] || 0)
    if (d) return d
  }
  return 0
}

function parseVersionParts(raw: string | undefined): number[] {
  if (!raw || !raw.trim()) return [0]
  return raw
    .trim()
    .split('.')
    .map((p) => {
      const n = parseInt(p, 10)
      return Number.isFinite(n) ? n : 0
    })
}

export function readInstalledSkillVersion(skillDir: string): string | undefined {
  const file = path.join(skillDir, 'SKILL.md')
  if (!fs.existsSync(file) || !fs.statSync(file).isFile()) return undefined
  try {
    return parseSkillVersion(fs.readFileSync(file, 'utf8'))
  } catch {
    return undefined
  }
}

export function resolveBundledSkillDir(extensionPath: string): string | undefined {
  const candidates = [
    path.join(extensionPath, 'skills', SKILL_FOLDER_NAME),
    path.join(extensionPath, '..', 'skills', SKILL_FOLDER_NAME)
  ]
  for (const dir of candidates) {
    if (fs.existsSync(path.join(dir, 'SKILL.md'))) return dir
  }
  return undefined
}

export function bundledSkillVersion(extensionPath: string): string | undefined {
  const dir = resolveBundledSkillDir(extensionPath)
  if (!dir) return undefined
  try {
    return parseSkillVersion(fs.readFileSync(path.join(dir, 'SKILL.md'), 'utf8'))
  } catch {
    return undefined
  }
}

export function scanAgentStatuses(
  bundledVersion: string,
  homeDir: string = os.homedir()
): AgentSkillStatus[] {
  return AGENT_DEFS.map((def) => {
    const marker = path.join(homeDir, def.homeMarker)
    const skillsDir = path.join(homeDir, def.globalSkillsRel)
    const detected = isDir(marker) || isDir(skillsDir)
    const skillDir = path.join(skillsDir, SKILL_FOLDER_NAME)
    const hasSkill = fs.existsSync(path.join(skillDir, 'SKILL.md'))
    const installedVersion = hasSkill ? readInstalledSkillVersion(skillDir) : undefined
    let state: AgentSkillState = 'missing'
    if (hasSkill) {
      const cmp = compareSkillVersions(installedVersion, bundledVersion)
      state = cmp < 0 ? 'outdated' : cmp > 0 ? 'newer' : 'latest'
    }
    return {
      id: def.id,
      label: def.label,
      detected,
      skillsDir,
      installedVersion,
      state
    }
  })
}

export function shouldOfferSkillNotice(
  bundledVersion: string | undefined,
  statuses: AgentSkillStatus[],
  lastHandledVersion: string | undefined
): boolean {
  if (!bundledVersion) return false
  if (lastHandledVersion && compareSkillVersions(lastHandledVersion, bundledVersion) >= 0) {
    return false
  }
  const detected = statuses.filter((s) => s.detected)
  if (detected.length === 0) return false
  return detected.some((s) => s.state === 'missing' || s.state === 'outdated')
}

export function copySkillDir(src: string, dest: string): void {
  if (!fs.existsSync(path.join(src, 'SKILL.md'))) {
    throw new Error(`Bundled skill is missing SKILL.md at ${src}`)
  }
  if (fs.existsSync(dest)) {
    fs.rmSync(dest, { recursive: true, force: true })
  }
  copyDir(src, dest)
}

export function installSkillForAgents(
  bundledDir: string,
  agentIds: string[],
  homeDir: string = os.homedir()
): { id: string; dest: string }[] {
  const results: { id: string; dest: string }[] = []
  for (const id of agentIds) {
    const def = AGENT_DEFS.find((a) => a.id === id)
    if (!def) continue
    const dest = path.join(homeDir, def.globalSkillsRel, SKILL_FOLDER_NAME)
    copySkillDir(bundledDir, dest)
    results.push({ id, dest })
  }
  return results
}

export function detectPython3(): PythonStatus {
  const candidates: Array<{ cmd: string; args: string[] }> =
    process.platform === 'win32'
      ? [
          { cmd: 'py', args: ['-3'] },
          { cmd: 'python', args: [] },
          { cmd: 'python3', args: [] }
        ]
      : [
          { cmd: 'python3', args: [] },
          { cmd: 'python', args: [] }
        ]
  for (const c of candidates) {
    const r = spawnSync(c.cmd, [...c.args, '--version'], {
      encoding: 'utf8',
      timeout: 5000,
      windowsHide: true
    })
    if (r.error || r.status !== 0) continue
    const text = `${r.stdout || ''} ${r.stderr || ''}`.trim()
    const m = text.match(/Python\s+(3(?:\.\d+)*)/i)
    if (!m) continue
    const command = c.args.length ? `${c.cmd} ${c.args.join(' ')}` : c.cmd
    return { ready: true, command, version: m[1] }
  }
  return { ready: false }
}

function isDir(p: string): boolean {
  try {
    return fs.existsSync(p) && fs.statSync(p).isDirectory()
  } catch {
    return false
  }
}

function copyDir(src: string, dest: string): void {
  fs.mkdirSync(dest, { recursive: true })
  for (const ent of fs.readdirSync(src, { withFileTypes: true })) {
    if (ent.name === '__pycache__' || ent.name.endsWith('.pyc')) continue
    const from = path.join(src, ent.name)
    const to = path.join(dest, ent.name)
    if (ent.isDirectory()) copyDir(from, to)
    else fs.copyFileSync(from, to)
  }
}
