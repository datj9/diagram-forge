import test from 'node:test';
import assert from 'node:assert/strict';
import { document, render, supportedTypes, validate } from '../lib/forge.mjs';

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
