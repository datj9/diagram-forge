import test from 'node:test';
import assert from 'node:assert/strict';
import { document, listThemes, render, supportedTypes, validate } from '../lib/forge.mjs';
import { cardRects } from './support/svg.mjs';

const architecture = { type: 'architecture', title: 'Test system', nodes: [{ id: 'a', label: 'App' }, { id: 'b', label: 'API' }], edges: [{ from: 'a', to: 'b', label: 'calls' }] };
const EDITORIAL = ['timeline', 'roadmap', 'comparison', 'matrix', 'chart'];

const luminance = hex => {
  const [red, green, blue] = [1, 3, 5].map(at => parseInt(hex.slice(at, at + 2), 16) / 255).map(channel => (channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4));
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
};
const contrast = (first, second) => {
  const [lighter, darker] = [luminance(first), luminance(second)].sort((left, right) => right - left);
  return (lighter + 0.05) / (darker + 0.05);
};

test('supports the promised visual vocabulary', () => assert.deepEqual(supportedTypes(), ['architecture', 'dataflow', 'workflow', 'sequence', 'lifecycle', 'timeline', 'roadmap', 'hierarchy', 'journey', 'comparison', 'matrix', 'chart']));
test('renders a standalone accessible SVG document', () => {
  const html = document(architecture, { theme: 'midnight' });
  assert.match(html, /<!doctype html>/);
  assert.ok(html.includes(render(architecture, { theme: 'midnight' })));
  assert.ok(html.includes('<title>Test system · Diagram Forge</title>'));
});
test('rejects unknown graph endpoints', () => assert.match(validate({ ...architecture, edges: [{ from: 'a', to: 'missing' }] }).join(' '), /unknown node/));

const GRAPH_TYPES = supportedTypes().filter(type => !EDITORIAL.includes(type));
const normalise = (svg, type) => svg.replace(/df-[a-z0-9]+/g, 'df-ID').replaceAll(`${type} diagram`, 'TYPE diagram');
const renderAlias = (type, body) => normalise(render({ type, title: 'Same', ...body }), type);

test('alias types render the same output', () => {
  const graphBody = { nodes: [{ id: 'a', label: 'Alpha' }, { id: 'b', label: 'Beta' }], edges: [{ from: 'a', to: 'b' }] };
  const graphSvgs = GRAPH_TYPES.map(type => renderAlias(type, graphBody));
  for (const svg of graphSvgs) assert.equal(svg, graphSvgs[0]);
  const itemsBody = { items: [{ label: 'One', value: 1 }, { label: 'Two', value: 2 }] };
  assert.equal(renderAlias('timeline', itemsBody), renderAlias('roadmap', itemsBody));
  assert.equal(renderAlias('comparison', itemsBody), renderAlias('chart', itemsBody));
});

test('rows grow to fit their tallest group so cards never overlap the next row', () => {
  const nodes = [
    ...['a1', 'a2', 'a3'].map(id => ({ id, label: id, group: 'G1' })),
    ...['g2', 'g3', 'g4', 'g5'].map(id => ({ id, label: id, group: id }))
  ];
  const svg = render({ type: 'architecture', title: 'Many groups', nodes });
  const cards = cardRects(svg);
  const thirdBottom = cards[2].y + cards[2].h;
  assert.ok(cards[6].y >= thirdBottom + 60, `next row at ${cards[6].y}, third card ends ${thirdBottom}`);
  const labelY = Number(svg.match(/<text x="[\d.]+" y="([\d.]+)"[^>]*letter-spacing="1.4"[^>]*>G5</)[1]);
  assert.ok(labelY > thirdBottom, 'group label must clear the tall group above');
});

test('chart values of 0 render zero-width bars, not positional ones', () => {
  const svg = render({ type: 'chart', title: 'Zeros', items: [{ label: 'a', value: 0 }, { label: 'b', value: 0 }, { label: 'c', value: 0 }] });
  const bars = [...svg.matchAll(/<rect x="300" y="\d+" width="([\d.]+)" height="29" rx="([\d.]+)"/g)].map(match => [match[1], match[2]]);
  assert.deepEqual(bars, [['0', '0'], ['0', '0'], ['0', '0']]);
});

test('narrow bars use a radius no larger than half their width', () => {
  const svg = render({ type: 'chart', title: 'Narrow', items: [{ label: 'big', value: 100 }, { label: 'small', value: 1 }] });
  assert.match(svg, /width="700" height="29" rx="14"/);
  assert.match(svg, /width="7" height="29" rx="3.5"/);
});

test('rejects negative, non-numeric and non-finite chart values', () => {
  for (const value of [-50, 'abc', NaN, Infinity]) {
    const errors = validate({ type: 'chart', title: 't', items: [{ value: 1 }, { value }] });
    assert.match(errors.join(' '), /items\[1\]\.value/, String(value));
  }
});

