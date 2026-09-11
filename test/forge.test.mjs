import test from 'node:test';
import assert from 'node:assert/strict';
import { document, render, supportedTypes, validate } from '../lib/forge.mjs';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const architecture = { type: 'architecture', title: 'Test system', nodes: [{ id: 'a', label: 'App' }, { id: 'b', label: 'API' }], edges: [{ from: 'a', to: 'b', label: 'calls' }] };

test('supports the promised visual vocabulary', () => assert.equal(supportedTypes().length, 12));
test('renders a standalone accessible SVG document', () => {
  const html = document(architecture, { theme: 'midnight' });
  assert.match(html, /<!doctype html>/);
  assert.match(html, /role="img"/);
  assert.match(html, /Diagram Forge/);
  assert.match(html, /Test system/);
});
test('rejects unknown graph endpoints', () => assert.match(validate({ ...architecture, edges: [{ from: 'a', to: 'missing' }] }).join(' '), /unknown node/));
test('renders editorial roadmap data', () => assert.match(render({ type: 'roadmap', title: 'Plan', items: [{ label: 'One', value: 1 }] }), /One/));
test('renders every advertised type', () => {
  for (const type of supportedTypes()) {
    const model = ['timeline', 'roadmap', 'comparison', 'matrix', 'chart'].includes(type)
      ? { type, title: type, items: [{ label: 'One', value: 1 }] }
      : { type, title: type, nodes: [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }], edges: [{ from: 'a', to: 'b' }] };
    assert.match(render(model), new RegExp(type));
  }
});
test('CLI writes native SVG output when requested', () => {
  const directory = mkdtempSync(join(tmpdir(), 'diagram-forge-'));
  const output = join(directory, 'demo.svg');
  execFileSync(process.execPath, ['bin/diagram-forge.mjs', 'render', 'examples/product-architecture.json', output, '--theme', 'ocean']);
  assert.match(readFileSync(output, 'utf8'), /^<svg/);
});
