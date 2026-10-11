import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { document, listThemes, render, supportedTypes } from '../lib/forge.mjs';

const root = relative => new URL(relative, import.meta.url);
const readJson = relative => JSON.parse(readFileSync(root(relative), 'utf8'));
const cliPath = fileURLToPath(root('../bin/diagram-forge.mjs'));
const shouldUpdate = process.env.UPDATE_GOLDEN === '1';
if (shouldUpdate && process.env.CI) throw new Error('UPDATE_GOLDEN must not run in CI');

const EXAMPLES = ['product-architecture', 'launch-roadmap'];
const GALLERY_THEME = { 'product-architecture': 'midnight', 'launch-roadmap': 'ocean' };

const manifest = [
  ...EXAMPLES.flatMap(example => listThemes().map(theme => ({
    file: `${example}.${theme}.svg`,
    produce: () => render(readJson(`../examples/${example}.json`), { theme })
  }))),
  ...supportedTypes().map(type => ({
    file: `${type}.paper.svg`,
    produce: () => render(readJson(`./fixtures/${type}.json`), { theme: 'paper' })
  })),
  { file: 'product-architecture.midnight.html', produce: () => document(readJson('../examples/product-architecture.json'), { theme: 'midnight' }) }
];

function describeFirstDifference(expected, actual) {
  let index = 0;
  while (index < expected.length && index < actual.length && expected[index] === actual[index]) index++;
  const before = expected.slice(0, index).split('\n');
  return `first difference at index ${index} (line ${before.length}:${before.at(-1).length + 1})\n  expected: ${JSON.stringify(expected.slice(index, index + 60))}\n  actual:   ${JSON.stringify(actual.slice(index, index + 60))}`;
}

for (const { file, produce } of manifest) {
  test(`golden ${file}`, () => {
    const actual = produce();
    const goldenUrl = root(`./golden/${file}`);
    if (shouldUpdate) {
      writeFileSync(goldenUrl, actual);
      assert.equal(readFileSync(goldenUrl, 'utf8'), actual);
      console.log(`updated ${fileURLToPath(goldenUrl)}`);
      return;
    }
    let expected;
    try {
      expected = readFileSync(goldenUrl, 'utf8');
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      assert.fail(`missing golden ${file}; run npm run test:update-golden`);
    }
    if (expected !== actual) assert.fail(`${file} differs from golden: ${describeFirstDifference(expected, actual)}`);
  });
}

test('every file in test/golden is in the manifest', () => {
  const known = new Set(manifest.map(entry => entry.file));
  const orphans = readdirSync(root('./golden/')).filter(name => !known.has(name));
  assert.deepEqual(orphans, []);
});

test('gallery SVGs equal their goldens', () => {
  for (const example of EXAMPLES) {
    const gallery = readFileSync(root(`../docs/gallery/${example}.svg`), 'utf8');
    const golden = readFileSync(root(`./golden/${example}.${GALLERY_THEME[example]}.svg`), 'utf8');
    assert.equal(gallery, golden, `${example} gallery is stale; regenerate it`);
  }
});

test('CLI output equals library output for every fixture', () => {
  for (const type of supportedTypes()) {
    const fixturePath = fileURLToPath(root(`./fixtures/${type}.json`));
    const model = readJson(`./fixtures/${type}.json`);
    const svgRun = spawnSync(process.execPath, [cliPath, 'render', fixturePath, '-', '--format', 'svg', '--theme', 'ocean'], { encoding: 'utf8' });
    assert.equal(svgRun.status, 0, `${type}: ${svgRun.stderr}`);
    assert.equal(svgRun.stdout, render(model, { theme: 'ocean' }), `${type} svg`);
    const htmlRun = spawnSync(process.execPath, [cliPath, 'render', fixturePath, '-', '--format', 'html', '--theme', 'ocean'], { encoding: 'utf8' });
    assert.equal(htmlRun.status, 0, `${type}: ${htmlRun.stderr}`);
    assert.equal(htmlRun.stdout, document(model, { theme: 'ocean' }), `${type} html`);
  }
});
