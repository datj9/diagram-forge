export const cardRects = svg => [...svg.matchAll(/<rect x="([\d.]+)" y="([\d.]+)" width="([\d.]+)" height="([\d.]+)" rx="13"/g)]
  .map(match => ({ x: Number(match[1]), y: Number(match[2]), w: Number(match[3]), h: Number(match[4]) }));
