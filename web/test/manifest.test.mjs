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

test('enforceCaps rejects undersize and off-fixed sizes', () => {
  assert.throws(() => enforceCaps('tile', 16), /below min/);   // pixflux floor is 32
  assert.throws(() => enforceCaps('effect', 32), /exactly 64/); // effect is fixed 64x64
  assert.doesNotThrow(() => enforceCaps('effect', 64));
});
