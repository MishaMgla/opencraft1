// nano-banana (Google Gemini 3.1 Flash Image, "Nano Banana 2") asset generator
// via the OpenRouter Image API. Implements the generate()/getBalance() contract
// gen-asset.mjs expects (it is generator-agnostic via `generateImpl`): still
// images only — gen-asset synthesizes walk frames locally from the ordinal stills.

import { deflateSync, inflateSync } from 'node:zlib';
import { execFileSync } from 'node:child_process';

const BASE_URL = 'https://openrouter.ai/api/v1';
const DEFAULT_MODEL = 'google/gemini-3.1-flash-image-preview';

const CARDINAL = ['south', 'north', 'east', 'west'];
const ORDINAL = ['north-east', 'south-east', 'south-west', 'north-west'];

// which way a facing points, phrased for the isometric 3/4 view.
const FACING_PHRASE = {
  'north-east': 'facing up-and-right (away)',
  'south-east': 'facing down-and-right (toward viewer)',
  'south-west': 'facing down-and-left (toward viewer)',
  'north-west': 'facing up-and-left (away)',
  south: 'facing toward the viewer (front)',
  north: 'facing away (back)',
  east: 'facing right',
  west: 'facing left',
};

// wrap a plain subject in the shipped dataset-poison AI-slop house style. bold
// slop for character/hud (foreground), quiet poison-accent seamless for tile.
function housePrompt(type, subject, facing) {
  if (type === 'tile') {
    return `${subject}, seamless repeating isometric ground tile texture, flat and low-contrast, `
      + 'soft muted poison-accent palette (sickly greens and purples), subtle AI-slop dataset-bleed grain, '
      + 'no characters, no bold outlines, edge-to-edge seamless with no visible seams, fills the entire frame';
  }
  if (type === 'object') {
    // Transparent foreground prop/overlay (bomb, flame) in the quiet poison
    // house style. Unlike the character/hud wrap, NO limb/face hallucination —
    // a flame must stay a flame — but same green-screen for the alpha knockout.
    return `${subject}, single centered object, `
      + 'flat graphic poster art in quiet DATASET-POISON AI-SLOP style, '
      + 'soft muted poison-accent palette (sickly greens and purples), subtle AI-slop dataset-bleed grain, '
      + 'slightly off-register color, bold simple readable silhouette, NOT photoreal, NOT clean, '
      + 'no characters, no limbs, no hands, no text, on a solid flat #00FF00 chroma-key green background';
  }
  const facingPhrase = facing ? FACING_PHRASE[facing] ?? '' : '';
  return `${subject}, single subject, 3/4 isometric ${facingPhrase} view, `
    + 'flat graphic poster art in DATASET-POISON AI-SLOP style: random wrong objects fused into the body '
    + '(car parts, branches, product fragments, ghost label text) and TOO MANY hallucinated limbs sprouting '
    + 'at wrong angles, duplicated fingers, melty doubled joints, chaotic AI-generated dataset-bleed, '
    + 'bold flat shapes, slightly off-register color, NOT photoreal, NOT clean; centered full body, '
    + 'feet on one baseline, no caption, no border, on a solid flat #00FF00 chroma-key green background';
}

// --- PNG codec + chroma-key ---------------------------------------------------
// nano-banana ignores background:transparent and returns an OPAQUE RGB PNG, so
// character/hud art is generated on a flat #00FF00 green screen and knocked out
// to alpha here. self-contained codec (gen-asset's is not exported and importing
// it would be circular); supports colorType 2 (RGB) and 6 (RGBA) input.
const PNG_SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

const crcTable = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    t[n] = c >>> 0;
  }
  return t;
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

// decode a PNG (colorType 2 or 6, bitDepth 8) to flat RGBA pixels.
function decodeRgba(buf) {
  if (!buf.subarray(0, 8).equals(PNG_SIG)) throw new Error('not a PNG file');
  let width = 0, height = 0, bitDepth = 0, colorType = 0;
  const idat = [];
  for (let off = 8; off < buf.length;) {
    const len = buf.readUInt32BE(off);
    const type = buf.toString('ascii', off + 4, off + 8);
    const data = buf.subarray(off + 8, off + 8 + len);
    off += 12 + len;
    if (type === 'IHDR') { width = data.readUInt32BE(0); height = data.readUInt32BE(4); bitDepth = data[8]; colorType = data[9]; }
    else if (type === 'IDAT') idat.push(data);
    else if (type === 'IEND') break;
  }
  if (bitDepth !== 8 || (colorType !== 2 && colorType !== 6)) {
    throw new Error(`unsupported PNG format: bitDepth=${bitDepth} colorType=${colorType}`);
  }
  const bpp = colorType === 6 ? 4 : 3, stride = width * bpp;
  const raw = inflateSync(Buffer.concat(idat));
  const chan = Buffer.alloc(width * height * bpp);
  let src = 0;
  for (let y = 0; y < height; y++) {
    const filter = raw[src++];
    const row = chan.subarray(y * stride, (y + 1) * stride);
    const prev = y ? chan.subarray((y - 1) * stride, y * stride) : null;
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
              : filter === 4 ? (v + pr) & 0xff : v;
    }
  }
  // promote RGB → RGBA (opaque) so callers always get 4 channels.
  if (colorType === 6) return { width, height, pixels: chan };
  const pixels = Buffer.alloc(width * height * 4);
  for (let i = 0, j = 0; i < chan.length; i += 3, j += 4) {
    pixels[j] = chan[i]; pixels[j + 1] = chan[i + 1]; pixels[j + 2] = chan[i + 2]; pixels[j + 3] = 255;
  }
  return { width, height, pixels };
}

