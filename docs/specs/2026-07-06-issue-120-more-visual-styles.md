# Spec — issue #120: More visual styles

## Goal
Produce one additional review-only batch of five distinct visual-style variants for opencraft1, each delivered as a horse still sample only.

## Context
Opencraft1 already uses lightweight additive generated art assets and recently completed one five-variant visual-style exploration set made of horse and grass samples, without changing runtime gameplay or renderer behavior ([docs/vision.md](../vision.md), [docs/prd/mvp.md](../prd/mvp.md), [docs/project-map/client.md](../project-map/client.md)). This follow-up issue explicitly asks for more visual-style exploration in the same spirit as that prior batch, but narrowed to horse-only review assets and with no grass-tile generation.

## Requirements
1. The deliverable must contain exactly five new visual-style variants beyond the already-generated set from issue #117, and each new variant must include exactly one horse still sample only.
2. No grass tile, terrain tile, prop, HUD skin, or gameplay-ready character sheet may be generated for this issue.
3. This issue remains exploration only: it must not select a winning style, wire any sample into live gameplay, replace the shipped horse asset, or change the renderer, controls, networking, HUD behavior, or world rules.
4. Each variant must define all of the following in writing: a memorable visual thesis, a strict 5-8 color palette, shape language, lighting rule, texture rule, matching UI/icon treatment, character-readability rules for small pixel scale, and a clear list of what to avoid.
5. Each horse sample must be a single review image only, not a multi-facing sprite sheet, animation set, idle/walk integration contract, or production-ready in-game replacement.
6. Across the full set, the five new variants must be materially different from each other and from the previously generated issue-117 styles in palette, form language, lighting, texture, and UI sensibility; recolors or near-duplicates do not satisfy the exploration goal.
7. All samples must preserve crisp pixel edges, limited palettes, readable silhouettes, and restrained surface detail, and must avoid smooth 3D rendering, generic fantasy asset-pack styling, and noisy over-detailing.
8. Review artifacts may be generated and registered as static sample assets for inspection, but the running game must remain unchanged unless a later issue explicitly asks to ship one of these styles.

## Variant Briefs

### Variant 1 — Lantern Enamel Courier
- Thesis: a fast-travel world language built from glossy sign-paint, courier marks, and sturdy travel-icon silhouettes.
- Palette: cream white, lacquer red, pine green, night blue, warm black, brass yellow.
- Shape language: rounded plaques, painted bands, compact icon masses, clipped corners, simple badge geometry.
- Lighting: bold top-front light with one bright enamel gleam per major surface and firm shadow blocks.
- Texture: painted metal, worn enamel chips, brushed signboard edges, subtle stamped borders.
- UI/icon treatment: route-marker icons, sign-plate panels, painted arrows, compact destination-tab framing.
- Character readability: horse body stays one strong travel-icon mass with a large saddle block and a clean head silhouette that reads instantly at tiny scale.
- Avoid: realistic leather tack, ornate heraldry, muddy gradients, dusty parchment motifs, or heavy industrial grime.

### Variant 2 — Reed Delta Totem
- Thesis: the world feels assembled from marsh totems, reed bundles, and water-worn carved markers.
- Palette: reed tan, marsh green, river blue, silt brown, bone white, ember orange.
- Shape language: tied bundles, carved wedges, stacked marker forms, soft diamonds, simple cut notches.
- Lighting: flat daylight with one darker underside band and bright edge accents on carved planes.
- Texture: reeds, wrapped fibers, damp wood grain, shallow carved lines, worn pigment patches.
- UI/icon treatment: totem tabs, knot-framed icons, carved marker symbols, simple woven separators.
- Character readability: horse silhouette must stay broad and compact, with the saddle reading as a clear wrapped bundle rather than fine strap detail.
- Avoid: shiny lacquer, urban signage language, gemstone sparkle, fantasy swamp-monster styling, or noisy foliage clutter.

