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
 * Case C (no bound project id): watch `<appDir>/signals/` for
 * `<projectId>.storage-ready` (no TTL).
 *
 * On each signal, [onStorageReady] receives the projectId from the filename.
 * The service compares that id to `.idea`/`.vscode` `code-trace-tree.project.id`
 * and binds only when they match.
 *
 * Once storage is bound, dispose this watcher and start [ExternalStorageWatcher].
 */
export class StorageReadyWatcher implements vscode.Disposable {
  private readonly disposables: vscode.Disposable[] = []
  private readyTimer: ReturnType<typeof setTimeout> | undefined
  private pendingProjectId: string | undefined

  constructor(private readonly onStorageReady: (projectId: string) => void) {}

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
  }

  dispose() {
    if (this.readyTimer) clearTimeout(this.readyTimer)
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
}
