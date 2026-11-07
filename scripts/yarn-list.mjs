#!/usr/bin/env node
// Compatibility shim: Yarn 4 removed the `yarn list` command, but vsce calls
// `yarn list --prod --json` to enumerate production dependencies.
// vsce expects Yarn classic's output shape:
//
//   {"type":"tree","data":{"trees":[{"name":"pkg@version","children":[]}...]}}
//
// This script reads main/package.json and emits that exact JSON shape on one line.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const pkg = JSON.parse(readFileSync(new URL('../main/package.json', import.meta.url), 'utf8'));

const trees = [
  {
    name: `${pkg.name}@${pkg.version}`,
    children: Object.entries(pkg.dependencies || {}).map(([name, range]) => ({
      name: `${name}@${String(range).replace(/^[^0-9]*/, '')}`,
      children: [],
    })),
  },
];

process.stdout.write(
  JSON.stringify({
    type: 'tree',
    data: { trees },
  })
);

