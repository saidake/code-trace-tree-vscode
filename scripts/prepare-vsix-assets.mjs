/**
 * Copy root README / LICENSE / preview images into main/ so @vscode/vsce
 * includes them in the VSIX (Marketplace Overview + license metadata).
 *
 * Root README.md stays untouched for GitHub. The Marketplace copy:
 * - drops `# Code Trace Tree`, top badges, logo.png, and the `----` separator
 * - drops the `# Development` section (through the next `# License`)
 * - rewrites `main/assets/` paths for packaging from main/
 *
 * Run via `yarn prepare-vsix` / `yarn package` at release time; do not commit
 * main/README.md (see .gitignore).
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const mainDir = path.join(root, 'main')

let readme = fs.readFileSync(path.join(root, 'README.md'), 'utf8')
// Root README paths are repo-relative; rewrite for packaging from main/.
readme = readme.replaceAll('main/assets/', 'assets/')
// Drop title, badges, logo, and horizontal rule through the first ---- block.
readme = readme.replace(/^[\s\S]*?\r?\n----\r?\n\r?\n/, '')
// Drop Development section; keep License for the Marketplace page.
readme = readme.replace(
  /\r?\n# Development\r?\n[\s\S]*?(?=\r?\n# License\r?\n)/,
  '\n'
)
fs.writeFileSync(path.join(mainDir, 'README.md'), readme)

fs.copyFileSync(path.join(root, 'LICENSE'), path.join(mainDir, 'LICENSE'))

const previewDestDir = path.join(mainDir, 'docs', 'assets')
fs.mkdirSync(previewDestDir, { recursive: true })
for (const name of ['logo.png', 'preview-1-vscode.png', 'preview-2-vscode.png']) {
  const src = path.join(root, 'docs', 'assets', name)
  if (fs.existsSync(src)) {
    fs.copyFileSync(src, path.join(previewDestDir, name))
  }
}
const legacyPreview = path.join(previewDestDir, 'preview-vscode.png')
if (fs.existsSync(legacyPreview)) {
  fs.unlinkSync(legacyPreview)
}

console.log('Prepared main/README.md, main/LICENSE, and docs assets for vsce packaging')
