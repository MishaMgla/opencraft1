# Spec — issue #126: Visual styles

## Goal
Produce five distinct review-only visual-style variants for opencraft1, each delivered as a single isometric horse still sample that helps the team compare and choose a stronger visual identity.

## Context
Opencraft1 already treats graphics work as additive, spec-driven asset generation rather than a renderer or gameplay rewrite, and the product vision still favors lightweight symbolic presentation in an isometric browser world ([docs/vision.md](../vision.md), [docs/prd/mvp.md](../prd/mvp.md), [docs/project-map/agents.md](../project-map/agents.md), [docs/project-map/client.md](../project-map/client.md)). This issue asks for style discovery and sample generation, but the comment thread narrowed the concrete deliverable to horse-only review stills: five variants, one isometric horse image per variant, with no grass tile and no runtime rollout.

## Requirements
1. The deliverable must contain exactly five visual-style variants, and each variant must include exactly one horse still sample only.
2. Every sample must read as an isometric horse review image, not a side-view sheet, front-view portrait, animation strip, gameplay-ready character set, or broader scene vignette.
3. No grass tile, terrain tile, prop set, building set, HUD skin, effect, or integrated runtime-facing horse replacement may be generated for this issue.
4. This issue remains exploration only: it must not pick a final winning style, wire any sample into live gameplay, replace the currently shipped horse asset, or change renderer, controls, networking, persistence, HUD behavior, or world rules.
5. Each variant brief must define all of the following in writing: a memorable visual thesis; a strict 5-8 color palette; shape language for buildings, props, terrain, and characters; a lighting rule; a texture rule; matching UI/icon treatment; horse-readability rules for small pixel scale; and what to avoid so the result does not drift into generic pixel-art fantasy.
6. Across the full set, the five variants must be materially different from each other and from the earlier style-exploration batches already produced in this repository; recolors, near-duplicates, or minor texture swaps do not satisfy the goal.
7. All samples must preserve crisp pixel edges, limited palettes, readable silhouettes, consistent isometric readability, and restrained detail, and must avoid smooth 3D rendering, generic fantasy asset-pack styling, and noisy over-detail.
8. The style briefs and generated samples must be original to opencraft1 and must not copy any existing game's exact visual identity.
9. Review artifacts may be generated and registered as static sample assets for inspection, but the running game must remain unchanged after implementation unless a later issue explicitly asks to ship a chosen style.

## Variant Briefs

### Variant 1 — Ledger Caravan
- Thesis: a trade-world visual language built from stamped ledgers, cargo seals, and practical travel marks, as if the world were assembled from expedition paperwork made physical.
- Palette: parchment cream, ink black, oxblood red, faded teal, brass yellow, dust brown.
- Shape language: clipped rectangles, cargo tabs, tied bundles, seal medallions, broad saddle blocks, terrain forms reduced to stacked record-like planes.
- Lighting: flat poster lighting with one firm underside shadow band and no soft bloom.
- Texture: paper grain, rubber-stamp impressions, rubbed ink fill, worn card edges, wax-seal scuffs.
- UI/icon treatment: receipt-strip panels, stamped action icons, ledger dividers, tabbed labels, seal-shaped buttons.
- Horse readability: the horse must read as one sturdy courier mass with a large readable saddle pack, a simple head-neck break, and legs reduced to bold grouped shapes that survive tiny scaling.
- Avoid: whimsical stationery clutter, handwritten-script fussiness, sepia mush, realistic leather micro-detail, or cozy tavern-fantasy cues.

### Variant 2 — Kiln Oath
- Thesis: a solemn world of fired clay vows, kiln marks, and ritual craft objects, where everything feels baked, durable, and heat-shaped.
- Palette: chalk white, brick red, soot black, kiln orange, sage green, clay tan.
- Shape language: thick vessel curves, tile chips, slab-built silhouettes, notch-cut manes, compact torso masses, stepped terrain plates.
- Lighting: hard sun from one side with dense shadow wedges and bright fired highlights on top planes.
- Texture: matte ceramic, kiln soot, glaze pooling, chipped rims, scored maker marks.
- UI/icon treatment: pottery-stamp icons, slab tabs, kiln-mark separators, inset token frames, stamped selection rings.
- Horse readability: the horse silhouette must stay blocky and durable, with the saddle reading as one contrasting ceramic slab and the muzzle/head shape readable at first glance.
- Avoid: glossy porcelain luxury, ornate mosaic filigree, fantasy temple excess, smoky blur, or fragile figurine proportions.

