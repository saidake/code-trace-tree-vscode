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
import * as vscode from 'vscode'
import {
  REFRESH_REQUEST_FILE,
  SELECT_REQUEST_FILE
} from '../domain/constants'

const DEBOUNCE_MS = 400

/**
 * Watches the bound global project XML and IDE-local refresh/select request files
 * so external agents can edit storage and ask VS Code to reload / select nodes.
 */
export class ExternalStorageWatcher implements vscode.Disposable {
  private readonly disposables: vscode.Disposable[] = []
  private reloadTimer: ReturnType<typeof setTimeout> | undefined
  private selectTimer: ReturnType<typeof setTimeout> | undefined
  private pendingReason: string | undefined

  constructor(
    private readonly projectBase: string,
    private readonly storageFileProvider: () => string | undefined,
    private readonly shouldIgnore: () => boolean,
    private readonly onExternalChange: (reason: string) => void,
    private readonly onSelectRequest: () => void
  ) {}

  start() {
    const vscodeDir = path.join(this.projectBase, '.vscode')
    const ideaDir = path.join(this.projectBase, '.idea')
    try {
      fs.mkdirSync(vscodeDir, { recursive: true })
    } catch {
      // ignore
    }

    this.watchDir(vscodeDir)
    if (fs.existsSync(ideaDir)) {
      this.watchDir(ideaDir)
    }

    const storageFile = this.storageFileProvider()
    if (storageFile) {
      const storageDir = path.dirname(storageFile)
      const base = path.basename(storageFile)
      const watcher = vscode.workspace.createFileSystemWatcher(
        new vscode.RelativePattern(storageDir, `${base}*`)
      )
      const onStorage = () => this.scheduleReload('storage-xml')
      this.disposables.push(watcher, watcher.onDidChange(onStorage), watcher.onDidCreate(onStorage))
    }
  }

  dispose() {
    if (this.reloadTimer) clearTimeout(this.reloadTimer)
    if (this.selectTimer) clearTimeout(this.selectTimer)
    for (const d of this.disposables) d.dispose()
    this.disposables.length = 0
  }

  private watchDir(dir: string) {
    const watcher = vscode.workspace.createFileSystemWatcher(
      new vscode.RelativePattern(dir, 'code-trace-tree.*')
    )
    const handle = (uri: vscode.Uri) => this.handleEvent(uri.fsPath)
    this.disposables.push(
      watcher,
      watcher.onDidCreate(handle),
      watcher.onDidChange(handle)
    )
  }

  private handleEvent(filePath: string) {
    const name = path.basename(filePath)
    if (name === SELECT_REQUEST_FILE) {
      if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
        this.scheduleSelect()
      }
      return
    }
    if (this.shouldIgnore()) return
    if (name === REFRESH_REQUEST_FILE) {
      if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
        this.scheduleReload('refresh-request')
      }
      return
    }
  }

  private scheduleReload(reason: string) {
    this.pendingReason = reason
    if (this.reloadTimer) clearTimeout(this.reloadTimer)
    this.reloadTimer = setTimeout(() => {
      if (this.shouldIgnore()) return
      const r = this.pendingReason
      this.pendingReason = undefined
      if (!r) return
      try {
        this.onExternalChange(r)
      } catch {
        // ignore
      }
    }, DEBOUNCE_MS)
  }

  private scheduleSelect() {
    if (this.selectTimer) clearTimeout(this.selectTimer)
    this.selectTimer = setTimeout(() => {
      try {
        this.onSelectRequest()
      } catch {
        // ignore
      }
    }, DEBOUNCE_MS)
  }
}
