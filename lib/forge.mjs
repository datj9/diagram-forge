import { CHAR_PX, measure, wrapLines } from './text.mjs';

const TYPES = new Set(['architecture', 'dataflow', 'workflow', 'sequence', 'lifecycle', 'timeline', 'roadmap', 'hierarchy', 'journey', 'comparison', 'matrix', 'chart']);
const GRAPH_TYPES = new Set(['architecture', 'dataflow', 'workflow', 'sequence', 'lifecycle', 'hierarchy', 'journey']);
const EDITORIAL_TYPES = new Set(['timeline', 'roadmap', 'comparison', 'matrix', 'chart']);
const MAX_ITEMS = 10;
const FONT = 'Arial, Helvetica, sans-serif';
const CARD_HEIGHT = 58;
const CARD_GAP = 46;
const CARD_LINE_HEIGHT = 18;
const CARD_TEXT_INSET = 49;
const ROW_MIN_PITCH = 250;
const SAME_COLUMN_GAP = 46;

const THEMES = {
  paper: { bg: '#f7f4ed', panel: '#fffdf8', ink: '#17211d', muted: '#67726c', line: '#c9d0c5', accent: '#126b5a', accent2: '#b4541f', accent3: '#7756b4' },
  midnight: { bg: '#101716', panel: '#18211f', ink: '#ecf4ee', muted: '#afbeb5', line: '#3c4c46', accent: '#66d0ad', accent2: '#ffab70', accent3: '#bba3ff' },
  ocean: { bg: '#eef6fb', panel: '#fbfdff', ink: '#102b3b', muted: '#597282', line: '#bfd1dc', accent: '#087e8b', accent2: '#b4541f', accent3: '#6856a5' },
  ember: { bg: '#211412', panel: '#301d1a', ink: '#fff1e9', muted: '#d8bcb0', line: '#68473d', accent: '#ff8a4c', accent2: '#ffd166', accent3: '#d986c4' }
};

export const listThemes = () => Object.keys(THEMES);

function themeFor(name) {
  if (typeof name !== 'string' || !Object.hasOwn(THEMES, name)) throw new Error(`Unknown theme "${String(name)}". Available: ${listThemes().join(', ')}.`);
  return THEMES[name];
}

const esc = (value = '') => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
const palette = (theme, index) => [theme.accent, theme.accent2, theme.accent3][index % 3];
const hashText = text => {
  let hash = 2166136261;
  for (let index = 0; index < text.length; index++) hash = Math.imul(hash ^ text.charCodeAt(index), 16777619);
  return (hash >>> 0).toString(36);
};

const isPlainObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const isValidId = id => (typeof id === 'string' && id.trim() !== '') || (typeof id === 'number' && Number.isFinite(id));
const hasText = value => (typeof value === 'string' && value.trim() !== '') || (typeof value === 'number' && Number.isFinite(value));
const itemsOf = model => {
  const source = model.items ?? model.rows ?? model.series;
  return Array.isArray(source) ? source : [];
};
const itemsKey = model => (model.items != null ? 'items' : model.rows != null ? 'rows' : 'series');

function validateNodes(model, errors) {
  const ids = new Set();
  if (model.nodes != null && !Array.isArray(model.nodes)) {
    errors.push('nodes must be an array.');
    return ids;
  }
  (model.nodes ?? []).forEach((node, index) => {
    if (!isPlainObject(node)) return errors.push(`nodes[${index}] must be an object.`);
    if (!isValidId(node.id) || !hasText(node.label)) errors.push(`nodes[${index}] needs an id and label.`);
    if (node.group != null && typeof node.group !== 'string') errors.push(`nodes[${index}].group must be a string.`);
    if (isValidId(node.id)) {
      if (ids.has(node.id)) errors.push(`Duplicate node id "${node.id}" at nodes[${index}].`);
      ids.add(node.id);
    }
  });
  return ids;
}

