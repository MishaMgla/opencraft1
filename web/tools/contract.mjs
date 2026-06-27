// web/tools/contract.mjs
// The ONLY place that encodes the live PixelLab v2 API shape. If the API
// changes, edit here. Field names below were confirmed against
// https://api.pixellab.ai/v2/openapi.json on 2026-06-26 (see Task 1, Step 1).
//
// CONFIRMED against live OpenAPI spec (2026-06-26):
//   - Endpoint paths: /create-image-pixflux, /create-character-with-4-directions,
//     /animate-with-text, /background-jobs/{job_id}
//   - Request field: "description" (not "prompt") — carries the SUBJECT only;
//     style is set via dedicated fields below, not adjectives in the description.
//   - Request field: "image_size" with nested "width"/"height"
//   - Style fields (soft hints): "outline", "shading", "detail", "view".
//     outline ∈ {single color black outline, single color outline,
//     selective outline, lineless}; view ∈ {side, low top-down, high top-down}.
//   - "no_background" (pixflux only): transparent background.
//   - "template_id" (character only): 'mannequin' | quadruped preset
//     (bear|cat|dog|horse|lion).
//   - Request field: "n_frames" for animate-with-text
//   - Background job ID field: "background_job_id"
//   - Background job status values: "processing" | "completed" | "failed"
//   - Background job result location: "last_response" nested object
//   - /create-image-pixflux sync response: { image: { type, base64 } } (singular)
//   - /create-character-with-4-directions: ASYNC-ONLY. POST returns
//       { background_job_id, character_id } with NO inline images. Sprites are
//       PUBLIC URLs under CharacterDetail.rotation_urls (GET /characters/{id}),
//       not base64. (The old "{images:{south,west,east,north}}" note was wrong.)
//   - /animate-with-text sync response: { images: [ { type, base64 }, ... ] } (array)
//
// NOTE: These endpoints are synchronous by default. Background-job wrapping is
// opt-in (via a request header or query param — consult PixelLab docs). The
// background-jobs/{job_id} accessor below is for that async path; the sync
// path returns images directly in the POST response (use jobImagesOf on it too).

export const BASE_URL = 'https://api.pixellab.ai/v2';

export const ENDPOINTS = {
  tile:      '/create-image-pixflux',
  hud:       '/create-image-pixflux',
  character: '/create-character-with-4-directions',
  effect:    '/animate-with-text',
};

// 4-direction character endpoint slot keys. The API returns an object keyed by
// these legacy cardinal names. In opencraft1's isometric renderer they are
// interpreted as diagonal visual facings:
//   north -> north-east, east -> south-east,
//   south -> south-west, west -> north-west.
export const DIRECTIONS = ['south', 'north', 'east', 'west'];

// Style is expressed through the API's DEDICATED PARAMETERS — never by stuffing
// adjectives into the description. The generator is pixel-art by default, so the
// description carries the SUBJECT ONLY. The following are real request fields,
// confirmed against the live OpenAPI spec (2026-06-26):
//
//   outline (both endpoints) — soft style hint. Allowed:
//       'single color black outline' (API default) | 'single color outline'
//       | 'selective outline' | 'lineless'.  We default to 'lineless' (no
//       outline) to match the retro look; pass --outline to override.
//   view (camera) — 'side' | 'low top-down' | 'high top-down'.
//       NOTE: REAL values use SPACES, not underscores (earlier note was wrong).
//       The endpoint default is 'low top-down'; we omit it unless --view is set.
//   no_background (pixflux/tile+hud only) — transparent background. HUD overlays
//       want it true; floor tiles want it false (opaque). Caller decides.
//   template_id (character only) — 'mannequin' (humanoid, default) or a quadruped
//       preset: 'bear' | 'cat' | 'dog' | 'horse' | 'lion'. Pass --template.
//
// Palette/colour control stays unwired (deferred). When added, use the REAL
// per-endpoint field — it is not uniform: /animate-with-text exposes
// `forced_palette`, the character endpoint exposes `color_image` + `force_colors`.

// Build the POST body for a generation request.
// "description" is the confirmed PixelLab field name (not "prompt").
export function requestBody(type, { prompt, size, view, outline = 'lineless', noBackground, templateId }) {
  const image_size = { width: size, height: size };
  switch (type) {
    case 'tile':
    case 'hud': {
      const body = { description: prompt, image_size };
      if (outline) body.outline = outline;
      if (view) body.view = view;
      if (noBackground !== undefined) body.no_background = noBackground;
      return body;
    }
    case 'character': {
      const body = { description: prompt, image_size };
      if (outline) body.outline = outline;       // 'lineless' → no outline
      if (view) body.view = view;
      if (templateId) body.template_id = templateId; // e.g. 'horse'
      return body;
    }
    case 'effect':
      // /animate-with-text ANIMATES an existing sprite — it is NOT text-to-effect.
      // It requires `action` + `reference_image` (plus description/image_size).
      // Scratch (reference-less) effect generation is unsupported; gen-asset.mjs
      // rejects it upstream. This throw is defence-in-depth so we never emit the
      // old invalid body that 422s. Re-introduce as a two-step (generate a base
      // frame, then animate it) when object-VFX support is built.
      throw new Error('effect: /animate-with-text requires a reference_image + action; scratch effects unsupported');
    default:
      throw new Error(`unknown asset type: ${type}`);
  }
}

