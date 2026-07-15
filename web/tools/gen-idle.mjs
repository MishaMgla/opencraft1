// gen-idle.mjs — generate idle-animation frames for an EXISTING character by
// img2img: each still is sent to nano-banana (Gemini image) as a reference and
// redrawn with slightly varied line work, same pose/silhouette. Frames land as
// <name>-<dir>-idle-<i>.png (frame 0 = the original still) and the manifest
// gains animations.idle.
//
// Usage: OPENROUTER_API_KEY=... node web/tools/gen-idle.mjs --name critter-imp [--frames 3] [--fps 6]
// ponytail: character-type ordinal facings only — extend when another type needs it.

import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const BASE_URL = 'https://openrouter.ai/api/v1';
const MODEL = process.env.NANOBANANA_MODEL || 'google/gemini-3.1-flash-image-preview';
const assetsDir = () => join(dirname(fileURLToPath(import.meta.url)), '..', 'assets');

function parseArgs(argv) {
  const a = { frames: 3, fps: 6 };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i], v = argv[++i];
    if (k === '--name') a.name = v;
    else if (k === '--frames') a.frames = Number(v);
    else if (k === '--fps') a.fps = Number(v);
    else throw new Error(`unknown flag: ${k}`);
  }
  if (!a.name) throw new Error('--name is required');
  return a;
}

// Composite the transparent still onto a green screen, so the model returns a
// keyable background; knock the green back out of the result and resize to the
// still's size. All pixel work is delegated to Pillow (same dep as nanobanana).
const PY = `
import sys, io
from PIL import Image
mode, size = sys.argv[1], int(sys.argv[2])
im = Image.open(io.BytesIO(sys.stdin.buffer.read())).convert('RGBA')
if mode == 'greenify':
    bg = Image.new('RGBA', im.size, (0, 255, 0, 255))
    bg.alpha_composite(im)
    out = bg
else:  # knockout: chroma-key green -> alpha, then resize
    px = im.load()
    w, h = im.size
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if g > 140 and r < 120 and b < 120 and g - r > 60 and g - b > 60:
                px[x, y] = (r, g, b, 0)
    out = im.resize((size, size), Image.LANCZOS) if im.size != (size, size) else im
buf = io.BytesIO(); out.save(buf, 'PNG'); sys.stdout.buffer.write(buf.getvalue())
`;

function pillow(mode, size, buf) {
  return execFileSync('python3', ['-c', PY, mode, String(size)], { input: buf, maxBuffer: 64 * 1024 * 1024 });
}

async function redraw(apiKey, refPng, frameNo, total) {
  const dataUri = `data:image/png;base64,${refPng.toString('base64')}`;
  const prompt = `Redraw this exact creature in the exact same pose and position, frame ${frameNo} of ${total} `
    + `of a subtle idle animation: keep the silhouette, colors and proportions identical, but redraw the line `
    + `work and small interior details slightly differently, like a hand-drawn boiling-line animation frame. `
    + `Keep the solid green background exactly as it is. No text.`;
  const body = {
    model: MODEL,
    modalities: ['image', 'text'],
    messages: [{ role: 'user', content: [
      { type: 'text', text: prompt },
      { type: 'image_url', image_url: { url: dataUri } },
    ] }],
  };
  for (let attempt = 1; attempt <= 3; attempt++) {
    const res = await fetch(`${BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify(body),
    });
    if (res.ok) {
      const json = await res.json();
      const url = json?.choices?.[0]?.message?.images?.[0]?.image_url?.url;
      if (url?.startsWith('data:image/')) {
        return { image: Buffer.from(url.slice(url.indexOf(',') + 1), 'base64'), usd: json?.usage?.cost ?? 0 };
      }
    }
    if (attempt < 3) await new Promise((r) => setTimeout(r, 1500 * attempt));
  }
  throw new Error(`img2img failed after 3 attempts (frame ${frameNo})`);
}

const a = parseArgs(process.argv.slice(2));
const apiKey = process.env.OPENROUTER_API_KEY;
if (!apiKey) throw new Error('OPENROUTER_API_KEY is not set');

const manifestPath = join(assetsDir(), 'manifest.json');
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
const entry = manifest.assets[`character:${a.name}`];
if (!entry) throw new Error(`character:${a.name} not found in manifest`);

let usd = 0;
const frames = {};
for (const [dir, rel] of Object.entries(entry.frames)) {
  const still = readFileSync(join(assetsDir(), rel));
  const size = entry.size ?? 128;
  const green = pillow('greenify', size, still);
  const rels = [rel]; // frame 0 = the original still
  for (let i = 1; i < a.frames; i++) {
    const r = await redraw(apiKey, green, i + 1, a.frames);
    usd += r.usd;
    const out = pillow('knockout', size, r.image);
    const outRel = `characters/${a.name}-${dir}-idle-${i}.png`;
    writeFileSync(join(assetsDir(), outRel), out);
    rels.push(outRel);
    console.log(`gen-idle: wrote ${outRel}`);
  }
  frames[dir] = rels;
}
entry.animations = { ...(entry.animations ?? {}), idle: { fps: a.fps, frames } };
writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
console.log(`gen-idle: manifest updated (idle, ${a.frames} frames/facing) — $${usd.toFixed(4)}`);
