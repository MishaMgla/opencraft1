// web/tools/gen-asset.mjs
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { deflateSync, inflateSync } from 'node:zlib';
import { generate, getBalance } from './pixellab.mjs';
import { DIRECTIONS } from './contract.mjs';
import {
  assetsDir, assetKey, validateSlug, enforceCaps, readManifest, upsertManifest, defaultPlacement,
} from './manifest.mjs';

const TYPE_DIR = { tile: 'tiles', character: 'characters', hud: 'hud', effect: 'effects' };
const PNG_SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const ORDINALS = ['north-east', 'south-east', 'south-west', 'north-west'];

function parseArgs(argv) {
  const a = { size: undefined, directions: 4, frames: 4, fps: 12, facings: 'cardinal', force: false };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    if (k === '--force') { a.force = true; continue; }
    const v = argv[++i];
    if (k === '--type') a.type = v;
    else if (k === '--name') a.name = v;
    else if (k === '--prompt') a.prompt = v;
    else if (k === '--size') a.size = Number(v);
    else if (k === '--directions') a.directions = Number(v);
    else if (k === '--frames') a.frames = Number(v);
    else if (k === '--view') a.view = v;
    else if (k === '--outline') a.outline = v;            // e.g. lineless (default), single color black outline
    else if (k === '--template') a.template = v;          // character only: horse, cat, dog, mannequin, ...
    else if (k === '--facings') a.facings = v;            // character only: 'cardinal' (default) | 'ordinal' (iso diagonals)
    else if (k === '--no-background') a.noBackground = v === 'true'; // pixflux only: transparent bg
    else if (k === '--animate') a.animate = v;            // character only: walk-cycle template (e.g. walk)
    else if (k === '--fps') a.fps = Number(v);            // animation playback rate stamped into the manifest
    else throw new Error(`unknown flag: ${k}`);
  }
  if (a.animate && a.type !== 'character') throw new Error('--animate is character-only');
  if (a.facings !== 'cardinal' && a.facings !== 'ordinal') throw new Error(`--facings must be 'cardinal' or 'ordinal' (got ${a.facings})`);
  if (a.facings === 'ordinal' && a.type !== 'character') throw new Error('--facings is character-only');
  if (!a.type || !a.name || !a.prompt) throw new Error('required: --type --name --prompt');
  if (a.size === undefined) a.size = (a.type === 'tile' || a.type === 'hud') ? 128 : 64;
  // Background defaults by type: HUD overlays are transparent, floor tiles opaque.
  // Characters get native transparency from the endpoint (no field needed).
  if (a.noBackground === undefined && (a.type === 'tile' || a.type === 'hud')) {
    a.noBackground = a.type === 'hud';
  }
  return a;
}

const crcTable = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data = Buffer.alloc(0)) {
  const t = Buffer.from(type);
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  t.copy(out, 4);
  data.copy(out, 8);
  out.writeUInt32BE(crc32(Buffer.concat([t, data])), 8 + data.length);
  return out;
}

function decodePngRgba(buf) {
  if (!buf.subarray(0, 8).equals(PNG_SIG)) throw new Error('not a PNG file');
  let width = 0, height = 0, bitDepth = 0, colorType = 0;
  const idat = [];
  for (let off = 8; off < buf.length;) {
    const len = buf.readUInt32BE(off);
    const type = buf.toString('ascii', off + 4, off + 8);
    const data = buf.subarray(off + 8, off + 8 + len);
    off += 12 + len;
    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8];
      colorType = data[9];
    } else if (type === 'IDAT') {
      idat.push(data);
    } else if (type === 'IEND') {
      break;
    }
  }
  if (bitDepth !== 8 || colorType !== 6) throw new Error(`unsupported PNG format: bitDepth=${bitDepth} colorType=${colorType}`);
  const bpp = 4, stride = width * bpp;
  const raw = inflateSync(Buffer.concat(idat));
  const pixels = Buffer.alloc(width * height * bpp);
  let src = 0;
  for (let y = 0; y < height; y++) {
    const filter = raw[src++];
    const row = pixels.subarray(y * stride, (y + 1) * stride);
    const prev = y ? pixels.subarray((y - 1) * stride, y * stride) : null;
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? row[x - bpp] : 0;
      const b = prev ? prev[x] : 0;
      const c = prev && x >= bpp ? prev[x - bpp] : 0;
      const p = a + b - c;
      const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
      const pr = pa <= pb && pa <= pc ? a : (pb <= pc ? b : c);
      const v = raw[src++];
      row[x] = filter === 0 ? v
        : filter === 1 ? (v + a) & 0xff
          : filter === 2 ? (v + b) & 0xff
            : filter === 3 ? (v + Math.floor((a + b) / 2)) & 0xff
              : filter === 4 ? (v + pr) & 0xff
                : v;
    }
  }
  return { width, height, pixels };
}

