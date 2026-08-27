/*
 * Copyright (C) 2025-2026 Code Trace Tree Contributors
 *
 * SPDX-License-Identifier: MIT
 */
import * as path from 'path'
import * as vscode from 'vscode'

/** Context key for editor/context menu visibility. */
export const EDITOR_ELIGIBLE_CONTEXT = 'codeTraceTree.editorEligible'

/**
 * True when the URI is a real on-disk file under the Code Trace Tree project root.
 * Excludes SCM virtual buffers (`git:` Index / HEAD), untitled, and out-of-root files.
 */
export function isTraceEditorUri(
  uri: vscode.Uri | undefined,
  projectRoot?: string
): boolean {
  if (!uri || uri.scheme !== 'file') return false
  const root = projectRoot || vscode.workspace.workspaceFolders?.[0]?.uri.fsPath
  if (!root) return false
  const rel = path.relative(root, uri.fsPath)
  return rel !== '' && !rel.startsWith('..') && !path.isAbsolute(rel)
}

function isUri(value: unknown): value is vscode.Uri {
  return value instanceof vscode.Uri
}

/**
 * True for a single-file diff, multi-file diff, or notebook diff tab.
 * Duck-types TabInputTextMultiDiff so this works on VS Code / Cursor builds
 * whose @types predate that class. `isInDiffEditor` is not used: it is often
 * false while focus is in an inner pane (Git Working Tree).
 */
function isDiffTabInput(input: unknown): boolean {
  if (!input || typeof input !== 'object') return false
  if (input instanceof vscode.TabInputTextDiff) return true
  const vs = vscode as typeof vscode & {
    TabInputTextMultiDiff?: new (...args: never[]) => object
    TabInputNotebookDiff?: new (...args: never[]) => object
  }
  if (vs.TabInputTextMultiDiff && input instanceof vs.TabInputTextMultiDiff) return true
  if (vs.TabInputNotebookDiff && input instanceof vs.TabInputNotebookDiff) return true
  const rec = input as { original?: unknown; modified?: unknown; textDiffs?: unknown }
  if (isUri(rec.original) && isUri(rec.modified)) return true
  if (Array.isArray(rec.textDiffs)) return true
  return false
}

function groupShowsDiffTab(group: vscode.TabGroup): boolean {
  return !!group.activeTab && isDiffTabInput(group.activeTab.input)
}

/**
 * True when this text editor is a pane of a Git / text / notebook diff
 * (Working Tree and Index). The whole diff tab is off-limits.
 */
export function isEditorInDiffPanel(editor: vscode.TextEditor): boolean {
  if (editor.document.uri.scheme === 'git') return true

  const diffGroups = vscode.window.tabGroups.all.filter(groupShowsDiffTab)
  if (diffGroups.length === 0) return false
  // Inner panes often have no viewColumn. Any editor in a column that is
  // showing a diff tab is off-limits (Working Tree and Index).
  if (editor.viewColumn === undefined) return true
  return diffGroups.some((group) => group.viewColumn === editor.viewColumn)
}

/**
 * Normal project file editor only. False for Git diff panes (both sides).
 */
export function isTraceTextEditor(
  editor: vscode.TextEditor | undefined,
  projectRoot?: string
): boolean {
  if (!editor) return false
  if (!isTraceEditorUri(editor.document.uri, projectRoot)) return false
  if (isEditorInDiffPanel(editor)) return false
  return true
}

export async function setEditorEligibleContext(
  editor: vscode.TextEditor | undefined,
  projectRoot?: string
): Promise<void> {
  // Focus is on a diff tab (either pane): hide editor/context actions entirely.
  if (groupShowsDiffTab(vscode.window.tabGroups.activeTabGroup)) {
    await vscode.commands.executeCommand('setContext', EDITOR_ELIGIBLE_CONTEXT, false)
    return
  }
  const eligible = isTraceTextEditor(editor, projectRoot)
  await vscode.commands.executeCommand('setContext', EDITOR_ELIGIBLE_CONTEXT, eligible)
}
