#!/usr/bin/env node
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { document, render, supportedTypes, validate } from '../lib/forge.mjs';

const [command, input, output, ...flags] = process.argv.slice(2);
const usage = `Diagram Forge\n\n  diagram-forge check <model.json>\n  diagram-forge render <model.json> <output.html|output.svg> [--theme paper|midnight|ocean|ember]\n  diagram-forge types`;

if (command === 'types') { console.log(supportedTypes().join('\n')); process.exit(0); }
if (!['check', 'render'].includes(command) || !input || (command === 'render' && !output)) { console.error(usage); process.exit(1); }
let model;
try { model = JSON.parse(await readFile(input, 'utf8')); } catch (error) { console.error(`Could not read JSON: ${error.message}`); process.exit(1); }
const errors = validate(model);
if (errors.length) { console.error(errors.map(x => `✗ ${x}`).join('\n')); process.exit(1); }
if (command === 'check') { console.log(`✓ ${model.type}: ${model.title} is structurally valid`); process.exit(0); }
const themeIndex = flags.indexOf('--theme');
const theme = themeIndex >= 0 ? flags[themeIndex + 1] : 'paper';
await mkdir(dirname(output), { recursive: true });
const artifact = output.toLowerCase().endsWith('.svg')
  ? render(model, { theme })
  : document(model, { theme });
await writeFile(output, artifact);
console.log(`✓ Wrote ${output} (${model.type}, ${theme})`);
