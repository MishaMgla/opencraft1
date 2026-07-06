# Spec — issue #123: More visual styles

## Goal
Produce one additional review-only batch of five distinct new visual-style variants for opencraft1, each delivered as a single isometric horse still sample only.

## Context
Opencraft1 already supports additive generated art assets while keeping gameplay and renderer behavior stable, and the project vision still favors lightweight symbolic presentation rather than a full art-pipeline rewrite ([docs/vision.md](../vision.md), [docs/prd/mvp.md](../prd/mvp.md), [docs/project-map/client.md](../project-map/client.md)). This issue asks for another style-exploration batch in the same review-only spirit as the earlier horse-and-grass exploration, but narrowed to horse-only output, with no grass tile, no implementation rollout, and explicitly new styles rather than repeats.

## Requirements
1. The deliverable must contain exactly five new visual-style variants, and each variant must include exactly one horse still sample only.
2. Every horse sample must read as an isometric-view review image, not a side-view, front-view, top-down-only icon, sprite sheet, animation strip, or gameplay-ready character set.
3. No grass tile, terrain tile, prop set, HUD skin, effect, or runtime-facing character asset may be generated for this issue.
4. This issue remains exploration only: it must not choose a winning style, wire any sample into live gameplay, replace the shipped horse asset, or change rendering, controls, networking, HUD behavior, persistence, or world rules.
5. Each variant brief must define all of the following in writing: a memorable visual thesis, a strict 5-8 color palette, shape language, lighting rule, texture rule, matching UI/icon treatment, horse-readability rules for small pixel scale, and a clear avoid list.
6. Across the full set, the five new variants must be materially different from each other and from the previously generated horse-style exploration set in palette, form language, lighting, texture, and UI sensibility; recolors or near-duplicates do not satisfy the goal.
7. All samples must preserve crisp pixel edges, limited palettes, readable silhouettes, and restrained detail, and must avoid smooth-rendered 3D surfaces, painterly blur, or generic asset-pack styling.
8. Review artifacts may be generated and registered as static sample assets for inspection, but the running game must remain unchanged after implementation unless a later issue explicitly asks to ship one of these styles.

## Variant Briefs

### Variant 1 — Quarry Herald
- Thesis: a rugged world language built from carved waystones, chiseled badges, and sturdy messenger-beast silhouettes.
- Palette: limestone white, slate gray, rust red, moss green, coal black, muted gold.
- Shape language: cut-stone wedges, inset plaques, squared saddle masses, chipped corners, simple heraldic markers.
- Lighting: hard angled daylight with one bright struck face and one deep shadow plane per major form.
- Texture: chisel nicks, dusty stone grain, rubbed paint, shallow engraved marks.
- UI/icon treatment: carved sign tabs, stamped route symbols, inset badge panels, strict divider grooves.
- Horse readability: the horse must read as one strong pack-animal mass with a large saddle block and a clean head-neck break visible at tiny scale.
- Avoid: polished marble luxury, ornate knight tack, soft atmospheric haze, decorative filigree, or muddy brown-on-brown contrast.

### Variant 2 — Orchard Patchwork
- Thesis: the world feels stitched from quilt blocks, harvest markers, and practical countryside iconography.
- Palette: oat cream, apple red, leaf green, denim blue, bark brown, butter yellow.
- Shape language: patch panels, stitched diamonds, broad cloth bands, blunt hooves, simple farm-badge motifs.
- Lighting: soft morning light with flat readable value steps and a single darker underside band.
- Texture: woven fabric, stitched seams, patched cloth, matte dye variation, worn trim.
- UI/icon treatment: quilt-tab panels, stitched marker icons, fabric dividers, cropped badge corners.
- Horse readability: the horse silhouette must stay compact and sturdy, with the saddle and blanket reading through bold value blocking rather than fine stitching detail.
- Avoid: plush toy softness, glossy satin sheen, lace ornament, scrapbook clutter, or pastel haze that weakens silhouette contrast.

