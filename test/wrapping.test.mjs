import test from 'node:test';
import assert from 'node:assert/strict';
import { render } from '../lib/forge.mjs';
import { cardRects } from './support/svg.mjs';

const LONG_LABEL = 'Payment authorisation and fraud scoring orchestrator';
const graphModel = (nodes, edges = []) => ({ type: 'architecture', title: 'Wrapping', nodes, edges });
const decode = text => text.replaceAll('&lt;', '<').replaceAll('&gt;', '>').replaceAll('&quot;', '"').replaceAll('&#39;', "'").replaceAll('&amp;', '&');

function textBlocks(svg) {
  return [...svg.matchAll(/<text ([^>]*)>(.*?)<\/text>/gs)].map(([, attributes, inner]) => {
    const attribute = name => attributes.match(new RegExp(`(?:^| )${name}="([^"]*)"`))?.[1];
    const spans = [...inner.matchAll(/<tspan x="([\d.]+)"(?: dy="([\d.]+)")?([^>]*)>([^<]*)<\/tspan>/g)];
    const baseY = Number(attribute('y'));
    if (!spans.length) return { size: Number(attribute('font-size')), lines: [{ x: Number(attribute('x')), y: baseY, content: decode(inner), attributes }] };
    let currentY = baseY;
    return { size: Number(attribute('font-size')), lines: spans.map(([, spanX, dy, spanAttributes, content]) => {
      currentY += Number(dy ?? 0);
      return { x: Number(spanX), y: currentY, content: decode(content), attributes: spanAttributes };
    }) };
  });
}
const allLines = svg => textBlocks(svg).flatMap(block => block.lines.map(line => ({ ...line, size: block.size })));
const rightEdge = (line, pxPerChar) => line.x + [...line.content].length * pxPerChar;
const textLengthOf = line => Number(line.attributes.match(/textLength="([\d.]+)"/)?.[1]);
const findBlock = (svg, text) => textBlocks(svg).find(block => block.lines.some(line => line.content.includes(text)));

test('a 52-char card label wraps into two lines inside a taller card', () => {
  const svg = render(graphModel([{ id: 'a', label: LONG_LABEL, group: 'One' }, { id: 'b', label: 'Next', group: 'One' }, { id: 'c', label: 'Other', group: 'Two' }]));
  const [first, second] = cardRects(svg);
  assert.equal(first.h, 76);
  assert.equal(first.w, 266.8);
  const block = findBlock(svg, 'Payment authorisation');
  assert.deepEqual(block.lines.map(line => line.content), ['Payment authorisation and', 'fraud scoring orchestrator']);
  assert.deepEqual(block.lines.map(line => line.attributes.match(/textLength="([\d.]+)"/)[1]), ['207.5', '215.8']);
  assert.equal(block.lines[1].y - block.lines[0].y, 18);
  assert.ok(second.y >= first.y + first.h + 46, `next card at ${second.y}, first ends ${first.y + first.h}`);
});

test('a one-line card keeps the original 58px height and baseline', () => {
  const svg = render(graphModel([{ id: 'a', label: 'App', group: 'One' }, { id: 'b', label: 'API', group: 'Two' }]));
  const [card] = cardRects(svg);
  assert.equal(card.h, 58);
  assert.equal(findBlock(svg, 'App').lines[0].y, card.y + 34);
});

test('card wrap point flips between 26 and 27 characters at the 219px room', () => {
  const lineCountFor = length => findBlock(render(graphModel([{ id: 'a', label: 'a'.repeat(length), group: 'One' }, { id: 'b', label: 'B', group: 'Two' }])), 'aaaa').lines.length;
  assert.equal(lineCountFor(26), 1);
  assert.equal(lineCountFor(27), 2);
});

test('four columns cap card width so every gutter is at least 64px', () => {
  const nodes = ['One', 'Two', 'Three', 'Four'].map(group => ({ id: group, label: 'Thirty characters of label text', group }));
  const cards = cardRects(render(graphModel(nodes)));
  assert.equal(cards.length, 4);
  for (const card of cards) assert.ok(card.w <= 206, `card width ${card.w}`);
  assert.equal(findBlock(render(graphModel(nodes)), 'Thirty').lines.length, 2);
  cards.slice(1).forEach((card, index) => assert.ok(card.x - (cards[index].x + cards[index].w) >= 64));
});

test('a label longer than three lines is truncated with an ellipsis and a full-text title', () => {
  const label = 'Settlement reconciliation, ledger posting, regulatory reporting and archival of every completed payment batch overnight';
  const svg = render(graphModel([{ id: 'a', label, group: 'One' }, { id: 'b', label: 'B', group: 'Two' }]));
  const block = findBlock(svg, 'Settlement');
  assert.equal(block.lines.length, 3);
  assert.ok(block.lines[2].content.endsWith('…'));
  assert.ok(svg.includes(`<g><title>${label}</title>`));
  assert.equal(cardRects(svg)[0].h, 94);
});

