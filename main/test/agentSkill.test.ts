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
  compareSkillVersions,
  copySkillDir,
  parseSkillVersion,
  scanAgentStatuses,
  shouldOfferSkillNotice
} from '../src/skill/agentSkill'
import {
  parseGlobalSettingsXml,
  serializeGlobalSettingsXml
} from '../src/storage/globalSettingsXml'
import { skillScriptsDir } from './helpers/skillSpawn'

describe('agent skill version', () => {
  it('reads version from SKILL frontmatter', () => {
    const md = `---\nname: code-trace-tree\nversion: 1.3.5\ndescription: test\n---\n\n# Hi\n`
    assert.strictEqual(parseSkillVersion(md), '1.3.5')
    const bundled = fs.readFileSync(path.join(skillScriptsDir(), '..', 'SKILL.md'), 'utf8')
    assert.strictEqual(parseSkillVersion(bundled), '1.3.5')
  })

  it('treats a missing version as older', () => {
    assert.ok(compareSkillVersions(undefined, '1.3.5') < 0)
    assert.ok(compareSkillVersions('1.3.4', '1.3.5') < 0)
    assert.strictEqual(compareSkillVersions('1.3.5', '1.3.5'), 0)
    assert.ok(compareSkillVersions('1.4.0', '1.3.5') > 0)
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
        '---\nname: code-trace-tree\nversion: 1.3.4\n---\n',
        'utf8'
      )
      const statuses = scanAgentStatuses('1.3.5', home)
      const cursor = statuses.find((s) => s.id === 'cursor')
      const claude = statuses.find((s) => s.id === 'claude-code')
      assert.ok(cursor?.detected)
      assert.strictEqual(cursor?.state, 'outdated')
      assert.strictEqual(cursor?.installedVersion, '1.3.4')
      assert.strictEqual(claude?.detected, false)
      assert.strictEqual(claude?.state, 'missing')
      assert.strictEqual(shouldOfferSkillNotice('1.3.5', statuses, undefined), true)
      assert.strictEqual(shouldOfferSkillNotice('1.3.5', statuses, '1.3.5'), false)
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
      fs.writeFileSync(path.join(src, 'SKILL.md'), '---\nversion: 1.3.5\n---\n', 'utf8')
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
})

describe('global settings xml skill notice', () => {
  it('round-trips highlight colors and agent-skill notice fields', () => {
    const xml = serializeGlobalSettingsXml({
      highlightLineBackgroundLight: '#FFFFC8',
      highlightLineBackgroundDark: '#236C60',
      agentSkillVersion: '1.3.5',
      agentSkillNoticeStatus: 'dismissed'
    })
    const parsed = parseGlobalSettingsXml(xml)
    assert.strictEqual(parsed?.highlightLineBackgroundLight, '#FFFFC8')
    assert.strictEqual(parsed?.highlightLineBackgroundDark, '#236C60')
    assert.strictEqual(parsed?.agentSkillVersion, '1.3.5')
    assert.strictEqual(parsed?.agentSkillNoticeStatus, 'dismissed')
  })
})
