import * as xmljs from 'xml-js';

export function parseXml(xml: string): any {
  return xmljs.xml2js(xml, { compact: true });
}

export function serializeXml(obj: any): string {
  return xmljs.js2xml(obj, { compact: true, spaces: 2 });
}