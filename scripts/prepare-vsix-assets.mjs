/**
 * Copy root README / LICENSE / preview image into main/ so @vscode/vsce
 * includes them in the VSIX (Marketplace Overview + license metadata).
 *
 * Root README.md stays untouched for GitHub. The Marketplace copy strips
 * the title/badge/logo header and the Development section.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const mainDir = path.join(root, 'main')

let readme = fs.readFileSync(path.join(root, 'README.md'), 'utf8')
// Root README paths are repo-relative; rewrite for packaging from main/.
readme = readme.replaceAll('main/assets/', 'assets/')
// Drop GitHub-only header (title, badges, logo) before the first content block.
readme = readme.replace(
  /^# Code Trace Tree\r?\n[\s\S]*?\r?\n----\r?\n\r?\n/,
  ''
)
// Drop Development section; keep License for the Marketplace page.
readme = readme.replace(
  /\r?\n# Development\r?\n[\s\S]*?(?=\r?\n# License\r?\n)/,
  '\n'
)
fs.writeFileSync(path.join(mainDir, 'README.md'), readme)

fs.copyFileSync(path.join(root, 'LICENSE'), path.join(mainDir, 'LICENSE'))

const previewSrc = path.join(root, 'docs', 'assets', 'preview-vscode.png')
const previewDestDir = path.join(mainDir, 'docs', 'assets')
if (fs.existsSync(previewSrc)) {
  fs.mkdirSync(previewDestDir, { recursive: true })
  fs.copyFileSync(previewSrc, path.join(previewDestDir, 'preview-vscode.png'))
}

console.log('Prepared main/README.md, main/LICENSE, and docs assets for vsce packaging')