// ---------------------------------------------------------------------------
// Response accessors — isolate every field name the API owns.
// ---------------------------------------------------------------------------

// Background job ID field is "background_job_id" (confirmed).
// For sync responses that return images directly, jobIdOf is not applicable.
export const jobIdOf = (postJson) => postJson.background_job_id;

// ---------------------------------------------------------------------------
// Character flow (async-only). CONFIRMED against the live OpenAPI spec:
//   POST /create-character-with-4-directions -> { background_job_id, character_id }
//     (NO inline images — the earlier "sync character {images:{...}}" shape was
//      fiction; character generation is always async).
//   After the job completes: GET /characters/{character_id} -> CharacterDetail
//     with `rotation_urls` (PUBLIC URLs, NOT base64) keyed by direction, and
//     `animations` (array of AnimationGroup, each direction's `frames` is a list
//      of PUBLIC frame URLs). Sprite bytes are fetched by downloading those URLs.
// ---------------------------------------------------------------------------

// character_id from the create POST (available immediately, before the job ends).
export const characterIdOf = (post) => post.character_id;

// CharacterDetail.rotation_urls -> URLs in DIRECTIONS order (4-dir: south/north/east/west).
export function rotationUrlsOf(characterDetail) {
  const u = characterDetail.rotation_urls ?? {};
  return DIRECTIONS.map((dir) => u[dir]).filter(Boolean);
}

// POST /animate-character -> { background_job_ids:[...one per direction...], directions:[...] }.
export const animationJobIdsOf = (post) => post.background_job_ids ?? [];

// Build the /animate-character body. We use "v3" mode (custom text-to-animation
// from `action_description`) rather than "template" mode: template mode requires
// an exact `template_animation_id` from a FIXED catalog (angry/attack/crouched-
// walking/…) with no plain `walk`, so arbitrary names 422. v3 takes free text, so
// `animation: 'walk'` just works. The endpoint fans out one job per direction.
// frame_count must be even, 4–16 (v3 only).
export function animateRequestBody({ characterId, animation, frameCount }) {
  const fc = Math.max(4, Math.min(16, (frameCount ?? 4) & ~1)); // clamp + force even; 4 = fastest
  return {
    character_id: characterId,
    action_description: animation,   // free text, e.g. 'walk'
    animation_name: animation,       // so the result group is findable by name
    mode: 'v3',
    async_mode: true,
    enhance_prompt: true,            // expand 'walk' into a richer motion description
    frame_count: fc,
  };
}

// CharacterDetail.animations -> { fps?, frames: { <dir>: [frameUrl,...] } } for the
// named animation (falls back to the first group if the exact name is absent).
export function animationFramesOf(characterDetail, animationType) {
  const groups = characterDetail.animations ?? [];
  const g = groups.find((x) => x.animation_type === animationType) ?? groups[0];
  if (!g) return null;
  const frames = {};
  for (const dir of g.directions ?? []) frames[dir.direction] = dir.frames ?? [];
  return { name: g.animation_type, frames };
}

// `usage` block on any response: { type:'usd'|'generations', usd?, generations? }.
export const usageOf = (json) => json?.usage ?? null;

// Background job status: "processing" | "completed" | "failed" (confirmed).
export const jobDoneOf   = (getJson) => getJson.status === 'completed';
export const jobFailedOf = (getJson) => getJson.status === 'failed';

// Returns an array of base64 PNG strings (no data-URI prefix), one per frame/direction.
//
// Handles three confirmed response shapes:
//   1. Sync /create-image-pixflux:        { image: { base64 } }
//   2. Sync /create-character-with-4-directions: { images: { south, west, east, north } }
//      each value is { base64 } — flattened in DIRECTIONS order.
//   3. Sync /animate-with-text:           { images: [ { base64 }, ... ] }
//   4. Background job completion:         { last_response: <one of the above> }
export function jobImagesOf(json) {
  // Unwrap background-job envelope if present.
  const body = json.last_response ?? json;

  let imgs;
  if (body.images && !Array.isArray(body.images)) {
    // Shape 2: character endpoint — object keyed by direction.
    imgs = DIRECTIONS.map((d) => body.images[d]).filter(Boolean);
  } else if (Array.isArray(body.images)) {
    // Shape 3: animate-with-text array.
    imgs = body.images;
  } else if (body.image) {
    // Shape 1: pixflux singular image.
    imgs = [body.image];
  } else {
    imgs = [];
  }

  return imgs.map((i) => {
    const b64 = typeof i === 'string' ? i : (i.base64 ?? i.data ?? '');
    return b64.replace(/^data:image\/png;base64,/, '');
  });
}
