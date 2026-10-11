import { fileURLToPath } from 'node:url';
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const cliPath = fileURLToPath(new URL('../bin/diagram-forge.mjs', import.meta.url));
const model = { type: 'architecture', title: 'Test system', nodes: [{ id: 'a', label: 'App' }, { id: 'b', label: 'API' }], edges: [{ from: 'a', to: 'b' }] };

function runCli(args, { input } = {}) {
  return spawnSync(process.execPath, [cliPath, ...args], { encoding: 'utf8', input });
}

function makeWorkspace() {
  const directory = mkdtempSync(join(tmpdir(), 'diagram-forge-cli-'));
  const modelPath = join(directory, 'model.json');
  writeFileSync(modelPath, JSON.stringify(model));
  return { directory, modelPath };
}

test('render refuses to overwrite its own input, even with --force', () => {
  const { directory } = makeWorkspace();
  const modelPath = join(directory, 'model.html');
  writeFileSync(modelPath, JSON.stringify(model));
  const result = runCli(['render', modelPath, modelPath, '--force']);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /input file/);
  assert.equal(JSON.parse(readFileSync(modelPath, 'utf8')).title, 'Test system');
});

test('render refuses an existing output file without --force and replaces it with --force', () => {
  const { directory, modelPath } = makeWorkspace();
  const outputPath = join(directory, 'out.html');
  writeFileSync(outputPath, 'precious');
  const refused = runCli(['render', modelPath, outputPath]);
  assert.equal(refused.status, 1);
  assert.match(refused.stderr, /--force/);
  assert.equal(readFileSync(outputPath, 'utf8'), 'precious');
  const forced = runCli(['render', modelPath, outputPath, '--force']);
  assert.equal(forced.status, 0);
  assert.match(readFileSync(outputPath, 'utf8'), /<!doctype html>/);
});

test('failed render leaves no output directory behind', () => {
  const { directory, modelPath } = makeWorkspace();
  const outputPath = join(directory, 'nested', 'out.html');
  const result = runCli(['render', modelPath, outputPath, '--theme', 'nope']);
  assert.notEqual(result.status, 0);
  assert.equal(existsSync(join(directory, 'nested')), false);
});

test('--theme works before and after the output path', () => {
  const { directory, modelPath } = makeWorkspace();
  const after = join(directory, 'after.html');
  const before = join(directory, 'before.html');
  assert.equal(runCli(['render', modelPath, after, '--theme', 'midnight']).status, 0);
  assert.equal(runCli(['render', '--theme', 'midnight', modelPath, before]).status, 0);
  assert.equal(readFileSync(before, 'utf8'), readFileSync(after, 'utf8'));
  assert.equal(existsSync(join(directory, '--theme')), false);
});

test('unknown theme is a usage error naming the theme', () => {
  const { directory, modelPath } = makeWorkspace();
  const result = runCli(['render', modelPath, join(directory, 'out.html'), '--theme', 'nope']);
  assert.equal(result.status, 2);
  assert.match(result.stderr, /Unknown theme "nope"/);
});

test('inherited object keys are not themes', () => {
  const { directory, modelPath } = makeWorkspace();
  const result = runCli(['render', modelPath, join(directory, 'out.html'), '--theme', '__proto__']);
  assert.equal(result.status, 2);
});

test('bare --theme is a usage error', () => {
  const { directory, modelPath } = makeWorkspace();
  const result = runCli(['render', modelPath, join(directory, 'out.html'), '--theme']);
  assert.equal(result.status, 2);
  assert.match(result.stderr, /theme/);
});

test('--help and -h print usage to stdout and exit 0', () => {
  for (const flag of ['--help', '-h']) {
    const result = runCli([flag]);
    assert.equal(result.status, 0);
    assert.match(result.stdout, /diagram-forge render/);
    assert.match(result.stdout, /Exit codes/);
  }
});

test('--version prints the package version', () => {
  const result = runCli(['--version']);
  assert.equal(result.status, 0);
  assert.equal(result.stdout.trim(), JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version);
});

test('missing command and unknown flags exit 2', () => {
  assert.equal(runCli([]).status, 2);
  assert.equal(runCli(['check', '--bogus']).status, 2);
});

test('malformed JSON exits 1', () => {
  const { directory } = makeWorkspace();
  const badPath = join(directory, 'bad.json');
  writeFileSync(badPath, '{not json');
  const result = runCli(['check', badPath]);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Could not read JSON/);
});

test('check accepts a valid model and rejects an invalid one', () => {
  const { directory, modelPath } = makeWorkspace();
  const valid = runCli(['check', modelPath]);
  assert.equal(valid.status, 0);
  assert.match(valid.stdout, /structurally valid/);
  const invalidPath = join(directory, 'invalid.json');
  writeFileSync(invalidPath, JSON.stringify({ ...model, edges: [{ from: 'a', to: 'missing' }] }));
  const invalid = runCli(['check', invalidPath]);
  assert.equal(invalid.status, 1);
  assert.match(invalid.stderr, /unknown node/);
});

test('uppercase .SVG extension renders native SVG', () => {
  const { directory, modelPath } = makeWorkspace();
  const outputPath = join(directory, 'out.SVG');
  assert.equal(runCli(['render', modelPath, outputPath]).status, 0);
  assert.match(readFileSync(outputPath, 'utf8'), /^<svg/);
});

test('unsupported output extension is rejected and writes nothing', () => {
  const { directory, modelPath } = makeWorkspace();
  const outputPath = join(directory, 'out.png');
  const result = runCli(['render', modelPath, outputPath]);
  assert.equal(result.status, 2);
  assert.match(result.stderr, /\.png/);
  assert.equal(existsSync(outputPath), false);
});

test('reads the model from stdin and writes the artifact to stdout', () => {
  const html = runCli(['render', '-', '-'], { input: JSON.stringify(model) });
  assert.equal(html.status, 0);
  assert.match(html.stdout, /<!doctype html>/);
  const svg = runCli(['render', '-', '-', '--format', 'svg'], { input: JSON.stringify(model) });
  assert.equal(svg.status, 0);
  assert.match(svg.stdout, /^<svg/);
  assert.equal(runCli(['check', '-'], { input: JSON.stringify(model) }).status, 0);
});

test('CLI writes native SVG output when requested', () => {
  const { directory } = makeWorkspace();
  const output = join(directory, 'demo.svg');
  const result = runCli(['render', fileURLToPath(new URL('../examples/product-architecture.json', import.meta.url)), output, '--theme', 'ocean']);
  assert.equal(result.status, 0);
  assert.match(readFileSync(output, 'utf8'), /^<svg/);
});

test('check reports a nonexistent input file and exits 1', () => {
  const missingPath = join(makeWorkspace().directory, 'missing.json');
  const result = runCli(['check', missingPath]);
  assert.equal(result.status, 1);
  assert.ok(result.stderr.includes(missingPath), result.stderr);
});

test('check lists a missing title and an unknown type in order and exits 1', () => {
  const result = runCli(['check', '-'], { input: JSON.stringify({ type: 'bogus' }) });
  assert.equal(result.status, 1);
  const lines = result.stderr.trim().split('\n');
  assert.match(lines[0], /^✗ Unsupported type "bogus"\. Supported: architecture, /);
  assert.equal(lines[1], '✗ A title is required.');
});
