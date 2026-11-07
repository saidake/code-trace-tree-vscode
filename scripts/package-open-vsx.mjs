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
const lockPath = path.join(mainDir, 'yarn.lock')
const originalPkg = fs.readFileSync(pkgPath, 'utf8')
const originalLock = fs.readFileSync(lockPath, 'utf8')
const pkg = JSON.parse(originalPkg)
const version = pkg.version
const outFile = path.join(mainDir, `code-trace-tree-open-vsx-${version}.vsix`)

// Temporarily override the package identity for Open VSX packaging.
pkg.name = 'code-trace-tree'
pkg.displayName = 'Code Trace Tree'
pkg.publisher = 'craigbrown'
fs.writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`)

// Yarn 4 requires the workspace name to exist in the lockfile. While the
// package name is temporarily `code-trace-tree`, add the matching workspace
// entry so vsce's `yarn list --prod --json` can resolve it. Removed in finally.
const workspaceEntry = `
"code-trace-tree@workspace:.":
  version: 0.0.0-use.local
  resolution: "code-trace-tree@workspace:."
  dependencies:
    "@types/mocha": "npm:^10.0.10"
    "@types/node": "npm:16.x"
    "@types/vscode": "npm:^1.80.0"
    fast-xml-parser: "npm:^5.3.0"
    mocha: "npm:^10.8.2"
    ts-node: "npm:^10.9.2"
    typescript: "npm:^5.1.6"
    uuid: "npm:^13.0.1"
  languageName: unknown
  linkType: soft
`
fs.appendFileSync(lockPath, workspaceEntry)

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
  run('node', ['../scripts/prepare-vsix-assets.mjs'])
  run('npx', ['--yes', '@vscode/vsce', 'package', '--out', outFile])
  console.log(`Open VSX VSIX: ${outFile}`)
} finally {
  fs.writeFileSync(pkgPath, originalPkg)
  fs.writeFileSync(lockPath, originalLock)
}
