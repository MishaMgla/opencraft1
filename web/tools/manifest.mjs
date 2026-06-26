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

export const CAPS = { tile: 128, hud: 128, character: 64, effect: 64 };
export const MAX_EFFECT_FRAMES = 12;
const TYPES = new Set(Object.keys(CAPS));

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
  if (size > CAPS[type]) throw new Error(`size ${size} exceeds cap ${CAPS[type]} for ${type}`);
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
