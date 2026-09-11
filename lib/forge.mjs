const TYPES = new Set(['architecture', 'dataflow', 'workflow', 'sequence', 'lifecycle', 'timeline', 'roadmap', 'hierarchy', 'journey', 'comparison', 'matrix', 'chart']);

const THEMES = {
  paper: { bg: '#f7f4ed', panel: '#fffdf8', ink: '#17211d', muted: '#67726c', line: '#c9d0c5', accent: '#126b5a', accent2: '#e0733c', accent3: '#7756b4' },
  midnight: { bg: '#101716', panel: '#18211f', ink: '#ecf4ee', muted: '#afbeb5', line: '#3c4c46', accent: '#66d0ad', accent2: '#ffab70', accent3: '#bba3ff' },
  ocean: { bg: '#eef6fb', panel: '#fbfdff', ink: '#102b3b', muted: '#597282', line: '#bfd1dc', accent: '#087e8b', accent2: '#e96f3b', accent3: '#6856a5' },
  ember: { bg: '#211412', panel: '#301d1a', ink: '#fff1e9', muted: '#d8bcb0', line: '#68473d', accent: '#ff8a4c', accent2: '#ffd166', accent3: '#d986c4' }
};

const esc = (value = '') => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const textWidth = text => Math.max(108, Math.min(230, 20 + String(text).length * 7.4));
const palette = (t, i) => [t.accent, t.accent2, t.accent3][i % 3];

export function validate(model) {
  const errors = [];
  if (!model || typeof model !== 'object') return ['Model must be a JSON object.'];
  if (!TYPES.has(model.type)) errors.push(`Unsupported type "${model.type}". Supported: ${[...TYPES].join(', ')}.`);
  if (!String(model.title || '').trim()) errors.push('A title is required.');
  const nodes = model.nodes || [];
  const ids = new Set();
  for (const node of nodes) {
    if (!node.id || !node.label) errors.push('Each node needs an id and label.');
    if (ids.has(node.id)) errors.push(`Duplicate node id "${node.id}".`);
    ids.add(node.id);
  }
  for (const edge of model.edges || []) {
    if (!ids.has(edge.from) || !ids.has(edge.to)) errors.push(`Edge ${edge.from} → ${edge.to} references an unknown node.`);
  }
  if (['architecture', 'dataflow', 'workflow', 'sequence', 'lifecycle', 'hierarchy', 'journey'].includes(model.type) && nodes.length < 2) errors.push(`${model.type} needs at least two nodes.`);
  if (['timeline', 'roadmap', 'comparison', 'matrix', 'chart'].includes(model.type) && !(model.items || model.rows || model.series || []).length) errors.push(`${model.type} needs items, rows, or series.`);
  return errors;
}

