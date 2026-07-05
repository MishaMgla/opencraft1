# Spec — issue #117: Visual style

## Goal
Produce five distinct visual-identity exploration variants for opencraft1, each delivered as one review-only horse still sample and one grass-tile sample.

## Context
Opencraft1 already presents a lightweight browser-native isometric world with symbolic terrain and additive generated art assets, and the current product direction favors crisp readable visuals over a heavy art pipeline ([docs/vision.md](../vision.md), [docs/prd/mvp.md](../prd/mvp.md), [docs/project-map/client.md](../project-map/client.md)). This issue is a presentation-exploration task, not a gameplay or renderer rewrite: the deliverable is a set of style options the team can compare before choosing any future shipped look ([docs/project-map/agents.md](../project-map/agents.md)).

## Requirements
1. The deliverable must contain exactly five distinct visual-style variants for the same game surface, and each variant must include exactly two sample assets only: one horse still image and one grass tile.
2. This issue remains exploration only: it must not select a winning style, wire any sample into live gameplay, or change the current renderer, controls, networking, or world rules.
3. Each variant must define all of the following in writing: a memorable visual thesis, a strict 5-8 color palette, shape language, lighting rule, texture rule, matching UI/icon treatment, character-readability rules for small pixel scale, and a clear list of what to avoid.
4. Each variant must be original and ownable in direction; it must not intentionally copy any existing game's exact look.
5. Each horse sample must be a single review image only, not a gameplay-ready multi-facing sprite sheet, animation set, or character-integration contract.
6. Each grass sample must read as a production-ready isometric pixel-game ground tile at a consistent tile scale across all five variants.
7. Across the full set, the five variants must be materially different from each other in palette, form language, lighting, texture, and UI sensibility; simple recolors or near-duplicates do not satisfy the exploration goal.
8. All samples must preserve crisp pixel edges, limited palettes, readable silhouettes, and restrained surface detail, and must avoid smooth 3D rendering, generic fantasy asset-pack styling, and noisy over-detailing.
9. Review artifacts may be generated and registered as static sample assets for inspection, but the runtime game must remain unchanged unless a later issue explicitly asks to ship one of the styles.

## Variant Briefs

### Variant 1 — Paper Relic Pastures
- Thesis: a world assembled from clipped forms, folded scraps, and archival marks, as if the landscape were built from annotated field notes.
- Palette: parchment cream, moss green, bottle green, oxblood red, charcoal ink, brass yellow.
- Shape language: broad cut-paper silhouettes, stepped corners, layered planes, simple rectangular notches, minimal curves.
- Lighting: flat poster lighting with one darker shadow band per form and no soft gradients.
- Texture: stamped ink, paper grain, torn-edge layering, occasional registration-offset feel.
- UI/icon treatment: label tabs, stamp-like icons, thin ruled dividers, inventory markers that feel cataloged rather than ornamental.
- Character readability: horse bodies stay blocky and compact, legs merge into 1-2 readable clusters, saddle and mane must stay identifiable at a glance.
- Avoid: lush painterly foliage, glossy highlights, realistic fur rendering, decorative filigree, anything that feels like a fantasy card game.

### Variant 2 — Ceramic Ritual Mosaic
- Thesis: the world reads like fired tilework from a ceremonial floor, with every asset built from bold glazed pieces.
- Palette: kiln white, deep teal, jade green, terracotta red, lapis blue, soot brown, gold glaze.
- Shape language: interlocking shards, chamfered corners, triangular inserts, ring motifs, deliberate tessellation.
- Lighting: hard directional light with crisp shadow wedges and bright glaze hits only on major edges.
- Texture: chipped ceramic, crackle glaze, grout seams, polished worn corners.
- UI/icon treatment: icon silhouettes framed as inset medallions, chunky borders, glyph-like symbols, minimal text emphasis.
- Character readability: horse torso must stay one dominant mass, head and neck one secondary mass, and the saddle must read as a contrasting inlay rather than micro-detail.
- Avoid: muddy gradients, soft natural grass tufts, medieval manuscript ornament, random rubble, or anything that reads as generic JRPG town art.

### Variant 3 — Matchbox Foundry Miniature
- Thesis: the world feels like industrial toys from a tiny factory line, with printed surfaces, stamped seams, and economical mass-production charm.
- Palette: cream card, signal red, pine green, denim blue, safety yellow, soot gray, rust orange.
- Shape language: compact rounded blocks, die-cut tabs, stamped panel lines, repeated simple modules, toy-like bevel hints.
- Lighting: single-direction workshop light with sharp cast shadows and occasional underside darkness.
- Texture: printed cardboard, tin paint, stamped metal seams, rubbed corners, slight screen-print misregistration.
- UI/icon treatment: warning-label symbols, numbered tabs, simple meter windows, bold industrial pictograms.
- Character readability: horse silhouette must read instantly as a toy horse with a visible saddle block, thick neck, and sturdy leg spacing that survives tiny scaling.
- Avoid: heroic realism, ornate fantasy tack, organic brush textures, neon cyberpunk glow, or high-detail military kit.