### Variant 3 — Wire Orchard
- Thesis: an agrarian signal-world made from trellis wire, orchard markers, and neatly maintained field hardware rather than medieval rustic fantasy.
- Palette: apple green, cream white, wire gray, bark brown, sunset orange, midnight blue.
- Shape language: hooked wire arcs, post-and-crossbar forms, tag diamonds, broad blanket shapes, simple clipped foliage masses, patterned field bands.
- Lighting: clear late-afternoon light with strong warm top planes and cool simple shadow blocks.
- Texture: painted wood, oxidized wire, canvas wraps, weathered enamel tags, dry soil scuffing.
- UI/icon treatment: produce-tag icons, post-frame panels, clipped-corner labels, wire-loop selectors, harvest-stamp badges.
- Horse readability: the horse must read as a compact work-animal icon with a thick neck, broad saddle blanket, and a clean mane stripe that separates clearly from the torso.
- Avoid: cute farm-animal softness, storybook pastels, hay-bale clutter, realistic vegetation rendering, or generic cottagecore charm.

### Variant 4 — Salt Theater
- Thesis: a dramatic coastal stage language of painted flats, salt-worn props, and ceremonial scene-cut silhouettes, like a travelling performance world.
- Palette: salt white, stage black, tide blue, coral red, lantern gold, weathered plum.
- Shape language: curtain cuts, profile masks, crest waves, plank wedges, bold saddle banners, layered backdrop terrain slabs.
- Lighting: stark spotlight logic with bright front planes and deep stage-shadow drop shapes.
- Texture: flaking paint, salted wood, canvas backdrops, brushed lacquer, rope wear.
- UI/icon treatment: marquee plaques, mask icons, ticket-tab panels, stage-marker dividers, bold cue symbols.
- Horse readability: the horse must remain a strong stage-silhouette first, with a readable saddle banner and a distinct muzzle and chest break even at tiny size.
- Avoid: pirate kitsch, theatrical clutter, photoreal ocean effects, glittery carnival noise, or over-costumed fantasy mounts.

### Variant 5 — Coal Reliquary
- Thesis: a severe subterranean identity built from coal stamps, reliquary boxes, and soot-marked preservation objects, making the world feel compact, sacred, and industrial without becoming sci-fi.
- Palette: coal black, bone white, iron gray, ember red, tarnished silver, deep moss.
- Shape language: casket blocks, riveted frames, vent slits, stacked reliquary faces, bold saddle chests, terrain reduced to compressed cut-stone tiers.
- Lighting: low directional glow with strong silhouette contrast, small hot highlights, and large dark value fields.
- Texture: soot dust, scratched metal, charred wood, rubbed silver edging, packed ash.
- UI/icon treatment: reliquary-window icons, riveted panels, inventory-plate dividers, stamped warning glyphs, framed badge counters.
- Horse readability: the horse must read instantly as a sturdy burden-bearer with one large saddle chest, a thick torso block, and a clear head silhouette separated from the body by value, not detail.
- Avoid: neon cyberpunk glow, dieselpunk machinery overload, skull-heavy goth ornament, muddy all-dark palettes, or post-apocalypse scrap clutter.

## Asset Generation
- type: hud
- name: ledger-caravan-horse-sample
- prompt: courier horse with a readable saddle pack and stamped trade-mark details
- size: 64
- view: low top-down

## Asset Generation
- type: hud
- name: kiln-oath-horse-sample
- prompt: fired clay horse with a readable saddle slab and kiln-mark accents
- size: 64
- view: low top-down

## Asset Generation
- type: hud
- name: wire-orchard-horse-sample
- prompt: orchard work horse with a readable saddle blanket and simple marker-tag details
- size: 64
- view: low top-down

## Asset Generation
- type: hud
- name: salt-theater-horse-sample
- prompt: stage-silhouette horse with a readable saddle banner and painted coastal details
- size: 64
- view: low top-down

## Asset Generation
- type: hud
- name: coal-reliquary-horse-sample
- prompt: burden horse with a readable saddle chest and soot-marked reliquary details
- size: 64
- view: low top-down

## Out of scope
- Any grass tile, terrain tile, prop, building, or full-scene exploration asset.
- Choosing a winning style, shipping one of the samples into runtime, or changing the current horse rendering contract.
- Gameplay changes, renderer rewrites, UI implementation work, animation work, or any new world mechanics.
- Additional creature species, rider variants, or broader environment kits beyond the requested five horse stills.

## Acceptance
- A reviewer can inspect the spec and find five clearly distinct style variants, each with all required art-direction fields: thesis, palette, shape language, lighting, texture, UI/icon treatment, horse-readability rules, and avoid list.
- The generated review set contains exactly five horse still samples total and no grass tiles or other asset types.
- All five samples read as isometric horse review images rather than sprite sheets, non-isometric studies, or gameplay-ready character sets.
- The five variants are visibly different enough from each other and from the earlier exploration batches to support a real visual-identity comparison rather than a recolor review.
- The work stops at research artifacts: no winner is declared and the running game remains unchanged after the spec is implemented.
