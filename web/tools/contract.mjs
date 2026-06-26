// web/tools/contract.mjs
// The ONLY place that encodes the live PixelLab v2 API shape. If the API
// changes, edit here. Field names below were confirmed against
// https://api.pixellab.ai/v2/openapi.json on 2026-06-26 (see Task 1, Step 1).
//
// CONFIRMED against live OpenAPI spec (2026-06-26):
//   - Endpoint paths: /create-image-pixflux, /create-character-with-4-directions,
//     /animate-with-text, /background-jobs/{job_id}
//   - Request field: "description" (not "prompt")
//   - Request field: "image_size" with nested "width"/"height"
//   - Request field: "n_frames" for animate-with-text
//   - Background job ID field: "background_job_id"
//   - Background job status values: "processing" | "completed" | "failed"
//   - Background job result location: "last_response" nested object
//   - /create-image-pixflux sync response: { image: { type, base64 } } (singular)
//   - /create-character-with-4-directions sync response:
//       { images: { south, west, east, north } } (object keyed by direction)
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

// Cardinal facings returned by the 4-direction character endpoint.
// The API returns an object keyed by these names; renderer expects this order.
export const DIRECTIONS = ['south', 'north', 'east', 'west'];

// Build the POST body for a generation request.
// "description" is the confirmed PixelLab field name (not "prompt").
export function requestBody(type, { prompt, size, frames }) {
  switch (type) {
    case 'tile':
    case 'hud':
      return { description: prompt, image_size: { width: size, height: size } };
    case 'character':
      return { description: prompt, image_size: { width: size, height: size } };
    case 'effect':
      return { description: prompt, n_frames: frames, image_size: { width: size, height: size } };
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
