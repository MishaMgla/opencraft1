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
    { expectUrl: /create-image-pixflux/, json: { background_job_id: 'job-1' } },
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
    { json: { background_job_id: 'job-2' } },
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

// Character is async-only: POST -> {background_job_id, character_id}, then
// GET /characters/{id} yields rotation_urls (URLs, not base64) to DOWNLOAD.
// Animation is a second pipeline whose frames are also URLs.
const PNG = Buffer.from('PNGBYTES');
function charFetch() {
  const json = (obj) => ({ ok: true, status: 200, json: async () => obj });
  const bin = () => ({ ok: true, status: 200, arrayBuffer: async () => new Uint8Array(PNG).buffer });
  return async (url) => {
    const u = String(url);
    if (u.includes('/create-character-with-4-directions')) return json({ background_job_id: 'cj', character_id: 'cid' });
    if (u.includes('/animate-character')) return json({ background_job_ids: ['aj-s', 'aj-n', 'aj-e', 'aj-w'], directions: ['south', 'north', 'east', 'west'] });
    if (u.includes('/background-jobs/')) return json({ id: 'x', status: 'completed', created_at: 't' });
    if (u.includes('/characters/cid')) return json({
      id: 'cid',
      rotation_urls: { south: 'https://img/s', north: 'https://img/n', east: 'https://img/e', west: 'https://img/w' },
      animations: [{ animation_type: 'walk', directions: [
        { direction: 'south', frame_count: 2, frames: ['https://f/s0', 'https://f/s1'] },
        { direction: 'north', frame_count: 2, frames: ['https://f/n0', 'https://f/n1'] },
        { direction: 'east', frame_count: 2, frames: ['https://f/e0', 'https://f/e1'] },
        { direction: 'west', frame_count: 2, frames: ['https://f/w0', 'https://f/w1'] },
      ] }],
    });
    if (u.startsWith('https://img/') || u.startsWith('https://f/')) return bin();
    throw new Error(`unexpected fetch ${u}`);
  };
}

test('generate(character) downloads rotation URLs (not base64)', async () => {
  const { images, animation } = await generate(
    { type: 'character', prompt: 'horse', size: 64, directions: 4 },
    { apiKey: 'k', fetchImpl: charFetch(), pollMs: 1, sleep: noSleep },
  );
  assert.equal(images.length, 4);
  assert.equal(images[0].toString(), 'PNGBYTES');
  assert.equal(animation, null, 'no animation when not requested');
});

test('generate(character) with animation downloads per-direction walk frames', async () => {
  const { images, animation } = await generate(
    { type: 'character', prompt: 'horse', size: 64, directions: 4, animation: 'walk' },
    { apiKey: 'k', fetchImpl: charFetch(), pollMs: 1, sleep: noSleep },
  );
  assert.equal(images.length, 4);
  assert.equal(animation.name, 'walk');
  assert.equal(animation.frames.south.length, 2);
  assert.equal(animation.frames.west.length, 2);
  assert.equal(animation.frames.south[0].toString(), 'PNGBYTES');
});

test('generate(character): a failing animation is non-fatal (static stills still returned)', async () => {
  // animate-character 422s, but the 4 directional stills must still come back so
  // the asset ships; the animation is reported failed (not thrown).
  const json = (obj) => ({ ok: true, status: 200, json: async () => obj });
  const bin = () => ({ ok: true, status: 200, arrayBuffer: async () => new Uint8Array(PNG).buffer });
  const fetchImpl = async (url) => {
    const u = String(url);
    if (u.includes('/create-character-with-4-directions')) return json({ background_job_id: 'cj', character_id: 'cid' });
    if (u.includes('/animate-character')) return { ok: false, status: 422, text: async () => '{"detail":"bad template"}' };
    if (u.includes('/background-jobs/')) return json({ id: 'x', status: 'completed' });
    if (u.includes('/characters/cid')) return json({ rotation_urls: { south: 'https://img/s', north: 'https://img/n', east: 'https://img/e', west: 'https://img/w' } });
    if (u.startsWith('https://img/')) return bin();
    throw new Error(`unexpected ${u}`);
  };
  const { images, animation } = await generate(
    { type: 'character', prompt: 'horse', size: 64, directions: 4, animation: 'walk' },
    { apiKey: 'k', fetchImpl, pollMs: 1, sleep: noSleep },
  );
  assert.equal(images.length, 4, 'static stills still returned');
  assert.equal(animation.failed, true);
  assert.match(animation.error, /422/);
});

// ISO ordinal characters: 8-direction endpoint, keep the 4 diagonal facings,
// static-only (no animation even if asked). rotation_urls are hyphenated.
function char8Fetch() {
  const json = (obj) => ({ ok: true, status: 200, json: async () => obj });
  const bin = () => ({ ok: true, status: 200, arrayBuffer: async () => new Uint8Array(PNG).buffer });
  return async (url) => {
    const u = String(url);
    if (u.includes('/create-character-with-8-directions')) return json({ background_job_id: 'cj8', character_id: 'cid8' });
    if (u.includes('/create-character-with-4-directions')) throw new Error('ordinal must use the 8-direction endpoint');
    if (u.includes('/animate-character')) throw new Error('ordinal characters must not animate');
    if (u.includes('/background-jobs/')) return json({ status: 'completed' });
    if (u.includes('/characters/cid8')) return json({
      rotation_urls: {
        south: 'https://img/s', 'south-east': 'https://img/se', east: 'https://img/e', 'north-east': 'https://img/ne',
        north: 'https://img/n', 'north-west': 'https://img/nw', west: 'https://img/w', 'south-west': 'https://img/sw',
      },
    });
    if (u.startsWith('https://img/')) return bin();
    throw new Error(`unexpected fetch ${u}`);
  };
}

test('generate(character, ordinal) uses the 8-dir endpoint and keeps the 4 ordinals', async () => {
  const { images, dirs, animation } = await generate(
    { type: 'character', prompt: 'horse', size: 64, ordinal: true, animation: 'walk' },
    { apiKey: 'k', fetchImpl: char8Fetch(), pollMs: 1, sleep: noSleep },
  );
  assert.deepEqual(dirs, ['north-east', 'south-east', 'south-west', 'north-west']);
  assert.equal(images.length, 4);
  assert.equal(images[0].toString(), 'PNGBYTES');
  assert.equal(animation, null, 'ordinal characters ship static (no animation)');
});

test('generate returns images directly on a sync POST response', async () => {
  // Track call count
  let callCount = 0;
  const b64sync = Buffer.from('PNGDATA').toString('base64');
  const fetchImpl = mockFetch([
    // POST returns image directly (sync response, no background_job_id)
    { expectUrl: /create-image-pixflux/, json: { image: { base64: b64sync } } },
  ]);
  // Wrap to count calls
  const countingFetch = async (...args) => { callCount++; return fetchImpl(...args); };

  const { images } = await generate(
    { type: 'tile', prompt: 'stone', size: 128 },
    { apiKey: 'k', fetchImpl: countingFetch, pollMs: 1, sleep: noSleep },
  );
  assert.equal(images.length, 1, 'should decode one image');
  assert.equal(images[0].toString(), 'PNGDATA', 'should decode base64 correctly');
  assert.equal(callCount, 1, 'should call fetch exactly once (no polling)');
});
