/*
 * Copyright (C) 2025-2026 Code Trace Tree Contributors
 *
 * SPDX-License-Identifier: MIT
 */
import * as vscode from 'vscode'
import { TracePointService } from '../TracePointService'

/**
 * Resolves the name used when creating a trace point.
 * Returns `undefined` when the user cancels a name prompt (caller should abort).
 * Returns `""` when name prompting is disabled.
 */
export async function resolveNewTracePointName(
  service: TracePointService,
  prompt: string,
  initialValue?: string
): Promise<string | undefined> {
  if (!service.isNamePromptEnabled()) return ''
  return vscode.window.showInputBox({
    prompt,
    placeHolder: 'Leave empty for no name',
    value: initialValue
  })
}