function svgShell(model, theme, body, width = 1200, height = 720) {
  const t = THEMES[theme] || THEMES.paper;
  const title = esc(model.title);
  const subtitle = esc(model.subtitle || 'Diagram Forge · deterministic visual communication');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="title desc">
<title id="title">${title}</title><desc id="desc">${subtitle}</desc>
<rect width="${width}" height="${height}" fill="${t.bg}"/><rect x="32" y="28" width="${width - 64}" height="${height - 56}" rx="26" fill="${t.panel}" stroke="${t.line}"/>
<text x="76" y="92" font-family="Georgia, serif" font-size="34" fill="${t.ink}" font-weight="700">${title}</text>
<text x="78" y="123" font-family="Arial, sans-serif" font-size="15" fill="${t.muted}">${subtitle}</text>
${body}</svg>`;
}

function graph(model, theme) {
  const t = THEMES[theme] || THEMES.paper;
  const nodes = model.nodes || [];
  const edges = model.edges || [];
  const groups = [...new Set(nodes.map(n => n.group || 'System'))];
  const positions = new Map();
  const columns = Math.max(2, Math.min(4, groups.length));
  const columnGap = Math.min(400, 810 / Math.max(1, columns - 1));
  groups.forEach((group, groupIndex) => {
    const members = nodes.filter(n => (n.group || 'System') === group);
    const x = 90 + (groupIndex % columns) * columnGap;
    const y = 205 + Math.floor(groupIndex / columns) * 250;
    members.forEach((n, i) => positions.set(n.id, { x, y: y + i * 104, w: textWidth(n.label), h: 58, color: palette(t, groupIndex) }));
  });
  const lines = edges.map(edge => {
    const a = positions.get(edge.from), b = positions.get(edge.to);
    if (!a || !b) return '';
    if (a.x === b.x) {
      const x = a.x + a.w / 2, y1 = a.y + a.h, y2 = b.y;
      return `<path d="M${x} ${y1} L${x} ${y2}" fill="none" stroke="${t.line}" stroke-width="2.5" marker-end="url(#arrow)"/><text x="${x + 16}" y="${(y1 + y2) / 2 + 4}" font-family="Arial" font-size="12" fill="${t.muted}">${esc(edge.label || '')}</text>`;
    }
    const x1 = a.x + a.w, y1 = a.y + a.h / 2, x2 = b.x, y2 = b.y + b.h / 2;
    const mx = (x1 + x2) / 2;
    return `<path d="M${x1} ${y1} C${mx} ${y1}, ${mx} ${y2}, ${x2} ${y2}" fill="none" stroke="${t.line}" stroke-width="2.5" marker-end="url(#arrow)"/><text x="${mx}" y="${(y1 + y2) / 2 - 8}" text-anchor="middle" font-family="Arial" font-size="12" fill="${t.muted}">${esc(edge.label || '')}</text>`;
  }).join('');
  const cards = nodes.map(n => {
    const p = positions.get(n.id);
    return `<rect x="${p.x}" y="${p.y}" width="${p.w}" height="${p.h}" rx="13" fill="${t.panel}" stroke="${p.color}" stroke-width="2"/><circle cx="${p.x + 20}" cy="${p.y + 29}" r="6" fill="${p.color}"/><text x="${p.x + 35}" y="${p.y + 34}" font-family="Arial" font-size="15" fill="${t.ink}" font-weight="700">${esc(n.label)}</text>`;
  }).join('');
  const labels = groups.map((group, i) => `<text x="${90 + (i % columns) * columnGap}" y="${180 + Math.floor(i / columns) * 250}" font-family="Arial" font-size="12" font-weight="700" letter-spacing="1.4" fill="${palette(t, i)}">${esc(group.toUpperCase())}</text>`).join('');
  const contentBottom = Math.max(...[...positions.values()].map(p => p.y + p.h), 380);
  return svgShell(model, theme, `<defs><marker id="arrow" markerWidth="9" markerHeight="9" refX="8" refY="3" orient="auto"><path d="M0,0 L0,6 L8,3 z" fill="${t.line}"/></marker></defs>${labels}${lines}${cards}`, 1200, Math.max(480, contentBottom + 65));
}

function editorial(model, theme) {
  const t = THEMES[theme] || THEMES.paper;
  const items = model.items || model.rows || model.series || [];
  const max = Math.max(...items.map(x => Number(x.value || 1)), 1);
  const body = items.slice(0, 10).map((item, i) => {
    const y = 185 + i * 47, value = Number(item.value || i + 1), width = 700 * value / max;
    const label = item.label || item.name || `Item ${i + 1}`;
    if (model.type === 'timeline' || model.type === 'roadmap') return `<circle cx="126" cy="${y}" r="10" fill="${palette(t, i)}"/><line x1="126" y1="${y}" x2="1050" y2="${y}" stroke="${t.line}"/><text x="158" y="${y + 5}" font-family="Arial" font-size="16" fill="${t.ink}" font-weight="700">${esc(label)}</text><text x="520" y="${y + 5}" font-family="Arial" font-size="14" fill="${t.muted}">${esc(item.detail || item.date || '')}</text>`;
    if (model.type === 'matrix') return `<rect x="${100 + (i % 2) * 485}" y="${170 + Math.floor(i / 2) * 150}" width="430" height="114" rx="16" fill="${t.bg}" stroke="${palette(t, i)}"/><text x="${125 + (i % 2) * 485}" y="${205 + Math.floor(i / 2) * 150}" font-family="Arial" font-size="16" fill="${t.ink}" font-weight="700">${esc(label)}</text><text x="${125 + (i % 2) * 485}" y="${235 + Math.floor(i / 2) * 150}" font-family="Arial" font-size="13" fill="${t.muted}">${esc(item.detail || '')}</text>`;
    return `<text x="102" y="${y + 18}" font-family="Arial" font-size="14" fill="${t.ink}" font-weight="700">${esc(label)}</text><rect x="300" y="${y}" width="${width}" height="29" rx="14" fill="${palette(t, i)}"/><text x="${315 + width}" y="${y + 20}" font-family="Arial" font-size="13" fill="${t.muted}">${esc(item.detail || value)}</text>`;
  }).join('');
  const rows = model.type === 'matrix' ? Math.ceil(items.slice(0, 10).length / 2) : items.slice(0, 10).length;
  const contentBottom = model.type === 'matrix' ? 170 + rows * 150 : 185 + rows * 47;
  return svgShell(model, theme, body, 1200, Math.max(480, contentBottom + 55));
}

export function render(model, { theme = 'paper' } = {}) {
  const errors = validate(model);
  if (errors.length) throw new Error(errors.join('\n'));
  const graphTypes = new Set(['architecture', 'dataflow', 'workflow', 'sequence', 'lifecycle', 'hierarchy', 'journey']);
  return graphTypes.has(model.type) ? graph(model, theme) : editorial(model, theme);
}

export function document(model, options) {
  const svg = render(model, options);
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(model.title)} · Diagram Forge</title><style>body{margin:0;background:#111;display:grid;min-height:100vh;place-items:center}svg{width:min(1200px,96vw);height:auto;box-shadow:0 20px 70px #0006}@media print{body{background:white}svg{width:100%;box-shadow:none}}</style></head><body>${svg}</body></html>`;
}

export const supportedTypes = () => [...TYPES];
