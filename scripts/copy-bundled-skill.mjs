/**
 * Copy repo-root skills/code-trace-tree into main/skills for F5 and VSIX packaging.
 * Do not commit main/skills/ (see .gitignore).
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const mainDir = path.join(root, 'main')

export function copyBundledSkill() {
  const skillSrc = path.join(root, 'skills', 'code-trace-tree')
  const skillDest = path.join(mainDir, 'skills', 'code-trace-tree')
  if (!fs.existsSync(path.join(skillSrc, 'SKILL.md'))) {
    throw new Error(`bundled skill not found at ${skillSrc}`)
  }
  fs.rmSync(skillDest, { recursive: true, force: true })
  copyDir(skillSrc, skillDest)
  return skillDest
}

function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true })
  for (const ent of fs.readdirSync(src, { withFileTypes: true })) {
    if (ent.name === '__pycache__' || ent.name.endsWith('.pyc')) continue
    const from = path.join(src, ent.name)
    const to = path.join(dest, ent.name)
    if (ent.isDirectory()) copyDir(from, to)
    else fs.copyFileSync(from, to)
  }
}

const invokedDirectly =
  Boolean(process.argv[1]) &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
if (invokedDirectly) {
  copyBundledSkill()
  console.log('Copied bundled skill to main/skills/code-trace-tree')
}
