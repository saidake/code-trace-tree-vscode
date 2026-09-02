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

export type AgentSkillNoticeStatus = 'dismissed' | 'opened'

export type AgentSkillState = 'missing' | 'outdated' | 'latest' | 'newer'

export interface AgentDef {
  id: string
  label: string
  /** Home-relative, `xdg:`-prefixed, or absolute. Detected if any path exists. */
  detect: readonly string[]
  /** Global skills directory (same spec rules as detect). */
  globalSkills: string
}

/** Same agents and global paths as `npx skills` (https://github.com/vercel-labs/skills/blob/main/src/agents.ts). */
export const AGENT_DEFS: readonly AgentDef[] = [
  ag('aider-desk', 'AiderDesk', ['.aider-desk'], '.aider-desk/skills'),
  ag('amp', 'Amp', ['xdg:amp'], 'xdg:agents/skills'),
  ag('antigravity', 'Antigravity', ['.gemini/antigravity'], '.gemini/antigravity/skills'),
  ag('antigravity-cli', 'Antigravity CLI', ['.gemini/antigravity-cli'], '.gemini/antigravity-cli/skills'),
  ag('astrbot', 'AstrBot', ['.astrbot'], '.astrbot/data/skills'),
  ag('autohand-code', 'Autohand Code CLI', ['.autohand'], '.autohand/skills'),
  ag('augment', 'Augment', ['.augment'], '.augment/skills'),
  ag('bob', 'IBM Bob', ['.bob'], '.bob/skills'),
  ag('claude-code', 'Claude Code', ['.claude'], '.claude/skills'),
  ag('openclaw', 'OpenClaw', ['.openclaw', '.clawdbot', '.moltbot'], '.openclaw/skills'),
  ag('cline', 'Cline', ['.cline'], '.agents/skills'),
  ag('codearts-agent', 'CodeArts Agent', ['.codeartsdoer'], '.codeartsdoer/skills'),
  ag('codebuddy', 'CodeBuddy', ['.codebuddy'], '.codebuddy/skills'),
  ag('codemaker', 'Codemaker', ['.codemaker'], '.codemaker/skills'),
  ag('codestudio', 'Code Studio', ['.codestudio'], '.codestudio/skills'),
  ag('codex', 'Codex', ['.codex'], '.codex/skills'),
  ag('command-code', 'Command Code', ['.commandcode'], '.commandcode/skills'),
  ag('continue', 'Continue', ['.continue'], '.continue/skills'),
  ag('cortex', 'Cortex Code', ['.snowflake/cortex'], '.snowflake/cortex/skills'),
  ag('crush', 'Crush', ['.config/crush'], '.config/crush/skills'),
  ag('cursor', 'Cursor', ['.cursor'], '.cursor/skills'),
  ag('deepagents', 'Deep Agents', ['.deepagents'], '.deepagents/agent/skills'),
  ag('devin', 'Devin for Terminal', ['xdg:devin'], 'xdg:devin/skills'),
  ag('dexto', 'Dexto', ['.dexto'], '.agents/skills'),
  ag('droid', 'Droid', ['.factory'], '.factory/skills'),
  ag('firebender', 'Firebender', ['.firebender'], '.firebender/skills'),
  ag('forgecode', 'ForgeCode', ['.forge'], '.forge/skills'),
  ag('gemini-cli', 'Gemini CLI', ['.gemini'], '.gemini/skills'),
  ag('github-copilot', 'GitHub Copilot', ['.copilot'], '.copilot/skills'),
  ag('goose', 'Goose', ['xdg:goose'], 'xdg:goose/skills'),
  ag('grok', 'Grok Build', ['.grok'], '.grok/skills'),
  ag('hermes-agent', 'Hermes Agent', ['.hermes'], '.hermes/skills'),
  ag('inference-sh', 'inference.sh', ['.inferencesh'], '.inferencesh/skills'),
  ag('jazz', 'Jazz', ['.jazz'], '.jazz/skills'),
  ag('junie', 'Junie', ['.junie'], '.junie/skills'),
  ag('iflow-cli', 'iFlow CLI', ['.iflow'], '.iflow/skills'),
  ag('kilo', 'Kilo Code', ['.kilocode'], '.kilocode/skills'),
  ag('kimchi', 'Kimchi', ['.config/kimchi'], '.config/kimchi/harness/skills'),
  ag('kimi-code-cli', 'Kimi Code CLI', ['.kimi-code', '.kimi'], '.agents/skills'),
  ag('kiro-cli', 'Kiro CLI', ['.kiro'], '.kiro/skills'),
  ag('kode', 'Kode', ['.kode'], '.kode/skills'),
  ag('lingma', 'Lingma', ['.lingma'], '.lingma/skills'),
  ag('loaf', 'Loaf', ['.loaf'], '.agents/skills'),
  ag('mcpjam', 'MCPJam', ['.mcpjam'], '.mcpjam/skills'),
  ag('minimax-code', 'MiniMax Code', ['.minimax'], '.minimax/skills'),
  ag('mistral-vibe', 'Mistral Vibe', ['.vibe'], '.vibe/skills'),
  ag('moxby', 'Moxby', ['.moxby'], '.moxby/skills'),
  ag('mux', 'Mux', ['.mux'], '.mux/skills'),
  ag('opencode', 'OpenCode', ['xdg:opencode'], 'xdg:opencode/skills'),
  ag('openhands', 'OpenHands', ['.openhands'], '.openhands/skills'),
  ag('ona', 'Ona', ['.ona'], '.ona/skills'),
  ag('pi', 'Pi', ['.pi/agent'], '.pi/agent/skills'),
  ag('posit-assistant', 'Posit Assistant', ['.posit/assistant', '.positai'], '.posit/assistant/skills'),
  ag('qoder', 'Qoder', ['.qoder'], '.qoder/skills'),
  ag('qoder-cn', 'Qoder CN', ['.qoder-cn'], '.qoder-cn/skills'),
  ag('qwen-code', 'Qwen Code', ['.qwen'], '.qwen/skills'),
  ag('replit', 'Replit', [], 'xdg:agents/skills'),
  ag('reasonix', 'Reasonix', ['.reasonix'], '.reasonix/skills'),
  ag('rovodev', 'Rovo Dev', ['.rovodev'], '.rovodev/skills'),
  ag('roo', 'Roo Code', ['.roo'], '.roo/skills'),
  ag('tabnine-cli', 'Tabnine CLI', ['.tabnine'], '.tabnine/agent/skills'),
  ag('terramind', 'Terramind', ['.terramind'], '.terramind/skills'),
  ag('tinycloud', 'Tinycloud', ['.tinycloud'], '.tinycloud/skills'),
  ag('trae', 'Trae', ['.trae'], '.trae/skills'),
  ag('trae-cn', 'Trae CN', ['.trae-cn'], '.trae-cn/skills'),
  ag('warp', 'Warp', ['.warp'], '.agents/skills'),
  ag('windsurf', 'Windsurf', ['.codeium/windsurf'], '.codeium/windsurf/skills'),
  ag('zed', 'Zed', ['xdg:zed'], '.agents/skills'),
  ag('zcode', 'ZCode', ['.zcode'], '.zcode/skills'),
  ag('zencoder', 'Zencoder', ['.zencoder'], '.zencoder/skills'),
  ag('zenflow', 'Zenflow', ['.zencoder'], '.zencoder/skills'),
  ag('neovate', 'Neovate', ['.neovate'], '.neovate/skills'),
  ag('pochi', 'Pochi', ['.pochi'], '.pochi/skills'),
  ag('adal', 'AdaL', ['.adal'], '.adal/skills'),
  ag('universal', 'Universal', [], 'xdg:agents/skills')
]

