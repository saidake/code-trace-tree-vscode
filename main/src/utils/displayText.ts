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
import { TracePoint } from '../domain/types'

/** Location suffix shown after the purple name (includes leading space via TreeItem.description). */
export function formatLocationSuffix(tp: TracePoint): string {
  const fileName = tp.baseName.includes('/')
    ? tp.baseName.substring(tp.baseName.lastIndexOf('/') + 1)
    : tp.baseName
  switch (tp.traceType) {
    case 'LINE':
      return `(${fileName}:${tp.lineNumber})`
    case 'FILE':
      return `(${fileName})`
    case 'DIRECTORY':
      return `(${fileName}/)`
  }
}

/** Plain display text for clipboard / menus. */
export function formatDisplayText(tp: TracePoint): string {
  return `${tp.traceName} ${formatLocationSuffix(tp)}`
}
