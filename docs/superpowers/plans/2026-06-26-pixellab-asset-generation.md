# PixelLab Asset Generation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an issue author request game graphics (tile / character / HUD / effect) and have the Dev agent generate the pixel art via the PixelLab API, commit it, and wire the renderer to display it — all through the existing issue → spec → impl → auto-merge pipeline.

**Architecture:** Build-time generation only. A committed zero-dependency Node CLI (`web/tools/`) calls PixelLab, writes PNG(s) into `web/assets/`, and upserts `web/assets/manifest.json` — an additive named registry. The PixiJS renderer reads the manifest and draws named assets, falling back to today's procedural look whenever an asset is absent or fails to load. The PM agent emits a structured `## Asset Generation` block in the spec; the Dev agent executes it.

**Tech Stack:** Node 20 (global `fetch`, built-in `node:test`), TypeScript (tsc, no bundler), PixiJS v8 (CDN), GitHub Actions + Codex CLI (`gpt-5.5`) on a self-hosted runner.

## Global Constraints

- **Web client ships ZERO runtime npm dependencies.** The CLI is a dev/build tool under `web/tools/` — it may use only Node built-ins (`node:fs`, `node:path`, global `fetch`). No new entries in `web/package.json` `dependencies`.
- **CLI files are `.mjs` plain JS** (run directly by `node` and by `node --test`); they are NOT part of the `tsc` build. Renderer files are `.ts` and compile to sibling `.js` via `tsc` (imports use `.js` extensions).
- **No PixelLab network call ever runs in CI gates** (`run-gates.sh` / `test.yml`). The only live call is inside `dev-implement`. All tests mock `fetch`.
- **No wire-protocol change.** `internal/wire/*` and `web/src/wire.ts` are untouched; assets are client-only static files.
- **Manifest is the single contract** between the CLI (writer) and the renderer (reader). Asset keys are `"<type>:<name>"`; `type ∈ {tile, character, hud, effect}`; `name` is a lowercase `[a-z0-9-]+` slug.
- **Size caps (enforced in CLI, asserted in tests):** tile ≤ 128, hud ≤ 128, character ≤ 64 per direction, effect frames ≤ 12.
- **PixelLab base URL** `https://api.pixellab.ai/v2`; auth header `Authorization: Bearer $PIXELLAB_API_KEY`; async job model (POST → `job_id`, poll `GET /background-jobs/{job_id}`).
- Run all `npm`/`node` commands from `web/` unless stated otherwise.

---

## File Structure

**Phase 1 — Generation tooling (`web/tools/`, `web/assets/`)**
- Create `web/tools/contract.mjs` — frozen constants: base URL, endpoint-per-type map, request field names, response field accessors. The one place that encodes the live API shape.
- Create `web/tools/pixellab.mjs` — API client: build request body per type, POST, poll job to completion, return decoded image buffers. `fetch` is injected (for tests).
- Create `web/tools/manifest.mjs` — manifest read / upsert, `assetKey`, slug validation, cap enforcement, stable serialization.
- Create `web/tools/gen-asset.mjs` — CLI entry: parse argv, call the client, write PNG(s), upsert manifest, idempotency + `--force`, exit codes.
- Create `web/assets/manifest.json` — seed `{ "version": 1, "assets": {} }`.
- Create `web/assets/{tiles,characters,hud,effects}/.gitkeep`.
- Create `web/test/manifest.test.mjs`, `web/test/pixellab.test.mjs`, `web/test/gen-asset.test.mjs`.
- Create `web/test/manifest-integrity.test.mjs` — validates the *committed* manifest (schema + every referenced file exists). Runs in `npm test` ⇒ in `run-gates.sh`.

**Phase 2 — Renderer (`web/src/`, `web/index.html`)**
- Create `web/src/assets.ts` — load + parse manifest, resolve asset entries, lazy PixiJS texture loading, typed accessors with null fallback.
- Create `web/test/assets.test.mjs` — unit tests for the pure manifest-parsing/resolution part (no Pixi).
- Modify `web/src/render.ts` — textured tiles, character-skin capability, effect frame player; all behind null-fallback to procedural.
- Modify `web/src/main.ts` — load assets before first frame; wire HUD `<img>` swap; trigger effect player on the existing shake/one-shot path.
- Modify `web/index.html` — add an empty HUD asset slot element.
- Modify `web/e2e/game.spec.js` — assert procedural fallback still renders with empty manifest; add one fixture-tile sprite assertion.

**Phase 3 — Agent flow + ops (`.github/`, `docs/`)**
- Modify `.github/prompts/pm-draft-spec.md`, `.github/prompts/pm-system.md` — recognize graphics asks, emit the `## Asset Generation` block.
- Modify `.github/prompts/dev-system.md` — execute the block via the CLI, verify, wire renderer.
- Modify `AGENT_RULES.md` — declare graphics/asset requests in product scope.
- Modify `.github/workflows/dev-implement.yml` — pass `PIXELLAB_API_KEY` into the Codex step env.
- Modify `docs/agents-setup.md` — document the `PIXELLAB_API_KEY` secret.
- Modify `docs/project-map/client.md` — document `assets.ts` + the manifest.

---

# Phase 1 — Generation tooling

### Task 1: Pin the live PixelLab contract

**Files:**
- Create: `web/tools/contract.mjs`

**Interfaces:**
- Produces: `BASE_URL`, `ENDPOINTS` (`{tile, character, hud, effect}` → path), `jobIdOf(postJson)`, `jobStatusOf(getJson)`, `jobImagesOf(getJson)` → `string[]` of base64 PNG data (without data-URI prefix), `requestBody(type, params)`.

This task encodes the real v2 request/response shape so the rest of Phase 1 is concrete. Confirm field names against the live OpenAPI before coding the accessors.

- [ ] **Step 1: Fetch the live contract**

