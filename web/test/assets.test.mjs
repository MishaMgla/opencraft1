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
