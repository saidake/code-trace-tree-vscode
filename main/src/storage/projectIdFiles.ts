/*
 * Copyright (C) 2025-2026 Code Trace Tree Contributors
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program. If not, see <https://www.gnu.org/licenses/>.
 */
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
