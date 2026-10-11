import test from 'node:test';
import assert from 'node:assert/strict';
import { measure, wrapLines } from '../lib/text.mjs';

test('measure counts one unit per ASCII character', () => assert.equal(measure('abcd', 8.3), 4 * 8.3));
test('measure counts CJK and emoji code points as two units', () => {
  assert.equal(measure('漢字漢字', 1), 8);
  assert.equal(measure('a😀', 1), 3);
  assert.ok(measure('漢字漢字', 1) > measure('abcd', 1));
});

test('wrapLines wraps the 52-char card label at word boundaries', () => {
  const { lines, truncated } = wrapLines('Payment authorisation and fraud scoring orchestrator', 219, 8.3);
  assert.deepEqual(lines, ['Payment authorisation and', 'fraud scoring orchestrator']);
  assert.equal(truncated, false);
});

test('wrapLines keeps text that exactly fits on one line and wraps one pixel less', () => {
  const text = 'abc def';
  assert.deepEqual(wrapLines(text, 7 * 10, 10).lines, [text]);
  assert.deepEqual(wrapLines(text, 7 * 10 - 1, 10).lines, ['abc', 'def']);
});

test('wrapLines returns single-line text unchanged, including odd spacing', () => assert.deepEqual(wrapLines('  a  b ', 1000, 8.3), { lines: ['  a  b '], truncated: false }));
test('wrapLines returns one empty line for empty text', () => assert.deepEqual(wrapLines('', 100, 8.3), { lines: [''], truncated: false }));

test('wrapLines hard-breaks a word wider than the line without inserting spaces', () => {
  const { lines } = wrapLines('a'.repeat(52), 26 * 8.3, 8.3);
  assert.deepEqual(lines, ['a'.repeat(26), 'a'.repeat(26)]);
});

test('wrapLines keeps three lines and does not truncate when the text needs exactly three', () => {
  const { lines, truncated } = wrapLines('aaaa bbbb cccc', 4 * 10, 10);
  assert.deepEqual(lines, ['aaaa', 'bbbb', 'cccc']);
  assert.equal(truncated, false);
});

test('wrapLines caps at three lines and ends the last with an ellipsis', () => {
  const { lines, truncated } = wrapLines('aaaa bbbb cccc dddd', 4 * 10, 10);
  assert.equal(lines.length, 3);
  assert.equal(truncated, true);
  assert.equal(lines[2], 'ccc…');
  assert.ok(measure(lines[2], 10) <= 40);
});

test('wrapLines honours a smaller maxLines', () => assert.deepEqual(wrapLines('aaaa bbbb cccc', 40, 10, 2), { lines: ['aaaa', 'bbb…'], truncated: true }));

test('wrapLines wraps CJK text by code point using double weight', () => {
  const { lines } = wrapLines('漢字漢字漢字', 8 * 10, 10);
  assert.deepEqual(lines, ['漢字漢字', '漢字']);
});

test('wrapLines returns one empty line for whitespace wider than the line', () => assert.deepEqual(wrapLines(' '.repeat(300), 100, 8.3), { lines: [''], truncated: false }));
