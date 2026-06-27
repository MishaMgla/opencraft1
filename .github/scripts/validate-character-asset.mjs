// Validate a freshly generated character asset BEFORE the workflow commits it.
// Dependency-free: checks the manifest entry shape + that every frame PNG exists,
// carries the PNG magic header, has sane IHDR dimensions, and is non-trivial in
// size. Exits non-zero on any problem so the regen workflow never commits a
// broken/partial asset. Usage: node validate-character-asset.mjs <name> <facings>
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { assetsDir, readManifest } from '../../web/tools/manifest.mjs';
import { ORDINAL_DIRECTIONS, DIRECTIONS } from '../../web/tools/contract.mjs';

const name = process.argv[2];
const facings = process.argv[3] ?? 'cardinal';
if (!name) { console.error('usage: validate-character-asset.mjs <name> <cardinal|ordinal>'); process.exit(2); }

const expectDirs = facings === 'ordinal' ? ORDINAL_DIRECTIONS : DIRECTIONS;
const fail = (msg) => { console.error(`validate: ${msg}`); process.exitCode = 1; };

const key = `character:${name}`;
const entry = readManifest().assets[key];
if (!entry) { console.error(`validate: manifest missing ${key}`); process.exit(1); }

if (entry.type !== 'character') fail(`${key} type is '${entry.type}', expected 'character'`);
if (facings === 'ordinal' && entry.facings !== 'ordinal') fail(`${key} is not marked facings:ordinal`);

const frames = entry.frames ?? {};
const haveKeys = Object.keys(frames).sort();
const wantKeys = [...expectDirs].sort();
if (JSON.stringify(haveKeys) !== JSON.stringify(wantKeys)) {
  fail(`${key} frames keys ${JSON.stringify(haveKeys)} != expected ${JSON.stringify(wantKeys)}`);
}

const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
for (const dir of expectDirs) {
  const rel = frames[dir];
  if (!rel) { fail(`missing frame for '${dir}'`); continue; }
  const abs = join(assetsDir(), rel);
  if (!existsSync(abs)) { fail(`frame file not found: ${rel}`); continue; }
  const buf = readFileSync(abs);
  if (buf.length < 256) { fail(`frame ${rel} suspiciously small (${buf.length} bytes)`); continue; }
  if (!buf.subarray(0, 8).equals(PNG_MAGIC)) { fail(`frame ${rel} is not a PNG`); continue; }
  // IHDR width/height are big-endian uint32 at offsets 16 and 20.
  const w = buf.readUInt32BE(16), h = buf.readUInt32BE(20);
  if (w < 16 || h < 16 || w > 512 || h > 512) fail(`frame ${rel} has implausible dimensions ${w}x${h}`);
  console.log(`validate: ok ${dir} -> ${rel} (${w}x${h}, ${buf.length} bytes)`);
}

if (process.exitCode) { console.error('validate: FAILED'); }
else console.log(`validate: OK — ${key} has ${expectDirs.length} valid ${facings} facings.`);
