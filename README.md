# Diagram Forge

**A deterministic compiler for diagrams that are both technically trustworthy and
presentation-ready.**

Diagram Forge takes a small JSON model and emits one self-contained HTML file
with inline SVG. It deliberately combines two ideas: a broad visual vocabulary
and a validation-first renderer pipeline.

## What works today

- 12 routed types: `architecture`, `dataflow`, `workflow`, `sequence`,
  `lifecycle`, `timeline`, `roadmap`, `hierarchy`, `journey`, `comparison`,
  `matrix`, and `chart`.
- Four polished themes: `paper`, `midnight`, `ocean`, and `ember`.
- Deterministic layouts, SVG output, keyboard-friendly accessible labels, and
  no runtime dependency or network request.
- Structural checks for duplicate IDs, orphan edges, unsupported types, empty
  labels, and insufficient graph data.

## Try it

```bash
npm test
node bin/diagram-forge.mjs check examples/product-architecture.json
node bin/diagram-forge.mjs render examples/product-architecture.json dist/product-architecture.html --theme midnight
open dist/product-architecture.html
```

## The model

```json
{
  "type": "architecture",
  "title": "Checkout platform",
  "subtitle": "One canonical model, many visual treatments",
  "nodes": [
    { "id": "web", "label": "Web app", "group": "Experience", "kind": "app" },
    { "id": "api", "label": "Checkout API", "group": "Platform", "kind": "service" }
  ],
  "edges": [{ "from": "web", "to": "api", "label": "HTTPS" }]
}
```

The canonical `nodes` / `edges` model is shared by graph-oriented types.
Editorial types use `items`, `series`, or `rows` as appropriate. See
[`examples/`](examples).

## Product architecture

```text
intent or import → canonical JSON → validate → type router → SVG renderer
                                                           ↓
                                             self-contained presentable HTML
```

The important boundary is intentional: content semantics stay in the model;
visual treatment lives in themes and renderers. That lets a future agent
translate Mermaid/draw.io/Excalidraw into the model without inheriting their
layout or styling.

## Roadmap

1. Add importers for Mermaid, draw.io, and Excalidraw.
2. Add an automatic type recommender and JSON schema files.
3. Add view modes, PNG/PDF export, and browser visual regression checks.
4. Add authored style packs and a plugin API for new visual types.

## License and provenance

MIT. See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) for the related
open-source projects that informed the product direction.