### Variant 3 — Ash Signal
- Thesis: a severe signal-system style built from cinders, warning pennants, and heat-marked industrial icons.
- Palette: ash gray, ember orange, soot black, warning cream, iron blue, dark red.
- Shape language: signal wedges, stacked plates, hard pennant cuts, vent slits, compact mechanical masses.
- Lighting: stark side light with bright edge catches and dense shadow blocks that sharpen the silhouette.
- Texture: scorched paint, ash dust, stamped metal, heat discoloration, roughened plate surfaces.
- UI/icon treatment: warning placards, signal-arrow icons, hazard stripes, bolted label frames.
- Horse readability: the horse must read as a strong warning-emblem shape with a thick neck, bold saddle block, and a distinct muzzle break at first glance.
- Avoid: high-tech sci-fi glow, realistic machinery detail, smoky blur, orange-only recolor treatment, or post-apocalyptic clutter.

### Variant 4 — Canal Festival Mask
- Thesis: the world reads like floating parade masks, lacquered river signage, and festive but disciplined ceremonial icon shapes.
- Palette: ivory white, teal green, lacquer red, night navy, brass yellow, plum purple.
- Shape language: mask ovals, ribbon cuts, lacquer plaques, curved saddle banners, bold crest shapes.
- Lighting: bright frontal light with crisp lacquer gleams and simple shadow wedges under overlapping forms.
- Texture: lacquer sheen, painted wood, silk ribbon edges, shallow carved accents, worn gilded trim.
- UI/icon treatment: mask medallion icons, ribbon tabs, lacquer panels, ceremonial divider bars.
- Horse readability: the horse must remain sturdy and legible, with decorative elements subordinate to a clear body block, readable saddle, and simple mane shape.
- Avoid: carnival clutter, realistic brocade fabric, face-like horse expressions, excessive sparkle, or overloaded costume detail.

### Variant 5 — Tundra Relay
- Thesis: the world is built from relay-post markers, insulated travel gear, and wind-cut northern navigation forms.
- Palette: snow white, ice blue, pine green, charcoal black, leather brown, signal red.
- Shape language: wrapped bundles, relay posts, cut pennants, thick leg blocks, angular blanket forms.
- Lighting: cold clear daylight with bright top planes and dark blue-gray underside shadows.
- Texture: felt wraps, frost wear, rough leather, painted wood, wind-scuffed surfaces.
- UI/icon treatment: relay-post icons, pennant tabs, bundled marker frames, sparse direction bars.
- Horse readability: the horse must read as a durable travel-animal icon with a thick body, strong saddle bundle, and visible head silhouette even at tiny review size.
- Avoid: soft snow-fog blur, glossy fantasy ice crystals, hyper-detailed fur rendering, arctic wildlife realism, or monochrome blue wash.

## Asset Generation
- type: hud
- name: quarry-herald-horse-sample
- prompt: carved stone messenger horse with a readable saddle block and simple herald markings
- size: 64
- view: low top-down

## Asset Generation
- type: hud
- name: orchard-patchwork-horse-sample
- prompt: patchwork harvest horse with a readable saddle blanket and sturdy countryside silhouette
- size: 64
- view: low top-down

## Asset Generation
- type: hud
- name: ash-signal-horse-sample
- prompt: warning-emblem horse with a readable saddle block and scorched signal details
- size: 64
- view: low top-down

## Asset Generation
- type: hud
- name: canal-festival-mask-horse-sample
- prompt: lacquered ceremonial horse with a readable saddle and bold ribbon-like crest shapes
- size: 64
- view: low top-down

## Asset Generation
- type: hud
- name: tundra-relay-horse-sample
- prompt: relay-post travel horse with a readable saddle bundle and wind-cut northern markings
- size: 64
- view: low top-down

## Out of scope
- Any grass tile, terrain tile, or environment-style exploration asset.
- Choosing a winning style, shipping one of the samples into runtime, or changing the current horse rendering contract.
- Gameplay changes, HUD implementation changes, renderer rewrites, animation work, or new world mechanics.
- Full scene mockups, multi-asset style kits, or additional creature species.

## Acceptance
- A reviewer can inspect the spec and find five clearly distinct new style variants, each with all eight required art-direction fields: thesis, palette, shape language, lighting, texture, UI/icon treatment, horse-readability rules, and avoid list.
- The generated review set contains exactly five horse still samples total and no grass tiles or other asset types.
- All five samples read as isometric horse review images rather than gameplay-ready character sheets or non-isometric studies.
- The five new horse samples are visibly different enough from each other and from the earlier exploration batch to support a real art-direction comparison rather than minor recolor review.
- The work stops at exploration artifacts: no winner is declared and the running game remains unchanged after the spec is implemented.
