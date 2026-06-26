// web/src/assets.ts
// Pixi is imported TWO ways on purpose:
//  - `import type` is fully erased by tsc, so the emitted assets.js has NO
//    static CDN import and Node can load it for the pure-resolver unit tests
//    (Node 20 cannot resolve `https:` import specifiers).
//  - the runtime Pixi value is pulled via a DYNAMIC import() inside loadTexture,
//    which only executes in the browser, never during `node --test`.
import type { Texture } from 'pixi.js';

const PIXI_CDN = 'https://cdn.jsdelivr.net/npm/pixi.js@8.19.0/dist/pixi.min.mjs';

export interface Placement {
  anchor: { x: number; y: number };       // normalized canvas point pinned to the ground point
  footprint: { w: number; h: number };    // tile cells the asset occupies
  sortOffset: number;                      // zIndex nudge for tall/multi-cell objects
}
export interface AssetEntry {
  type: 'tile' | 'character' | 'hud' | 'effect';
  name: string;
  file?: string;
  frames?: string[] | Record<string, string>;
  directions?: number;
  fps?: number;
  size?: number;
  placement?: Placement;
}
export interface Manifest { version: number; assets: Record<string, AssetEntry>; }

// Backward-compatible defaults for manifests written before placement existed.
const DEFAULT_ANCHOR: Record<AssetEntry['type'], { x: number; y: number }> = {
  character: { x: 0.5, y: 0.8 },
  tile: { x: 0.5, y: 0.5 },
  effect: { x: 0.5, y: 0.5 },
  hud: { x: 0.5, y: 0.5 },
};
export function anchorOf(e: AssetEntry): { x: number; y: number } {
  return e.placement?.anchor ?? DEFAULT_ANCHOR[e.type];
}

const EMPTY: Manifest = { version: 1, assets: {} };

export function resolveTile(m: Manifest, name: string): { file: string } | null {
  const e = m.assets[`tile:${name}`];
  return e?.file ? { file: e.file } : null;
}
export function resolveCharacter(m: Manifest, name: string):
    { directions: number; frames: Record<string, string>; anchor: { x: number; y: number } } | null {
  const e = m.assets[`character:${name}`];
  if (!e || Array.isArray(e.frames) || !e.frames) return null;
  return { directions: e.directions ?? 4, frames: e.frames, anchor: anchorOf(e) };
}
export function resolveEffect(m: Manifest, name: string): { fps: number; frames: string[] } | null {
  const e = m.assets[`effect:${name}`];
  return Array.isArray(e?.frames) ? { fps: e!.fps ?? 12, frames: e!.frames } : null;
}
export function resolveHud(m: Manifest, name: string): { file: string } | null {
  const e = m.assets[`hud:${name}`];
  return e?.file ? { file: e.file } : null;
}

export function assetUrl(file: string): string { return `assets/${file}`; }

export async function loadManifest(): Promise<Manifest> {
  try {
    const res = await fetch('assets/manifest.json');
    if (!res.ok) return EMPTY;
    return await res.json();
  } catch { return EMPTY; }
}

export async function loadTexture(file: string): Promise<Texture | null> {
  try {
    const { Assets } = await import(PIXI_CDN);
    return await Assets.load(assetUrl(file));
  } catch { return null; }
}