function encodePngRgba({ width, height, pixels }) {
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  let dst = 0;
  for (let y = 0; y < height; y++) {
    raw[dst++] = 0;
    Buffer.from(pixels.subarray(y * stride, (y + 1) * stride)).copy(raw, dst);
    dst += stride;
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 6;  // RGBA
  return Buffer.concat([PNG_SIG, pngChunk('IHDR', ihdr), pngChunk('IDAT', deflateSync(raw)), pngChunk('IEND')]);
}

function alphaBounds(pixels, width, height) {
  let minX = width, minY = height, maxX = -1, maxY = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (pixels[(y * width + x) * 4 + 3] <= 24) continue;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  return maxX < minX ? null : { minX, minY, maxX, maxY };
}

function synthWalkFrame(decoded, facing, phase) {
  const { width, height, pixels } = decoded;
  const out = Buffer.from(pixels);
  const bounds = alphaBounds(pixels, width, height);
  if (!bounds) return out;
  const lowerY = bounds.minY + Math.floor((bounds.maxY - bounds.minY + 1) * 0.56);
  const pad = 3;
  for (let y = lowerY; y <= Math.min(height - 1, bounds.maxY + pad); y++) {
    for (let x = Math.max(0, bounds.minX - pad); x <= Math.min(width - 1, bounds.maxX + pad); x++) {
      out[(y * width + x) * 4 + 3] = 0;
    }
  }
  const eastSign = facing.includes('east') ? 1 : -1;
  const span = Math.max(1, bounds.maxX - bounds.minX + 1);
  for (let y = lowerY; y <= bounds.maxY; y++) {
    const lowerT = (y - lowerY) / Math.max(1, bounds.maxY - lowerY);
    for (let x = bounds.minX; x <= bounds.maxX; x++) {
      const src = (y * width + x) * 4;
      if (pixels[src + 3] <= 24) continue;
      const pair = Math.floor(((x - bounds.minX) / span) * 4) % 2 === 0 ? 1 : -1;
      const stride = phase * pair;
      const nx = Math.max(0, Math.min(width - 1, x + eastSign * stride));
      const ny = Math.max(0, Math.min(height - 1, y + (lowerT > 0.7 ? -stride : 0)));
      const dst = (ny * width + nx) * 4;
      out[dst] = pixels[src];
      out[dst + 1] = pixels[src + 1];
      out[dst + 2] = pixels[src + 2];
      out[dst + 3] = pixels[src + 3];
    }
  }
  return out;
}

function synthesizeExistingOrdinalWalk(a, existing) {
  if (a.type !== 'character' || a.facings !== 'ordinal' || a.animate !== 'walk') return null;
  if (!existing?.frames || Array.isArray(existing.frames)) return null;
  if (!ORDINALS.every((d) => existing.frames[d])) return null;
  const animFrames = {};
  const files = [];
  for (const d of ORDINALS) {
    const sourceRel = existing.frames[d];
    const source = readFileSync(join(assetsDir(), sourceRel));
    const decoded = decodePngRgba(source);
    const sequence = [
      source,
      encodePngRgba({ ...decoded, pixels: synthWalkFrame(decoded, d, 1) }),
      source,
      encodePngRgba({ ...decoded, pixels: synthWalkFrame(decoded, d, -1) }),
    ];
    animFrames[d] = sequence.map((buf, i) => {
      const rel = `${TYPE_DIR.character}/${a.name}-${d}-${a.animate}-${i}.png`;
      writeFileSync(join(assetsDir(), rel), buf);
      files.push(rel);
      return rel;
    });
  }
  const entry = {
    ...existing,
    animations: { ...(existing.animations ?? {}), [a.animate]: { fps: a.fps, frames: animFrames } },
  };
  upsertManifest(entry);
  return files;
}

export async function run(argv, { generateImpl = generate, env = process.env } = {}) {
  const a = parseArgs(argv);
  validateSlug(a.name);
  if (a.type === 'effect') {
    // /animate-with-text animates an EXISTING sprite (requires a base
    // reference_image + action); it cannot synthesize an effect from text
    // alone. Reject scratch effect generation until the two-step pipeline
    // (generate a base frame -> animate it) is built. The effect category
    // stays in the manifest/render schema for that future path.
    throw new Error('effect generation is not supported via scratch asset generation: '
      + '/animate-with-text needs a base reference sprite + action. Generate the base '
      + 'sprite first, then animate (two-step pipeline not yet built).');
  }
  if (a.type === 'character' && a.directions !== 4) throw new Error('v1 supports 4-direction characters only (got ' + a.directions + ')');
  enforceCaps(a.type, a.size, a.frames);
  const key = assetKey(a.type, a.name);

  // Skip if it already exists — UNLESS a walk-style animation was requested that
  // the existing entry doesn't have yet (then regenerate to add it). Lets a
  // re-run upgrade a static character to an animated one without --force.
  const existing = readManifest().assets[key];
  const animMissing = a.animate && !existing?.animations?.[a.animate];
  if (!a.force && existing && !animMissing) {
    console.log(`gen-asset: ${key} already exists — skipping (use --force to regenerate).`);
    return { skipped: true, key, files: [] };
  }
  const synthesized = !a.force && animMissing ? synthesizeExistingOrdinalWalk(a, existing) : null;
  if (synthesized) {
    console.log(`gen-asset: wrote ${key} (${synthesized.length} synthesized walk frame file(s)).`);
    return { skipped: false, key, files: synthesized };
  }
  if (animMissing && existing) {
    console.log(`gen-asset: ${key} exists but lacks '${a.animate}' animation — regenerating with it.`);
  }

  const { images, dirs: genDirs, animation, usage } = await generateImpl(
    {
      type: a.type, prompt: a.prompt, size: a.size, frames: a.frames, directions: a.directions,
      view: a.view, outline: a.outline, noBackground: a.noBackground, templateId: a.template,
      ordinal: a.facings === 'ordinal',
      animation: a.animate, frameCount: a.frameCount,
    },
    { apiKey: env.PIXELLAB_API_KEY },
  );

  const dir = TYPE_DIR[a.type];
  const placement = defaultPlacement(a.type);
  const files = [];
  let entry;

  if (a.type === 'character') {
    // Direction labels come from the generator: cardinal (south/north/east/west)
    // or the four ISO ordinals (north-east/south-east/south-west/north-west).
    const dirsOut = genDirs ?? DIRECTIONS.slice(0, a.directions);
    const frames = {};
    dirsOut.forEach((d, i) => {
      const rel = `${dir}/${a.name}-${d}.png`;
      writeFileSync(join(assetsDir(), rel), images[i]);
      frames[d] = rel; files.push(rel);
    });
    entry = { type: 'character', name: a.name, directions: dirsOut.length, size: a.size, frames, prompt: a.prompt, placement };
    if (a.facings === 'ordinal') entry.facings = 'ordinal';
    // Optional walk-style animation: per-direction frame sequences the renderer
    // loops while the character is moving. Non-fatal — a failed animation still
    // ships the static character (renderer falls back to the idle still).
    if (animation && animation.failed) {
      console.warn(`gen-asset: WARNING — '${a.animate}' animation skipped for ${key}: ${animation.error}. `
        + 'Static character written; re-run to retry the walk cycle.');
    }
    if (animation && animation.frames) {
      const animFrames = {};
      for (const d of dirsOut) {
        animFrames[d] = (animation.frames[d] ?? []).map((buf, i) => {
          const rel = `${dir}/${a.name}-${d}-${animation.name}-${i}.png`;
          writeFileSync(join(assetsDir(), rel), buf);
          files.push(rel);
          return rel;
        });
      }
      entry.animations = { [animation.name]: { fps: a.fps, frames: animFrames } };
    }
  } else {
    const rel = `${dir}/${a.name}.png`;
    writeFileSync(join(assetsDir(), rel), images[0]);
    files.push(rel);
    entry = { type: a.type, name: a.name, file: rel, size: a.size, prompt: a.prompt, placement };
  }

  upsertManifest(entry);
  // Roll up what PixelLab charged (usd credits and/or subscription generations).
  if (Array.isArray(usage) && usage.length) {
    const usd = usage.reduce((s, u) => s + (u?.usd ?? 0), 0);
    const gens = usage.reduce((s, u) => s + (u?.generations ?? 0), 0);
    const parts = [usd ? `$${usd.toFixed(4)}` : null, gens ? `${gens} generation(s)` : null].filter(Boolean);
    if (parts.length) console.log(`gen-asset: usage — ${parts.join(', ')}.`);
  }
  console.log(`gen-asset: wrote ${key} (${files.length} file(s)).`);
  return { skipped: false, key, files };
}

// Cheap account check before spending: an empty balance otherwise surfaces only
// as an opaque generation failure. Best-effort — never blocks the run.
async function preflightBalance(env) {
  try {
    const b = await getBalance({ apiKey: env.PIXELLAB_API_KEY });
    const usd = b?.credits?.usd;
    const gens = b?.subscription?.generations;
    console.log(`gen-asset: balance — ${usd != null ? `$${usd}` : '?'} credits`
      + `${gens != null ? `, ${gens} subscription generation(s)` : ''}.`);
  } catch (e) {
    console.error(`gen-asset: balance check skipped (${e.message}).`);
  }
}

// CLI entry.
if (import.meta.url === `file://${process.argv[1]}`) {
  preflightBalance(process.env)
    .then(() => run(process.argv.slice(2), {}))
    .catch((e) => { console.error(`gen-asset: ${e.message}`); process.exit(1); });
}
