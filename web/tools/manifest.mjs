import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
// Resolved at CALL time, not import time: tests set OPENCRAFT_ASSETS_DIR to a
// temp dir to stay isolated from the committed manifest. The CLI run by the Dev
// agent leaves it unset and writes to the real web/assets.
export function assetsDir() {
  return process.env.OPENCRAFT_ASSETS_DIR || join(HERE, '..', 'assets');
}
export function manifestPath() {
  return join(assetsDir(), 'manifest.json');
}

// Per-type pixel-size rules, grounded in the live PixelLab v2 contract + our
// isometric renderer:
//   - tile/hud  -> /create-image-pixflux: API allows 32..400; we product-cap at 128.
//   - character -> /create-character-with-4-directions: API min 32; we product-cap
//                  at 64 per direction.
//   - effect    -> /animate-with-text: documents a FIXED 64x64 frame (min == max).
// `fixed` (when set) forces an exact dimension; otherwise [min,max] is a closed
// range. The 128/64 ceilings are PRODUCT caps (renderer-driven), not API limits.
export const SIZES = {
  tile:      { min: 32, max: 128 },
  hud:       { min: 32, max: 128 },
  character: { min: 32, max: 64 },
  effect:    { min: 64, max: 64, fixed: 64 },
};
// Back-compat: the old upper-cap map (callers/tests read CAPS.tile, etc.).
export const CAPS = Object.fromEntries(Object.entries(SIZES).map(([t, s]) => [t, s.max]));
export const MAX_EFFECT_FRAMES = 12;
const TYPES = new Set(Object.keys(SIZES));

// Renderer placement metadata, stored per asset so the client positions sprites
// deterministically on the iso grid. anchor = normalized canvas point pinned to
// the world ground point; footprint = tile cells the asset occupies; sortOffset
// nudges zIndex for tall objects (zIndex = wx+wy alone is insufficient when an
// object spans multiple cells or rises behind/over neighbors). Backward-compatible
// defaults: existing manifests without placement still load via these.
export function defaultPlacement(type) {
  switch (type) {
    case 'character': return { anchor: { x: 0.5, y: 0.8 }, footprint: { w: 1, h: 1 }, sortOffset: 0 };
    case 'tile':      return { anchor: { x: 0.5, y: 0.5 }, footprint: { w: 1, h: 1 }, sortOffset: 0 };
    case 'effect':    return { anchor: { x: 0.5, y: 0.5 }, footprint: { w: 1, h: 1 }, sortOffset: 0 };
    case 'hud':       return { anchor: { x: 0.5, y: 0.5 }, footprint: { w: 0, h: 0 }, sortOffset: 0 };
    default:          return { anchor: { x: 0.5, y: 1.0 }, footprint: { w: 1, h: 1 }, sortOffset: 0 };
  }
}

export function validateSlug(name) {
  if (!/^[a-z0-9-]+$/.test(name)) {
    throw new Error(`invalid asset slug "${name}": use lowercase letters, digits, hyphens`);
  }
}

export function assetKey(type, name) {
  if (!TYPES.has(type)) throw new Error(`unknown asset type: ${type}`);
  validateSlug(name);
  return `${type}:${name}`;
}

export function enforceCaps(type, size, frames = 1) {
  if (!TYPES.has(type)) throw new Error(`unknown asset type: ${type}`);
  const s = SIZES[type];
  if (s.fixed !== undefined && size !== s.fixed) {
    throw new Error(`size ${size} invalid for ${type}: must be exactly ${s.fixed}`);
  }
  if (size < s.min) throw new Error(`size ${size} below min ${s.min} for ${type}`);
  if (size > s.max) throw new Error(`size ${size} exceeds cap ${s.max} for ${type}`);
  if (type === 'effect' && frames > MAX_EFFECT_FRAMES) {
    throw new Error(`effect frames ${frames} exceed cap ${MAX_EFFECT_FRAMES}`);
  }
}

export function readManifest() {
  const p = manifestPath();
  if (!existsSync(p)) return { version: 1, assets: {} };
  return JSON.parse(readFileSync(p, 'utf8'));
}

export function upsertManifest(entry) {
  const { type, name } = entry;
  const key = assetKey(type, name);
  const m = readManifest();
  m.assets[key] = entry;
  // Stable, sorted output for clean diffs.
  const sorted = {};
  for (const k of Object.keys(m.assets).sort()) sorted[k] = m.assets[k];
  m.assets = sorted;
  writeFileSync(manifestPath(), JSON.stringify(m, null, 2) + '\n');
  return m;
}
