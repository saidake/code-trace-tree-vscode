import * as fs from 'fs'
import * as path from 'path'
import { PROJECT_ID_FILE_NAME } from '../domain/constants'

export function vscodeIdPath(projectBase: string): string {
  return path.join(projectBase, '.vscode', PROJECT_ID_FILE_NAME)
}

export function ideaIdPath(projectBase: string): string {
  return path.join(projectBase, '.idea', PROJECT_ID_FILE_NAME)
}

function readIdFile(filePath: string): string | undefined {
  try {
    if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) return undefined
    const id = fs.readFileSync(filePath, 'utf8').trim()
    return id || undefined
  } catch {
    return undefined
  }
}

/**
 * Prefer `.vscode/code-trace-tree.project.id`; if missing, reuse `.idea/...` when present.
 */
export function readProjectId(projectBase: string): string | undefined {
  const vscodeId = readIdFile(vscodeIdPath(projectBase))
  if (vscodeId) return vscodeId
  return readIdFile(ideaIdPath(projectBase))
}

/** Write the project id only to `.vscode/` (current IDE). */
export function writeProjectId(projectBase: string, projectId: string): void {
  const filePath = vscodeIdPath(projectBase)
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  fs.writeFileSync(filePath, projectId.trim() + '\n', 'utf8')
}