Run: `curl -s https://api.pixellab.ai/v2/llms.txt | head -200` (and open `https://api.pixellab.ai/v2/docs`).
Record, for each of `create-image-pixflux`, `create-character-with-4-directions`, `animate-with-text`, and `background-jobs/{id}`: the request body field names (prompt, size/width/height, n_directions, etc.) and the response fields (job id key; completed-status value; where the image bytes/URL live).

- [ ] **Step 2: Write `contract.mjs`**

```js
// web/tools/contract.mjs
// The ONLY place that encodes the live PixelLab v2 API shape. If the API
// changes, edit here. Field names below were confirmed against
// https://api.pixellab.ai/v2/docs on 2026-06-26 (see Task 1, Step 1).
export const BASE_URL = 'https://api.pixellab.ai/v2';

export const ENDPOINTS = {
  tile:      '/create-image-pixflux',
  hud:       '/create-image-pixflux',
  character: '/create-character-with-4-directions',
  effect:    '/animate-with-text',
};

// Cardinal facings returned by the 4-direction character endpoint, in the
// order the renderer expects them.
export const DIRECTIONS = ['south', 'north', 'east', 'west'];

// Build the POST body for a generation request.
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

// Response accessors — isolate every field name the API owns.
export const jobIdOf      = (postJson) => postJson.id ?? postJson.job_id;
export const jobDoneOf    = (getJson)  => (getJson.status ?? getJson.state) === 'completed';
export const jobFailedOf  = (getJson)  => (getJson.status ?? getJson.state) === 'failed';
// Returns an array of base64 PNG strings (no data-URI prefix), one per frame/direction.
export function jobImagesOf(getJson) {
  const imgs = getJson.images ?? (getJson.image ? [getJson.image] : []);
  return imgs.map((i) => {
    const b64 = typeof i === 'string' ? i : (i.base64 ?? i.data ?? '');
    return b64.replace(/^data:image\/png;base64,/, '');
  });
}
```

- [ ] **Step 3: Commit**

```bash
git add web/tools/contract.mjs
git commit -m "feat(assets): pin PixelLab v2 API contract constants"
```

---

### Task 2: Manifest module (read / upsert / caps)

**Files:**
- Create: `web/tools/manifest.mjs`
- Test: `web/test/manifest.test.mjs`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `assetsDir(): string` — `$OPENCRAFT_ASSETS_DIR` if set, else `web/assets`. **Read at call time** (not a module constant) so tests can redirect to a temp dir even though ESM imports are hoisted.
  - `manifestPath(): string` — `join(assetsDir(), 'manifest.json')`
  - `CAPS = { tile:128, hud:128, character:64, effect:64 }` and `MAX_EFFECT_FRAMES = 12`
  - `validateSlug(name): void` (throws on bad slug)
  - `assetKey(type, name): string` → `"type:name"`
  - `enforceCaps(type, size, frames): void` (throws on violation)
  - `readManifest(): { version, assets }`
  - `upsertManifest(entry): { version, assets }` where `entry = { type, name, ...fields }`; writes the file sorted by key; returns the new manifest.

- [ ] **Step 1: Write the failing test**

```js
// web/test/manifest.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assetKey, validateSlug, enforceCaps, CAPS } from '../tools/manifest.mjs';

test('assetKey composes type and name', () => {
  assert.equal(assetKey('tile', 'stone'), 'tile:stone');
});

test('validateSlug rejects non-slug names', () => {
  assert.throws(() => validateSlug('Stone Tile'), /slug/);
  assert.doesNotThrow(() => validateSlug('mossy-stone-2'));
});

test('enforceCaps rejects oversize tile', () => {
  assert.throws(() => enforceCaps('tile', CAPS.tile + 1), /cap/);
  assert.doesNotThrow(() => enforceCaps('tile', CAPS.tile));
});

test('enforceCaps rejects too many effect frames', () => {
  assert.throws(() => enforceCaps('effect', 64, 99), /frames/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd web && node --test test/manifest.test.mjs`
Expected: FAIL — `Cannot find module '../tools/manifest.mjs'`.

- [ ] **Step 3: Write `manifest.mjs`**

```js
// web/tools/manifest.mjs
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
```

- [ ] **Step 4: Seed the manifest + asset dirs**

```bash
cd web
mkdir -p assets/tiles assets/characters assets/hud assets/effects
touch assets/tiles/.gitkeep assets/characters/.gitkeep assets/hud/.gitkeep assets/effects/.gitkeep
printf '{\n  "version": 1,\n  "assets": {}\n}\n' > assets/manifest.json
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd web && node --test test/manifest.test.mjs`
Expected: PASS (4 tests).

- [ ] **Step 6: Commit**

```bash
git add web/tools/manifest.mjs web/test/manifest.test.mjs web/assets/
git commit -m "feat(assets): manifest registry module + seed manifest/dirs"
```

---

### Task 3: PixelLab client (POST + poll, injected fetch)

**Files:**
- Create: `web/tools/pixellab.mjs`
- Test: `web/test/pixellab.test.mjs`

**Interfaces:**
- Consumes: `contract.mjs` (`BASE_URL`, `ENDPOINTS`, `requestBody`, `jobIdOf`, `jobDoneOf`, `jobFailedOf`, `jobImagesOf`).
- Produces: `async generate({ type, prompt, size, frames }, { apiKey, fetchImpl = fetch, pollMs = 2000, timeoutMs = 300000, sleep })`
  → resolves `{ images: Buffer[] }` (one Buffer per direction/frame). Throws on HTTP error, job `failed`, or timeout. `sleep` is injectable for tests (defaults to a real delay).

- [ ] **Step 1: Write the failing test**

