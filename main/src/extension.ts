import * as vscode from 'vscode'
import { TracePointService } from './TracePointService'
import { TracePointTreeDataProvider } from './TracePointTreeDataProvider'
import { registerCreateRootTracePoint } from './commands/createRootTracePoint'
import { registerCreateTracePointUnderSelected } from './commands/createTracePointUnderSelected'
import { registerUpdateTracePoint } from './commands/updateTracePoint'
import { registerMoveUp } from './commands/moveUp'
import { registerMoveDown } from './commands/moveDown'
import { registerExpandSelected } from './commands/expandSelected'
import { registerToggleHighlights } from './commands/toggleHighlights'
import { registerExportTracePoints } from './commands/exportTracePoints'
import { registerImportTracePoints } from './commands/importTracePoints'
import { registerGoToTracePoint } from './commands/goToTracePoint'
import { registerRenameTracePoint } from './commands/renameTracePoint'
import { registerDeleteTracePoints } from './commands/deleteTracePoints'
import { DescriptionViewProvider } from './DescriptionViewProvider'
import { ProfileViewProvider } from './ProfileViewProvider'

let service: TracePointService
let treeDataProvider: TracePointTreeDataProvider
let treeView: vscode.TreeView<vscode.TreeItem>

export function activate(context: vscode.ExtensionContext) {
  service = TracePointService.getInstance(context)
  treeDataProvider = new TracePointTreeDataProvider(service)
  treeView = vscode.window.createTreeView('codeTraceTree.view', {
    treeDataProvider,
    canSelectMany: true,
    showCollapseAll: true,
    dragAndDropController: treeDataProvider
  })

  // Profile selector webview (above Trace Points)
  const profileProvider = new ProfileViewProvider(context.extensionUri, service)
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider('codeTraceTree.profile', profileProvider)
  )

  // Description webview
  const descProvider = new DescriptionViewProvider(context.extensionUri, service)
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider('codeTraceTree.description', descProvider)
  )

  // Listen to tree view selection changes
  context.subscriptions.push(
    treeView.onDidChangeSelection((e) => {
      const selectedIds = e.selection.map((item) => item.id!).filter((id) => id !== undefined)
      service.selectTracePoints(selectedIds)
    })
  )
  // Listen to tree view expand/collapse events
  context.subscriptions.push(
    treeView.onDidExpandElement((e) => {
      const id = e.element.id!
      const expanded = service.getExpandedTracePointIds()
      expanded.add(id)
      service.setExpandedTracePointIds(expanded)
    }),
    treeView.onDidCollapseElement((e) => {
      const id = e.element.id!
      const expanded = service.getExpandedTracePointIds()
      expanded.delete(id)
      service.setExpandedTracePointIds(expanded)
    })
  )
  // Register all commands
  registerCreateRootTracePoint(context, service, treeDataProvider)
  registerCreateTracePointUnderSelected(context, service, treeDataProvider, treeView)
  registerUpdateTracePoint(context, service, treeView)
  registerMoveUp(context, service, treeView, treeDataProvider)
  registerMoveDown(context, service, treeView, treeDataProvider)
  registerExpandSelected(context, treeView, treeDataProvider)
  registerToggleHighlights(context, service)
  registerExportTracePoints(context, service)
  registerImportTracePoints(context, service)
  registerGoToTracePoint(context, service, treeView)
  registerRenameTracePoint(context, service, treeView, treeDataProvider)
  registerDeleteTracePoints(context, service, treeView, treeDataProvider)

  // Load hybrid storage + active profile
  service.loadState()

  // Listen for document changes/openings
  vscode.workspace.onDidChangeTextDocument((e) => service.handleDocumentChange(e))
  vscode.workspace.onDidOpenTextDocument((doc) => service.attachListenersAndHighlight(doc))
}

export function deactivate() {
  // Flush pending profile/tree writes before unload
  service?.persistNow()
}
