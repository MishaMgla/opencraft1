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