function ag(id: string, label: string, detect: string[], globalSkills: string): AgentDef {
  return { id, label, detect, globalSkills }
}

export interface AgentSkillStatus {
  id: string
  label: string
  detected: boolean
  skillsDir: string
  installedVersion?: string
  state: AgentSkillState
}

export const PYTHON_DOWNLOAD_URL = 'https://www.python.org/downloads/'

export interface PythonStatus {
  ready: boolean
  command?: string
  version?: string
}

/** Bundled skill version from SKILL.md `metadata.version`. */
export function parseSkillVersion(skillMd: string): string | undefined {
  const fm = skillMd.match(/^---\r?\n([\s\S]*?)\r?\n---/)
  if (!fm) return undefined
  const meta = fm[1].match(/^metadata:\s*\r?\n((?:[ \t]+\S.*\r?\n?)*)/m)
  if (!meta) return undefined
  const m = meta[1].match(/^[ \t]+version:\s*['"]?([0-9]+)['"]?\s*$/m)
  return m?.[1]
}

/** Missing, empty, or non-integer values count as 0. Integers compare as-is. */
export function compareSkillVersions(a: string | undefined, b: string | undefined): number {
  return skillVersionRank(a) - skillVersionRank(b)
}

function skillVersionRank(raw: string | undefined): number {
  if (!raw || !/^\d+$/.test(raw.trim())) return 0
  return parseInt(raw.trim(), 10)
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

export function xdgConfigHome(homeDir: string = os.homedir()): string {
  return process.env.XDG_CONFIG_HOME?.trim() || path.join(homeDir, '.config')
}

export function resolveAgentLayout(
  def: AgentDef,
  homeDir: string = os.homedir()
): { detectPaths: string[]; skillsDir: string } {
  const resolveSpec = (spec: string): string => {
    if (spec.startsWith('xdg:')) return joinRel(xdgConfigHome(homeDir), spec.slice(4))
    if (path.isAbsolute(spec)) return spec
    return joinRel(homeDir, spec)
  }
  let detectPaths = def.detect.map(resolveSpec)
  let skillsDir = resolveSpec(def.globalSkills)

  const envHome = (envName: string, fallbackRel: string): string =>
    process.env[envName]?.trim() || joinRel(homeDir, fallbackRel)

  switch (def.id) {
    case 'claude-code': {
      const h = envHome('CLAUDE_CONFIG_DIR', '.claude')
      detectPaths = [h]
      skillsDir = path.join(h, 'skills')
      break
    }
    case 'codex': {
      const h = envHome('CODEX_HOME', '.codex')
      detectPaths = [h, '/etc/codex']
      skillsDir = path.join(h, 'skills')
      break
    }
    case 'autohand-code': {
      const h = envHome('AUTOHAND_HOME', '.autohand')
      detectPaths = [h]
      skillsDir = path.join(h, 'skills')
      break
    }
    case 'grok': {
      const h = envHome('GROK_HOME', '.grok')
      detectPaths = [h]
      skillsDir = path.join(h, 'skills')
      break
    }
    case 'hermes-agent': {
      const h = envHome('HERMES_HOME', '.hermes')
      detectPaths = [h]
      skillsDir = path.join(h, 'skills')
      break
    }
    case 'mistral-vibe': {
      const h = envHome('VIBE_HOME', '.vibe')
      detectPaths = [h]
      skillsDir = path.join(h, 'skills')
      break
    }
    case 'openclaw': {
      const candidates = ['.openclaw', '.clawdbot', '.moltbot'].map((d) => joinRel(homeDir, d))
      detectPaths = candidates
      const found = candidates.find(pathExists)
      skillsDir = path.join(found || joinRel(homeDir, '.openclaw'), 'skills')
      break
    }
    case 'zed': {
      detectPaths = [joinRel(xdgConfigHome(homeDir), 'zed')]
      if (process.env.APPDATA?.trim()) detectPaths.push(path.join(process.env.APPDATA.trim(), 'Zed'))
      if (process.env.FLATPAK_XDG_CONFIG_HOME?.trim()) {
        detectPaths.push(path.join(process.env.FLATPAK_XDG_CONFIG_HOME.trim(), 'zed'))
      }
      break
    }
    case 'minimax-code':
      detectPaths = [...detectPaths, '/Applications/MiniMax Code.app']
      break
    case 'zcode':
      detectPaths = [...detectPaths, '/Applications/ZCode.app']
      break
    default:
      break
  }
  return { detectPaths, skillsDir }
}

function joinRel(base: string, rel: string): string {
  return path.join(base, ...rel.split('/').filter(Boolean))
}

function pathExists(p: string): boolean {
  try {
    return fs.existsSync(p)
  } catch {
    return false
  }
}

export function scanAgentStatuses(
  bundledVersion: string,
  homeDir: string = os.homedir()
): AgentSkillStatus[] {
  return AGENT_DEFS.map((def) => {
    const { detectPaths, skillsDir } = resolveAgentLayout(def, homeDir)
    const detected = detectPaths.some(pathExists)
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

/** True when a detected agent is missing/outdated and this bundled version has not been dismissed or opened. */
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
    const dest = path.join(resolveAgentLayout(def, homeDir).skillsDir, SKILL_FOLDER_NAME)
    copySkillDir(bundledDir, dest)
    results.push({ id, dest })
  }
  return results
}

/** Delete the bundled skill folder from each listed agent's global skills directory. */
export function removeSkillForAgents(
  agentIds: string[],
  homeDir: string = os.homedir()
): { id: string; dest: string }[] {
  const results: { id: string; dest: string }[] = []
  for (const id of agentIds) {
    const def = AGENT_DEFS.find((a) => a.id === id)
    if (!def) continue
    const dest = path.join(resolveAgentLayout(def, homeDir).skillsDir, SKILL_FOLDER_NAME)
    if (!fs.existsSync(dest)) continue
    fs.rmSync(dest, { recursive: true, force: true })
    results.push({ id, dest })
  }
  return results
}

export function agentsWithInstalledSkill(statuses: AgentSkillStatus[]): AgentSkillStatus[] {
  return statuses.filter((s) => s.state !== 'missing')
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
