const WIDE_CHARACTER = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}\p{Extended_Pictographic}]/u;
const ELLIPSIS = '…';

export const CHAR_PX = { card: 8.3, detail: 7.2, item: 8.9, chartLabel: 7.75, title: 19, subtitle: 8.3 };

const graphemeSegmenter = new Intl.Segmenter('und', { granularity: 'grapheme' });
const graphemesOf = text => [...graphemeSegmenter.segment(text)].map(({ segment }) => segment);

const unitsOf = character => (WIDE_CHARACTER.test(character) ? 2 : 1);

export const measure = (text, pxPerChar) => [...String(text)].reduce((total, character) => total + unitsOf(character), 0) * pxPerChar;

function hardBreak(word, maxPx, pxPerChar) {
  const chunks = [];
  let chunk = '';
  for (const character of graphemesOf(word)) {
    if (chunk && measure(chunk + character, pxPerChar) > maxPx) {
      chunks.push(chunk);
      chunk = '';
    }
    chunk += character;
  }
  return [...chunks, chunk];
}

function packWords(source, maxPx, pxPerChar) {
  const lines = [];
  let current = '';
  for (const word of source.split(/\s+/).filter(Boolean)) {
    if (measure(word, pxPerChar) > maxPx) {
      if (current) lines.push(current);
      const chunks = hardBreak(word, maxPx, pxPerChar);
      lines.push(...chunks.slice(0, -1));
      current = chunks.at(-1);
      continue;
    }
    const candidate = current ? `${current} ${word}` : word;
    if (current && measure(candidate, pxPerChar) > maxPx) {
      lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }
  return current ? [...lines, current] : lines;
}

function withEllipsis(line, maxPx, pxPerChar) {
  const characters = graphemesOf(line);
  while (characters.length > 1 && measure(characters.join('') + ELLIPSIS, pxPerChar) > maxPx) characters.pop();
  return characters.join('').trimEnd() + ELLIPSIS;
}

export function wrapLines(text, maxPx, pxPerChar, maxLines = 3) {
  const source = String(text);
  if (measure(source, pxPerChar) <= maxPx) return { lines: [source], truncated: false };
  const lines = packWords(source, maxPx, pxPerChar);
  if (!lines.length) return { lines: [''], truncated: false };
  if (lines.length <= maxLines) return { lines, truncated: false };
  const kept = lines.slice(0, maxLines);
  kept[maxLines - 1] = withEllipsis(kept[maxLines - 1], maxPx, pxPerChar);
  return { lines: kept, truncated: true };
}
