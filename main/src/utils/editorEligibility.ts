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
 * Excludes SCM virtual buffers (Working Tree / Index), untitled, and out-of-root files.
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

export async function setEditorEligibleContext(
  editor: vscode.TextEditor | undefined,
  projectRoot?: string
): Promise<void> {
  const eligible = isTraceEditorUri(editor?.document.uri, projectRoot)
  await vscode.commands.executeCommand('setContext', EDITOR_ELIGIBLE_CONTEXT, eligible)
}
