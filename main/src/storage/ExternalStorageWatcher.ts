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
const POLL_MS = 1000

/**
 * Watches this project's signal files under `<appDir>/signals/` so external agents
 * can ask VS Code to reload storage or select/navigate trace points.
 *
 * Signals (no XML file watch — agents must write refresh signals after edits):
 * - `<projectId>.request_refresh`
 * - `<projectId>.request_refresh_profile`
 * - `<projectId>.request_refresh_settings`
 * - `<projectId>.select_trace_points`
 *
 * FileSystemWatcher plus a periodic mtime poll so repeated overwrites of the same
 * signal file (rapid `trace_tree add`) are not missed.
 *
 * Call only when a project id is already bound. For Case C (unbound), use
 * StorageReadyWatcher until `<projectId>.storage-ready` binds storage.
 */
export class ExternalStorageWatcher implements vscode.Disposable {
  private readonly disposables: vscode.Disposable[] = []
  private reloadTimer: ReturnType<typeof setTimeout> | undefined
  private profileReloadTimer: ReturnType<typeof setTimeout> | undefined
  private settingsReloadTimer: ReturnType<typeof setTimeout> | undefined
  private selectTimer: ReturnType<typeof setTimeout> | undefined
  private pollTimer: ReturnType<typeof setInterval> | undefined
  private pendingReason: string | undefined
  private readonly lastSeenMtimeMs = new Map<string, number>()

  constructor(
    private readonly projectId: string,
    private readonly onFullRefresh: (reason: string) => void,
    private readonly onProfileRefresh: () => void,
    private readonly onSettingsRefresh: () => void,
    private readonly onSelectRequest: () => void
  ) {}

  /**
   * @param replayExistingRefresh when true, schedule fresh request_refresh / _profile /
   *   _settings already on disk. Pass false after a Case C storage-ready bind.
   *   Fresh select signals are still replayed either way.
   */
  start(replayExistingRefresh = true) {
    const signals = AgentSignalFiles.ensureSignalsDir()
    this.watchSignalsDir(signals)

    if (replayExistingRefresh) {
      this.considerSignal(
        AgentSignalFiles.refreshPath(this.projectId),
        AgentSignalFiles.refreshFileName(this.projectId),
        () => this.scheduleFullReload('refresh-request')
      )
      this.considerSignal(
        AgentSignalFiles.refreshProfilePath(this.projectId),
        AgentSignalFiles.refreshProfileFileName(this.projectId),
        () => this.scheduleProfileReload()
      )
      this.considerSignal(
        AgentSignalFiles.refreshSettingsPath(this.projectId),
        AgentSignalFiles.refreshSettingsFileName(this.projectId),
        () => this.scheduleSettingsReload()
      )
    } else {
      this.rememberMtime(AgentSignalFiles.refreshPath(this.projectId))
      this.rememberMtime(AgentSignalFiles.refreshProfilePath(this.projectId))
      this.rememberMtime(AgentSignalFiles.refreshSettingsPath(this.projectId))
    }
    this.considerSignal(
      AgentSignalFiles.selectPath(this.projectId),
      AgentSignalFiles.selectFileName(this.projectId),
      () => this.scheduleSelect()
    )

    this.pollTimer = setInterval(() => this.pollSignals(), POLL_MS)
  }

  dispose() {
    if (this.pollTimer) clearInterval(this.pollTimer)
    if (this.reloadTimer) clearTimeout(this.reloadTimer)
    if (this.profileReloadTimer) clearTimeout(this.profileReloadTimer)
    if (this.settingsReloadTimer) clearTimeout(this.settingsReloadTimer)
    if (this.selectTimer) clearTimeout(this.selectTimer)
    for (const d of this.disposables) d.dispose()
    this.disposables.length = 0
    this.lastSeenMtimeMs.clear()
  }

