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
 * Watches this project's signal files under `<appDir>/signals/` so external agents
 * can ask VS Code to reload storage or select/navigate trace points.
 *
 * Signals (no XML file watch — agents must write refresh signals after edits):
 * - `<projectId>.request_refresh`
 * - `<projectId>.request_refresh_profile`
 * - `<projectId>.select_trace_points`
 */
export class ExternalStorageWatcher implements vscode.Disposable {
  private readonly disposables: vscode.Disposable[] = []
  private reloadTimer: ReturnType<typeof setTimeout> | undefined
  private profileReloadTimer: ReturnType<typeof setTimeout> | undefined
  private selectTimer: ReturnType<typeof setTimeout> | undefined
  private pendingReason: string | undefined

  constructor(
    private readonly projectId: string,
    private readonly shouldIgnore: () => boolean,
    private readonly onFullRefresh: (reason: string) => void,
    private readonly onProfileRefresh: () => void,
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

    // Replay fresh signals written while the IDE was closed; drop stale ones.
    if (AgentSignalFiles.isFresh(AgentSignalFiles.refreshPath(this.projectId))) {
      this.scheduleFullReload('refresh-request')
    }
    if (AgentSignalFiles.isFresh(AgentSignalFiles.refreshProfilePath(this.projectId))) {
      this.scheduleProfileReload()
    }
    if (AgentSignalFiles.isFresh(AgentSignalFiles.selectPath(this.projectId))) {
      this.scheduleSelect()
    }
  }

  dispose() {
    if (this.reloadTimer) clearTimeout(this.reloadTimer)
    if (this.profileReloadTimer) clearTimeout(this.profileReloadTimer)
    if (this.selectTimer) clearTimeout(this.selectTimer)
    for (const d of this.disposables) d.dispose()
    this.disposables.length = 0
  }

  private watchSignalsDir(dir: string) {
    const names = [
      AgentSignalFiles.refreshFileName(this.projectId),
      AgentSignalFiles.refreshProfileFileName(this.projectId),
      AgentSignalFiles.selectFileName(this.projectId)
    ]
    for (const name of names) {
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
        this.scheduleFullReload('refresh-request')
      }
      return
    }
    if (name === AgentSignalFiles.refreshProfileFileName(this.projectId)) {
      if (AgentSignalFiles.isFresh(AgentSignalFiles.refreshProfilePath(this.projectId))) {
        this.scheduleProfileReload()
      }
    }
  }

  private scheduleFullReload(reason: string) {
    this.pendingReason = reason
    if (this.reloadTimer) clearTimeout(this.reloadTimer)
    this.reloadTimer = setTimeout(() => {
      if (this.shouldIgnore()) return
      const r = this.pendingReason
      this.pendingReason = undefined
      if (!r) return
      try {
        this.onFullRefresh(r)
      } catch {
        // ignore
      }
    }, DEBOUNCE_MS)
  }

  private scheduleProfileReload() {
    if (this.profileReloadTimer) clearTimeout(this.profileReloadTimer)
    this.profileReloadTimer = setTimeout(() => {
      if (this.shouldIgnore()) return
      try {
        this.onProfileRefresh()
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
