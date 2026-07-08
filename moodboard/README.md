# moodboard

Visual-style exploration artifacts (review-only; not shipped to the running
game). Open the `.html` files in a browser — images are embedded, no server
needed. Generated locally via PixelLab (`web/tools/gen-asset.mjs` and the flat
`pixflux` / `generate-8-rotations-v3` endpoints).

See `docs/character-generation-pipeline.md` for how these were made and the
PixelLab API quirks involved.

## Style exploration (40 techniques)

Same subject rendered across many pixel-art *techniques* (hue left free), to find
an ownable visual identity by rendering language rather than by hue-locked theme.

- `visual-style-round5-materials-report.html` — material themes (early)
- `visual-style-round6-techniques-report.html` — 5 rendering techniques
- `visual-style-round7-anthro-iso-report.html` — 5 techniques, anthro cast + iso tile
- `visual-style-round8-more-techniques-report.html` — 10 more techniques
- `visual-style-round9-cast-test-report.html` — 6 finalists × full cast
- `visual-style-round10-more-cast-report.html` — 10 more techniques × cast
- `visual-style-round11-onebit-variations-report.html` — 10 one-bit variations × cast

## Character pipeline experiments

- `character-endpoint-style-comparison.html` — 7 styles via the character endpoint
  (shows its locked proportions)
- `create-character-pro-cast.html` — the `create-character-pro` cast (varied
  proportions, mannequin-forced bipedal)
- `halftone-comic-chosen-cast.html` — halftone cast on a neutral ground tile
- `watercolor-8rotations-cast.html` — watercolor cast rotated via
  `generate-8-rotations-v3` (documents the correct frame-index → facing map)
- `south-sources-compare.html` — why source pose matters for rotation
- `style-picker.html` — **current:** all 4 characters × 5 styles, clean
  south-facing 64px sprites for style selection

## Raw sprites

- `style-picker/` — `<style>-<character>.png`, front-facing 64px
- `sources/` — `<character>-source-south.png`, the true-south rotation sources