### Variant 4 — Woven Harvest Signals
- Thesis: the landscape looks stitched from woven bands and embroidered field marks, turning the world into a tactile textile map.
- Palette: oat beige, wheat gold, leaf green, plum purple, brick red, indigo thread, walnut brown.
- Shape language: soft diamonds, braided edges, stitched bands, tassel-like accents, repeated woven motifs.
- Lighting: gentle top light with shadow simplified into darker thread bands rather than volumetric shading.
- Texture: embroidery, woven fabric, stitched borders, patchwork joins, felt-like fill areas.
- UI/icon treatment: stitched icon frames, banner tabs, embroidered markers, simple woven separators.
- Character readability: horse anatomy must reduce to strong fabric patches with a high-contrast saddle patch and mane stripe; no thin thread-only leg detail.
- Avoid: shiny satin highlights, realistic cloth folds, cute toy overload, cottagecore clutter, or soft watercolor handling.

### Variant 5 — Basalt Garden Signals
- Thesis: the world feels carved from ritual stone and mossed markers, mixing geometric monumentality with living ground cover.
- Palette: basalt black, ash gray, moss green, pale mint, clay orange, bone white.
- Shape language: carved slabs, runic cuts, stacked stone masses, square-ended foliage, radial marker motifs.
- Lighting: stark raking light that creates deep shadow cuts and bright edge rims on major carved planes.
- Texture: carved stone, weathered pits, moss fill, dusted edges, shallow engraved lines.
- UI/icon treatment: monolith-like panels, rune icons, severe framing, sparse high-contrast markers.
- Character readability: horse sample must read as a clear stone-carved steed with one readable saddle mass and bold head/neck silhouette, not a noisy statue.
- Avoid: soft fairy-forest whimsy, ornamental gothic excess, realistic marble rendering, heavy fog bloom, or dark-fantasy sludge.

## Asset Generation
- type: hud
- name: paper-relic-horse-sample
- prompt: folded paper horse with a readable saddle and clipped mane
- size: 64
- view: low top-down

## Asset Generation
- type: tile
- name: paper-relic-grass-tile
- prompt: layered paper grass ground with clipped blades and ink-mark accents
- size: 64
- view: low top-down

## Asset Generation
- type: hud
- name: ceramic-mosaic-horse-sample
- prompt: glazed ceramic horse idol with a readable saddle and mosaic inlays
- size: 64
- view: low top-down

## Asset Generation
- type: tile
- name: ceramic-mosaic-grass-tile
- prompt: glazed ceramic grass tile with tessellated leaf pieces and grout seams
- size: 64
- view: low top-down

## Asset Generation
- type: hud
- name: matchbox-foundry-horse-sample
- prompt: painted toy horse with a readable saddle and stamped factory seams
- size: 64
- view: low top-down

## Asset Generation
- type: tile
- name: matchbox-foundry-grass-tile
- prompt: miniature printed grass ground with stamped seams and compact turf shapes
- size: 64
- view: low top-down

## Asset Generation
- type: hud
- name: woven-harvest-horse-sample
- prompt: embroidered horse figure with a readable saddle patch and woven mane stripe
- size: 64
- view: low top-down

## Asset Generation
- type: tile
- name: woven-harvest-grass-tile
- prompt: woven grass ground with stitched blades and patchwork field bands
- size: 64
- view: low top-down

## Asset Generation
- type: hud
- name: basalt-garden-horse-sample
- prompt: carved stone horse with a readable saddle mass and moss accents
- size: 64
- view: low top-down

## Asset Generation
- type: tile
- name: basalt-garden-grass-tile
- prompt: carved stone grass tile with moss channels and geometric ground cuts
- size: 64
- view: low top-down

## Out of scope
- Full isometric scene mockups, environment compositions, or multi-asset world kits beyond the requested horse and grass samples.
- Choosing a winning style, shipping one of the variants into the game, or updating runtime asset bindings.
- Gameplay changes, UI implementation changes, renderer rewrites, animation work, or new player-facing mechanics.
- Additional asset classes such as buildings, props, HUD skins, effects, or character sprite sheets.

## Acceptance
- A reviewer can inspect the spec and find five clearly distinct style variants, each with all eight required art-direction fields: thesis, palette, shape language, lighting, texture, UI/icon treatment, character-readability rules, and avoid list.
- The generated review set contains exactly ten sample assets total: one horse still and one grass tile for each of the five variants.
- The five horse samples and five grass samples are visibly different enough that a reviewer can make a real art-direction comparison rather than comparing minor recolors.
- Every sample keeps crisp pixel readability, limited-palette discipline, and coherent isometric-game scale, without smooth-rendered 3D surfaces or generic asset-pack noise.
- The work stops at exploration artifacts: no style winner is declared and the running game remains unchanged after the spec is implemented.
