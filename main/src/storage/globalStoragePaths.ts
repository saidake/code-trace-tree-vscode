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
import * as os from 'os'
import * as path from 'path'
import { GLOBAL_APP_DIR_NAME } from '../domain/constants'

/** Resolve OS-specific base dir for global Code Trace Tree storage. */
export function resolveBaseDir(): string {
  const platform = process.platform
  const home = os.homedir()

  if (platform === 'win32') {
    const localAppData = process.env.LOCALAPPDATA
    if (localAppData && localAppData.trim()) return localAppData
    return path.join(home, 'AppData', 'Local')
  }
  if (platform === 'darwin') {
    return path.join(home, 'Library', 'Application Support')
  }
  const xdg = process.env.XDG_CONFIG_HOME
  if (xdg && xdg.trim()) return xdg
  return path.join(home, '.config')
}

export function resolveAppDir(): string {
  return path.join(resolveBaseDir(), GLOBAL_APP_DIR_NAME)
}
