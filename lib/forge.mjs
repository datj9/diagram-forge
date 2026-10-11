const TYPES = new Set(['architecture', 'dataflow', 'workflow', 'sequence', 'lifecycle', 'timeline', 'roadmap', 'hierarchy', 'journey', 'comparison', 'matrix', 'chart']);
const GRAPH_TYPES = new Set(['architecture', 'dataflow', 'workflow', 'sequence', 'lifecycle', 'hierarchy', 'journey']);
const EDITORIAL_TYPES = new Set(['timeline', 'roadmap', 'comparison', 'matrix', 'chart']);
const MAX_ITEMS = 10;
const FONT = 'Arial, Helvetica, sans-serif';
const CARD_HEIGHT = 58;
const CARD_PITCH = 104;
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
// Card width must fit the 35px icon offset + label + right padding, or text overflows the box.
const textWidth = text => Math.max(132, Math.min(268, 51 + String(text).length * 8.3));
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

function svgShell({ model, theme, body, width = 1200, height = 720, prefix, lang }) {
  const title = esc(model.title);
  const subtitle = esc(model.subtitle || 'Diagram Forge · deterministic visual communication');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" lang="${esc(lang)}" xml:lang="${esc(lang)}" role="img" aria-labelledby="${prefix}-title ${prefix}-desc">
<title id="${prefix}-title">${title}</title><desc id="${prefix}-desc">${esc(describe(model))}</desc>
<rect width="${width}" height="${height}" fill="${theme.bg}"/><rect x="32" y="28" width="${width - 64}" height="${height - 56}" rx="26" fill="${theme.panel}" stroke="${theme.line}"/>
<text x="76" y="92" font-family="Georgia, serif" font-size="34" fill="${theme.ink}" font-weight="700">${title}</text>
<text x="78" y="123" font-family="${FONT}" font-size="15" fill="${theme.muted}">${subtitle}</text>
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

function layoutGraph(nodes, theme) {
  const groups = groupNodes(nodes);
  const columns = Math.max(2, Math.min(4, groups.length));
  const columnGap = Math.min(400, 810 / Math.max(1, columns - 1));
  const positions = new Map();
  const groupLabels = [];
  let rowTop = 205;
  for (let rowStart = 0; rowStart < groups.length; rowStart += columns) {
    const rowGroups = groups.slice(rowStart, rowStart + columns);
    rowGroups.forEach(([group, members], columnIndex) => {
      const x = 90 + columnIndex * columnGap;
      const groupIndex = rowStart + columnIndex;
      groupLabels.push({ group, x, y: rowTop - 25, color: palette(theme, groupIndex) });
      members.forEach((node, index) => positions.set(node.id, { x, y: rowTop + index * CARD_PITCH, w: textWidth(node.label), h: CARD_HEIGHT, color: palette(theme, groupIndex) }));
    });
    const tallest = rowGroups.reduce((most, [, members]) => Math.max(most, members.length), 1);
    rowTop += Math.max(ROW_MIN_PITCH, (tallest - 1) * CARD_PITCH + CARD_HEIGHT + 90);
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

function graph(model, theme, prefix, lang) {
  const nodes = model.nodes ?? [];
  const { positions, groupLabels, columnGap } = layoutGraph(nodes, theme);
  const columnRights = new Map();
  for (const card of positions.values()) columnRights.set(card.x, Math.max(columnRights.get(card.x) ?? 0, card.x + card.w));
  const lines = (model.edges ?? []).map(edge => {
    const a = positions.get(edge.from), b = positions.get(edge.to);
    if (!a || !b) return '';
    const { d, labelX, labelY, anchor } = edgeGeometry(a, b, columnRights, columnGap);
    const label = edge.label ? `<text x="${labelX}" y="${labelY}" text-anchor="${anchor}" font-family="${FONT}" font-size="12" fill="${theme.muted}" stroke="${theme.panel}" stroke-width="4" stroke-linejoin="round" paint-order="stroke">${esc(edge.label)}</text>` : '';
    return `<path d="${d}" fill="none" stroke="${theme.muted}" stroke-width="2.5" marker-end="url(#${prefix}-arrow)"/>${label}`;
  }).join('');
  const cards = nodes.map(node => {
    const card = positions.get(node.id);
    // Cap the glyph run to its natural Arial estimate (never wider than the box interior):
    // Arial renders unchanged, a wider substitute font compresses to fit instead of overflowing.
    const textLen = Math.max(1, Math.min(String(node.label).length * 8.3, card.w - 49));
    return `<rect x="${card.x}" y="${card.y}" width="${card.w}" height="${card.h}" rx="13" fill="${theme.panel}" stroke="${card.color}" stroke-width="2"/><circle cx="${card.x + 20}" cy="${card.y + 29}" r="6" fill="${card.color}"/><text x="${card.x + 35}" y="${card.y + 34}" font-family="${FONT}" font-size="15" fill="${theme.ink}" font-weight="700" textLength="${textLen.toFixed(1)}" lengthAdjust="spacingAndGlyphs">${esc(node.label)}</text>`;
  }).join('');
  const labels = groupLabels.map(({ group, x, y, color }) => `<text x="${x}" y="${y}" font-family="${FONT}" font-size="12" font-weight="700" letter-spacing="1.4" fill="${color}">${esc(group.toUpperCase())}</text>`).join('');
  const contentBottom = [...positions.values()].reduce((most, card) => Math.max(most, card.y + card.h), 380);
  const defs = `<defs><marker id="${prefix}-arrow" markerWidth="9" markerHeight="9" refX="8" refY="3" orient="auto"><path d="M0,0 L0,6 L8,3 z" fill="${theme.muted}"/></marker></defs>`;
  return svgShell({ model, theme, body: `${defs}${labels}${lines}${cards}`, height: Math.max(480, contentBottom + 65), prefix, lang });
}

const detailFit = (text, room) => (text.length * 7.2 > room ? ` textLength="${Math.max(40, Math.floor(room))}" lengthAdjust="spacingAndGlyphs"` : '');

function editorial(model, theme, prefix, lang) {
  const items = itemsOf(model).slice(0, MAX_ITEMS);
  const valueOf = (item, index) => item.value ?? index + 1;
  const max = items.reduce((most, item, index) => Math.max(most, valueOf(item, index)), 0) || 1;
  const body = items.map((item, i) => {
    const y = 185 + i * 47, value = valueOf(item, i), width = (value / max) * 700;
    const label = item.label || item.name || `Item ${i + 1}`, detail = String(item.detail || value);
    if (model.type === 'timeline' || model.type === 'roadmap') return `<circle cx="126" cy="${y}" r="10" fill="${palette(theme, i)}"/><line x1="126" y1="${y}" x2="1050" y2="${y}" stroke="${theme.line}"/><text x="158" y="${y - 3}" font-family="${FONT}" font-size="16" fill="${theme.ink}" font-weight="700">${esc(label)}</text><text x="158" y="${y + 15}" font-family="${FONT}" font-size="13" fill="${theme.muted}">${esc(item.detail || item.date || '')}</text>`;
    if (model.type === 'matrix') return `<rect x="${100 + (i % 2) * 485}" y="${170 + Math.floor(i / 2) * 150}" width="430" height="114" rx="16" fill="${theme.bg}" stroke="${palette(theme, i)}"/><text x="${125 + (i % 2) * 485}" y="${205 + Math.floor(i / 2) * 150}" font-family="${FONT}" font-size="16" fill="${theme.ink}" font-weight="700">${esc(label)}</text><text x="${125 + (i % 2) * 485}" y="${235 + Math.floor(i / 2) * 150}" font-family="${FONT}" font-size="13" fill="${theme.muted}">${esc(item.detail || '')}</text>`;
    return `<text x="102" y="${y + 18}" font-family="${FONT}" font-size="14" fill="${theme.ink}" font-weight="700">${esc(label)}</text><rect x="300" y="${y}" width="${width}" height="29" rx="${Math.min(14, width / 2)}" fill="${palette(theme, i)}"/><text x="${315 + width}" y="${y + 20}" font-family="${FONT}" font-size="13" fill="${theme.muted}"${detailFit(detail, 1150 - 315 - width)}>${esc(detail)}</text>`;
  }).join('');
  const contentBottom = model.type === 'matrix' ? 170 + Math.ceil(items.length / 2) * 150 : 185 + items.length * 47;
  return svgShell({ model, theme, body, height: Math.max(480, contentBottom + 55), prefix, lang });
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
