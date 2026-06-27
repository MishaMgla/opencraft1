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

test('run writes character walk-animation frames + manifest animations', async () => {
  const fakeGenAnim = async () => ({
    images: [Buffer.from('S'), Buffer.from('N'), Buffer.from('E'), Buffer.from('W')],
    animation: { name: 'walk', frames: {
      south: [Buffer.from('s0'), Buffer.from('s1')], north: [Buffer.from('n0'), Buffer.from('n1')],
      east: [Buffer.from('e0'), Buffer.from('e1')], west: [Buffer.from('w0'), Buffer.from('w1')],
    } },
    usage: [{ type: 'usd', usd: 0.02 }],
  });
  await run(['--type', 'character', '--name', 'testhorse', '--prompt', 'horse', '--size', '64',
    '--directions', '4', '--animate', 'walk'], { generateImpl: fakeGenAnim, env });
  assert.ok(existsSync(join(dir, 'characters/testhorse-south.png')), 'idle still written');
  assert.ok(existsSync(join(dir, 'characters/testhorse-south-walk-0.png')), 'walk frame 0 written');
  assert.ok(existsSync(join(dir, 'characters/testhorse-west-walk-1.png')), 'walk frame 1 written');
  const m = JSON.parse(readFileSync(manifestPath(), 'utf8'));
  const e = m.assets['character:testhorse'];
  assert.equal(e.animations.walk.fps, 12);
  assert.equal(e.animations.walk.frames.south.length, 2);
  assert.equal(e.animations.walk.frames.south[0], 'characters/testhorse-south-walk-0.png');
});

test('run regenerates an existing static character when an animation is newly requested', async () => {
  const noAnim = async () => ({ images: [Buffer.from('S'), Buffer.from('N'), Buffer.from('E'), Buffer.from('W')] });
  const withAnim = async () => ({
    images: [Buffer.from('S'), Buffer.from('N'), Buffer.from('E'), Buffer.from('W')],
    animation: { name: 'walk', frames: { south: [Buffer.from('s0')], north: [Buffer.from('n0')], east: [Buffer.from('e0')], west: [Buffer.from('w0')] } },
  });
  // First: static only.
  await run(['--type', 'character', '--name', 'upg', '--prompt', 'p', '--size', '64', '--directions', '4'],
    { generateImpl: noAnim, env });
  // Re-run WITHOUT --force but now asking for walk → must NOT skip; must add animation.
  const res = await run(['--type', 'character', '--name', 'upg', '--prompt', 'p', '--size', '64', '--directions', '4', '--animate', 'walk'],
    { generateImpl: withAnim, env });
  assert.equal(res.skipped, false, 'should regenerate to add the missing animation');
  const e = JSON.parse(readFileSync(manifestPath(), 'utf8')).assets['character:upg'];
  assert.ok(e.animations.walk, 'walk animation added on re-run');
  // And re-running again now that it HAS walk → skips.
  const again = await run(['--type', 'character', '--name', 'upg', '--prompt', 'p', '--size', '64', '--directions', '4', '--animate', 'walk'],
    { generateImpl: withAnim, env });
  assert.equal(again.skipped, true, 'skips once the animation is present');
});

test('run rejects --animate on a non-character type', async () => {
  await assert.rejects(
    run(['--type', 'tile', '--name', 'testanim', '--prompt', 'x', '--size', '128', '--animate', 'walk'],
      { generateImpl: fakeGen, env }),
    /character-only/,
  );
});

test('run stamps placement metadata on entries', async () => {
  await run(['--type', 'character', '--name', 'testmage', '--prompt', 'mage', '--size', '64', '--directions', '4'],
    { generateImpl: fakeGen, env });
  const m = JSON.parse(readFileSync(manifestPath(), 'utf8'));
  const entry = m.assets['character:testmage'];
  assert.ok(entry.placement, 'entry should carry placement');
  assert.equal(entry.placement.anchor.y, 0.8, 'character anchor.y default is 0.8');
});
