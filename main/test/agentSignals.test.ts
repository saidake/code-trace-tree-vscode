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
  refreshFileName,
  refreshPath,
  writeRequestRefresh,
  writeRequestRefreshProfile,
  writeRequestRefreshSettings
} from '../src/storage/agentSignalFiles'
import { resolveBaseDir } from '../src/storage/globalStoragePaths'

describe('IDE signal files (plugin notify path)', () => {
  before(function () {
    if (process.platform === 'darwin') this.skip()
  })
  const originalLocal = process.env.LOCALAPPDATA
  const originalXdg = process.env.XDG_CONFIG_HOME
  let tmp = ''

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ctt-signals-'))
    process.env.LOCALAPPDATA = tmp
    process.env.XDG_CONFIG_HOME = tmp
  })

  afterEach(() => {
    if (originalLocal === undefined) delete process.env.LOCALAPPDATA
    else process.env.LOCALAPPDATA = originalLocal
    if (originalXdg === undefined) delete process.env.XDG_CONFIG_HOME
    else process.env.XDG_CONFIG_HOME = originalXdg
    fs.rmSync(tmp, { recursive: true, force: true })
  })

  it('resolveBaseDir honors LOCALAPPDATA on Windows and XDG_CONFIG_HOME on Linux', () => {
    if (process.platform === 'darwin') return
    assert.strictEqual(path.normalize(resolveBaseDir()), path.normalize(tmp))
  })

  it('writeRequestRefresh creates request_refresh and storage-ready', () => {
    const projectId = '11111111-2222-3333-4444-555555555555'
    writeRequestRefresh(projectId, tmp)
    assert.ok(fs.existsSync(refreshPath(projectId)))
    assert.ok(fs.existsSync(path.join(tmp, 'code-trace-tree', 'signals', refreshFileName(projectId))))
    assert.ok(
      fs.existsSync(path.join(tmp, 'code-trace-tree', 'signals', `${projectId}.storage-ready`))
    )
  })

  it('profile and settings notify files use the documented suffixes', () => {
    const projectId = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'
    writeRequestRefreshProfile(projectId, 'main', tmp)
    writeRequestRefreshSettings(projectId, tmp)
    const dir = path.join(tmp, 'code-trace-tree', 'signals')
    assert.strictEqual(fs.readFileSync(path.join(dir, `${projectId}.request_refresh_profile`), 'utf8').trim(), 'main')
    assert.ok(fs.existsSync(path.join(dir, `${projectId}.request_refresh_settings`)))
  })
})
