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
