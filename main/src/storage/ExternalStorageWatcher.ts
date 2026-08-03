/*
 * Copyright (C) 2025-2026 Code Trace Tree Contributors
 *
 * SPDX-License-Identifier: MIT
 */
import * as fs from 'fs'
import * as path from 'path'
import * as vscode from 'vscode'
import * as AgentSignalFiles from './agentSignalFiles'

const DEBOUNCE_MS = 400

/**
 * Watches the bound global project XML and this project's signal files under
 * `<appDir>/signals/` so external agents can edit storage, ask VS Code to reload,
 * or select/navigate trace points. Each watcher only reacts to
 * `<projectId>.request_refresh` / `<projectId>.select_trace_points`.
 */
export class ExternalStorageWatcher implements vscode.Disposable {
  private readonly disposables: vscode.Disposable[] = []
  private reloadTimer: ReturnType<typeof setTimeout> | undefined
  private selectTimer: ReturnType<typeof setTimeout> | undefined
  private pendingReason: string | undefined

  constructor(
    private readonly projectId: string,
    private readonly storageFileProvider: () => string | undefined,
    private readonly shouldIgnore: () => boolean,
    private readonly onExternalChange: (reason: string) => void,
    private readonly onSelectRequest: () => void
  ) {}

  start() {
    const signals = AgentSignalFiles.signalsDir()
    try {
      fs.mkdirSync(signals, { recursive: true })
    } catch {
      // ignore
    }
    this.watchSignalsDir(signals)

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

    // Replay fresh signals written while the IDE was closed; drop stale ones.
    if (AgentSignalFiles.isFresh(AgentSignalFiles.refreshPath(this.projectId))) {
      this.scheduleReload('refresh-request')
    }
    if (AgentSignalFiles.isFresh(AgentSignalFiles.selectPath(this.projectId))) {
      this.scheduleSelect()
    }
  }

  dispose() {
    if (this.reloadTimer) clearTimeout(this.reloadTimer)
    if (this.selectTimer) clearTimeout(this.selectTimer)
    for (const d of this.disposables) d.dispose()
    this.disposables.length = 0
  }

  private watchSignalsDir(dir: string) {
    const refreshName = AgentSignalFiles.refreshFileName(this.projectId)
    const selectName = AgentSignalFiles.selectFileName(this.projectId)
    // Watch both signal files for this projectId (glob doesn't allow OR; use two watchers).
    for (const name of [refreshName, selectName]) {
      const watcher = vscode.workspace.createFileSystemWatcher(
        new vscode.RelativePattern(dir, name)
      )
      const handle = (uri: vscode.Uri) => this.handleEvent(uri.fsPath)
      this.disposables.push(
        watcher,
        watcher.onDidCreate(handle),
        watcher.onDidChange(handle)
      )
    }
  }

  private handleEvent(filePath: string) {
    const name = path.basename(filePath)
    if (name === AgentSignalFiles.selectFileName(this.projectId)) {
      if (AgentSignalFiles.isFresh(AgentSignalFiles.selectPath(this.projectId))) {
        this.scheduleSelect()
      }
      return
    }
    if (this.shouldIgnore()) return
    if (name === AgentSignalFiles.refreshFileName(this.projectId)) {
      if (AgentSignalFiles.isFresh(AgentSignalFiles.refreshPath(this.projectId))) {
        this.scheduleReload('refresh-request')
      }
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
