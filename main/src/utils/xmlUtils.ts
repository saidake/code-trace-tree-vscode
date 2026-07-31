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
import { XMLParser, XMLBuilder } from 'fast-xml-parser'

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  parseTagValue: false,
  trimValues: true,
  // Force arrays only for repeating list children (not single-export root <traceProfile>)
  isArray: (name, jpath) =>
    name === 'tracePointNode' ||
    (name === 'traceProfile' && String(jpath).includes('traceProfiles')) ||
    (name === 'id' && String(jpath).includes('expandedTracePointIds'))
})

const builder = new XMLBuilder({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  format: true,
  indentBy: '  ',
  suppressEmptyNode: false
})

export function parseXml(xml: string): any {
  return parser.parse(xml)
}

export function serializeXml(obj: any): string {
  return builder.build(obj)
}

/** Normalize a single-or-array XML value into an array. */
export function asArray<T>(value: T | T[] | undefined | null): T[] {
  if (value == null || value === '') return []
  return Array.isArray(value) ? value : [value]
}
