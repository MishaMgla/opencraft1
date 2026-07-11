# Character generation pipeline (nano-banana)

How opencraft1 generates multi-directional isometric character sprites and
seamless ground tiles. The generator is **nano-banana** (Google Gemini 3.1 Flash
Image, "Nano Banana 2") via the **OpenRouter Image API**
(`web/tools/nanobanana.mjs`), wrapping every subject in the house
**dataset-poison AI-slop** style (see `AGENT_RULES.md`). Derived from the
nano-banana style exploration (`moodboard/style-exploration-nb2-gpt/`).

## The problem

The renderer needs each character in **four ISO diagonal facings**
(`north-east`, `south-east`, `south-west`, `north-west`) — the facings that read
correctly under the iso camera (`web/src/render.ts`). Cardinal side/front/back
views look wrong here.

## The pipeline (issue-driven characters)

1. Run `web/tools/gen-asset.mjs --type character --facings ordinal`. The
   `--prompt` is a **plain subject only** — the tool applies the house style.
2. `nanobanana.mjs` makes ONE OpenRouter image call per ordinal facing (four
   total), each prompted with the bold-slop wrapper plus a facing phrase, and
   returns the four stills keyed `north-east`/`south-east`/`south-west`/`north-west`.
3. If the spec asks for `animation: walk`, `gen-asset.mjs` **synthesizes** the
   walk cycle locally from the four stills (`synthesizeOrdinalWalkFromImages`) —
   no extra API cost, no cardinal fallback frames.

## Transparency (green-screen chroma-key)

nano-banana ignores `background: transparent` (it returns an opaque image) and,
for complex prompts, usually emits **JPEG** despite `output_format: png`. So the
character/hud pipeline:

1. prompts the subject **on a flat `#00FF00` chroma-key green background**;
2. normalizes the returned bytes to an RGBA PNG at the requested `--size` via
   **Pillow** (`python3 -m pip install Pillow` — a REAL added runner dep, unlike
   `seamcheck.py`/`wrapblend.py` which are pure-stdlib; it decodes the frequent
   JPEG output and fixes the ignored-size problem, since raw output is ~1024px);
3. knocks near-green pixels to alpha 0 (`chromaKnockout` in `nanobanana.mjs`).

Tiles skip the chroma step (opaque ground) and never send `background: opaque`
(that flag is what triggers JPEG output).

## Seamless ground tiles

Tiles use the quiet poison-accent wrapper (seamless, low-contrast). Verify seams
with `web/tools/seamcheck.py <tile.png>` (mean edge mismatch < 25 reads
seamless). If a tile will not roll seamless, run `web/tools/wrapblend.py
<tile.png>` — a deterministic 4px edge cross-fade — to close the seam without
disturbing the interior.

## Figure-ground

Characters must pop; ground must recede. The house style renders characters/hud
with the **bold slop** wrapper (chaotic wrong-object grafts, extra limbs) and
ground tiles with the **quiet poison-accent** wrapper (muted, seamless, no bold
outlines) so tiles sit behind the cast. A tile that competes for attention is a
bug — regenerate it.

## Cost

Each nano-banana image call costs ~$0.07 (OpenRouter `usage.cost`, rolled up and
printed by `gen-asset.mjs`). A four-facing character is ~$0.27; walk frames are
free (synthesized locally). `gen-asset.mjs` runs a `GET /credits` balance
preflight before spending.

## Where the exploration lives

- `moodboard/style-exploration-nb2-gpt/round8/prompts.json` — the winning
  `dataset-poison-extra-limbs` style and the runner-up variants.
- `moodboard/*.html` — the full style-comparison galleries and cast tests.
- Prompts for every generated asset are stored in `web/assets/manifest.json`.