  private pollSignals() {
    this.considerSignal(
      AgentSignalFiles.refreshPath(this.projectId),
      AgentSignalFiles.refreshFileName(this.projectId),
      () => this.scheduleFullReload('refresh-request')
    )
    this.considerSignal(
      AgentSignalFiles.refreshProfilePath(this.projectId),
      AgentSignalFiles.refreshProfileFileName(this.projectId),
      () => this.scheduleProfileReload()
    )
    this.considerSignal(
      AgentSignalFiles.refreshSettingsPath(this.projectId),
      AgentSignalFiles.refreshSettingsFileName(this.projectId),
      () => this.scheduleSettingsReload()
    )
    this.considerSignal(
      AgentSignalFiles.selectPath(this.projectId),
      AgentSignalFiles.selectFileName(this.projectId),
      () => this.scheduleSelect()
    )
  }

  private considerSignal(filePath: string, fileName: string, onUpdated: () => void) {
    if (!AgentSignalFiles.isFresh(filePath)) return
    let mtime: number
    try {
      mtime = fs.statSync(filePath).mtimeMs
    } catch {
      return
    }
    const prev = this.lastSeenMtimeMs.get(fileName)
    this.lastSeenMtimeMs.set(fileName, mtime)
    if (prev === mtime) return
    onUpdated()
  }

  private rememberMtime(filePath: string) {
    try {
      if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) return
      this.lastSeenMtimeMs.set(path.basename(filePath), fs.statSync(filePath).mtimeMs)
    } catch {
      // ignore
    }
  }

  private clearSeen(fileName: string) {
    this.lastSeenMtimeMs.delete(fileName)
  }

  private watchSignalsDir(dir: string) {
    const names = [
      AgentSignalFiles.refreshFileName(this.projectId),
      AgentSignalFiles.refreshProfileFileName(this.projectId),
      AgentSignalFiles.refreshSettingsFileName(this.projectId),
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
      this.considerSignal(AgentSignalFiles.selectPath(this.projectId), name, () =>
        this.scheduleSelect()
      )
      return
    }
    if (name === AgentSignalFiles.refreshFileName(this.projectId)) {
      this.considerSignal(AgentSignalFiles.refreshPath(this.projectId), name, () =>
        this.scheduleFullReload('refresh-request')
      )
      return
    }
    if (name === AgentSignalFiles.refreshProfileFileName(this.projectId)) {
      this.considerSignal(AgentSignalFiles.refreshProfilePath(this.projectId), name, () =>
        this.scheduleProfileReload()
      )
      return
    }
    if (name === AgentSignalFiles.refreshSettingsFileName(this.projectId)) {
      this.considerSignal(AgentSignalFiles.refreshSettingsPath(this.projectId), name, () =>
        this.scheduleSettingsReload()
      )
    }
  }

  private scheduleFullReload(reason: string) {
    this.pendingReason = reason
    if (this.reloadTimer) clearTimeout(this.reloadTimer)
    this.reloadTimer = setTimeout(() => {
      const r = this.pendingReason
      this.pendingReason = undefined
      if (!r) return
      try {
        this.onFullRefresh(r)
      } catch {
        this.clearSeen(AgentSignalFiles.refreshFileName(this.projectId))
      }
    }, DEBOUNCE_MS)
  }

  private scheduleProfileReload() {
    if (this.profileReloadTimer) clearTimeout(this.profileReloadTimer)
    this.profileReloadTimer = setTimeout(() => {
      try {
        this.onProfileRefresh()
      } catch {
        this.clearSeen(AgentSignalFiles.refreshProfileFileName(this.projectId))
      }
    }, DEBOUNCE_MS)
  }

  private scheduleSettingsReload() {
    if (this.settingsReloadTimer) clearTimeout(this.settingsReloadTimer)
    this.settingsReloadTimer = setTimeout(() => {
      try {
        this.onSettingsRefresh()
      } catch {
        this.clearSeen(AgentSignalFiles.refreshSettingsFileName(this.projectId))
      }
    }, DEBOUNCE_MS)
  }

  private scheduleSelect() {
    if (this.selectTimer) clearTimeout(this.selectTimer)
    this.selectTimer = setTimeout(() => {
      try {
        this.onSelectRequest()
      } catch {
        this.clearSeen(AgentSignalFiles.selectFileName(this.projectId))
      }
    }, DEBOUNCE_MS)
  }
}
