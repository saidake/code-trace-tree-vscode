/*
 * Copyright (C) 2025-2026 Code Trace Tree Contributors
 *
 * SPDX-License-Identifier: MIT
 */
import * as fs from 'fs'
import * as path from 'path'
import * as vscode from 'vscode'
import * as AgentSignalFiles from './agentSignalFiles'
import { GLOBAL_REFRESH_SETTINGS_FILE_NAME } from '../domain/constants'

const DEBOUNCE_MS = 400
const POLL_MS = 1000

/**
 * Case C (no bound project id): watch `<appDir>/signals/` for
 * `<projectId>.storage-ready` (no TTL) and `request_refresh_global_settings`
 * (global highlight colors).
 *
 * On each signal, [onStorageReady] receives the projectId from the filename.
 * The service filters by the signal body path (or XML `<path>` for legacy bodies)
 * against the workspace, then binds.
 *
 * Once storage is bound, dispose this watcher and start [ExternalStorageWatcher].
 */
export class StorageReadyWatcher implements vscode.Disposable {
  private readonly disposables: vscode.Disposable[] = []
  private readyTimer: ReturnType<typeof setTimeout> | undefined
  private globalSettingsTimer: ReturnType<typeof setTimeout> | undefined
  private pollTimer: ReturnType<typeof setInterval> | undefined
  private pendingProjectId: string | undefined
  private lastSeenGlobalSettingsMtimeMs = -1

  constructor(
    private readonly onStorageReady: (projectId: string) => void,
    private readonly onGlobalSettingsRefresh: () => void = () => {}
  ) {}

  start() {
    const dir = AgentSignalFiles.ensureSignalsDir()
    const watcher = vscode.workspace.createFileSystemWatcher(
      new vscode.RelativePattern(dir, `*${AgentSignalFiles.STORAGE_READY_SUFFIX}`)
    )
    const handle = (uri: vscode.Uri) => {
      const id = AgentSignalFiles.projectIdFromStorageReadyFileName(path.basename(uri.fsPath))
      if (!id) return
      if (!AgentSignalFiles.exists(AgentSignalFiles.storageReadyPath(id))) return
      this.scheduleReady(id)
    }
    this.disposables.push(watcher, watcher.onDidCreate(handle), watcher.onDidChange(handle))
    this.scanExisting(dir)
    this.rememberGlobalSettingsMtime()
    const settingsWatcher = vscode.workspace.createFileSystemWatcher(
      new vscode.RelativePattern(dir, GLOBAL_REFRESH_SETTINGS_FILE_NAME)
    )
    const settingsHandle = () => this.considerGlobalSettingsSignal()
    this.disposables.push(
      settingsWatcher,
      settingsWatcher.onDidCreate(settingsHandle),
      settingsWatcher.onDidChange(settingsHandle)
    )
    this.pollTimer = setInterval(() => this.considerGlobalSettingsSignal(), POLL_MS)
  }

  dispose() {
    if (this.pollTimer) clearInterval(this.pollTimer)
    if (this.readyTimer) clearTimeout(this.readyTimer)
    if (this.globalSettingsTimer) clearTimeout(this.globalSettingsTimer)
    for (const d of this.disposables) d.dispose()
    this.disposables.length = 0
  }

  private scanExisting(dir: string) {
    try {
      if (!fs.existsSync(dir)) return
      for (const name of fs.readdirSync(dir)) {
        const id = AgentSignalFiles.projectIdFromStorageReadyFileName(name)
        if (!id) continue
        if (AgentSignalFiles.exists(path.join(dir, name))) {
          this.scheduleReady(id)
        }
      }
    } catch {
      // ignore
    }
  }

  private scheduleReady(projectId: string) {
    this.pendingProjectId = projectId
    if (this.readyTimer) clearTimeout(this.readyTimer)
    this.readyTimer = setTimeout(() => {
      const id = this.pendingProjectId
      this.pendingProjectId = undefined
      if (!id) return
      try {
        this.onStorageReady(id)
      } catch {
        // ignore
      }
    }, DEBOUNCE_MS)
  }

  private rememberGlobalSettingsMtime() {
    const file = AgentSignalFiles.globalRefreshSettingsPath()
    try {
      if (!fs.existsSync(file) || !fs.statSync(file).isFile()) {
        this.lastSeenGlobalSettingsMtimeMs = 0
        return
      }
      this.lastSeenGlobalSettingsMtimeMs = fs.statSync(file).mtimeMs
    } catch {
      this.lastSeenGlobalSettingsMtimeMs = 0
    }
  }

  private considerGlobalSettingsSignal() {
    const file = AgentSignalFiles.globalRefreshSettingsPath()
    if (!AgentSignalFiles.isFresh(file)) return
    let mtime: number
    try {
      mtime = fs.statSync(file).mtimeMs
    } catch {
      return
    }
    const prev = this.lastSeenGlobalSettingsMtimeMs
    this.lastSeenGlobalSettingsMtimeMs = mtime
    if (prev === mtime) return
    if (prev < 0) return
    this.scheduleGlobalSettings()
  }

  private scheduleGlobalSettings() {
    if (this.globalSettingsTimer) clearTimeout(this.globalSettingsTimer)
    this.globalSettingsTimer = setTimeout(() => {
      try {
        this.onGlobalSettingsRefresh()
      } catch {
        this.lastSeenGlobalSettingsMtimeMs = -1
      }
    }, DEBOUNCE_MS)
  }
}
