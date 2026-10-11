#!/usr/bin/env node
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { dirname, extname, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { document, listThemes, render, supportedTypes, validate } from '../lib/forge.mjs';

const EXIT_FAILURE = 1;
const EXIT_USAGE = 2;
const DEFAULT_THEME = 'paper';
const STDIO = '-';

const usage = `Diagram Forge

  diagram-forge check <model.json|->
  diagram-forge render <model.json|-> <output.html|output.svg|-> [--theme <name>] [--format html|svg] [--force]
  diagram-forge types

Options:
  --theme <name>   one of: ${listThemes().join(', ')} (default ${DEFAULT_THEME})
  --format <kind>  html or svg; only for stdout output ("-"), otherwise taken from the file extension
  --force          replace an existing output file
  -h, --help       show this help
  --version        show the version

"-" reads the model from stdin or writes the artifact to stdout (html unless --format svg).
Exit codes: 0 success, 1 failure (bad JSON, invalid model, refused or failed write), 2 usage error.`;

class UsageError extends Error {}

function parseCommandLine() {
  try {
    return parseArgs({
      allowPositionals: true,
      strict: true,
      options: {
        theme: { type: 'string' },
        format: { type: 'string' },
        force: { type: 'boolean' },
        help: { type: 'boolean', short: 'h' },
        version: { type: 'boolean' },
      },
    });
  } catch (error) {
    throw new UsageError(error.message);
  }
}

async function readInput(inputPath) {
  if (inputPath !== STDIO) return readFile(inputPath, 'utf8');
  process.stdin.setEncoding('utf8');
  let text = '';
  for await (const chunk of process.stdin) text += chunk;
  return text;
}

async function isSameFile(pathA, pathB) {
  try {
    const [statA, statB] = await Promise.all([stat(pathA), stat(pathB)]);
    return statA.dev === statB.dev && statA.ino === statB.ino;
  } catch { return resolve(pathA) === resolve(pathB); }
}

async function pathExists(filePath) {
  try { await stat(filePath); return true; } catch { return false; }
}

async function writeArtifact(outputPath, inputPath, artifact, force) {
  if (inputPath !== STDIO && await isSameFile(inputPath, outputPath)) {
    throw new Error(`Refusing to overwrite the input file ${inputPath}`);
  }
  if (!force && await pathExists(outputPath)) throw new Error(`${outputPath} already exists; pass --force to replace it`);
  await mkdir(dirname(outputPath), { recursive: true });
  try {
    await writeFile(outputPath, artifact, { flag: force ? 'w' : 'wx' });
  } catch (error) {
    if (error.code === 'EEXIST') throw new Error(`${outputPath} already exists; pass --force to replace it`);
    throw error;
  }
}

function pickFormat(outputPath, format) {
  if (outputPath === STDIO) {
    if (format && !['html', 'svg'].includes(format)) throw new UsageError(`Unsupported --format "${format}"; use html or svg`);
    return format ?? 'html';
  }
  if (format) throw new UsageError('--format only applies to stdout output ("-")');
  const extension = extname(outputPath).toLowerCase();
  if (extension === '.html') return 'html';
  if (extension === '.svg') return 'svg';
  throw new UsageError(`Unsupported output extension "${extension}"; use .html or .svg`);
}

async function main() {
  const { values, positionals } = parseCommandLine();
  if (values.help) { console.log(usage); return; }
  if (values.version) {
    const manifest = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
    console.log(manifest.version);
    return;
  }
  const [command, inputPath, outputPath] = positionals;
  if (command === 'types' && positionals.length === 1) { console.log(supportedTypes().join('\n')); return; }
  const expectedArgs = command === 'render' ? 3 : 2;
  if (!['check', 'render'].includes(command) || positionals.length !== expectedArgs) {
    throw new UsageError(command === undefined ? 'Missing command' : `Invalid arguments for "${command}"`);
  }
  const theme = values.theme ?? DEFAULT_THEME;
  if (!listThemes().includes(theme)) throw new UsageError(`Unknown theme "${theme}"; choose one of: ${listThemes().join(', ')}`);
  const format = command === 'render' ? pickFormat(outputPath, values.format) : undefined;

  let model;
  try { model = JSON.parse(await readInput(inputPath)); } catch (error) { throw new Error(`Could not read JSON: ${error.message}`); }
  const errors = validate(model);
  if (errors.length) throw new Error(errors.map(message => `✗ ${message}`).join('\n'));
  if (command === 'check') { console.log(`✓ ${model.type}: ${model.title} is structurally valid`); return; }

  const artifact = format === 'svg' ? render(model, { theme }) : document(model, { theme });
  if (outputPath === STDIO) { process.stdout.write(artifact); return; }
  await writeArtifact(outputPath, inputPath, artifact, values.force);
  console.log(`✓ Wrote ${outputPath} (${model.type}, ${theme})`);
}

try {
  await main();
} catch (error) {
  console.error(error.message);
  if (error instanceof UsageError) console.error(`\n${usage}`);
  process.exitCode = error instanceof UsageError ? EXIT_USAGE : EXIT_FAILURE;
}
