/*
 * Copyright (C) 2025-2026 Code Trace Tree Contributors
 *
 * SPDX-License-Identifier: MIT
 */
import * as vscode from 'vscode'
import { TracePointService } from './TracePointService'
import { TracePointsViewProvider } from './TracePointsViewProvider'
import { registerCreateRootTracePoint } from './commands/createRootTracePoint'
import { registerCreateTracePointUnderSelected } from './commands/createTracePointUnderSelected'
import { registerCreateRootPathTracePoint } from './commands/createRootPathTracePoint'
import { registerCreatePathTracePointUnderSelected } from './commands/createPathTracePointUnderSelected'
import { registerUpdateTracePoint } from './commands/updateTracePoint'
import { registerMoveUp } from './commands/moveUp'
import { registerMoveDown } from './commands/moveDown'
import { registerExpandSelected } from './commands/expandSelected'
import { registerCollapseAll } from './commands/collapseAll'
import { registerToggleHighlights } from './commands/toggleHighlights'
import { registerOpenAdvancedSettings } from './commands/openAdvancedSettings'
import { registerToggleNamePrompt } from './commands/toggleNamePrompt'
import { registerExportTracePoints } from './commands/exportTracePoints'
import { registerImportTracePoints, registerBrowseStoredProjects } from './commands/importTracePoints'
import { registerGoToTracePoint } from './commands/goToTracePoint'
import { registerGoToTracePointInTree } from './commands/goToTracePointInTree'
import { registerRenameTracePoint } from './commands/renameTracePoint'
import { registerDeleteTracePoints } from './commands/deleteTracePoints'
import { registerCopyTracePointText } from './commands/copyTracePointText'
import { registerShowLineContent } from './commands/showLineContent'
import { DescriptionViewProvider } from './DescriptionViewProvider'
import { ProfileViewProvider } from './ProfileViewProvider'
import { EmptyTracePointsViewProvider } from './EmptyTracePointsViewProvider'
import { ExternalStorageWatcher } from './storage/ExternalStorageWatcher'
import { StorageReadyWatcher } from './storage/StorageReadyWatcher'
import { setEditorEligibleContext } from './utils/editorEligibility'

let service: TracePointService
let listView: TracePointsViewProvider
let externalWatcher: ExternalStorageWatcher | undefined
let storageReadyWatcher: StorageReadyWatcher | undefined

export function activate(context: vscode.ExtensionContext) {
  service = TracePointService.getInstance(context)
  listView = new TracePointsViewProvider(service)
  service.setListView(listView)

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider('codeTraceTree.view', listView)
  )

  const profileProvider = new ProfileViewProvider(context.extensionUri, service)
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider('codeTraceTree.profile', profileProvider)
  )

  const descProvider = new DescriptionViewProvider(context.extensionUri, service)
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider('codeTraceTree.description', descProvider)
  )

  const emptyProvider = new EmptyTracePointsViewProvider(
    'codeTraceTree.browseStoredProjects',
    () => service.listStoredProjects().length > 0
  )
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider('codeTraceTree.empty', emptyProvider)
  )

  registerCreateRootTracePoint(context, service)
  registerCreateTracePointUnderSelected(context, service)
  registerCreateRootPathTracePoint(context, service)
  registerCreatePathTracePointUnderSelected(context, service)
  registerUpdateTracePoint(context, service)
  registerMoveUp(context, service)
  registerMoveDown(context, service)
  registerExpandSelected(context, listView)
  registerCollapseAll(context, listView)
  registerToggleHighlights(context, service)
  registerOpenAdvancedSettings(context, service)
  registerToggleNamePrompt(context, service)
  registerExportTracePoints(context, service)
  registerImportTracePoints(context, service)
  registerBrowseStoredProjects(context, service)
  registerGoToTracePoint(context, service)
  registerGoToTracePointInTree(context, service)
  registerRenameTracePoint(context, service)
  registerDeleteTracePoints(context, service)
  registerCopyTracePointText(context, service)
  registerShowLineContent(context, service)

  const refreshEditorEligibleContext = () => {
    void setEditorEligibleContext(
      vscode.window.activeTextEditor,
      service.getWorkspaceRoot()
    )
  }
  const afterLoadState = () => {
    emptyProvider.refresh()
    listView.sync()
    startExternalWatcher(context)
    refreshEditorEligibleContext()
  }

  refreshEditorEligibleContext()
  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor(() => refreshEditorEligibleContext()),
    vscode.workspace.onDidChangeWorkspaceFolders(() => {
      void service.loadState().then(afterLoadState)
    })
  )

  service.loadState().then(afterLoadState)
  service.setOnStorageBound(() => {
    startExternalWatcher(context)
    refreshEditorEligibleContext()
  })

  context.subscriptions.push(
    vscode.window.onDidChangeVisibleTextEditors(() => {
      service.applyHighlightsToAllEditors()
    }),
    vscode.window.onDidChangeActiveColorTheme(() => {
      service.applyHighlightsToAllEditors()
    })
  )
  service.addProfileListener(() => {
    emptyProvider.refresh()
    listView.sync()
  })

  context.subscriptions.push(
    vscode.workspace.onDidChangeTextDocument((e) => service.handleDocumentChange(e)),
    vscode.workspace.onDidOpenTextDocument((doc) => service.attachListenersAndHighlight(doc)),
    // Rebind LINE anchors after disk saves (covers tools that write files outside the editor)
    vscode.workspace.onDidSaveTextDocument((doc) => {
      const rel = vscode.workspace.asRelativePath(doc.uri)
      void service.rebindLineNodesForPaths([rel])
    })
  )
}

function startExternalWatcher(
  context: vscode.ExtensionContext,
  options?: { replayExistingRefresh?: boolean }
) {
  const replayExistingRefresh = options?.replayExistingRefresh !== false
  const workspaceRoot =
    service.getWorkspaceRoot() || vscode.workspace.workspaceFolders?.[0]?.uri.fsPath
  if (!workspaceRoot) return

  const projectId = service.getBoundProjectId()
  if (!projectId) {
    externalWatcher?.dispose()
    externalWatcher = undefined
    if (!storageReadyWatcher) {
      storageReadyWatcher = new StorageReadyWatcher((signalProjectId) => {
        void service.handleStorageReadySignal(signalProjectId).then((bound) => {
          if (bound) {
            // Data already loaded via storage-ready; skip replaying request_refresh.
            startExternalWatcher(context, { replayExistingRefresh: false })
          }
        })
      })
      storageReadyWatcher.start()
      context.subscriptions.push(storageReadyWatcher)
    }
    return
  }

  storageReadyWatcher?.dispose()
  storageReadyWatcher = undefined
  externalWatcher?.dispose()
  externalWatcher = new ExternalStorageWatcher(
    projectId,
    (reason) => {
      void service.reloadFromExternalStorage(reason, true)
    },
    () => {
      void service.handleExternalProfileRefreshRequest()
    },
    () => {
      void service.handleExternalSelectRequest()
    }
  )
  externalWatcher.start(replayExistingRefresh)
  context.subscriptions.push(externalWatcher)
}

export function deactivate() {
  service?.persistNow()
  externalWatcher?.dispose()
  externalWatcher = undefined
  storageReadyWatcher?.dispose()
  storageReadyWatcher = undefined
}