function validateEdges(model, ids, errors) {
  if (model.edges != null && !Array.isArray(model.edges)) return errors.push('edges must be an array.');
  (model.edges ?? []).forEach((edge, index) => {
    if (!isPlainObject(edge)) return errors.push(`edges[${index}] must be an object.`);
    if (!isValidId(edge.from) || !isValidId(edge.to)) return errors.push(`edges[${index}] needs from and to.`);
    if (edge.from === edge.to) return errors.push(`edges[${index}] is a self-loop on "${edge.from}"; self-loops are not supported.`);
    if (!ids.has(edge.from) || !ids.has(edge.to)) errors.push(`edges[${index}] ${edge.from} → ${edge.to} references an unknown node.`);
  });
}

function validateItems(model, errors) {
  const key = itemsKey(model);
  const source = model.items ?? model.rows ?? model.series;
  if (source != null && !Array.isArray(source)) return errors.push(`${key} must be an array.`);
  if (!itemsOf(model).length) return errors.push(`${model.type} needs items, rows, or series.`);
  if (source.length > MAX_ITEMS) errors.push(`${model.type} supports at most ${MAX_ITEMS} items.`);
  source.forEach((item, index) => {
    if (!isPlainObject(item)) return errors.push(`${key}[${index}] must be an object.`);
    if (item.value != null && !(typeof item.value === 'number' && Number.isFinite(item.value) && item.value >= 0)) errors.push(`${key}[${index}].value must be a finite number >= 0.`);
  });
}

export function validate(model) {
  if (!isPlainObject(model)) return ['Model must be a JSON object.'];
  const errors = [];
  if (!TYPES.has(model.type)) errors.push(`Unsupported type "${String(model.type)}". Supported: ${[...TYPES].join(', ')}.`);
  if (!String(model.title ?? '').trim()) errors.push('A title is required.');
  const ids = validateNodes(model, errors);
  validateEdges(model, ids, errors);
  if (GRAPH_TYPES.has(model.type) && (!Array.isArray(model.nodes) || model.nodes.length < 2)) errors.push(`${model.type} needs at least two nodes.`);
  if (EDITORIAL_TYPES.has(model.type)) validateItems(model, errors);
  return errors;
}

function describe(model) {
  const parts = [];
  if (model.subtitle) parts.push(String(model.subtitle));
  if (GRAPH_TYPES.has(model.type)) {
    const nodes = model.nodes ?? [];
    const labelById = new Map(nodes.map(node => [node.id, node.label]));
    parts.push(`${model.type} diagram. Nodes: ${nodes.map(node => node.label).join(', ')}.`);
    const edges = (model.edges ?? []).map(edge => `${labelById.get(edge.from)} → ${labelById.get(edge.to)}${edge.label ? ` (${edge.label})` : ''}`);
    if (edges.length) parts.push(`Connections: ${edges.join('; ')}.`);
  } else {
    const entries = itemsOf(model).map((item, index) => `${item.label ?? item.name ?? `Item ${index + 1}`}${item.detail ? `: ${item.detail}` : ''}`);
    parts.push(`${model.type} diagram. Items: ${entries.join('; ')}.`);
  }
  return parts.join(' ');
}

const HEADER_MAX_PX = 1060;
const TITLE_LINE_HEIGHT = 40;
const SUBTITLE_LINE_HEIGHT = 20;

function layoutHeader(model) {
  const title = wrapLines(model.title, HEADER_MAX_PX, CHAR_PX.title, 2).lines;
  const subtitle = wrapLines(model.subtitle || 'Diagram Forge · deterministic visual communication', HEADER_MAX_PX, CHAR_PX.subtitle, 2).lines;
  return { title, subtitle, offset: (title.length - 1) * TITLE_LINE_HEIGHT + (subtitle.length - 1) * SUBTITLE_LINE_HEIGHT };
}

const textLines = (lines, textX, lineHeight) => (lines.length === 1
  ? esc(lines[0])
  : lines.map((line, index) => `<tspan x="${textX}"${index ? ` dy="${lineHeight}"` : ''}>${esc(line)}</tspan>`).join(''));