function encodeRgba({ width, height, pixels }) {
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  let dst = 0;
  for (let y = 0; y < height; y++) {
    raw[dst++] = 0;
    Buffer.from(pixels.subarray(y * stride, (y + 1) * stride)).copy(raw, dst);
    dst += stride;
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([PNG_SIG, pngChunk('IHDR', ihdr), pngChunk('IDAT', deflateSync(raw)), pngChunk('IEND')]);
}

// Normalize a returned image to an RGBA PNG at the requested size via Pillow.
// Two jobs: Gemini ignores output_format and emits JPEG ~60% of the time (which
// the repo's pure-stdlib PNG codecs cannot decode), and it ignores size entirely
// (always ~1024px), so a raw sprite is a multi-MB oversized blob. Pillow fixes both.
// ponytail: a battle-tested lib beats hand-rolling a baseline-JPEG decoder — but it
// is a REAL added runner dep (`pip install Pillow`), NOT already present (the other
// python tools use only stdlib). checkPil() fails loud + actionable if it is missing;
// keep it installed on the self-hosted runner (docs/agents-setup.md).
let pilChecked = false;
function checkPil() {
  if (pilChecked) return;
  try {
    execFileSync('python3', ['-c', 'import PIL'], { stdio: 'ignore' });
  } catch (e) {
    const why = e?.code === 'ENOENT' ? 'python3 not found on PATH' : 'the Pillow package is not importable';
    throw new Error(`nano-banana needs Pillow to transcode Gemini's JPEG output — ${why}. `
      + 'Install it on this machine / the runner: `python3 -m pip install Pillow` (see docs/agents-setup.md).');
  }
  pilChecked = true;
}

// size falsy → keep Gemini's native resolution (~1024px), only JPEG→PNG transcode.
// A pixel size squares the output to (size,size). Native output is still square
// (Gemini returns square), just larger — the renderer scales it at draw time.
function toPng(buf, size) {
  checkPil();
  const resize = size ? `im=im.resize((${size},${size}), Image.LANCZOS)\n` : '';
  return execFileSync('python3', ['-c',
    "import sys,io\nfrom PIL import Image\n"
    + `im=Image.open(io.BytesIO(sys.stdin.buffer.read())).convert('RGBA')\n`
    + resize
    + "im.save(sys.stdout.buffer,'PNG')"],
  { input: buf, maxBuffer: 64 * 1024 * 1024 });
}

// knock near-#00FF00 pixels to alpha 0. "green" = high G, low R/B — a wide
// threshold catches the anti-aliased fringe where the subject meets the screen.
function chromaKnockout(png) {
  const { width, height, pixels } = decodeRgba(png);
  for (let i = 0; i < pixels.length; i += 4) {
    const r = pixels[i], g = pixels[i + 1], b = pixels[i + 2];
    if (g > 140 && r < 120 && b < 120 && g - r > 60 && g - b > 60) pixels[i + 3] = 0;
  }
  return encodeRgba({ width, height, pixels });
}

// undici hides the real network failure on `.cause`; surface it with the detail.
async function connect(fetchImpl, url, init, what) {
  try {
    return await fetchImpl(url, init);
  } catch (e) {
    const c = e?.cause;
    const detail = c ? [c.code, c.errno, c.message].filter(Boolean).join(' ') : e.message;
    throw new Error(`nano-banana ${what} could not reach ${url}: ${detail || 'fetch failed'} `
      + '(network egress to openrouter.ai — check outbound HTTPS)');
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// one image generation call → PNG Buffer + usd cost. Gemini image gen
// intermittently returns 400/empty (finish_reason STOP with no image), so retry
// a few times before giving up — one flaky facing shouldn't sink a 4-image run.
async function genImage(fetchImpl, apiKey, model, { prompt, background, size }, tries = 3) {
  // NOTE: Gemini ignores output_format and returns JPEG or PNG unpredictably
  // (content-correlated, ~60% JPEG); toPng normalizes either to RGBA PNG. We never
  // pass background:'opaque' (it skews even harder toward JPEG); alpha comes from
  // the green-screen chroma-key, not the API's background field.
  const body = { model, prompt, n: 1, aspect_ratio: '1:1', output_format: 'png' };
  if (background) body.background = background;
  let lastErr;
  for (let attempt = 1; attempt <= tries; attempt++) {
    try {
      const res = await connect(fetchImpl, `${BASE_URL}/images`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify(body),
      }, 'POST /images');
      if (!res.ok) {
        let text = '';
        try { text = (await res.text()).replace(/\s+/g, ' ').slice(0, 300); } catch { /* ignore */ }
        throw new Error(`nano-banana POST /images failed: HTTP ${res.status}`
          + (res.status === 402 ? ' (insufficient credits — check `/credits`)' : '')
          + (text ? ` — ${text}` : ''));
      }
      const json = await res.json();
      const b64 = json?.data?.[0]?.b64_json;
      if (!b64) throw new Error('nano-banana POST /images returned no image data');
      // Gemini ignores output_format and emits JPEG most of the time for complex
      // prompts, so normalize to PNG (see toPng). Cheaper than retrying at
      // ~$0.07/call for a format that only sometimes comes back PNG.
      return { image: toPng(Buffer.from(b64, 'base64'), size), usd: json?.usage?.cost ?? 0 };
    } catch (e) {
      lastErr = e;
      if (attempt < tries) await sleep(1500 * attempt);
    }
  }
  throw lastErr;
}

export async function generate(input, { apiKey, fetchImpl = fetch, model } = {}) {
  if (!apiKey) throw new Error('OPENROUTER_API_KEY is not set');
  model = model || process.env.NANOBANANA_MODEL || DEFAULT_MODEL;
  const { type, prompt, size = 64, directions = 4 } = input;

  // character/hud need alpha, but nano-banana ignores background:transparent, so
  // they're rendered on a green screen (see housePrompt) and knocked out here.
  if (type === 'character') {
    const dirs = input.ordinal === true ? ORDINAL : CARDINAL.slice(0, directions);
    const images = [];
    let usd = 0;
    for (const facing of dirs) {
      const r = await genImage(fetchImpl, apiKey, model,
        { prompt: housePrompt('character', prompt, facing), background: 'transparent', size });
      images.push(chromaKnockout(r.image));
      usd += r.usd;
    }
    return { images, dirs, animation: null, usage: [{ usd, generations: dirs.length }] };
  }

  // sprite: transparent foreground object (bomb prop, flame effect frames) in the
  // poison-slop object style, green-screened then knocked out to alpha. The opaque
  // tile ground-wrap would be wrong for a prop that overlays the world. Effects
  // emit `frames` slightly-varied images so the overlay flickers instead of freezing.
  if (input.sprite) {
    const n = type === 'effect' ? Math.max(1, input.frames ?? 4) : 1;
    const images = [];
    let usd = 0;
    for (let i = 0; i < n; i++) {
      const variant = n > 1 ? `, variation ${i + 1} of ${n}` : '';
      const r = await genImage(fetchImpl, apiKey, model,
        { prompt: housePrompt('object', prompt + variant), background: 'transparent', size });
      images.push(chromaKnockout(r.image));
      usd += r.usd;
    }
    return { images, dirs: null, animation: null, usage: [{ usd, generations: n }] };
  }

  // tile: opaque ground, no background field (opaque triggers JPEG). hud:
  // transparent overlay via green-screen chroma-key.
  const r = await genImage(fetchImpl, apiKey, model,
    { prompt: housePrompt(type, prompt), background: type === 'hud' ? 'transparent' : undefined, size });
  const image = type === 'hud' ? chromaKnockout(r.image) : r.image;
  return { images: [image], dirs: null, animation: null, usage: [{ usd: r.usd, generations: 1 }] };
}

// account balance — remaining usd credits in the shape gen-asset's preflight
// expects, so it prints something sane. throws on error (preflight catches).
export async function getBalance({ apiKey, fetchImpl = fetch }) {
  if (!apiKey) throw new Error('OPENROUTER_API_KEY is not set');
  const res = await connect(fetchImpl, `${BASE_URL}/credits`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  }, 'GET /credits');
  if (!res.ok) throw new Error(`nano-banana GET /credits failed: HTTP ${res.status}`);
  const json = await res.json();
  const total = json?.data?.total_credits ?? 0;
  const used = json?.data?.total_usage ?? 0;
  return { credits: { usd: total - used } };
}
