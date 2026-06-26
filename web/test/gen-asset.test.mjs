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
    : type === 'effect'
      ? [Buffer.from('0'), Buffer.from('1'), Buffer.from('2')]
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

test('run rejects scratch effect generation', async () => {
  // /animate-with-text animates an existing sprite; it can't synthesize an
  // effect from text. Scratch effect generation must fail fast (it would 422
  // against the real API) rather than emit an invalid request.
  await assert.rejects(
    run(['--type', 'effect', '--name', 'testspark', '--prompt', 'spark', '--frames', '3'],
      { generateImpl: fakeGen, env }),
    /not supported via scratch/,
  );
  assert.ok(!existsSync(join(dir, 'effects/testspark-0.png')), 'no effect files should be written');
});

test('run stamps placement metadata on entries', async () => {
  await run(['--type', 'character', '--name', 'testmage', '--prompt', 'mage', '--size', '64', '--directions', '4'],
    { generateImpl: fakeGen, env });
  const m = JSON.parse(readFileSync(manifestPath(), 'utf8'));
  const entry = m.assets['character:testmage'];
  assert.ok(entry.placement, 'entry should carry placement');
  assert.equal(entry.placement.anchor.y, 0.8, 'character anchor.y default is 0.8');
});
