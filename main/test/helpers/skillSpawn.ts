/*
 * Copyright (C) 2025-2026 Code Trace Tree Contributors
 *
 * SPDX-License-Identifier: MIT
 */
import { spawnSync } from 'child_process'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'

export function skillScriptsDir(): string {
  let dir = __dirname
  for (let i = 0; i < 8; i++) {
    const candidate = path.join(dir, 'skills', 'code-trace-tree', 'scripts')
    if (fs.existsSync(path.join(candidate, 'trace_tree.py'))) return candidate
    const parent = path.dirname(dir)
    if (parent === dir) break
    dir = parent
  }
  throw new Error(`skill scripts not found walking up from ${__dirname}`)
}

export function findPython(): { cmd: string; prefix: string[] } {
  const candidates: Array<{ cmd: string; prefix: string[] }> =
    process.platform === 'win32'
      ? [
          { cmd: 'py', prefix: ['-3'] },
          { cmd: 'python', prefix: [] },
          { cmd: 'python3', prefix: [] }
        ]
      : [
          { cmd: 'python3', prefix: [] },
          { cmd: 'python', prefix: [] }
        ]
  for (const c of candidates) {
    const r = spawnSync(c.cmd, [...c.prefix, '-c', 'print(1)'], { encoding: 'utf8' })
    if (r.status === 0) return c
  }
  throw new Error('Python is required to run skill script tests (python / python3 / py -3)')
}

export function runSkill(
  python: { cmd: string; prefix: string[] },
  scriptName: string,
  args: string[],
  opts: { cwd: string; appDirBase: string }
): { status: number; stdout: string; stderr: string } {
  const script = path.join(skillScriptsDir(), scriptName)
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    LOCALAPPDATA: opts.appDirBase,
    XDG_CONFIG_HOME: opts.appDirBase
  }
  const r = spawnSync(python.cmd, [...python.prefix, script, ...args], {
    cwd: opts.cwd,
    env,
    encoding: 'utf8'
  })
  return {
    status: r.status ?? 1,
    stdout: r.stdout || '',
    stderr: r.stderr || ''
  }
}

export function makeTempProject(): { projectRoot: string; appDirBase: string; cleanup: () => void } {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ctt-skill-'))
  const projectRoot = path.join(root, 'project')
  const appDirBase = path.join(root, 'appdata')
  fs.mkdirSync(projectRoot, { recursive: true })
  fs.mkdirSync(path.join(projectRoot, '.git'), { recursive: true })
  fs.mkdirSync(path.join(projectRoot, 'src'), { recursive: true })
  fs.writeFileSync(
    path.join(projectRoot, 'src', 'app.py'),
    'def alpha():\n    pass\n\ndef beta():\n    pass\n',
    'utf8'
  )
  return {
    projectRoot,
    appDirBase,
    cleanup: () => fs.rmSync(root, { recursive: true, force: true })
  }
}

export function parseJson(stdout: string): Record<string, unknown> {
  const start = stdout.indexOf('{')
  if (start < 0) throw new Error(`no JSON in stdout: ${stdout}`)
  return JSON.parse(stdout.slice(start)) as Record<string, unknown>
}

export function projectIdFromXml(xmlPath: string): string {
  const xml = fs.readFileSync(xmlPath, 'utf8')
  const match = xml.match(/<projectId>([^<]+)<\/projectId>/)
  if (!match) throw new Error(`no projectId in ${xmlPath}`)
  return match[1]
}
