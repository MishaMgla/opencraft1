// gen-landmark.mjs — one-frame transparent landmark sprites (buildings) in the
// DATASET-POISON slop house style, with full custom prompts (the object wrap's
// "no limbs" rule is wrong for buildings that are supposed to sprout arms).
// Green-screen -> chroma knockout -> native downscale; manifest entry type tile.
//
// Usage: OPENROUTER_API_KEY=... node web/tools/gen-landmark.mjs --name landmark-a --size 512 --prompt "..."

import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const BASE_URL = 'https://openrouter.ai/api/v1';
const MODEL = process.env.NANOBANANA_MODEL || 'google/gemini-3.1-flash-image-preview';
const assetsDir = () => join(dirname(fileURLToPath(import.meta.url)), '..', 'assets');

const a = { size: 512 };
const argv = process.argv.slice(2);
for (let i = 0; i < argv.length; i++) {
  const k = argv[i], v = argv[++i];
  if (k === '--name') a.name = v;
  else if (k === '--size') a.size = Number(v);
  else if (k === '--prompt') a.prompt = v;
  else throw new Error(`unknown flag: ${k}`);
}
if (!a.name || !a.prompt) throw new Error('--name and --prompt are required');

const STYLE = 'flat graphic poster art in DATASET-POISON AI-SLOP style: chaotic AI-generated dataset-bleed, '
  + 'bold flat shapes, slightly off-register color, subtle dataset-bleed grain, NOT photoreal, NOT clean, '
  + '3/4 isometric view, single centered building, full structure visible, ground line at the bottom, '
  + 'no caption, no border, on a solid flat #00FF00 chroma-key green background';

const PY = `
import sys, io
from PIL import Image
size = int(sys.argv[1])
im = Image.open(io.BytesIO(sys.stdin.buffer.read())).convert('RGBA')
px = im.load()
w, h = im.size
for y in range(h):
    for x in range(w):
        r, g, b, alpha = px[x, y]
        if g > 140 and r < 120 and b < 120 and g - r > 60 and g - b > 60:
            px[x, y] = (r, g, b, 0)
if im.size != (size, size):
    im = im.resize((size, size), Image.LANCZOS)
buf = io.BytesIO(); im.save(buf, 'PNG'); sys.stdout.buffer.write(buf.getvalue())
`;

const apiKey = process.env.OPENROUTER_API_KEY;
if (!apiKey) throw new Error('OPENROUTER_API_KEY is not set');

let image, usd = 0;
for (let attempt = 1; attempt <= 3; attempt++) {
  const res = await fetch(`${BASE_URL}/images`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ model: MODEL, prompt: `${a.prompt}, ${STYLE}`, n: 1, aspect_ratio: '1:1', output_format: 'png' }),
  });
  if (res.ok) {
    const json = await res.json();
    const b64 = json?.data?.[0]?.b64_json;
    if (b64) { image = Buffer.from(b64, 'base64'); usd = json?.usage?.cost ?? 0; break; }
  }
  if (attempt < 3) await new Promise((r) => setTimeout(r, 1500 * attempt));
}
if (!image) throw new Error('generation failed after 3 attempts');

const out = execFileSync('python3', ['-c', PY, String(a.size)], { input: image, maxBuffer: 64 * 1024 * 1024 });
const rel = `tiles/${a.name}.png`;
writeFileSync(join(assetsDir(), rel), out);

const manifestPath = join(assetsDir(), 'manifest.json');
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
manifest.assets[`tile:${a.name}`] = { type: 'tile', name: a.name, file: rel, size: a.size, prompt: a.prompt, placement: 'landmark' };
writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
console.log(`gen-landmark: wrote ${rel} — $${usd.toFixed(4)}`);