test('rejects more than 10 items instead of dropping them', () => {
  const items = count => Array.from({ length: count }, (_, index) => ({ label: `i${index}`, value: 1 }));
  for (const type of EDITORIAL) {
    assert.deepEqual(validate({ type, title: 't', items: items(11) }), [`${type} supports at most 10 items.`]);
    assert.deepEqual(validate({ type, title: 't', items: items(10) }), []);
  }
});

test('malformed models yield validation errors, never raw throws', () => {
  const pair = [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }];
  const malformed = [
    { type: 'architecture', title: 't', nodes: [null] },
    { type: 'architecture', title: 't', nodes: pair, edges: [null] },
    { type: 'architecture', title: 't', nodes: {} },
    { type: 'architecture', title: 't', nodes: [{ id: 'a', label: 'A', group: 5 }, { id: 'b', label: 'B' }] },
    { type: 'chart', title: 't', items: 'abc' },
    { type: 'chart', title: 't', items: { length: 1 } },
    { type: 'chart', title: 't', items: [null] },
    { type: 'architecture', title: 't', nodes: pair, edges: { length: 1 } },
    null, [], 'text', 42
  ];
  for (const model of malformed) {
    const errors = validate(model);
    assert.ok(Array.isArray(errors) && errors.length > 0, JSON.stringify(model));
    if (model && typeof model === 'object' && !Array.isArray(model)) assert.throws(() => render(model), Error);
  }
  assert.match(validate(malformed[0]).join(' '), /nodes\[0\]/);
  assert.match(validate(malformed[1]).join(' '), /edges\[0\]/);
  assert.match(validate(malformed[3]).join(' '), /nodes\[0\]\.group/);
});

test('accepts id 0 and rejects self-loop edges', () => {
  const nodes = [{ id: 0, label: 'Zero' }, { id: 1, label: 'One' }];
  assert.deepEqual(validate({ type: 'workflow', title: 't', nodes, edges: [{ from: 0, to: 1 }] }), []);
  assert.match(validate({ type: 'workflow', title: 't', nodes, edges: [{ from: 1, to: 1 }] }).join(' '), /edges\[0\] is a self-loop/);
});

test('handles very large inputs without stack overflow', () => {
  const items = Array.from({ length: 150000 }, () => ({ value: 1 }));
  assert.deepEqual(validate({ type: 'chart', title: 't', items }), ['chart supports at most 10 items.']);
  const nodes = Array.from({ length: 150000 }, (_, index) => ({ id: index, label: 'n', group: `g${index % 7}` }));
  assert.deepEqual(validate({ type: 'architecture', title: 't', nodes }), []);
});

test('edges that go backward or up a column stay outside card interiors', () => {
  const nodes = [{ id: 'a', label: 'A', group: 'One' }, { id: 'b', label: 'B', group: 'One' }, { id: 'c', label: 'C', group: 'Two' }];
  const edges = [{ from: 'c', to: 'a', label: 'back' }, { from: 'b', to: 'a', label: 'up' }, { from: 'a', to: 'c' }];
  const svg = render({ type: 'architecture', title: 'Routes', nodes, edges });
  const [cardA, cardB, cardC] = cardRects(svg);
  const paths = [...svg.matchAll(/<path d="(M[^"]+)" fill="none"/g)].map(match => match[1]);
  assert.equal(paths.length, 3);
  const backward = paths[0].match(/-?[\d.]+/g).map(Number);
  assert.equal(backward[0], cardC.x, 'backward edge leaves the left side of the source');
  assert.equal(backward[backward.length - 2], cardA.x + cardA.w, 'backward edge enters the right side of the target');
  assert.match(paths[1], /^M[\d.]+ [\d.]+ H[\d.]+ V[\d.]+ H[\d.]+$/);
  const channelX = Number(paths[1].match(/ H([\d.]+) V/)[1]);
  assert.ok(channelX > cardA.x + cardA.w && channelX > cardB.x + cardB.w, 'upward same-column edge runs beside the column');
});

test('edge labels carry a halo and fonts have generic fallbacks', () => {
  const svg = render(architecture);
  assert.match(svg, /paint-order="stroke"[^>]*>calls</);
  assert.ok(!svg.includes('font-family="Arial"'));
  assert.match(svg, /font-family="Arial, Helvetica, sans-serif"/);
});

test('roadmap label and detail never share a position', () => {
  const svg = render({ type: 'roadmap', title: 'Plan', items: [{ label: 'A very long roadmap label that goes on and on', detail: 'Later', value: 1 }] });
  const label = svg.match(/<text x="(\d+)" y="(\d+)"[^>]*>A very long/);
  const detail = svg.match(/<text x="(\d+)" y="(\d+)"[^>]*>Later</);
  assert.ok(Math.abs(Number(label[2]) - Number(detail[2])) >= 16);
});

