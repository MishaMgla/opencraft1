# Character generation pipeline (PixelLab)

How opencraft1 generates multi-directional isometric character sprites, and the
non-obvious PixelLab API quirks that make or break the result. Derived from the
July 2026 visual-style exploration (see `moodboard/*.html`).

## The problem

The renderer needs each character in **four ISO diagonal facings**
(`north-east`, `south-east`, `south-west`, `north-west`) — the facings that read
correctly under the iso camera (`web/src/render.ts`). PixelLab offers several
ways to make directional characters, and they are **not** equivalent:

| Endpoint | Style fidelity | Rotation | Proportions | Bipedal animals |
|---|---|---|---|---|
| `create-character-with-8-directions` (what `gen-asset.mjs` uses) | flattens to a clean sprite; ignores render-technique words | built-in | **locked stocky template** (every character ~aspect 2.9) | reliable |
| `create-character-pro` (`method: create_with_style`, `template_id: mannequin`) | style reference honored | built-in | **varies by subject** (aspect 1.6–2.4) | reliable via `mannequin` |
| `generate-image-pixflux` (flat) | **best** — honors style fully | none (single pose) | prompt-driven | prompt-driven (unreliable) |
| `generate-8-rotations-v3` | preserves the input frame's style | rotates an existing frame | inherits the source | inherits the source |
| `rotate` | preserves style | one target facing per call | inherits source | inherits source |

Key finding: **the dedicated character endpoints impose their own look and
proportions**, so the styled samples in the flat (`pixflux`) galleries do NOT
match what the character endpoint produces. To keep a chosen style on a rotating
character, generate the styled frame with `pixflux` and rotate it with
`generate-8-rotations-v3`.

## The recommended pipeline (style-preserving)

1. **Generate a styled, true-south front sprite** with `pixflux`:
   - `direction: "south"`, `view: "low top-down"`, `isometric: true`,
     `no_background: true`, 64×64.
   - Append the house style suffix to the prompt (see `AGENT_RULES.md` →
     "visual style").
   - `direction`/`view`/`isometric` are **"weakly guiding"** — the model does not
     always obey. Generate a few candidates and auto-pick the most front-facing
     one (lowest horizontal asymmetry **and** a bright top third = a face, not a
     symmetric *back*). The horse in particular tends to turn its head; roll more.
2. **Rotate** the chosen frame with `generate-8-rotations-v3` (`first_frame` must
   be a `Base64Image` object `{type, base64, format}`, max 256×256).
3. **Slice the four ISO facings** from `last_response.images` by index — see the
   frame-order section below.

## generate-8-rotations frame order (the big gotcha)

`last_response.images` is a list of 8 frames in this order — **counter-clockwise,
starting at south** (documented on the `generate-8-rotations-v2` endpoint,
verified frame-by-frame; the v3 doc omits it):

```
index: 0      1           2      3           4      5           6      7
dir:   south, south-west, west,  north-west, north, north-east, east,  south-east
```

So the four ISO ordinal facings are:

```
south-east = images[7]
south-west = images[1]
north-east = images[5]
north-west = images[3]
```

**This mapping is only valid if the source frame is a true straight-south front
pose.** If the source is already turned to a diagonal, the whole 8-frame wheel is
rotated by that offset and every sliced facing is wrong. This is why a true-front
Jesus "rotated to cardinals" while an already-diagonal horse *looked* fine with a
wrong index map — always verify the source is front-facing first.

## Downloading result images

Character/rotation result URLs are Backblaze CDN links
(`https://backblaze.pixellab.ai/...`). They **403 without a browser `User-Agent`
header** — send `User-Agent: Mozilla/5.0` when downloading them. (Inline base64
results in `last_response.images` need no download.)

## Seamless ground tiles

Tiles are generated with `pixflux` + the house style suffix. Verify seams with
`web/tools/seamcheck.py <tile.png>` (mean edge mismatch < 25 reads seamless).
Organic/painterly styles often will not roll seamless; run
`web/tools/wrapblend.py <tile.png>` — a deterministic 4px edge cross-fade — to
close the seam without disturbing the interior.

## Figure-ground

Characters must pop; ground must recede. The house style (`AGENT_RULES.md`) uses
a **bold** style suffix for characters/hud/props and a **quiet, low-contrast**
suffix for ground tiles. Measured example: a busy grass tile put background
contrast (luminance stddev) at ~59 behind the cast; a neutral tile dropped it to
~9, making characters read clearly.

## Where the exploration lives

- `moodboard/*.html` — the full 40-style comparison galleries and cast tests
  (rounds 5–11), the character-endpoint/pro/rotation experiments, and the
  south-facing style picker.
- `moodboard/style-picker/`, `moodboard/sources/` — raw sprite PNGs.
- Prompts for every generated asset are stored in `web/assets/manifest.json`.
