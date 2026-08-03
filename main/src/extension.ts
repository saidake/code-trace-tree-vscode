/*
 * Copyright (C) 2025-2026 Code Trace Tree Contributors
 *
 * SPDX-License-Identifier: MIT
 */
import * as vscode from 'vscode'
import { TracePointService } from './TracePointService'
import { TracePointTreeDataProvider } from './TracePointTreeDataProvider'
import { registerCreateRootTracePoint } from './commands/createRootTracePoint'
import { registerCreateTracePointUnderSelected } from './commands/createTracePointUnderSelected'
import { registerCreateRootPathTracePoint } from './commands/createRootPathTracePoint'
import { registerCreatePathTracePointUnderSelected } from './commands/createPathTracePointUnderSelected'
import { registerUpdateTracePoint } from './commands/updateTracePoint'
import { registerMoveUp } from './commands/moveUp'
import { registerMoveDown } from './commands/moveDown'
import { registerExpandSelected } from './commands/expandSelected'
import { registerToggleHighlights } from './commands/toggleHighlights'
import { registerToggleNamePrompt } from './commands/toggleNamePrompt'
import { registerExportTracePoints } from './commands/exportTracePoints'
import { registerImportTracePoints } from './commands/importTracePoints'
import { registerGoToTracePoint } from './commands/goToTracePoint'
import {
  registerGoToTracePointInTree,
  updateTracePointAtCaretContext
} from './commands/goToTracePointInTree'
import { registerRenameTracePoint } from './commands/renameTracePoint'
import { registerDeleteTracePoints } from './commands/deleteTracePoints'
import { registerCopyTracePointText } from './commands/copyTracePointText'
import { DescriptionViewProvider } from './DescriptionViewProvider'
import { ProfileViewProvider } from './ProfileViewProvider'
import { ExternalStorageWatcher } from './storage/ExternalStorageWatcher'

let service: TracePointService
let treeDataProvider: TracePointTreeDataProvider
let treeView: vscode.TreeView<vscode.TreeItem>
let externalWatcher: ExternalStorageWatcher | undefined

export function activate(context: vscode.ExtensionContext) {
  service = TracePointService.getInstance(context)
  treeDataProvider = new TracePointTreeDataProvider(service)
  treeView = vscode.window.createTreeView('codeTraceTree.view', {
    treeDataProvider,
    canSelectMany: true,
    showCollapseAll: true,
    dragAndDropController: treeDataProvider
  })

  const profileProvider = new ProfileViewProvider(context.extensionUri, service)
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider('codeTraceTree.profile', profileProvider)
  )

  const descProvider = new DescriptionViewProvider(context.extensionUri, service)
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider('codeTraceTree.description', descProvider)
  )

  context.subscriptions.push(
    treeView.onDidChangeSelection((e) => {
      const selectedIds = e.selection
        .map((item) => service.resolveNodeId(item.id))
        .filter((id): id is string => !!id)
      service.selectTracePoints(selectedIds)
    })
  )
  context.subscriptions.push(
    treeView.onDidExpandElement((e) => {
      if (!service.shouldPersistExpandEvents()) return
      const id = service.resolveNodeId(e.element.id)
      if (!id) return
      const expanded = service.getExpandedTracePointIds()
      expanded.add(id)
      service.setExpandedTracePointIds(expanded)
    }),
    treeView.onDidCollapseElement((e) => {
      if (!service.shouldPersistExpandEvents()) return
      const id = service.resolveNodeId(e.element.id)
      if (!id) return
      const expanded = service.getExpandedTracePointIds()
      expanded.delete(id)
      service.setExpandedTracePointIds(expanded)
    })
  )

  registerCreateRootTracePoint(context, service, treeDataProvider)
  registerCreateTracePointUnderSelected(context, service, treeDataProvider, treeView)
  registerCreateRootPathTracePoint(context, service)
  registerCreatePathTracePointUnderSelected(context, service, treeView)
  registerUpdateTracePoint(context, service, treeView)
  registerMoveUp(context, service, treeView, treeDataProvider)
  registerMoveDown(context, service, treeView, treeDataProvider)
  registerExpandSelected(context, treeView, treeDataProvider)
  registerToggleHighlights(context, service)
  registerToggleNamePrompt(context, service)
  registerExportTracePoints(context, service)
  registerImportTracePoints(context, service)
  registerGoToTracePoint(context, service, treeView)
  registerGoToTracePointInTree(context, service, treeView)
  registerRenameTracePoint(context, service, treeView, treeDataProvider)
  registerDeleteTracePoints(context, service, treeView, treeDataProvider)
  registerCopyTracePointText(context, service, treeView)

  service.loadState().then(() => {
    updateTracePointAtCaretContext(service)
    startExternalWatcher(context)
  })
  service.setOnStorageBound(() => startExternalWatcher(context))

  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor(() => updateTracePointAtCaretContext(service)),
    vscode.window.onDidChangeVisibleTextEditors(() => {
      service.applyHighlightsToAllEditors()
    }),
    vscode.window.onDidChangeTextEditorSelection(() => updateTracePointAtCaretContext(service))
  )
  service.addNodeListener('refresh', () => updateTracePointAtCaretContext(service))

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

function startExternalWatcher(context: vscode.ExtensionContext) {
  const projectId = service.getBoundProjectId()
  if (!projectId) return
  externalWatcher?.dispose()
  externalWatcher = new ExternalStorageWatcher(
    projectId,
    () => service.shouldIgnoreExternalChanges(),
    (reason) => {
      void service.reloadFromExternalStorage(reason)
    },
    () => {
      void service.handleExternalProfileRefreshRequest()
    },
    () => {
      void service.handleExternalSelectRequest(treeView)
    }
  )
  externalWatcher.start()
  context.subscriptions.push(externalWatcher)
}

export function deactivate() {
  service?.persistNow()
  externalWatcher?.dispose()
  externalWatcher = undefined
}
