/*
 * Copyright (C) 2025-2026 Code Trace Tree Contributors
 *
 * SPDX-License-Identifier: MIT
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
