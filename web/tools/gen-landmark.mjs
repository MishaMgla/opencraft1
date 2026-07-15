// gen-landmark.mjs — transparent landmark building sprites matched to the
// game's isometric camera. A GUIDE image (exact 2:1 base diamond of the
// footprint + a player sprite for scale, on chroma green) is composed locally
// and sent as an img2img reference, so the model draws the building in the
// SAME projection and at door-fits-the-player scale, instead of inventing its
// own axonometry. Output is chroma-knocked and cropped to the alpha bbox (the
// renderer derives the on-screen height from the crop's aspect ratio).
//
// Usage: OPENROUTER_API_KEY=... node web/tools/gen-landmark.mjs \
//          --name landmark-x --tiles-w 2 --tiles-h 2 --prompt "..."

import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const BASE_URL = 'https://openrouter.ai/api/v1';
const MODEL = process.env.NANOBANANA_MODEL || 'google/gemini-3.1-flash-image-preview';
const assetsDir = () => join(dirname(fileURLToPath(import.meta.url)), '..', 'assets');

const a = { tilesW: 2, tilesH: 2, scaleRef: 'characters/horse-poison-south-east.png' };
const argv = process.argv.slice(2);
for (let i = 0; i < argv.length; i++) {
  const k = argv[i], v = argv[++i];
  if (k === '--name') a.name = v;
  else if (k === '--prompt') a.prompt = v;
  else if (k === '--tiles-w') a.tilesW = Number(v);
  else if (k === '--tiles-h') a.tilesH = Number(v);
  else if (k === '--scale-ref') a.scaleRef = v;
  else throw new Error(`unknown flag: ${k}`);
}
if (!a.name || !a.prompt) throw new Error('--name and --prompt are required');

// Compose the guide: green 1024x1024, a 2:1 iso diamond spanning tilesW x
// tilesH tiles near the bottom, and the player sprite standing at the
// diamond's left corner sized like in-game (~0.75 of one tile's screen width).
const PY_GUIDE = `
import sys, io, json
from PIL import Image, ImageDraw
args = json.loads(sys.argv[1])
W = 1024
im = Image.new('RGBA', (W, W), (0, 255, 0, 255))
d = ImageDraw.Draw(im)
dw = 640                       # diamond width for the full footprint
dh = dw // 2                   # strict 2:1 isometric diamond
cx, cy = W // 2, W - 150       # diamond center near the bottom
d.polygon([(cx, cy - dh//2), (cx + dw//2, cy), (cx, cy + dh//2), (cx - dw//2, cy)],
          outline=(20, 20, 20, 255), fill=(160, 160, 160, 255), width=6)
# inner tile grid so wall edges have lines to align to: lines parallel to the
# two diamond edge directions
tw = args['tilesW']; th = args['tilesH']
for i in range(1, tw):
    f = i / tw
    x1, y1 = cx - dw//2 + f*(dw//2), cy - f*(dh//2)
    x2, y2 = cx + f*(dw//2) - 0, cy + dh//2 - f*(dh//2)
    d.line([(x1, y1), (x2, y2)], fill=(20, 20, 20, 200), width=3)
for i in range(1, th):
    f = i / th
    x1, y1 = cx + dw//2 - f*(dw//2), cy - f*(dh//2)
    x2, y2 = cx - f*(dw//2), cy + dh//2 - f*(dh//2)
    d.line([(x1, y1), (x2, y2)], fill=(20, 20, 20, 200), width=3)
# player sprite for scale: height ~= 0.75 * one tile's screen width
ref = Image.open(args['refPath']).convert('RGBA')
tile_w = dw / tw
ch = int(0.75 * tile_w)
ref = ref.resize((int(ref.width * ch / ref.height), ch), Image.LANCZOS)
im.alpha_composite(ref, (cx - dw//2 - ref.width - 30, cy - ch + dh//4))
buf = io.BytesIO(); im.save(buf, 'PNG'); sys.stdout.buffer.write(buf.getvalue())
`;

// knockout green -> alpha, crop to the alpha bbox (no square padding: the
// renderer takes the aspect from the crop)
const PY_POST = `
import sys, io
from PIL import Image
im = Image.open(io.BytesIO(sys.stdin.buffer.read())).convert('RGBA')
px = im.load()
w, h = im.size
for y in range(h):
    for x in range(w):
        r, g, b, alpha = px[x, y]
        if g > 140 and r < 120 and b < 120 and g - r > 60 and g - b > 60:
            px[x, y] = (r, g, b, 0)
bbox = im.getbbox()
if bbox: im = im.crop(bbox)
buf = io.BytesIO(); im.save(buf, 'PNG'); sys.stdout.buffer.write(buf.getvalue())
`;

const apiKey = process.env.OPENROUTER_API_KEY;
if (!apiKey) throw new Error('OPENROUTER_API_KEY is not set');

const guide = execFileSync('python3', ['-c', PY_GUIDE,
  JSON.stringify({ tilesW: a.tilesW, tilesH: a.tilesH, refPath: join(assetsDir(), a.scaleRef) })],
  { maxBuffer: 64 * 1024 * 1024 });
writeFileSync('/tmp/landmark-guide.png', guide); // debugging aid

const prompt = `${a.prompt}. Draw this building standing EXACTLY on the gray diamond base in the reference image: `
  + `the building's walls must be parallel to the diamond's edges (strict 2:1 isometric projection, camera high, `
  + `no other vanishing points), the base of the building fills the whole diamond, and the entrance door must be `
  + `just slightly taller than the reference character standing to the left — that character sets the scale of `
  + `doors, windows and floors. Flat graphic poster art in DATASET-POISON AI-SLOP style: bold flat shapes, `
  + `slightly off-register color, subtle dataset-bleed grain, NOT photoreal, NOT clean. Do NOT draw the reference `
  + `character in the output, do NOT draw the gray diamond or grid lines — only the building. No text, no caption, `
  + `keep the solid flat #00FF00 chroma-key green background everywhere outside the building.`;

const dataUri = `data:image/png;base64,${guide.toString('base64')}`;
let image, usd = 0;
for (let attempt = 1; attempt <= 3; attempt++) {
  const res = await fetch(`${BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: MODEL,
      modalities: ['image', 'text'],
      messages: [{ role: 'user', content: [
        { type: 'text', text: prompt },
        { type: 'image_url', image_url: { url: dataUri } },
      ] }],
    }),
  });
  if (res.ok) {
    const json = await res.json();
    const url = json?.choices?.[0]?.message?.images?.[0]?.image_url?.url;
    if (url?.startsWith('data:image/')) {
      image = Buffer.from(url.slice(url.indexOf(',') + 1), 'base64');
      usd = json?.usage?.cost ?? 0;
      break;
    }
  }
  if (attempt < 3) await new Promise((r) => setTimeout(r, 1500 * attempt));
}
if (!image) throw new Error('guided generation failed after 3 attempts');

const out = execFileSync('python3', ['-c', PY_POST], { input: image, maxBuffer: 64 * 1024 * 1024 });
const rel = `tiles/${a.name}.png`;
writeFileSync(join(assetsDir(), rel), out);

const manifestPath = join(assetsDir(), 'manifest.json');
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
manifest.assets[`tile:${a.name}`] = { type: 'tile', name: a.name, file: rel, size: null, prompt: a.prompt, placement: 'landmark' };
writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
console.log(`gen-landmark: wrote ${rel} — $${usd.toFixed(4)}`);
