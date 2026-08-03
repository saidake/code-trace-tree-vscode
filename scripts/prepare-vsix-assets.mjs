/**
 * Copy root README / LICENSE / preview image into main/ so @vscode/vsce
 * includes them in the VSIX (Marketplace Overview + license metadata).
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const mainDir = path.join(root, 'main')

let readme = fs.readFileSync(path.join(root, 'README.md'), 'utf8')
// Root README paths are repo-relative; rewrite for packaging from main/.
readme = readme.replaceAll('main/assets/', 'assets/')
fs.writeFileSync(path.join(mainDir, 'README.md'), readme)

fs.copyFileSync(path.join(root, 'LICENSE'), path.join(mainDir, 'LICENSE'))

const previewSrc = path.join(root, 'docs', 'assets', 'preview-vscode.png')
const previewDestDir = path.join(mainDir, 'docs', 'assets')
if (fs.existsSync(previewSrc)) {
  fs.mkdirSync(previewDestDir, { recursive: true })
  fs.copyFileSync(previewSrc, path.join(previewDestDir, 'preview-vscode.png'))
}

console.log('Prepared main/README.md, main/LICENSE, and docs assets for vsce packaging')
