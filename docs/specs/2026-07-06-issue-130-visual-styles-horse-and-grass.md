# Spec — issue #130: Visual styles round 5 — horse + grass tile pairs

## Goal
Produce five brand-new review-only visual-style variants for opencraft1, each delivered as one isometric horse still sample plus one matching grass tile, so the team can compare full style directions (character + terrain together) and choose a stronger visual identity.

## Context
Opencraft1 treats graphics work as additive, spec-driven asset generation ([docs/vision.md](../vision.md), [docs/prd/mvp.md](../prd/mvp.md), [docs/project-map/agents.md](../project-map/agents.md)). Four earlier exploration batches (issues #117, #120, #123, #126) produced twenty style variants; issue #126 was narrowed to horse-only stills, which made terrain impossible to judge. This round explicitly restores the horse + grass-tile pairing from batch #117 and requires five variants materially different from all twenty prior ones. The per-asset prompt lines below are the saved "visual prompt additions" — they are recorded here and in `web/assets/manifest.json` so the winning style's prompt language can be reused verbatim in later asset work.

## Requirements
1. The deliverable must contain exactly five visual-style variants, and each variant must include exactly one isometric horse still sample and exactly one grass tile — ten generated assets total, no more, no fewer.
2. Every horse sample must read as an isometric horse review image, not a side-view sheet, front-view portrait, animation strip, or gameplay-ready character set; every grass tile must read as a repeatable isometric ground tile in the same style.
3. Each variant brief must define all of the following in writing: a memorable visual thesis; a strict 5-8 color palette; shape language for buildings, props, terrain, and characters; a lighting rule; a texture rule; matching UI/icon treatment; horse-readability rules for small pixel scale; and what to avoid so the result does not drift into generic pixel-art fantasy.
4. Across the full set, the five variants must be materially different from each other and from the twenty variants already produced in issues #117, #120, #123, and #126 (paper relic, ceramic mosaic, matchbox foundry, woven harvest, basalt garden, lantern enamel courier, reed delta totem, sugar banner parade, iron orchard marker, salt beacon relic, quarry herald, orchard patchwork, ash signal, canal festival mask, tundra relay, ledger caravan, kiln oath, wire orchard, salt theater, coal reliquary); recolors, near-duplicates, or minor texture swaps do not satisfy the goal.
5. All samples must preserve crisp pixel edges, limited palettes, readable silhouettes, consistent isometric readability, and restrained detail, and must avoid smooth 3D rendering, generic fantasy asset-pack styling, and noisy over-detail.
6. The style briefs and generated samples must be original to opencraft1 and must not copy any existing game's exact visual identity.
7. This issue remains exploration only: it must not pick a final winning style, wire any sample into live gameplay, replace the currently shipped horse or grass assets, or change renderer, controls, networking, persistence, HUD behavior, or world rules.
8. Review artifacts may be generated and registered as static sample assets for inspection, but the running game must remain unchanged after implementation unless a later issue explicitly asks to ship a chosen style.

## Variant Briefs

### Variant 1 — Glazier Vault
- Thesis: a world assembled from leaded lantern glass — every surface is a small glazed panel set into dark came, lit gently from within.
- Palette: came black, amber glass, deep cobalt, bottle green, ruby red, milk-glass white, worn brass.
- Shape language: faceted panel polygons, arched panes, kite and diamond quarries, thick joint lines everywhere; buildings as stacked glazed lanterns, terrain as large flat glass quarries, characters built from a few large glass facets per body mass.
- Lighting: backlit glow — each glass fill reads one stop brighter at its center while the dark came lines carry all edge definition; the only cast shadow is one hard ground diamond under each object.
- Texture: streaky rolled glass, faint bubble specks, soldered joints, rubbed brass caming; at most one streak per pane so panels stay flat and readable.
- UI/icon treatment: icons as small leaded medallions, panels framed in came with brass corner tabs, selection reads as a pane lighting up, counters set in round bezel windows.
- Horse readability: the horse is six to ten large glass facets — torso, haunch, neck, head, grouped leg blocks — with the saddle as one contrasting glass panel; the black came outline guarantees the silhouette survives tiny scaling.
- Avoid: church iconography, rainbow prism gradients, bloom haze, photoreal transparency or refraction, gothic tracery filigree.

### Variant 2 — Chalk Meridian
- Thesis: a surveyor's slate world — terrain and creatures drawn as confident chalk marks on dark slate, like a living field-plan that keeps being annotated.
- Palette: slate charcoal, deep slate blue, chalk white, ochre chalk, terracotta chalk, faded mint chalk.
- Shape language: flat slate slabs with chamfered edges; solid chalk-filled blocks carry the forms while dashed construction ticks, survey crosses, and arc guides annotate them; terrain as contour bands, buildings as plan-view solids raised into simple prisms.
- Lighting: no rendered light at all — flat dark ground with value carried by chalk density; a shadow is a hatched chalk patch, never a gradient.
- Texture: dry chalk grain, rubbed erasure ghosts, fine slate speckle; exactly one hatch pattern reused everywhere.
- UI/icon treatment: chalk-drawn icons inside dashed frames, panels as slate cards with a single white ruled border, hover states as a double-ruled line, counters written like tally marks.
- Horse readability: the horse is a solid chalk-filled silhouette in white or ochre with two or three slate-colored interior cut lines for the saddle and neck break; never line-art only, so the mass survives small scale.
- Avoid: schoolroom kitsch, scribbly sketch noise, neon blackboard colors, wobbly hand-drawn line affectation, blueprint-blue drafting cliché.

### Variant 3 — Votive Apiary
- Thesis: a solemn beekeepers' world molded from beeswax and comb — everything is poured, pressed, or stamped in wax and tended like a votive offering.
- Palette: beeswax amber, honey gold, cream wax, propolis brown, hive black, smoke gray, wick-flame orange.
- Shape language: soft-edged cast blocks with rounded chamfers, hex-comb motifs used sparingly as trim, drip beads along bottom edges only, buildings as stacked skep domes and wax tablets, characters as chunky molded masses.
- Lighting: one warm candle-key from the upper left with soft bright top planes and a single dense brown contact shadow; tiny wick-orange rim accents reserved for sacred objects.
- Texture: matte pressed wax with faint comb stamping, thumb-press dents, seal impressions; no gloss anywhere.
- UI/icon treatment: icons as pressed wax seals, panels as poured wax tablets with rounded corners and a stamped border, counters framed in single hex cells.
- Horse readability: the horse reads as one warm molded mass with a dark propolis saddle band and a hive-black mane wedge; legs group into two cast supports at small scale so the animal never dissolves into drips.
- Avoid: cute cartoon bees, dripping-goo excess, translucent subsurface rendering, candy-shop brightness, halloween candle gloom.

### Variant 4 — Ice Sawyard
- Thesis: a lake-ice harvest world — everything is built from sawn ice blocks, timber sledges, and sawdust packing; industrious and cold, never magical.
- Palette: ice white, glacial cyan, deep tarn teal, winter-sky pale blue, sawdust tan, iron gray.
- Shape language: rectangular sawn blocks with kerf-line edges, stacked coursework terrain, sled-runner curves on props, buildings as icehouse sheds of block courses, characters faceted like cut blocks with beveled corners.
- Lighting: low winter sun — long single-direction shadow slabs in deep teal, bright crisp top planes, no sparkle particles.
- Texture: saw kerf striations, trapped-air lines inside blocks, dusted sawdust patches, tong-bite notches; one striation direction per plane.
- UI/icon treatment: icons stamped like ice-merchant tally tags, panels as planked crate lids edged with iron strap, selection as tong-clamp brackets, counters burned into wood.
- Horse readability: the horse is a pale faceted block-animal set against tan and teal ground, with an iron-gray harness band and a deep-teal mane wedge; the silhouette is carried by value contrast, not outline.
- Avoid: frozen-kingdom fantasy sparkle, crystal or gem readings, blizzard fog, holiday-season cheer, and the insulated-expedition-clothing tropes already used by the tundra relay variant.

### Variant 5 — Brass Orrery
- Thesis: an astronomer's table-world — landscape and creatures machined like brass orrery instruments gliding over a midnight chart.
- Palette: midnight blue-black, chart cream, polished brass, blued-steel gray, enamel signal red, pale verdigris.
- Shape language: turned discs, ring tracks, keyed hubs, chamfered instrument arms; terrain as layered chart discs with engraved graduation ticks, buildings as instrument housings, characters as compact machined bodies on subtle pivot bases.
- Lighting: a single cool studio key with exactly one crisp one-to-two-pixel brass glint per object, never bloom; shadows are flat midnight shapes.
- Texture: engraved tick marks, brushed metal bands, enamel-filled stamps, worn lacquer edges; engraving appears only where it explains function.
- UI/icon treatment: icons as engraved brass tokens with enamel infill, panels as chart-paper cards in thin brass bezels, dial-style counters with a red index needle.
- Horse readability: the horse reads as a brass automaton animal with a cream chart-panel saddle plate for contrast, blued-steel legs grouped into two supports, and one glint on the haunch; the head silhouette stays solid with no gears or antennae breaking it.
- Avoid: steampunk goggles-and-gears clutter, sci-fi holograms, literal clock faces, gold-luxury shine, zodiac-symbol dumping.

## Asset Generation
- type: hud
- name: glazier-vault-horse-sample
- prompt: leaded stained glass horse with bold dark came lines and a contrasting glass saddle panel
- size: 64
- view: low top-down

## Asset Generation
- type: tile
- name: glazier-vault-grass-tile
- prompt: leaded glass grass panel with faceted green quarries and dark came seams
- size: 64
- view: low top-down

## Asset Generation
- type: hud
- name: chalk-meridian-horse-sample
- prompt: solid chalk-filled horse drawn on dark slate with dashed survey marks and an ochre saddle
- size: 64
- view: low top-down

## Asset Generation
- type: tile
- name: chalk-meridian-grass-tile
- prompt: dark slate ground tile with chalk-drawn grass ticks and dashed survey lines
- size: 64
- view: low top-down

## Asset Generation
- type: hud
- name: votive-apiary-horse-sample
- prompt: molded beeswax horse with a pressed honeycomb saddle band and stamped wax seal markings
- size: 64
- view: low top-down

## Asset Generation
- type: tile
- name: votive-apiary-grass-tile
- prompt: pressed beeswax grass ground with faint honeycomb stamping and molded wax blades
- size: 64
- view: low top-down

## Asset Generation
- type: hud
- name: ice-sawyard-horse-sample
- prompt: sawn ice block horse with beveled facets, an iron harness band and sawdust dusting
- size: 64
- view: low top-down

## Asset Generation
- type: tile
- name: ice-sawyard-grass-tile
- prompt: sawn lake-ice ground tile with kerf lines, trapped air streaks and sawdust patches
- size: 64
- view: low top-down

## Asset Generation
- type: hud
- name: brass-orrery-horse-sample
- prompt: machined brass orrery horse with engraved tick marks and a cream chart saddle plate
- size: 64
- view: low top-down

## Asset Generation
- type: tile
- name: brass-orrery-grass-tile
- prompt: midnight star-chart ground tile with engraved brass graduation rings and pale grass ticks
- size: 64
- view: low top-down

## Out of scope
- Any prop, building, HUD skin, effect, or full-scene exploration asset beyond the five horse samples and five grass tiles.
- Choosing a winning style, shipping any sample into runtime, or changing the current horse or grass rendering contract.
- Gameplay changes, renderer rewrites, UI implementation work, animation work, or any new world mechanics.
- Additional creature species, rider variants, or broader environment kits beyond the requested ten assets.

## Acceptance
- A reviewer can inspect the spec and find five clearly distinct style variants, each with all required art-direction fields: thesis, palette, shape language, lighting, texture, UI/icon treatment, horse-readability rules, and avoid list.
- The generated review set contains exactly ten assets: five isometric horse still samples and five matching grass tiles, one pair per variant.
- The five variants are visibly different from each other and from all twenty variants of issues #117, #120, #123, and #126 — different core material, different lighting logic, different palette family — supporting a real visual-identity comparison rather than a recolor review.
- Every generated asset's prompt line is preserved verbatim in this spec and in `web/assets/manifest.json`, so the chosen style's prompt addition can be reused.
- The work stops at research artifacts: no winner is declared and the running game remains unchanged after the spec is implemented.
