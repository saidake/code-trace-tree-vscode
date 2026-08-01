/*
 * Copyright (C) 2025-2026 Code Trace Tree Contributors
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program. If not, see <https://www.gnu.org/licenses/>.
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
