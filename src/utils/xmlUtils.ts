import { XMLParser, XMLBuilder } from 'fast-xml-parser';

const parser = new XMLParser({
  ignoreAttributes: false,
  parseTagValue: true,   
  trimValues: true,      
});

const builder = new XMLBuilder({
  ignoreAttributes: false,
  format: true,          
  indentBy: '  ',
});

export function parseXml(xml: string): any {
  return parser.parse(xml);
}

export function serializeXml(obj: any): string {
  return builder.build(obj);
}
