/*
 * Copyright (C) 2025-2026 Code Trace Tree Contributors
 *
 * SPDX-License-Identifier: MIT
 */
import * as assert from 'assert'
import * as fs from 'fs'
import * as path from 'path'
import { findPython, makeTempProject, parseJson, projectIdFromXml, runSkill } from './helpers/skillSpawn'

describe('skill scripts execute and notify the IDE', function () {
  this.timeout(30000)

  const python = findPython()
  let projectRoot = ''
  let appDirBase = ''
  let cleanup: () => void = () => undefined
  let projectId = ''

  beforeEach(() => {
    const tmp = makeTempProject()
    projectRoot = tmp.projectRoot
    appDirBase = tmp.appDirBase
    cleanup = tmp.cleanup
  })

  afterEach(() => cleanup())

  function signalsDir(): string {
    return path.join(appDirBase, 'code-trace-tree', 'signals')
  }

  it('resolve_storage.py creates XML under the isolated app dir', () => {
    const r = runSkill(python, 'resolve_storage.py', [projectRoot], {
      cwd: projectRoot,
      appDirBase
    })
    assert.strictEqual(r.status, 0, r.stderr || r.stdout)
    const json = parseJson(r.stdout)
    assert.strictEqual(json.created, true)
    projectId = String(json.project_id)
    assert.ok(projectId)
    assert.ok(fs.existsSync(String(json.storage_xml)))
    assert.ok(
      String(json.global_dir).replace(/\\/g, '/').includes('code-trace-tree'),
      String(json.global_dir)
    )
  })

  it('trace_tree add writes a LINE node and request_refresh_profile', () => {
    const add = runSkill(
      python,
      'trace_tree.py',
      [
        'add',
        '--project',
        projectRoot,
        '--file',
        'src/app.py',
        '--line',
        '1',
        '--content',
        'def alpha():',
        '--trace-name',
        'alpha'
      ],
      { cwd: projectRoot, appDirBase }
    )
    assert.strictEqual(add.status, 0, add.stderr || add.stdout)
    const json = parseJson(add.stdout)
    assert.strictEqual(json.action, 'add')
    assert.strictEqual(json.refreshed, true)
    const node = json.node as { id: string; line: string | number; content: string }
    assert.ok(node.id)
    assert.strictEqual(Number(node.line), 1)
    assert.ok(String(node.content).includes('def alpha():'))
    projectId = projectIdFromXml(String(json.storage_xml))
    const profileSignal = path.join(signalsDir(), `${projectId}.request_refresh_profile`)
    const ready = path.join(signalsDir(), `${projectId}.storage-ready`)
    assert.ok(fs.existsSync(profileSignal), 'add should notify the IDE to reload the profile')
    assert.ok(fs.existsSync(ready))
  })

  it('trace_tree rebind updates the line after an external disk edit and notifies the IDE', () => {
    const add = runSkill(
      python,
      'trace_tree.py',
      [
        'add',
        '--project',
        projectRoot,
        '--file',
        'src/app.py',
        '--line',
        '1',
        '--content',
        'def alpha():',
        '--trace-name',
        'alpha'
      ],
      { cwd: projectRoot, appDirBase }
    )
    assert.strictEqual(add.status, 0, add.stderr || add.stdout)
    const added = parseJson(add.stdout)
    const storageXml = String(added.storage_xml)
    projectId = projectIdFromXml(storageXml)

    fs.writeFileSync(
      path.join(projectRoot, 'src', 'app.py'),
      'header()\n\ndef alpha():\n    pass\n',
      'utf8'
    )

    const rebind = runSkill(
      python,
      'trace_tree.py',
      ['rebind', '--project', projectRoot],
      { cwd: projectRoot, appDirBase }
    )
    assert.strictEqual(rebind.status, 0, rebind.stderr || rebind.stdout)
    const xml = fs.readFileSync(storageXml, 'utf8')
    assert.ok(/<lineNumber>3<\/lineNumber>/.test(xml), xml)
    const profileSignal = path.join(signalsDir(), `${projectId}.request_refresh_profile`)
    assert.ok(fs.existsSync(profileSignal), 'rebind should notify the IDE')
  })

  it('request_refresh.py writes request_refresh + storage-ready', () => {
    const resolve = runSkill(python, 'resolve_storage.py', [projectRoot], {
      cwd: projectRoot,
      appDirBase
    })
    assert.strictEqual(resolve.status, 0, resolve.stderr || resolve.stdout)
    projectId = String(parseJson(resolve.stdout).project_id)

    const r = runSkill(python, 'request_refresh.py', [projectRoot], {
      cwd: projectRoot,
      appDirBase
    })
    assert.strictEqual(r.status, 0, r.stderr || r.stdout)
    assert.ok(fs.existsSync(path.join(signalsDir(), `${projectId}.request_refresh`)))
    assert.ok(fs.existsSync(path.join(signalsDir(), `${projectId}.storage-ready`)))
  })

  it('request_refresh_profile.py and request_refresh_settings.py write the matching signals', () => {
    const resolve = runSkill(python, 'resolve_storage.py', [projectRoot], {
      cwd: projectRoot,
      appDirBase
    })
    assert.strictEqual(resolve.status, 0, resolve.stderr || resolve.stdout)
    projectId = String(parseJson(resolve.stdout).project_id)

    const profile = runSkill(python, 'request_refresh_profile.py', [projectRoot, 'main'], {
      cwd: projectRoot,
      appDirBase
    })
    assert.strictEqual(profile.status, 0, profile.stderr || profile.stdout)
    const profilePath = path.join(signalsDir(), `${projectId}.request_refresh_profile`)
    assert.ok(fs.existsSync(profilePath))
    assert.strictEqual(fs.readFileSync(profilePath, 'utf8').trim(), 'main')

    const settings = runSkill(python, 'request_refresh_settings.py', [projectRoot], {
      cwd: projectRoot,
      appDirBase
    })
    assert.strictEqual(settings.status, 0, settings.stderr || settings.stdout)
    assert.ok(fs.existsSync(path.join(signalsDir(), `${projectId}.request_refresh_settings`)))
  })

  it('select_trace_points.py writes a select signal for the IDE', () => {
    const add = runSkill(
      python,
      'trace_tree.py',
      [
        'add',
        '--project',
        projectRoot,
        '--file',
        'src/app.py',
        '--line',
        '1',
        '--content',
        'def alpha():'
      ],
      { cwd: projectRoot, appDirBase }
    )
    assert.strictEqual(add.status, 0, add.stderr || add.stdout)
    const added = parseJson(add.stdout)
    const nodeId = (added.node as { id: string }).id
    projectId = projectIdFromXml(String(added.storage_xml))

    const select = runSkill(python, 'select_trace_points.py', [nodeId], {
      cwd: projectRoot,
      appDirBase
    })
    assert.strictEqual(select.status, 0, select.stderr || select.stdout)
    const selectPath = path.join(signalsDir(), `${projectId}.select_trace_points`)
    assert.ok(fs.existsSync(selectPath), 'select should notify the IDE tree')
    assert.ok(fs.readFileSync(selectPath, 'utf8').includes(nodeId))
  })

  it('create_tree.py writes nested nodes and notifies the IDE', () => {
    const treeFile = path.join(projectRoot, 'tree.json')
    fs.writeFileSync(
      treeFile,
      JSON.stringify({
        file: 'src/app.py',
        line: 1,
        content: 'def alpha():',
        name: 'alpha',
        type: 'LINE',
        children: [
          {
            file: 'src/app.py',
            line: 4,
            content: 'def beta():',
            name: 'beta',
            type: 'LINE'
          }
        ]
      }),
      'utf8'
    )
    const r = runSkill(
      python,
      'create_tree.py',
      ['--project', projectRoot, '--tree-file', treeFile],
      { cwd: projectRoot, appDirBase }
    )
    assert.strictEqual(r.status, 0, r.stderr || r.stdout)
    const json = parseJson(r.stdout)
    const storageXml = String(json.storage_xml)
    const xml = fs.readFileSync(storageXml, 'utf8')
    assert.ok(xml.includes('alpha'))
    assert.ok(xml.includes('beta'))
    const id = projectIdFromXml(storageXml)
    assert.ok(fs.existsSync(path.join(signalsDir(), `${id}.request_refresh_profile`)))
  })
})
