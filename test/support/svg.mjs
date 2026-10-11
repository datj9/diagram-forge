const toNumber = Number;

export const cardRects = svg => [...svg.matchAll(/<rect x="([\d.]+)" y="([\d.]+)" width="([\d.]+)" height="([\d.]+)" rx="13"/g)]
  .map(match => ({ x: toNumber(match[1]), y: toNumber(match[2]), w: toNumber(match[3]), h: toNumber(match[4]) }));

export function parsePath(d) {
  const tokens = [...d.matchAll(/([MLHVC])([^MLHVC]*)/g)];
  return tokens.map(([, command, args]) => ({ command, values: args.split(/[\s,]+/).filter(Boolean).map(toNumber) }));
}

export function samplePath(d, steps = 40) {
  const points = [];
  let current = { x: 0, y: 0 };
  for (const { command, values } of parsePath(d)) {
    const start = current;
    if (command === 'M') current = { x: values[0], y: values[1] };
    else if (command === 'L') current = { x: values[0], y: values[1] };
    else if (command === 'H') current = { x: values[0], y: start.y };
    else if (command === 'V') current = { x: start.x, y: values[0] };
    else if (command === 'C') {
      const [x1, y1, x2, y2, x3, y3] = values;
      for (let step = 0; step <= steps; step++) {
        const t = step / steps, u = 1 - t;
        points.push({
          x: u ** 3 * start.x + 3 * u * u * t * x1 + 3 * u * t * t * x2 + t ** 3 * x3,
          y: u ** 3 * start.y + 3 * u * u * t * y1 + 3 * u * t * t * y2 + t ** 3 * y3
        });
      }
      current = { x: x3, y: y3 };
      continue;
    }
    if (command === 'M') {
      points.push(current);
      continue;
    }
    for (let step = 1; step <= steps; step++) {
      points.push({ x: start.x + ((current.x - start.x) * step) / steps, y: start.y + ((current.y - start.y) * step) / steps });
    }
  }
  return points;
}

export const insideRect = (point, rect, inset = 1) =>
  point.x > rect.x + inset && point.x < rect.x + rect.w - inset && point.y > rect.y + inset && point.y < rect.y + rect.h - inset;

export const textRuns = svg => [...svg.matchAll(/<text ([^>]*)>([^<]*)<\/text>/g)].map(([, attributes, content]) => {
  const attribute = name => attributes.match(new RegExp(`(?:^| )${name}="([^"]*)"`))?.[1];
  return {
    x: toNumber(attribute('x')),
    y: toNumber(attribute('y')),
    size: toNumber(attribute('font-size')),
    textLength: attribute('textLength') === undefined ? undefined : toNumber(attribute('textLength')),
    chars: [...content].length
  };
});