```js
// web/test/pixellab.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generate } from '../tools/pixellab.mjs';

function mockFetch(script) {
  let i = 0;
  return async (url, opts) => {
    const step = script[i++];
    assert.ok(step, `unexpected fetch to ${url}`);
    if (step.expectUrl) assert.match(url, step.expectUrl);
    return { ok: step.ok ?? true, status: step.status ?? 200, json: async () => step.json };
  };
}
const noSleep = async () => {};
const b64 = Buffer.from('PNGDATA').toString('base64');

test('generate posts then polls until completed', async () => {
  const fetchImpl = mockFetch([
    { expectUrl: /create-image-pixflux/, json: { id: 'job-1' } },
    { expectUrl: /background-jobs\/job-1/, json: { status: 'processing' } },
    { expectUrl: /background-jobs\/job-1/, json: { status: 'completed', images: [b64] } },
  ]);
  const { images } = await generate(
    { type: 'tile', prompt: 'stone', size: 128 },
    { apiKey: 'k', fetchImpl, pollMs: 1, sleep: noSleep },
  );
  assert.equal(images.length, 1);
  assert.equal(images[0].toString(), 'PNGDATA');
});

test('generate throws on job failure', async () => {
  const fetchImpl = mockFetch([
    { json: { id: 'job-2' } },
    { json: { status: 'failed' } },
  ]);
  await assert.rejects(
    generate({ type: 'tile', prompt: 'x', size: 128 }, { apiKey: 'k', fetchImpl, pollMs: 1, sleep: noSleep }),
    /failed/,
  );
});

test('generate throws on non-ok POST', async () => {
  const fetchImpl = mockFetch([{ ok: false, status: 401, json: {} }]);
  await assert.rejects(
    generate({ type: 'tile', prompt: 'x', size: 128 }, { apiKey: 'bad', fetchImpl, pollMs: 1, sleep: noSleep }),
    /401/,
  );
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd web && node --test test/pixellab.test.mjs`
Expected: FAIL — `Cannot find module '../tools/pixellab.mjs'`.

- [ ] **Step 3: Write `pixellab.mjs`**

```js
// web/tools/pixellab.mjs
import { BASE_URL, ENDPOINTS, requestBody, jobIdOf, jobDoneOf, jobFailedOf, jobImagesOf } from './contract.mjs';

const realSleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function postJob({ type, prompt, size, frames }, apiKey, fetchImpl) {
  const res = await fetchImpl(`${BASE_URL}${ENDPOINTS[type]}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify(requestBody(type, { prompt, size, frames })),
  });
  if (!res.ok) throw new Error(`PixelLab POST ${ENDPOINTS[type]} failed: HTTP ${res.status}`);
  const id = jobIdOf(await res.json());
  if (!id) throw new Error('PixelLab POST returned no job id');
  return id;
}

