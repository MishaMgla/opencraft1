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