function svgShell({ model, theme, body, header, width = 1200, height = 720, prefix, lang }) {
  const subtitleY = 123 + (header.title.length - 1) * TITLE_LINE_HEIGHT;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" lang="${esc(lang)}" xml:lang="${esc(lang)}" role="img" aria-labelledby="${prefix}-title ${prefix}-desc">
<title id="${prefix}-title">${esc(model.title)}</title><desc id="${prefix}-desc">${esc(describe(model))}</desc>
<rect width="${width}" height="${height}" fill="${theme.bg}"/><rect x="32" y="28" width="${width - 64}" height="${height - 56}" rx="26" fill="${theme.panel}" stroke="${theme.line}"/>
<text x="76" y="92" font-family="Georgia, serif" font-size="34" fill="${theme.ink}" font-weight="700">${textLines(header.title, 76, TITLE_LINE_HEIGHT)}</text>
<text x="78" y="${subtitleY}" font-family="${FONT}" font-size="15" fill="${theme.muted}">${textLines(header.subtitle, 78, SUBTITLE_LINE_HEIGHT)}</text>
${body}</svg>`;
}

function groupNodes(nodes) {
  const membersByGroup = new Map();
  for (const node of nodes) {
    const group = node.group || 'System';
    if (!membersByGroup.has(group)) membersByGroup.set(group, []);
    membersByGroup.get(group).push(node);
  }
  return [...membersByGroup.entries()];
}

function sizeCard(label, columnGap) {
  const maxWidth = Math.min(268, columnGap - 64);
  const { lines, truncated } = wrapLines(label, maxWidth - CARD_TEXT_INSET, CHAR_PX.card);
  const widest = Math.max(...lines.map(line => measure(line, CHAR_PX.card)));
  return { w: Math.max(132, Math.min(maxWidth, 51 + widest)), h: CARD_HEIGHT + (lines.length - 1) * CARD_LINE_HEIGHT, lines, truncated, label: String(label) };
}

function layoutGraph(nodes, theme, top) {
  const groups = groupNodes(nodes);
  const columns = Math.max(2, Math.min(4, groups.length));
  const columnGap = Math.min(400, 810 / Math.max(1, columns - 1));
  const positions = new Map();
  const groupLabels = [];
  let rowTop = top;
  for (let rowStart = 0; rowStart < groups.length; rowStart += columns) {
    const rowGroups = groups.slice(rowStart, rowStart + columns);
    let tallest = 0;
    rowGroups.forEach(([group, members], columnIndex) => {
      const x = 90 + columnIndex * columnGap;
      const groupIndex = rowStart + columnIndex;
      groupLabels.push({ group, x, y: rowTop - 25, color: palette(theme, groupIndex) });
      let y = rowTop;
      for (const node of members) {
        const size = sizeCard(node.label, columnGap);
        positions.set(node.id, { x, y, ...size, color: palette(theme, groupIndex) });
        y += size.h + CARD_GAP;
      }
      tallest = Math.max(tallest, y - CARD_GAP - rowTop);
    });
    rowTop += Math.max(ROW_MIN_PITCH, tallest + 90);
  }
  return { positions, groupLabels, columnGap };
}

function edgeGeometry(a, b, columnRights, columnGap) {
  if (a.x === b.x) {
    if (b.y > a.y && b.y - (a.y + a.h) <= SAME_COLUMN_GAP) {
      const x = a.x + Math.min(a.w, b.w) / 2, y1 = a.y + a.h, y2 = b.y;
      return { d: `M${x} ${y1} L${x} ${y2}`, labelX: x + 16, labelY: (y1 + y2) / 2 + 4, anchor: 'start' };
    }
    const channelX = Math.min(columnRights.get(a.x) + 16, a.x + columnGap - 4), y1 = a.y + a.h / 2, y2 = b.y + b.h / 2;
    return { d: `M${a.x + a.w} ${y1} H${channelX} V${y2} H${b.x + b.w}`, labelX: channelX + 8, labelY: (y1 + y2) / 2 + 4, anchor: 'start' };
  }
  const shift = b.x < a.x ? 14 : 0;
  const x1 = b.x < a.x ? a.x : a.x + a.w, x2 = b.x < a.x ? b.x + b.w : b.x;
  const y1 = a.y + a.h / 2 + shift, y2 = b.y + b.h / 2 + shift;
  const midX = (x1 + x2) / 2;
  return { d: `M${x1} ${y1} C${midX} ${y1}, ${midX} ${y2}, ${x2} ${y2}`, labelX: midX, labelY: (y1 + y2) / 2 - 8, anchor: 'middle' };
}

// textLength is capped at the Arial estimate: Arial renders unchanged, a wider substitute font compresses instead of overflowing.
const fitAttributes = (line, pxPerChar, room) => `textLength="${Math.max(1, Math.min(measure(line, pxPerChar), room)).toFixed(1)}" lengthAdjust="spacingAndGlyphs"`;

function cardMarkup(card, theme) {
  const centerY = card.y + card.h / 2, textX = card.x + 35;
  const textAttributes = `font-family="${FONT}" font-size="15" fill="${theme.ink}" font-weight="700"`;
  const fit = line => fitAttributes(line, CHAR_PX.card, card.w - CARD_TEXT_INSET);
  const shape = `<rect x="${card.x}" y="${card.y}" width="${card.w}" height="${card.h}" rx="13" fill="${theme.panel}" stroke="${card.color}" stroke-width="2"/><circle cx="${card.x + 20}" cy="${centerY}" r="6" fill="${card.color}"/>`;
  const baseline = centerY + 5 - (card.lines.length - 1) * (CARD_LINE_HEIGHT / 2);
  const text = card.lines.length === 1
    ? `<text x="${textX}" y="${baseline}" ${textAttributes} ${fit(card.lines[0])}>${esc(card.lines[0])}</text>`
    : `<text x="${textX}" y="${baseline}" ${textAttributes}>${card.lines.map((line, index) => `<tspan x="${textX}"${index ? ` dy="${CARD_LINE_HEIGHT}"` : ''} ${fit(line)}>${esc(line)}</tspan>`).join('')}</text>`;
  return card.truncated ? `<g><title>${esc(card.label)}</title>${shape}${text}</g>` : `${shape}${text}`;
}

function graph(model, theme, prefix, lang) {
  const nodes = model.nodes ?? [];
  const header = layoutHeader(model);
  const { positions, groupLabels, columnGap } = layoutGraph(nodes, theme, 205 + header.offset);
  const columnRights = new Map();
  for (const card of positions.values()) columnRights.set(card.x, Math.max(columnRights.get(card.x) ?? 0, card.x + card.w));
  const lines = (model.edges ?? []).map(edge => {
    const a = positions.get(edge.from), b = positions.get(edge.to);
    if (!a || !b) return '';
    const { d, labelX, labelY, anchor } = edgeGeometry(a, b, columnRights, columnGap);
    const label = edge.label ? `<text x="${labelX}" y="${labelY}" text-anchor="${anchor}" font-family="${FONT}" font-size="12" fill="${theme.muted}" stroke="${theme.panel}" stroke-width="4" stroke-linejoin="round" paint-order="stroke">${esc(edge.label)}</text>` : '';
    return `<path d="${d}" fill="none" stroke="${theme.muted}" stroke-width="2.5" marker-end="url(#${prefix}-arrow)"/>${label}`;
  }).join('');
  const cards = nodes.map(node => cardMarkup(positions.get(node.id), theme)).join('');
  const labels = groupLabels.map(({ group, x, y, color }) => `<text x="${x}" y="${y}" font-family="${FONT}" font-size="12" font-weight="700" letter-spacing="1.4" fill="${color}">${esc(group.toUpperCase())}</text>`).join('');
  const contentBottom = [...positions.values()].reduce((most, card) => Math.max(most, card.y + card.h), 380 + header.offset);
  const defs = `<defs><marker id="${prefix}-arrow" markerWidth="9" markerHeight="9" refX="8" refY="3" orient="auto"><path d="M0,0 L0,6 L8,3 z" fill="${theme.muted}"/></marker></defs>`;
  return svgShell({ model, theme, header, body: `${defs}${labels}${lines}${cards}`, height: Math.max(480, contentBottom + 65), prefix, lang });
}

const TIMELINE_TEXT_PX = 892;
const MATRIX_TEXT_PX = 380;
const BELOW_BAR_TEXT_PX = 850;

function timelineRow({ label, detail, y, color }, theme) {
  const labelWrap = wrapLines(label, TIMELINE_TEXT_PX, CHAR_PX.item);
  const detailWrap = wrapLines(detail, TIMELINE_TEXT_PX, CHAR_PX.detail);
  const detailY = y + 15 + (labelWrap.lines.length - 1) * 20;
  const markup = `<circle cx="126" cy="${y}" r="10" fill="${color}"/><line x1="126" y1="${y}" x2="1050" y2="${y}" stroke="${theme.line}"/><text x="158" y="${y - 3}" font-family="${FONT}" font-size="16" fill="${theme.ink}" font-weight="700">${textLines(labelWrap.lines, 158, 20)}</text><text x="158" y="${detailY}" font-family="${FONT}" font-size="13" fill="${theme.muted}">${textLines(detailWrap.lines, 158, 17)}</text>`;
  return { markup, pitch: 47 + (labelWrap.lines.length - 1) * 20 + (detailWrap.lines.length - 1) * 17 };
}

function fittedText({ lines, textX, textY, lineHeight, room, attributes }) {
  const fit = line => fitAttributes(line, CHAR_PX.detail, room);
  if (lines.length === 1) return `<text x="${textX}" y="${textY}" ${attributes} ${fit(lines[0])}>${esc(lines[0])}</text>`;
  return `<text x="${textX}" y="${textY}" ${attributes}>${lines.map((line, index) => `<tspan x="${textX}"${index ? ` dy="${lineHeight}"` : ''} ${fit(line)}>${esc(line)}</tspan>`).join('')}</text>`;
}

function chartRow({ label, detail, value, max, y, color }, theme) {
  const width = (value / max) * 700;
  const labelWrap = wrapLines(label, 186, CHAR_PX.chartLabel);
  const isDetailBelow = measure(detail, CHAR_PX.detail) > 1150 - 315 - width;
  const detailAttributes = `font-family="${FONT}" font-size="13" fill="${theme.muted}"`;
  const detailWrap = isDetailBelow ? wrapLines(detail, BELOW_BAR_TEXT_PX, CHAR_PX.detail) : { lines: [detail] };
  const detailMarkup = isDetailBelow
    ? fittedText({ lines: detailWrap.lines, textX: 300, textY: y + 29 + 17, lineHeight: 17, room: BELOW_BAR_TEXT_PX, attributes: detailAttributes })
    : fittedText({ lines: [detail], textX: 315 + width, textY: y + 20, lineHeight: 17, room: 1150 - 315 - width, attributes: detailAttributes });
  const markup = `<text x="102" y="${y + 18}" font-family="${FONT}" font-size="14" fill="${theme.ink}" font-weight="700">${textLines(labelWrap.lines, 102, 18)}</text><rect x="300" y="${y}" width="${width}" height="29" rx="${Math.min(14, width / 2)}" fill="${color}"/>${detailMarkup}`;
  const belowPitch = isDetailBelow ? detailWrap.lines.length * 17 : 0;
  return { markup, pitch: Math.max(47, 29 + labelWrap.lines.length * 18) + belowPitch };
}

function stackRows(entries, rowFor, theme, top) {
  let y = top;
  const markup = entries.map(entry => {
    const row = rowFor({ ...entry, y }, theme);
    y += row.pitch;
    return row.markup;
  }).join('');
  return { body: markup, bottom: y };
}

function matrixCard({ label, detail, color }, cardX, cardY) {
  const labelWrap = wrapLines(label, MATRIX_TEXT_PX, CHAR_PX.item, 2);
  const detailWrap = wrapLines(detail, MATRIX_TEXT_PX, CHAR_PX.detail);
  const height = Math.max(114, 35 + labelWrap.lines.length * 20 + detailWrap.lines.length * 17 + 20);
  const detailY = cardY + 65 + (labelWrap.lines.length - 1) * 20;
  return { height, labelWrap, detailWrap, detailY, color, cardX, cardY };
}

function matrixRows(entries, theme, top) {
  let rowTop = top, body = '';
  for (let start = 0; start < entries.length; start += 2) {
    const cards = entries.slice(start, start + 2).map((entry, offset) => {
      const i = start + offset;
      return matrixCard(entry, 100 + (i % 2) * 485, rowTop);
    });
    for (const card of cards) {
      const textX = card.cardX + 25;
      body += `<rect x="${card.cardX}" y="${card.cardY}" width="430" height="${card.height}" rx="16" fill="${theme.bg}" stroke="${card.color}"/><text x="${textX}" y="${card.cardY + 35}" font-family="${FONT}" font-size="16" fill="${theme.ink}" font-weight="700">${textLines(card.labelWrap.lines, textX, 20)}</text><text x="${textX}" y="${card.detailY}" font-family="${FONT}" font-size="13" fill="${theme.muted}">${textLines(card.detailWrap.lines, textX, 17)}</text>`;
    }
    rowTop += Math.max(...cards.map(card => card.height)) + 36;
  }
  return { body, bottom: rowTop };
}

function editorial(model, theme, prefix, lang) {
  const header = layoutHeader(model);
  const items = itemsOf(model).slice(0, MAX_ITEMS);
  const valueOf = (item, index) => item.value ?? index + 1;
  const max = items.reduce((most, item, index) => Math.max(most, valueOf(item, index)), 0) || 1;
  const entries = items.map((item, index) => {
    const value = valueOf(item, index);
    const label = String(item.label || item.name || `Item ${index + 1}`);
    const detail = String(model.type === 'timeline' || model.type === 'roadmap' ? item.detail || item.date || '' : model.type === 'matrix' ? item.detail || '' : item.detail || value);
    return { label, detail, value, max, color: palette(theme, index) };
  });
  const layout = model.type === 'matrix'
    ? matrixRows(entries, theme, 170 + header.offset)
    : stackRows(entries, model.type === 'timeline' || model.type === 'roadmap' ? timelineRow : chartRow, theme, 185 + header.offset);
  return svgShell({ model, theme, header, body: layout.body, height: Math.max(480, layout.bottom + 55), prefix, lang });
}

export function render(model, { theme: themeName = 'paper', lang = 'en' } = {}) {
  const theme = themeFor(themeName);
  const errors = validate(model);
  if (errors.length) throw new Error(errors.join('\n'));
  const prefix = `df-${hashText(JSON.stringify([model, themeName]))}`;
  return GRAPH_TYPES.has(model.type) ? graph(model, theme, prefix, lang) : editorial(model, theme, prefix, lang);
}

export function document(model, options = {}) {
  const svg = render(model, options);
  const theme = themeFor(options.theme ?? 'paper');
  const lang = esc(options.lang ?? 'en');
  const style = `body{margin:0;padding:16px;min-height:100vh;box-sizing:border-box;background:${theme.bg}}.frame{max-width:1200px;margin:0 auto;overflow-x:auto}svg{display:block;width:100%;min-width:760px;height:auto}@media print{body{background:#fff;padding:0}.frame{max-width:none;overflow:visible}svg{min-width:0}}`;
  return `<!doctype html><html lang="${lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(model.title)} · Diagram Forge</title><style>${style}</style></head><body><div class="frame">${svg}</div></body></html>`;
}

export const supportedTypes = () => [...TYPES];