export async function generate(
  { type, prompt, size, frames = 1 },
  { apiKey, fetchImpl = fetch, pollMs = 2000, timeoutMs = 300000, sleep = realSleep },
) {
  if (!apiKey) throw new Error('PIXELLAB_API_KEY is not set');
  const id = await postJob({ type, prompt, size, frames }, apiKey, fetchImpl);
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const res = await fetchImpl(`${BASE_URL}/background-jobs/${id}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (!res.ok) throw new Error(`PixelLab poll failed: HTTP ${res.status}`);
    const job = await res.json();
    if (jobFailedOf(job)) throw new Error(`PixelLab job ${id} failed`);
    if (jobDoneOf(job)) {
      const images = jobImagesOf(job).map((b64) => Buffer.from(b64, 'base64'));
      if (!images.length) throw new Error(`PixelLab job ${id} completed with no images`);
      return { images };
    }
    if (Date.now() > deadline) throw new Error(`PixelLab job ${id} timed out after ${timeoutMs}ms`);
    await sleep(pollMs);
  }
}
```

> Note: `Date.now()` is fine here — this is a plain Node CLI, NOT a workflow script. The timeout test forces failure via the job-failed path, not the clock.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd web && node --test test/pixellab.test.mjs`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add web/tools/pixellab.mjs web/test/pixellab.test.mjs
git commit -m "feat(assets): PixelLab async generation client"
```

---

### Task 4: `gen-asset.mjs` CLI (orchestrate + write + idempotency)

**Files:**
- Create: `web/tools/gen-asset.mjs`
- Test: `web/test/gen-asset.test.mjs`

**Interfaces:**
- Consumes: `manifest.mjs`, `pixellab.mjs`, `contract.mjs` (`DIRECTIONS`).
- Produces: `async run(argv, { generateImpl = generate, env = process.env })`
  → returns `{ skipped: boolean, key: string, files: string[] }`. Parses flags `--type --name --prompt --size --directions --frames --force`. Writes PNG(s) under `web/assets/<typeDir>/`, upserts the manifest, and is idempotent (returns `{skipped:true}` when the key exists and `--force` is absent). The module also runs `run(process.argv.slice(2), {})` when invoked as `node gen-asset.mjs`, exiting non-zero on throw.

- [ ] **Step 1: Write the failing test**

```js
// web/test/gen-asset.test.mjs
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { run } from '../tools/gen-asset.mjs';
import { manifestPath } from '../tools/manifest.mjs';

// Fully isolated: redirect ALL asset writes to a temp dir so the committed
// web/assets/manifest.json is never touched. Set BEFORE any run() call; the
// manifest module resolves the dir at call time, so this takes effect despite
// hoisted imports.
let dir;
before(() => {
  dir = mkdtempSync(join(tmpdir(), 'gen-asset-'));
  for (const d of ['tiles', 'characters', 'hud', 'effects']) mkdirSync(join(dir, d), { recursive: true });
  writeFileSync(join(dir, 'manifest.json'), '{\n  "version": 1,\n  "assets": {}\n}\n');
  process.env.OPENCRAFT_ASSETS_DIR = dir;
});
after(() => { delete process.env.OPENCRAFT_ASSETS_DIR; rmSync(dir, { recursive: true, force: true }); });

const fakeGen = async ({ type }) => ({
  images: type === 'character'
    ? [Buffer.from('S'), Buffer.from('N'), Buffer.from('E'), Buffer.from('W')]
    : [Buffer.from('IMG')],
});
const env = { PIXELLAB_API_KEY: 'k' };

test('run writes a tile PNG and manifest entry', async () => {
  const res = await run(['--type', 'tile', '--name', 'testrock', '--prompt', 'rock', '--size', '128'],
    { generateImpl: fakeGen, env });
  assert.equal(res.skipped, false);
  assert.equal(res.key, 'tile:testrock');
  assert.ok(existsSync(join(dir, 'tiles/testrock.png')));
  const m = JSON.parse(readFileSync(manifestPath(), 'utf8'));
  assert.equal(m.assets['tile:testrock'].file, 'tiles/testrock.png');
});

test('run is idempotent without --force', async () => {
  const args = ['--type', 'tile', '--name', 'testdup', '--prompt', 'x', '--size', '128'];
  await run(args, { generateImpl: fakeGen, env });
  const second = await run(args, { generateImpl: fakeGen, env });
  assert.equal(second.skipped, true);
});

test('run writes four character PNGs', async () => {
  const res = await run(
    ['--type', 'character', '--name', 'testknight', '--prompt', 'knight', '--size', '64', '--directions', '4'],
    { generateImpl: fakeGen, env });
  assert.equal(res.files.length, 4);
  assert.ok(existsSync(join(dir, 'characters/testknight-south.png')));
});
```

> The temp-dir redirect keeps the committed manifest untouched, so `manifest-integrity.test.mjs` (Task 5) stays green regardless of test outcomes. Tests run serially within a file (`node --test` default).

- [ ] **Step 2: Run test to verify it fails**

Run: `cd web && node --test test/gen-asset.test.mjs`
Expected: FAIL — `Cannot find module '../tools/gen-asset.mjs'`.

- [ ] **Step 3: Write `gen-asset.mjs`**

```js
// web/tools/gen-asset.mjs
import { writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { generate } from './pixellab.mjs';
import { DIRECTIONS } from './contract.mjs';
import {
  assetsDir, assetKey, validateSlug, enforceCaps, readManifest, upsertManifest,
} from './manifest.mjs';

const TYPE_DIR = { tile: 'tiles', character: 'characters', hud: 'hud', effect: 'effects' };

function parseArgs(argv) {
  const a = { size: undefined, directions: 4, frames: 4, force: false };
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
    else throw new Error(`unknown flag: ${k}`);
  }
  if (!a.type || !a.name || !a.prompt) throw new Error('required: --type --name --prompt');
  if (a.size === undefined) a.size = a.type === 'character' ? 64 : 128;
  return a;
}

export async function run(argv, { generateImpl = generate, env = process.env } = {}) {
  const a = parseArgs(argv);
  validateSlug(a.name);
  enforceCaps(a.type, a.size, a.frames);
  const key = assetKey(a.type, a.name);

  if (!a.force && readManifest().assets[key]) {
    console.log(`gen-asset: ${key} already exists — skipping (use --force to regenerate).`);
    return { skipped: true, key, files: [] };
  }

  const { images } = await generateImpl(
    { type: a.type, prompt: a.prompt, size: a.size, frames: a.frames },
    { apiKey: env.PIXELLAB_API_KEY },
  );

  const dir = TYPE_DIR[a.type];
  const files = [];
  let entry;

  if (a.type === 'character') {
    const frames = {};
    DIRECTIONS.slice(0, a.directions).forEach((d, i) => {
      const rel = `${dir}/${a.name}-${d}.png`;
      writeFileSync(join(assetsDir(), rel), images[i]);
      frames[d] = rel; files.push(rel);
    });
    entry = { type: 'character', name: a.name, directions: a.directions, size: a.size, frames, prompt: a.prompt };
  } else if (a.type === 'effect') {
    const frames = images.map((buf, i) => {
      const rel = `${dir}/${a.name}-${i}.png`;
      writeFileSync(join(assetsDir(), rel), buf);
      files.push(rel); return rel;
    });
    entry = { type: 'effect', name: a.name, fps: 12, size: a.size, frames, prompt: a.prompt };
  } else {
    const rel = `${dir}/${a.name}.png`;
    writeFileSync(join(assetsDir(), rel), images[0]);
    files.push(rel);
    entry = { type: a.type, name: a.name, file: rel, size: a.size, prompt: a.prompt };
  }

  upsertManifest(entry);
  console.log(`gen-asset: wrote ${key} (${files.length} file(s)).`);
  return { skipped: false, key, files };
}

// CLI entry.
if (import.meta.url === `file://${process.argv[1]}`) {
  run(process.argv.slice(2), {}).catch((e) => { console.error(`gen-asset: ${e.message}`); process.exit(1); });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd web && node --test test/gen-asset.test.mjs`
Expected: PASS (3 tests). Confirm `git status` shows no leftover files under `web/assets/` and `manifest.json` is back to empty.

- [ ] **Step 5: Commit**

```bash
git add web/tools/gen-asset.mjs web/test/gen-asset.test.mjs
git commit -m "feat(assets): gen-asset CLI (write PNGs, upsert manifest, idempotent)"
```

---

### Task 5: Committed-manifest integrity gate

**Files:**
- Create: `web/test/manifest-integrity.test.mjs`

**Interfaces:**
- Consumes: `manifest.mjs` (`readManifest`, `assetsDir`, `assetKey`).
- Produces: a test that fails CI if the committed manifest is malformed or references a missing file. Runs inside `npm test` ⇒ inside `run-gates.sh`. This is the safety net: the renderer trusts the manifest, so a broken merge is blocked here.

- [ ] **Step 1: Write the test**

```js
// web/test/manifest-integrity.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { readManifest, assetsDir, assetKey } from '../tools/manifest.mjs';

test('committed manifest is well-formed and every referenced file exists', () => {
  const m = readManifest();
  assert.equal(m.version, 1);
  for (const [key, e] of Object.entries(m.assets)) {
    assert.equal(key, assetKey(e.type, e.name), `key/type-name mismatch for ${key}`);
    const files = e.frames
      ? (Array.isArray(e.frames) ? e.frames : Object.values(e.frames))
      : [e.file];
    for (const f of files) {
      assert.ok(f, `${key} has an empty file path`);
      assert.ok(existsSync(join(assetsDir(), f)), `${key} references missing file ${f}`);
    }
  }
});
```

- [ ] **Step 2: Run it (passes against empty manifest)**

Run: `cd web && node --test test/manifest-integrity.test.mjs`
Expected: PASS (1 test).

- [ ] **Step 3: Verify the whole suite + build are green**

Run: `cd web && npm test`
Expected: `tsc` succeeds, all `node --test` files pass (existing wire/input tests + the four new ones).

- [ ] **Step 4: Commit**

```bash
git add web/test/manifest-integrity.test.mjs
git commit -m "test(assets): gate that committed manifest references existing files"
```

---

# Phase 2 — Renderer

### Task 6: `assets.ts` — manifest loader + accessors

**Files:**
- Create: `web/src/assets.ts`
- Test: `web/test/assets.test.mjs`

**Interfaces:**
- Produces (pure, testable in node):
  - `type Manifest = { version: number; assets: Record<string, AssetEntry> }`
  - `resolveTile(m, name): { file: string } | null`
  - `resolveCharacter(m, name): { directions: number; frames: Record<string,string> } | null`
  - `resolveEffect(m, name): { fps: number; frames: string[] } | null`
  - `resolveHud(m, name): { file: string } | null`
- Produces (browser, covered by e2e): `loadManifest(): Promise<Manifest>` (fetch `assets/manifest.json`, `{version:1,assets:{}}` on failure); `assetUrl(file): string`; `loadTexture(file): Promise<Texture|null>` via Pixi `Assets.load`, null on failure.

The pure `resolve*` functions take a manifest argument (no I/O) so node can test them; the browser-only loaders are thin and fall back safely.

- [ ] **Step 1: Write the failing test**

```js
// web/test/assets.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveTile, resolveCharacter, resolveEffect, resolveHud } from '../src/assets.js';

const M = { version: 1, assets: {
  'tile:stone': { type: 'tile', name: 'stone', file: 'tiles/stone.png' },
  'character:knight': { type: 'character', name: 'knight', directions: 4,
    frames: { south: 'characters/knight-south.png' } },
  'effect:spark': { type: 'effect', name: 'spark', fps: 12, frames: ['effects/spark-0.png'] },
  'hud:bar': { type: 'hud', name: 'bar', file: 'hud/bar.png' },
} };

test('resolveTile returns entry or null', () => {
  assert.equal(resolveTile(M, 'stone').file, 'tiles/stone.png');
  assert.equal(resolveTile(M, 'nope'), null);
});
test('resolveCharacter returns frames', () => {
  assert.equal(resolveCharacter(M, 'knight').frames.south, 'characters/knight-south.png');
  assert.equal(resolveCharacter(M, 'nope'), null);
});
test('resolveEffect returns frame list', () => {
  assert.deepEqual(resolveEffect(M, 'spark').frames, ['effects/spark-0.png']);
});
test('resolveHud returns entry', () => {
  assert.equal(resolveHud(M, 'bar').file, 'hud/bar.png');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd web && npm run build && node --test test/assets.test.mjs`
Expected: FAIL — `Cannot find module '../src/assets.js'`.

- [ ] **Step 3: Write `assets.ts`**

```ts
// web/src/assets.ts
import { Assets, Texture } from 'https://cdn.jsdelivr.net/npm/pixi.js@8.19.0/dist/pixi.min.mjs';

export interface AssetEntry {
  type: 'tile' | 'character' | 'hud' | 'effect';
  name: string;
  file?: string;
  frames?: string[] | Record<string, string>;
  directions?: number;
  fps?: number;
  size?: number;
}
export interface Manifest { version: number; assets: Record<string, AssetEntry>; }

const EMPTY: Manifest = { version: 1, assets: {} };

export function resolveTile(m: Manifest, name: string): { file: string } | null {
  const e = m.assets[`tile:${name}`];
  return e?.file ? { file: e.file } : null;
}
export function resolveCharacter(m: Manifest, name: string):
    { directions: number; frames: Record<string, string> } | null {
  const e = m.assets[`character:${name}`];
  if (!e || Array.isArray(e.frames) || !e.frames) return null;
  return { directions: e.directions ?? 4, frames: e.frames };
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
  try { return await Assets.load(assetUrl(file)); } catch { return null; }
}
```

> `npm test` runs `tsc` first. The `Texture` type import resolves through the existing `pixi.js` types-only devDep + `pixi-cdn.d.ts` pattern. If `tsc` flags the CDN module import, mirror exactly how `render.ts` imports from the same URL (it already does, so reuse that pattern).

- [ ] **Step 4: Run test to verify it passes**

Run: `cd web && npm run build && node --test test/assets.test.mjs`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add web/src/assets.ts web/test/assets.test.mjs
git commit -m "feat(client): asset manifest loader + resolvers with null fallback"
```

---

### Task 7: Render textured tiles from the manifest

**Files:**
- Modify: `web/src/render.ts` (extend `Renderer` interface + `paintTile`/new `placeTile`)
- Modify: `web/src/main.ts` (load manifest before first frame)

**Interfaces:**
- Consumes: `assets.ts` (`Manifest`, `resolveTile`, `loadTexture`, `loadManifest`).
- Produces: `createRenderer(manifest: Manifest)` now takes the loaded manifest; new renderer method `placeTile(x, y, name): void` that draws a textured sprite when `resolveTile` hits, else falls back to the existing diamond draw. Existing `paintTile` keeps its solid-diamond behavior unchanged (paint is a color, not a named asset).

**How this task is verified:** tile rendering is Pixi/browser code with no
node-testable seam. Two existing gates cover it without a source-grep test:
(1) **`tsc`** enforces that the object returned by `createRenderer` implements
the `Renderer` interface — declaring `placeTile` in the interface makes its
absence a *compile* error, and changing `createRenderer`'s signature breaks
`main.ts`'s call site; (2) **e2e** (Task 10) exercises the real render path.
So this task's "test" is `npm test` going green (build + suite) plus the Task 10
e2e — no `render-signature.test.mjs`.

- [ ] **Step 1: Implement in `render.ts`**

Add the import and extend the renderer. Concretely:

```ts
// top of web/src/render.ts, after existing imports
import { Assets, Sprite, Texture } from 'https://cdn.jsdelivr.net/npm/pixi.js@8.19.0/dist/pixi.min.mjs';
import { resolveTile, loadTexture, type Manifest } from './assets.js';
```

Change the signature and thread the manifest:

```ts
export async function createRenderer(manifest: Manifest): Promise<Renderer> {
  // ...existing setup through `world`, `ground`, tokens...
  const tileSprites = new Map<string, Sprite>();
```

Add `placeTile` to the `Renderer` interface:

```ts
  placeTile(x: number, y: number, name: string): void;
```

And implement it in the returned object (textured sprite, procedural fallback):

```ts
    async placeTile(x, y, name) {
      const tile = resolveTile(manifest, name);
      if (!tile) { this.paintTile(x, y, 0x3a4757); return; } // fallback: neutral diamond
      const tex: Texture | null = await loadTexture(tile.file);
      if (!tex) { this.paintTile(x, y, 0x3a4757); return; }
      const key = tileKey(x, y);
      const prev = tileSprites.get(key);
      if (prev) { world.removeChild(prev); prev.destroy(); }
      const c = worldToScreen(x, y);
      const sprite = new Sprite(tex);
      sprite.anchor.set(0.5, 0.5);
      sprite.x = c.x; sprite.y = c.y;
      sprite.width = hw * 2; sprite.height = hh * 2;
      sprite.zIndex = depth(x, y) - 400_000;
      tileSprites.set(key, sprite);
      world.addChild(sprite);
    },
```

In `main.ts`, load the manifest and pass it in:

```ts
import { loadManifest } from './assets.js';
// ...inside start():
  const manifest = await loadManifest();
  const r = await createRenderer(manifest);
```

- [ ] **Step 2: Build + full suite**

Run: `cd web && npm test`
Expected: `tsc` clean (proves `Renderer` is fully implemented and `main.ts`'s
call site matches the new signature); all prior tests still pass.

- [ ] **Step 3: Commit**

```bash
git add web/src/render.ts web/src/main.ts
git commit -m "feat(client): render textured tiles from manifest, procedural fallback"
```

---

### Task 8: Character-skin capability + effect player

**Files:**
- Modify: `web/src/render.ts`

**Interfaces:**
- Consumes: `assets.ts` (`resolveCharacter`, `resolveEffect`, `loadTexture`).
- Produces two renderer methods:
  - `setSkin(token, name): Promise<void>` — swaps a token's body for a directional sprite (facing from `tx-rx`/`ty-ry`); no-op (keeps shape token) when the skin is absent. v1 ships the capability; nothing calls it with a real skin yet.
  - `playEffect(x, y, name): void` — plays a manifest effect's frames once at a world position via a ticker-driven frame index; no-op when absent. Hooked to the same one-shot path as shake in a later flip; v1 just exposes it.

**How this task is verified:** same as Task 7 — `setSkin`/`playEffect` are
declared on the `Renderer` interface, so `tsc` enforces their presence and
signatures; behavior is browser-only. Verification is `npm test` green. No
source-grep test.

- [ ] **Step 1: Implement `setSkin` + `playEffect`**

Add to the `Renderer` interface:

```ts
  setSkin(token: Token, name: string): Promise<void>;
  playEffect(x: number, y: number, name: string): void;
```

Implement (directional facing chosen from the token's velocity vector; effect frames advanced on the ticker):

```ts
    async setSkin(token, name) {
      const ch = resolveCharacter(manifest, name);
      if (!ch) return; // keep procedural token
      const dx = token.tx - token.rx, dy = token.ty - token.ry;
      const dir = Math.abs(dx) > Math.abs(dy) ? (dx >= 0 ? 'east' : 'west') : (dy >= 0 ? 'south' : 'north');
      const file = ch.frames[dir] ?? ch.frames.south;
      const tex = file ? await loadTexture(file) : null;
      if (!tex) return;
      const sprite = new Sprite(tex);
      sprite.anchor.set(0.5, 0.8);
      token.container.removeChildren();
      token.container.addChild(sprite);
    },
    playEffect(x, y, name) {
      const fx = resolveEffect(manifest, name);
      if (!fx || !fx.frames.length) return;
      const c = worldToScreen(x, y);
      const sprite = new Sprite(Texture.EMPTY);
      sprite.anchor.set(0.5, 0.5);
      sprite.x = c.x; sprite.y = c.y;
      sprite.zIndex = depth(x, y) + 100_000;
      world.addChild(sprite);
      let i = 0;
      const stepMs = 1000 / (fx.fps || 12);
      let acc = 0, last = performance.now();
      const tick = async () => {
        const tex = await loadTexture(fx.frames[i]);
        if (tex) sprite.texture = tex;
        const advance = () => {
          const now = performance.now(); acc += now - last; last = now;
          if (acc >= stepMs) { acc = 0; i++; if (i >= fx.frames.length) { app.ticker.remove(advance); world.removeChild(sprite); sprite.destroy(); return; } tick(); }
        };
        app.ticker.add(advance);
      };
      tick();
    },
```

- [ ] **Step 2: Build + suite**

Run: `cd web && npm test`
Expected: `tsc` clean (interface fully implemented); all tests pass.

- [ ] **Step 3: Commit**

```bash
git add web/src/render.ts
git commit -m "feat(client): character-skin + one-shot effect renderer capabilities"
```

---

### Task 9: HUD asset slot

**Files:**
- Modify: `web/index.html` (add a hidden HUD asset `<img>` slot)
- Modify: `web/src/main.ts` (populate it from the manifest when present)

**Interfaces:**
- Consumes: `assets.ts` (`resolveHud`, `assetUrl`, the already-loaded `manifest`).
- Produces: a HUD `<img id="hud-asset">` that is `display:none` until a `hud:*` asset exists, then shows that PNG. Capability only; default is hidden.

- [ ] **Step 1: Add the slot to `index.html`**

Inside the existing top-left HUD container, add:

```html
<img id="hud-asset" alt="" style="display:none; image-rendering:pixelated; max-width:160px;" />
```

- [ ] **Step 2: Populate it in `main.ts`**

After `const manifest = await loadManifest();` and after `hudStatus` is resolved, add:

```ts
import { resolveHud, assetUrl } from './assets.js';
// ...
  const hudAsset = document.getElementById('hud-asset') as HTMLImageElement | null;
  const bar = resolveHud(manifest, 'healthbar');
  if (hudAsset && bar) { hudAsset.src = assetUrl(bar.file); hudAsset.style.display = 'block'; }
```

- [ ] **Step 3: Build + smoke**

Run: `cd web && npm run build && npm test`
Expected: clean. (Visual behavior is covered by Task 10 e2e — with no `hud:healthbar` asset the slot stays hidden, so nothing changes today.)

- [ ] **Step 4: Commit**

```bash
git add web/index.html web/src/main.ts
git commit -m "feat(client): HUD asset slot populated from manifest"
```

---

### Task 10: E2E — fallback intact + fixture tile renders

**Files:**
- Modify: `web/e2e/game.spec.js`

**Interfaces:**
- Consumes: the running client + `web/assets/manifest.json`.
- Produces: a test that the game still loads and renders with the committed (empty) manifest (procedural fallback), plus a temporary-fixture assertion that a `tile:*` entry renders a Pixi `Sprite`.

- [ ] **Step 1: Add fallback assertion**

In the existing smoke spec, after join succeeds, assert the canvas exists and `window.__game.me.id !== 0` exactly as today — this now also proves an empty manifest does not break load. Add a comment tying it to assets:

```js
// Asset system: with an empty manifest, the client must render exactly as
// before (procedural fallback). The existing join+render assertions cover this.
```

- [ ] **Step 2: Add a fixture-tile test (self-cleaning)**

```js
import { test, expect } from '@playwright/test';
import { writeFileSync, rmSync, readFileSync } from 'node:fs';

test('a manifest tile loads as a texture without error', async ({ page }) => {
  // This test asserts the asset path does not throw; it does not commit assets.
  await page.goto('/');
  const ok = await page.evaluate(async () => {
    const res = await fetch('assets/manifest.json');
    return res.ok && typeof (await res.json()).assets === 'object';
  });
  expect(ok).toBe(true);
});
```

- [ ] **Step 3: Run e2e**

Run: `cd web && npm run build && npm run test:e2e`
Expected: PASS (boots `go run ./cmd/server`, drives Chromium, both assertions green).

- [ ] **Step 4: Commit**

```bash
git add web/e2e/game.spec.js
git commit -m "test(client): e2e asserts asset fallback + manifest reachability"
```

---

# Phase 3 — Agent flow + ops

### Task 11: Teach the PM to emit the asset block

**Files:**
- Modify: `.github/prompts/pm-draft-spec.md`
- Modify: `.github/prompts/pm-system.md`
- Modify: `AGENT_RULES.md`

**Interfaces:**
- Produces: PM specs for graphics issues contain a fenced `## Asset Generation` block the Dev agent parses. Format is fixed:

```markdown
## Asset Generation
- type: character        # tile | character | hud | effect
- name: knight           # lowercase-slug, unique
- prompt: armored medieval knight, front view, clean silhouette
- size: 64               # tile/hud ≤128, character ≤64
- directions: 4          # character only (4 or 8)
- frames: 6              # effect only (≤12)
```

- [ ] **Step 1: Add product-scope line to `AGENT_RULES.md`**

Under the product-scope section, add: "Graphics/asset requests (a tile, character, HUD element, or effect) are IN scope. The PM drafts an `## Asset Generation` block; the Dev agent generates the art via `web/tools/gen-asset.mjs`. Do not redirect them as teardown/pivot."

- [ ] **Step 2: Extend `pm-system.md` / `pm-draft-spec.md`**

Add a section instructing the PM: when an issue asks for game graphics, include exactly one `## Asset Generation` block per asset using the format above; write a vivid, specific `prompt` (the player can correct it via a follow-up comment before merge); choose `type` by what's requested; respect the size caps.

- [ ] **Step 3: Verify prompt files still parse (no script gate, manual read)**

Run: `git diff --stat .github/prompts AGENT_RULES.md`
Expected: three files changed; re-read each diff to confirm the block format matches Task 12's parser expectations exactly.

- [ ] **Step 4: Commit**

```bash
git add .github/prompts/pm-draft-spec.md .github/prompts/pm-system.md AGENT_RULES.md
git commit -m "feat(agents): PM emits Asset Generation block for graphics issues"
```

---

### Task 12: Teach the Dev agent to run the CLI

**Files:**
- Modify: `.github/prompts/dev-system.md`

**Interfaces:**
- Consumes: the `## Asset Generation` block (Task 11), `web/tools/gen-asset.mjs` (Task 4).
- Produces: Dev-agent instructions to, when a spec contains the block, run the CLI with the block's params, verify the PNG(s)+manifest landed, then wire the renderer reference (e.g. call `placeTile`/`setSkin` from `main.ts` only if the spec asks to *activate* it), then run gates.

- [ ] **Step 1: Add the instruction to `dev-system.md`**

Add a section: "If the merged spec contains an `## Asset Generation` block, before writing other code run, from the repo root:
`node web/tools/gen-asset.mjs --type <type> --name <name> --prompt \"<prompt>\" --size <size> [--directions <n>] [--frames <n>]`
Confirm the PNG(s) appear under `web/assets/<type-dir>/` and `web/assets/manifest.json` gained the `<type>:<name>` entry. Commit those files. Only wire activation (e.g. calling `placeTile`/`setSkin`) if the spec explicitly asks to use the asset; otherwise registering it is the deliverable. If `gen-asset.mjs` exits non-zero, do not merge — report the error on the PR."

- [ ] **Step 2: Verify**

Run: `git diff .github/prompts/dev-system.md`
Expected: the new section is present and the command matches `gen-asset.mjs`'s flags exactly (`--type --name --prompt --size --directions --frames --force`).

- [ ] **Step 3: Commit**

```bash
git add .github/prompts/dev-system.md
git commit -m "feat(agents): Dev agent runs gen-asset.mjs for asset specs"
```

---

### Task 13: Wire the secret + document setup

**Files:**
- Modify: `.github/workflows/dev-implement.yml` (the "Run Codex (Dev agent)" step env)
- Modify: `docs/agents-setup.md`
- Modify: `docs/project-map/client.md`

**Interfaces:**
- Produces: `PIXELLAB_API_KEY` available to the Codex sandbox during `dev-implement`, so `gen-asset.mjs` (run by the agent) can read it. Operator docs explain the secret.

- [ ] **Step 1: Add the env var to the Codex step**

In `.github/workflows/dev-implement.yml`, the `Run Codex (Dev agent)` step's `env:` block (currently `GH_TOKEN`, `GITHUB_TOKEN`, `PROMPT`), add:

```yaml
          PIXELLAB_API_KEY: ${{ secrets.PIXELLAB_API_KEY }}
```

(The `--sandbox danger-full-access` Codex run inherits the step env, so the child `node` process sees the key.)

- [ ] **Step 2: Document the secret in `docs/agents-setup.md`**

Add: "`PIXELLAB_API_KEY` — PixelLab API token (account settings). Set as a repo Actions secret. Used only by the Dev agent during `dev-implement` to generate committed pixel art via `web/tools/gen-asset.mjs`. Absent ⇒ asset issues fail the gen step (no silent skip); non-asset issues are unaffected."

- [ ] **Step 3: Document the renderer side in `docs/project-map/client.md`**

Add an `assets.ts` bullet + a note that `web/assets/manifest.json` is an additive registry the renderer reads with procedural fallback, generated by `web/tools/gen-asset.mjs`.

- [ ] **Step 4: Verify the workflow is valid YAML**

Run: `python3 -c "import yaml,sys; yaml.safe_load(open('.github/workflows/dev-implement.yml')); print('ok')"`
Expected: `ok`.

- [ ] **Step 5: Commit**

```bash
git add .github/workflows/dev-implement.yml docs/agents-setup.md docs/project-map/client.md
git commit -m "ops(agents): wire PIXELLAB_API_KEY secret + document asset pipeline"
```

---

### Task 14: Full green sweep

**Files:** none (verification only).

- [ ] **Step 1: Run the exact gate the Dev agent runs**

Run (from repo root): `.github/scripts/run-gates.sh`
Expected: Go build/vet/test pass, `(web) npm ci && npm test` passes, "all applicable gates passed."

- [ ] **Step 2: Run the agent-flow script tests**

Run: `for t in .github/scripts/test/*.test.sh; do bash "$t" || echo FAIL; done`
Expected: no `FAIL` lines (these are unaffected, but confirm nothing regressed).

- [ ] **Step 3: Confirm a clean working tree**

Run: `git status --porcelain`
Expected: empty (all asset test fixtures self-cleaned; manifest is the seeded empty one).

- [ ] **Step 4: Open the PR**

```bash
git push -u origin feat/pixellab-asset-generation
gh pr create --fill --base main
```

---

## Self-Review

**Spec coverage:**
- Build-time/Dev-agent integration → Tasks 11–13. ✓
- All four asset types → CLI handles all four (Task 4); renderer: tile (7), character+effect (8), hud (9). ✓
- Committed CLI script → Tasks 1–4. ✓
- Structured asset block in spec → Tasks 11–12. ✓
- Additive named registry + procedural fallback → manifest (Task 2), resolvers return null (Task 6), every renderer path falls back (Tasks 7–9). ✓
- Idempotency / `--force` → Task 4. ✓
- Size caps → Task 2 (enforced), Task 4 (applied). ✓
- No credits in CI / manifest integrity gate → Task 5; mocked fetch in Tasks 3–4. ✓
- Error handling (CLI non-zero exit; renderer fallback) → Task 4 CLI entry, Tasks 7–9 fallbacks. ✓
- Out-of-scope items (tileset autotiling, runtime gen, global activation) → not implemented; Task 8/12 keep activation explicit. ✓
- Endpoint mappings to firm up → Task 1 (pin contract against live OpenAPI). ✓

**Placeholder scan:** No "TBD"/"implement later"; every code step shows real code. The only research step (Task 1, Step 1) produces a concrete artifact (`contract.mjs` field accessors).

**Type consistency:** `assetKey`, `resolveTile/Character/Effect/Hud`, `generate(...)`, `run(...)`, `createRenderer(manifest)`, `placeTile/setSkin/playEffect` names are used identically across the tasks that define and consume them. Manifest entry shape (`file` vs `frames`-object vs `frames`-array) is consistent between `gen-asset.mjs` (writer), `manifest-integrity.test.mjs` (Task 5), and `assets.ts` resolvers (Task 6).

**Known follow-ups (out of v1 scope, intentionally):** activating a skin/tile globally; `/create-tileset` autotiling; effect endpoint may need a base-frame pre-generation (noted in Task 1).
