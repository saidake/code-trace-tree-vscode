/**
 * Package a VSIX for Open VSX (`craigbrown.code-trace-tree`).
 * Temporarily overrides name / displayName / publisher, then restores
 * the VS Marketplace identity in main/package.json.
 *
 * Output: main/code-trace-tree-open-vsx-<version>.vsix
 */
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const mainDir = path.join(root, 'main')
const pkgPath = path.join(mainDir, 'package.json')
const original = fs.readFileSync(pkgPath, 'utf8')
const pkg = JSON.parse(original)
const version = pkg.version
const outFile = path.join(mainDir, `code-trace-tree-open-vsx-${version}.vsix`)

pkg.name = 'code-trace-tree'
pkg.displayName = 'Code Trace Tree'
pkg.publisher = 'craigbrown'
fs.writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`)

const run = (command, args) => {
  const result = spawnSync(command, args, {
    cwd: mainDir,
    stdio: 'inherit',
    shell: true
  })
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(' ')} failed (${result.status})`)
  }
}

try {
  run('yarn', ['run', 'prepare-vsix'])
  run('npx', ['--yes', '@vscode/vsce', 'package', '--out', outFile])
  console.log(`Open VSX VSIX: ${outFile}`)
} finally {
  fs.writeFileSync(pkgPath, original)
}