test('the full-text title of a truncated card is escaped', () => {
  const label = `R&D <b>"quoted"</b> it's ${'padding words '.repeat(12)}`.trim();
  const svg = render(graphModel([{ id: 'a', label, group: 'One' }, { id: 'b', label: 'B', group: 'Two' }]));
  const title = svg.match(/<g><title>([^]*?)<\/title>/)[1];
  assert.doesNotMatch(title, /[<>"']/);
  assert.ok(title.startsWith('R&amp;D &lt;b&gt;&quot;quoted&quot;&lt;/b&gt; it&#39;s padding words'));
});

test('cards carry no <title> unless their label was truncated', () => {
  const svg = render(graphModel([{ id: 'a', label: LONG_LABEL, group: 'One' }, { id: 'b', label: 'B', group: 'Two' }]));
  assert.equal(svg.match(/<title/g).length, 1);
});

test('a CJK label is measured at double width', () => {
  const [card] = cardRects(render(graphModel([{ id: 'a', label: '漢字ラベル', group: 'One' }, { id: 'b', label: 'B', group: 'Two' }])));
  assert.equal(card.w, 51 + 10 * 8.3);
});

test('a long title wraps to two lines, pushes content down and stays inside the panel', () => {
  const title = 'Quarterly platform reliability and delivery review across every regional business unit';
  const nodes = [{ id: 'a', label: 'A', group: 'One' }, { id: 'b', label: 'B', group: 'Two' }];
  const shortSvg = render({ type: 'architecture', title: 'Short', nodes });
  const longSvg = render({ type: 'architecture', title, nodes });
  const titleBlock = textBlocks(longSvg).find(block => block.size === 34);
  assert.equal(titleBlock.lines.length, 2);
  for (const line of titleBlock.lines) assert.ok(rightEdge(line, 19) <= 1168, line.content);
  assert.equal(titleBlock.lines[1].y - titleBlock.lines[0].y, 40);
  assert.equal(cardRects(longSvg)[0].y - cardRects(shortSvg)[0].y, 40);
});

test('a title beyond two lines ends with an ellipsis', () => {
  const block = textBlocks(render({ type: 'chart', title: 'word '.repeat(60).trim(), items: [{ label: 'A', value: 1 }] })).find(entry => entry.size === 34);
  assert.equal(block.lines.length, 2);
  assert.ok(block.lines[1].content.endsWith('…'));
});

test('a long subtitle wraps to two lines and shifts the content', () => {
  const subtitle = 'sentence '.repeat(20).trim();
  const nodes = [{ id: 'a', label: 'A', group: 'One' }, { id: 'b', label: 'B', group: 'Two' }];
  const wrapped = render({ type: 'architecture', title: 'T', subtitle, nodes });
  assert.equal(textBlocks(wrapped).find(block => block.size === 15).lines.length, 2);
  assert.equal(cardRects(wrapped)[0].y - cardRects(render({ type: 'architecture', title: 'T', nodes }))[0].y, 20);
});

const chartSvg = items => render({ type: 'chart', title: 'Chart', items });
const barTop = (svg, index) => Number(svg.match(/<rect x="300" y="([\d.]+)"/g)[index].match(/y="([\d.]+)"/)[1]);

test('chart detail that fits beside the bar stays beside it at its estimated length', () => {
  const svg = chartSvg([{ label: 'A', value: 10, detail: 'y'.repeat(18) }, { label: 'B', value: 5 }]);
  const run = findBlock(svg, 'yyyy').lines[0];
  assert.equal(run.x, 315 + 700);
  assert.equal(textLengthOf(run), 18 * 7.2);
});

test('chart detail moves below the bar once it no longer fits (18 vs 19 chars at full width)', () => {
  const svg = chartSvg([{ label: 'A', value: 10, detail: 'y'.repeat(19) }, { label: 'B', value: 5 }]);
  const run = findBlock(svg, 'yyyy').lines[0];
  assert.equal(run.x, 300);
  assert.equal(run.y, barTop(svg, 0) + 46);
  assert.equal(textLengthOf(run), 19 * 7.2);
});

test('an 80-char chart detail wraps below the bar, ends inside the canvas and pushes the next row down', () => {
  const svg = chartSvg([{ label: 'A', value: 10, detail: 'x'.repeat(80) }, { label: 'B', value: 5 }]);
  const run = findBlock(svg, 'xxxx').lines[0];
  assert.ok(rightEdge(run, 7.2) <= 1150);
  assert.equal(barTop(svg, 1) - barTop(svg, 0), 47 + 17);
});

test('a long chart label wraps within 186px and grows the row pitch', () => {
  const svg = chartSvg([{ label: 'Billing, invoicing and collections platform', value: 10 }, { label: 'B', value: 5 }]);
  const block = findBlock(svg, 'Billing');
  assert.equal(block.lines.length, 2);
  for (const line of block.lines) assert.ok(rightEdge(line, 7.75) <= 288, line.content);
  assert.equal(barTop(svg, 1) - barTop(svg, 0), 29 + 2 * 18);
});

test('chart label room is 186px: a 25-char label (193.75px) wraps but would fit at 200', () => {
  const svg = chartSvg([{ label: 'abcdefghijkl mnopqrstuvwx', value: 10 }, { label: 'B', value: 5 }]);
  assert.equal(findBlock(svg, 'abcdefghijkl').lines.length, 2);
  assert.equal(findBlock(chartSvg([{ label: 'abcdefghijkl mnopqrstuv', value: 10 }, { label: 'B', value: 5 }]), 'abcdefghijkl').lines.length, 1);
});

test('roadmap labels and details wrap inside the 892px column', () => {
  const svg = render({ type: 'roadmap', title: 'Plan', items: [{ label: 'Platform reliability, observability and incident response programme for every regional business unit and partner', detail: 'stabilise and measure '.repeat(10).trim() }, { label: 'Next', detail: 'Later' }] });
  const [labelBlock, detailBlock] = textBlocks(svg).filter(block => block.size === 16 || block.size === 13).slice(0, 2);
  assert.equal(labelBlock.lines.length, 2);
  assert.equal(detailBlock.lines.length, 2);
  for (const line of labelBlock.lines) assert.ok(rightEdge(line, 8.9) <= 1050, line.content);
  for (const line of detailBlock.lines) assert.ok(rightEdge(line, 7.2) <= 1050, line.content);
  const circleYs = [...svg.matchAll(/<circle cx="126" cy="([\d.]+)"/g)].map(match => Number(match[1]));
  assert.equal(circleYs[1] - circleYs[0], 47 + 20 + 17);
});

test('matrix text stays inside its card and long labels are limited to two lines', () => {
  const longLabel = 'R&D programme: exploratory work on research, prototypes and the long-term platform bets we may adopt later';
  const svg = render({ type: 'matrix', title: 'Matrix', items: [{ label: longLabel, detail: 'Explore '.repeat(30).trim() }, { label: 'Two', detail: 'Short' }] });
  const [first] = [...svg.matchAll(/<rect x="(\d+)" y="([\d.]+)" width="430" height="([\d.]+)" rx="16"/g)];
  const cardX = Number(first[1]);
  const labelBlock = findBlock(svg, 'R&D');
  assert.equal(labelBlock.lines.length, 2);
  assert.ok(labelBlock.lines[1].content.endsWith('…'));
  for (const line of allLines(svg).filter(entry => entry.x === cardX + 25)) assert.ok(rightEdge(line, line.size === 16 ? 8.9 : 7.2) <= cardX + 405, line.content);
  assert.equal(Number(first[3]), 35 + 2 * 20 + 3 * 17 + 20);
});

test('short single-line labels render exactly as before', () => {
  const svg = render(graphModel([{ id: 'a', label: 'Web App', group: 'One' }, { id: 'b', label: 'API', group: 'Two' }]));
  assert.match(svg, /<text x="125" y="\d+" font-family="Arial, Helvetica, sans-serif" font-size="15" fill="#17211d" font-weight="700" textLength="58.1" lengthAdjust="spacingAndGlyphs">Web App<\/text>/);
});


test('every chart detail line is clamped so an all-caps detail cannot pass x=1150', () => {
  const detail = 'SETTLEMENT RECONCILIATION '.repeat(9).trim();
  const svg = chartSvg([{ label: 'A', value: 10 }, { label: 'B', value: 9, detail }]);
  const lines = findBlock(svg, 'SETTLEMENT').lines;
  assert.ok(lines.length >= 1);
  for (const line of lines) assert.ok(line.x + textLengthOf(line) <= 1150, `${line.content} ends at ${line.x + textLengthOf(line)}`);
});

test('a chart detail beside a short bar is clamped to the room right of the bar', () => {
  const svg = chartSvg([{ label: 'A', value: 10 }, { label: 'B', value: 5, detail: 'ABC' }]);
  const [line] = findBlock(svg, 'ABC').lines;
  assert.equal(line.x, 315 + 350);
  assert.equal(textLengthOf(line), 3 * 7.2);
});

test('a whitespace-only subtitle does not shift the content', () => {
  const nodes = [{ id: 'a', label: 'A', group: 'One' }, { id: 'b', label: 'B', group: 'Two' }];
  const blank = render({ type: 'architecture', title: 'T', subtitle: ' '.repeat(300), nodes });
  assert.equal(cardRects(blank)[0].y, 205);
  assert.equal(cardRects(render({ type: 'architecture', title: 'T', subtitle: 'short', nodes }))[0].y, 205);
});

test('a whitespace-only roadmap detail keeps the normal row pitch', () => {
  const svg = render({ type: 'roadmap', title: 'Plan', items: [{ label: 'One', detail: ' '.repeat(300) }, { label: 'Two', detail: 'Later' }] });
  const [first, second] = [...svg.matchAll(/<circle cx="126" cy="([\d.]+)"/g)].map(match => Number(match[1]));
  assert.equal(second - first, 47);
});