### Variant 3 — Sugar Banner Parade
- Thesis: the world reads like festival confectionery and parade signage, playful but still tightly graphic and readable.
- Palette: butter cream, cherry red, mint green, sky blue, cocoa brown, candy pink.
- Shape language: puffed ribbons, scalloped plaques, chunky candy-block forms, rounded tabs, parade-banner motifs.
- Lighting: bright frontal light with crisp candy-shadow shapes and minimal gloss highlights.
- Texture: sugared coating, printed paper wraps, frosted edges, pressed candy seams.
- UI/icon treatment: banner headers, candy-medallion icons, striped dividers, celebratory but disciplined badges.
- Character readability: horse form must stay sturdy and legible, with the saddle and mane separated by bold value changes rather than tiny decorative detail.
- Avoid: syrupy soft gradients, plush toy anatomy, excessive cute-face treatment, painterly sweets, or neon arcade glow.

### Variant 4 — Iron Orchard Marker
- Thesis: the world feels forged from orchard tools, stamped field markers, and practical rural machine forms.
- Palette: iron gray, apple red, leaf green, straw yellow, soil brown, chalk white.
- Shape language: forged hooks, riveted plates, crate-like blocks, pruned branch angles, simple farm-marker symbols.
- Lighting: single hard morning light with sharp shadow cuts and restrained edge glints on metal surfaces.
- Texture: forged iron, painted tool handles, crate slats, rubbed corners, shallow stamped numerals.
- UI/icon treatment: crate-label panels, tool-stamp icons, chalked status marks, practical divider rules.
- Character readability: horse body must read as a dependable work-animal icon with a big saddle mass and thick neck, not as a delicate ornamental steed.
- Avoid: glossy high-tech metal, baroque saddle gear, lush romantic pastoral painting, cartoon googly exaggeration, or dark-fantasy corrosion.

### Variant 5 — Salt Beacon Relic
- Thesis: the world is built from sea-beacon relics and salt-bleached markers, balancing severe navigation forms with weathered coastal color.
- Palette: salt white, slate blue, sea green, rust red, driftwood brown, storm black.
- Shape language: beacon towers, pennant cuts, stacked marker slabs, rope curves, hard directional wedges.
- Lighting: stark coastal light with bright sunstruck faces and deep shaded sides on major forms.
- Texture: salt crust, weathered paint, rope binding, worn wood grain, oxidized metal flecks.
- UI/icon treatment: beacon-signal icons, pennant tabs, chart-marker frames, sparse navigation stripes.
- Character readability: horse sample must read as a bold beacon-mascot form with a large readable saddle and a clean mane/head break visible at a glance.
- Avoid: pirate-costume detail, painterly ocean spray, soft fog bloom, tropical lushness, or generic nautical stock-art treatment.

## Asset Generation
- type: hud
- name: lantern-enamel-courier-horse-sample
- prompt: enamel sign horse icon with a readable saddle and painted travel markings
- size: 64
- view: low top-down

## Asset Generation
- type: hud
- name: reed-delta-totem-horse-sample
- prompt: reed-and-wood horse totem with a readable saddle bundle and carved marsh markings
- size: 64
- view: low top-down

## Asset Generation
- type: hud
- name: sugar-banner-parade-horse-sample
- prompt: parade candy horse figure with a readable saddle and banner-like mane shapes
- size: 64
- view: low top-down

## Asset Generation
- type: hud
- name: iron-orchard-marker-horse-sample
- prompt: forged farm horse icon with a readable saddle block and stamped orchard tool details
- size: 64
- view: low top-down

## Asset Generation
- type: hud
- name: salt-beacon-relic-horse-sample
- prompt: salt-worn beacon horse emblem with a readable saddle and coastal marker accents
- size: 64
- view: low top-down

## Out of scope
- Any grass tile or other terrain-style exploration assets.
- Choosing a winning style, shipping one of the samples into runtime, or changing the current horse rendering contract.
- Gameplay changes, HUD implementation changes, renderer rewrites, animation work, or new world mechanics.
- Full scene mockups, multi-asset environment kits, or additional character species.

## Acceptance
- A reviewer can inspect the spec and find five clearly distinct new style variants, each with all eight required art-direction fields: thesis, palette, shape language, lighting, texture, UI/icon treatment, character-readability rules, and avoid list.
- The generated review set contains exactly five horse still samples total and no grass tiles.
- The five new horse samples are visibly different enough from each other and from the prior issue-117 batch to support a real art-direction comparison rather than minor recolor review.
- Every sample keeps crisp pixel readability, limited-palette discipline, and clean silhouette clarity without smooth-rendered 3D surfaces or generic asset-pack noise.
- The work stops at exploration artifacts: no style winner is declared and the running game remains unchanged after the spec is implemented.
