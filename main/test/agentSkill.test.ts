/*
 * Copyright (C) 2025-2026 Code Trace Tree Contributors
 *
 * SPDX-License-Identifier: MIT
 */
import * as assert from 'assert'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import {
  AGENT_DEFS,
  compareSkillVersions,
  copySkillDir,
  parseSkillVersion,
  removeSkillForAgents,
  resolveAgentLayout,
  resolveBundledSkillDir,
  scanAgentStatuses,
  shouldOfferSkillNotice
} from '../src/skill/agentSkill'
import {
  parseGlobalSettingsXml,
  serializeGlobalSettingsXml
} from '../src/storage/globalSettingsXml'
import { skillScriptsDir } from './helpers/skillSpawn'

describe('agent skill version', () => {
  it('reads version from SKILL metadata', () => {
    const md = `---\nname: code-trace-tree\nmetadata:\n  version: "1"\ndescription: test\n---\n\n# Hi\n`
    assert.strictEqual(parseSkillVersion(md), '1')
    assert.strictEqual(parseSkillVersion('---\nversion: 1\n---\n'), undefined)
    const bundled = fs.readFileSync(path.join(skillScriptsDir(), '..', 'SKILL.md'), 'utf8')
    assert.strictEqual(parseSkillVersion(bundled), '1')
  })

  it('resolves the repo-root skill when main/skills is not present (F5 / unpackaged)', () => {
    const extensionPath = path.resolve(__dirname, '..')
    const dir = resolveBundledSkillDir(extensionPath)
    assert.ok(dir)
    assert.ok(fs.existsSync(path.join(dir, 'SKILL.md')))
  })

  it('uses npx skills agent ids and Codex ~/.codex/skills', () => {
    assert.ok(AGENT_DEFS.length > 50)
    assert.ok(AGENT_DEFS.some((a) => a.id === 'cursor'))
    assert.ok(AGENT_DEFS.some((a) => a.id === 'codex'))
    const home = path.join(os.tmpdir(), 'ctt-home')
    const cursor = resolveAgentLayout(AGENT_DEFS.find((a) => a.id === 'cursor')!, home)
    const codex = resolveAgentLayout(AGENT_DEFS.find((a) => a.id === 'codex')!, home)
    assert.ok(cursor.skillsDir.endsWith(path.join('.cursor', 'skills')))
    assert.ok(codex.skillsDir.endsWith(path.join('.codex', 'skills')))
  })

  it('treats missing and non-integer versions as 0', () => {
    assert.ok(compareSkillVersions(undefined, '1') < 0)
    assert.ok(compareSkillVersions('1.3.5', '1') < 0)
    assert.ok(compareSkillVersions('', '1') < 0)
    assert.strictEqual(compareSkillVersions('1', '1'), 0)
    assert.ok(compareSkillVersions('2', '1') > 0)
  })
})

describe('agent skill scan', () => {
  it('detects an agent from its home marker and compares installed skill version', () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'ctt-agents-'))
    try {
      fs.mkdirSync(path.join(home, '.cursor'))
      fs.mkdirSync(path.join(home, '.cursor', 'skills', 'code-trace-tree'), { recursive: true })
      fs.writeFileSync(
        path.join(home, '.cursor', 'skills', 'code-trace-tree', 'SKILL.md'),
        '---\nname: code-trace-tree\nmetadata:\n  version: "1"\n---\n',
        'utf8'
      )
      const statuses = scanAgentStatuses('2', home)
      const cursor = statuses.find((s) => s.id === 'cursor')
      const claude = statuses.find((s) => s.id === 'claude-code')
      assert.ok(cursor?.detected)
      assert.strictEqual(cursor?.state, 'outdated')
      assert.strictEqual(cursor?.installedVersion, '1')
      assert.strictEqual(claude?.detected, false)
      assert.strictEqual(claude?.state, 'missing')
      assert.strictEqual(shouldOfferSkillNotice('2', statuses, undefined), true)
      assert.strictEqual(shouldOfferSkillNotice('2', statuses, '1'), true)
      assert.strictEqual(shouldOfferSkillNotice('2', statuses, '2'), false)
    } finally {
      fs.rmSync(home, { recursive: true, force: true })
    }
  })

  it('copies the bundled skill folder, replacing an existing install', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ctt-copy-'))
    try {
      const src = path.join(root, 'src')
      const dest = path.join(root, 'dest', 'code-trace-tree')
      fs.mkdirSync(src)
      fs.writeFileSync(path.join(src, 'SKILL.md'), '---\nmetadata:\n  version: "1"\n---\n', 'utf8')
      fs.mkdirSync(path.join(src, 'scripts'))
      fs.writeFileSync(path.join(src, 'scripts', 'trace_tree.py'), 'print(1)\n', 'utf8')
      fs.mkdirSync(dest, { recursive: true })
      fs.writeFileSync(path.join(dest, 'old.txt'), 'stale', 'utf8')
      copySkillDir(src, dest)
      assert.strictEqual(fs.existsSync(path.join(dest, 'old.txt')), false)
      assert.ok(fs.existsSync(path.join(dest, 'SKILL.md')))
      assert.ok(fs.existsSync(path.join(dest, 'scripts', 'trace_tree.py')))
    } finally {
      fs.rmSync(root, { recursive: true, force: true })
    }
  })

  it('removes the installed skill folder for listed agents', () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'ctt-remove-'))
    try {
      const dest = path.join(home, '.cursor', 'skills', 'code-trace-tree')
      fs.mkdirSync(dest, { recursive: true })
      fs.writeFileSync(path.join(dest, 'SKILL.md'), '---\nmetadata:\n  version: "1"\n---\n', 'utf8')
      const removed = removeSkillForAgents(['cursor', 'claude-code'], home)
      assert.strictEqual(removed.length, 1)
      assert.strictEqual(removed[0].id, 'cursor')
      assert.strictEqual(fs.existsSync(dest), false)
    } finally {
      fs.rmSync(home, { recursive: true, force: true })
    }
  })
})

describe('global settings xml skill notice', () => {
  it('round-trips highlight colors and agent-skill notice fields', () => {
    const xml = serializeGlobalSettingsXml({
      highlightLineBackgroundLight: '#FFFFC8',
      highlightLineBackgroundDark: '#236C60',
      agentSkillVersion: '1',
      agentSkillNoticeStatus: 'dismissed'
    })
    const parsed = parseGlobalSettingsXml(xml)
    assert.strictEqual(parsed?.highlightLineBackgroundLight, '#FFFFC8')
    assert.strictEqual(parsed?.highlightLineBackgroundDark, '#236C60')
    assert.strictEqual(parsed?.agentSkillVersion, '1')
    assert.strictEqual(parsed?.agentSkillNoticeStatus, 'dismissed')
    const openedXml = serializeGlobalSettingsXml({
      highlightLineBackgroundLight: '#FFFFC8',
      highlightLineBackgroundDark: '#236C60',
      agentSkillVersion: '1',
      agentSkillNoticeStatus: 'opened'
    })
    assert.strictEqual(parseGlobalSettingsXml(openedXml)?.agentSkillNoticeStatus, 'opened')
    assert.strictEqual(
      parseGlobalSettingsXml(
        openedXml.replace('<noticeStatus>opened</noticeStatus>', '<noticeStatus>installed</noticeStatus>')
      )?.agentSkillNoticeStatus,
      'opened'
    )
  })
})
