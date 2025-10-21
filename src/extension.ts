import * as vscode from 'vscode';
import { TracePointService } from './TracePointService';
import { TracePointTreeDataProvider } from './TracePointTreeDataProvider';
import { registerCreateRootTracePoint } from './commands/createRootTracePoint'; 
import { registerCreateSelectedTracePoint } from './commands/createSelectedTracePoint'; 
import { registerUpdateTracePoint } from './commands/updateTracePoint';
import { registerMoveUp } from './commands/moveUp';
import { registerMoveDown } from './commands/moveDown';
import { registerExpandSelected } from './commands/expandSelected';
import { registerCollapseAll } from './commands/collapseAll';
import { registerToggleHighlights } from './commands/toggleHighlights';
import { registerToggleDescription } from './commands/toggleDescription';
import { registerExportTracePoints } from './commands/exportTracePoints';
import { registerImportTracePoints } from './commands/importTracePoints';
import { registerGoToTracePoint } from './commands/goToTracePoint';
import { registerRenameTracePoint } from './commands/renameTracePoint';
import { registerDeleteTracePoints } from './commands/deleteTracePoints';

let service: TracePointService;
let treeDataProvider: TracePointTreeDataProvider;
let treeView: vscode.TreeView<vscode.TreeItem>;

export function activate(context: vscode.ExtensionContext) {
  service = TracePointService.getInstance(context);
  treeDataProvider = new TracePointTreeDataProvider(service);
  treeView = vscode.window.createTreeView('codeTraceTree.view', { treeDataProvider, canSelectMany: true, dragAndDropController: treeDataProvider });

  // Register all commands
  registerCreateRootTracePoint(context, service, treeDataProvider);
  registerCreateSelectedTracePoint(context, service, treeDataProvider,treeView); 
  registerUpdateTracePoint(context, service, treeView);
  registerMoveUp(context, service, treeView, treeDataProvider);
  registerMoveDown(context, service, treeView, treeDataProvider);
  registerExpandSelected(context, treeView);
  registerCollapseAll(context, treeView);
  registerToggleHighlights(context, service);
  registerToggleDescription(context, service, treeDataProvider);
  registerExportTracePoints(context, service);
  registerImportTracePoints(context, service, treeDataProvider);
  registerGoToTracePoint(context, service, treeView);
  registerRenameTracePoint(context, service, treeView, treeDataProvider);
  registerDeleteTracePoints(context, service, treeView, treeDataProvider);

  // Load initial state
  service.loadState().then(() => treeDataProvider.refresh());

  // Listen for document changes/openings
  vscode.workspace.onDidChangeTextDocument((e) => service.handleDocumentChange(e));
  vscode.workspace.onDidOpenTextDocument((doc) => service.attachListenersAndHighlight(doc));
}

export function deactivate() {
  service.saveState();
}