test('edges and group labels meet WCAG contrast in every theme', () => {
  const nodes = [{ id: 'a', label: 'A', group: 'One' }, { id: 'b', label: 'B', group: 'Two' }, { id: 'c', label: 'C', group: 'Three' }];
  for (const theme of listThemes()) {
    const svg = render({ type: 'architecture', title: 't', nodes, edges: [{ from: 'a', to: 'b' }] }, { theme });
    const panel = svg.match(/<rect x="32" y="28"[^>]*fill="(#[0-9a-f]{6})"/)[1];
    const edge = svg.match(/<path d="M[^"]+" fill="none" stroke="(#[0-9a-f]{6})"/)[1];
    assert.ok(contrast(edge, panel) >= 3, `${theme} edge ${contrast(edge, panel)}`);
    const labelColors = [...svg.matchAll(/letter-spacing="1.4" fill="(#[0-9a-f]{6})"/g)].map(match => match[1]);
    assert.equal(labelColors.length, 3);
    for (const color of labelColors) assert.ok(contrast(color, panel) >= 4.5, `${theme} ${color} ${contrast(color, panel)}`);
  }
});

test('themes are listed and unknown names are rejected, including prototype keys', () => {
  assert.deepEqual(listThemes(), ['paper', 'midnight', 'ocean', 'ember']);
  for (const theme of ['nope', '__proto__', 'constructor', 'toString']) {
    assert.throws(() => render(architecture, { theme }), new Error(`Unknown theme "${theme}". Available: paper, midnight, ocean, ember.`));
    assert.throws(() => document(architecture, { theme }), /Unknown theme/);
  }
});

test('ids are unique per diagram, stable per model, and svg has dimensions', () => {
  const other = { ...architecture, title: 'Another system' };
  const idsOf = svg => [...svg.matchAll(/ id="([^"]+)"/g)].map(match => match[1]);
  const first = render(architecture), second = render(other);
  assert.equal(idsOf(first).length, 3);
  assert.equal(idsOf(first).filter(id => idsOf(second).includes(id)).length, 0);
  assert.deepEqual(idsOf(render(architecture)), idsOf(first));
  assert.notDeepEqual(idsOf(render(architecture, { theme: 'ocean' })), idsOf(first));
  assert.match(first, /<svg [^>]*width="1200" height="\d+" viewBox="0 0 1200 \d+"/);
  assert.match(first, /aria-labelledby="(df-[a-z0-9]+)-title \1-desc"/);
});

test('desc describes nodes and edges and lang is configurable', () => {
  const svg = render({ ...architecture, edges: [{ from: 'a', to: 'b', label: 'HTTPS' }] });
  assert.match(svg, /<desc [^>]*>[^<]*Nodes: App, API\.[^<]*App → API \(HTTPS\)/);
  assert.match(svg, /<svg [^>]*lang="en"/);
  assert.match(document(architecture), /<html lang="en">/);
  assert.match(document(architecture, { lang: 'id' }), /<html lang="id">/);
  assert.match(render(architecture, { lang: 'id' }), /<svg [^>]*lang="id"/);
});

test('document wraps the svg for small screens, themes the page and has a print variant', () => {
  const html = document(architecture, { theme: 'midnight' });
  assert.match(html, /\.frame\{[^}]*overflow-x:auto/);
  assert.match(html, /svg\{[^}]*min-width:760px/);
  assert.match(html, /<div class="frame"><svg/);
  assert.match(html, /body\{[^}]*background:#101716/);
  assert.match(document(architecture, { theme: 'paper' }), /body\{[^}]*background:#f7f4ed/);
  assert.match(html, /@media print\{body\{background:#fff/);
  assert.ok(!html.includes('#111'));
});

test('labels are escaped and output is deterministic', () => {
  const nasty = { type: 'architecture', title: '<script>alert(1)</script>', nodes: [{ id: 'a', label: '<script>x</script>' }, { id: 'b', label: 'B & "C"' }], edges: [{ from: 'a', to: 'b', label: "<img onerror='x'>" }] };
  const svg = render(nasty);
  assert.ok(!svg.includes('<script>') && !svg.includes('<img'));
  assert.ok(svg.includes('&lt;script&gt;x&lt;/script&gt;') && svg.includes('B &amp; &quot;C&quot;'));
  assert.ok(!document(nasty).includes('<script>'));
  assert.equal(render(nasty), render(structuredClone(nasty)));
});

test('huge chart values scale to finite bar widths', () => {
  const svg = render({ type: 'chart', title: 'Big', items: [{ label: 'A', value: 1e308 }, { label: 'B', value: 1e308 }] });
  assert.doesNotMatch(svg, /Infinity|NaN/);
});

test('long chart detail text is constrained to the canvas', () => {
  const svg = render({ type: 'chart', title: 'Wide', items: [{ label: 'A', value: 10, detail: 'x'.repeat(80) }, { label: 'B', value: 5 }] });
  assert.match(svg, /x="1015"[^>]*textLength="135"/);
});

test('standalone svg carries xml:lang', () => {
  assert.match(render({ type: 'chart', title: 'T', items: [{ label: 'A', value: 1 }] }, { lang: 'fr' }), /xml:lang="fr"/);
});
