// web/test/assets.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveTile, resolveCharacter, resolveEffect, resolveHud } from '../src/assets.js';

const M = { version: 1, assets: {
  'tile:stone': { type: 'tile', name: 'stone', file: 'tiles/stone.png' },
  'character:knight': { type: 'character', name: 'knight', directions: 4,
    frames: { south: 'characters/knight-south.png' } },
  'character:horse': { type: 'character', name: 'horse', directions: 4,
    frames: { south: 'characters/horse-south.png' },
    animations: { walk: { fps: 12, frames: { south: ['characters/horse-south-walk-0.png', 'characters/horse-south-walk-1.png'] } } } },
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
test('resolveCharacter surfaces walk animation frames', () => {
  const horse = resolveCharacter(M, 'horse');
  assert.equal(horse.animations.walk.fps, 12);
  assert.equal(horse.animations.walk.frames.south.length, 2);
  assert.equal(resolveCharacter(M, 'knight').animations, undefined);
});
test('resolveEffect returns frame list', () => {
  assert.deepEqual(resolveEffect(M, 'spark').frames, ['effects/spark-0.png']);
});
test('resolveHud returns entry', () => {
  assert.equal(resolveHud(M, 'bar').file, 'hud/bar.png');
});
