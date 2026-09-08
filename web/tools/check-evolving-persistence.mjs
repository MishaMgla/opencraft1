// One runnable check: build cmd/evolving-preview into /tmp/opencraft-preview-check,
// then run this script. It starts/stops ONLY its own server on loopback :8768.
// Uses PREVIEW_DATABASE_URL or the ignored .env.preview.local created for this trial.
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { once } from 'node:events';
import { setTimeout as delay } from 'node:timers/promises';

const base = 'http://127.0.0.1:8768';
const dsn = process.env.PREVIEW_DATABASE_URL || (await readFile('.env.preview.local', 'utf8')).split('\n').find(line => line.startsWith('PREVIEW_DATABASE_URL='))?.slice(21);
assert.ok(dsn, 'dedicated preview DSN required');
const url = new URL(dsn);
assert.equal(url.hostname, '127.0.0.1');
assert.equal(url.pathname, '/opencraft_preview');
assert.equal(url.username, 'opencraft_preview');
let child;
async function start() {
  // Refuse an existing service before spawning, so checks cannot touch it.
  let occupied = false;
  try { await fetch(base, { signal: AbortSignal.timeout(300) }); occupied = true; } catch {}
  assert.equal(occupied, false, 'port 8768 already in use');
  child = spawn('/tmp/opencraft-preview-check', ['-listen', '127.0.0.1:8768'], {
    env: { ...process.env, PREVIEW_DATABASE_URL: dsn }, stdio: 'ignore',
  });
  let spawnError;
  child.on('error', error => { spawnError = error; });
  for (let i = 0; i < 60; i++) {
    if (spawnError) throw spawnError;
    if (child.exitCode !== null) throw new Error('preview failed to start');
    try {
      const info = await (await fetch(`${base}/preview-info`)).json();
      assert.equal(info.mode, 'evolving-preview'); assert.equal(info.persistent, true);
      return;
    } catch { await delay(100); }
  }
  throw new Error('preview startup timed out');
}
async function stop() {
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
  const exit = once(child, 'exit'); child.kill('SIGTERM');
  const timer = setTimeout(() => child.kill('SIGKILL'), 5000);
  await exit; clearTimeout(timer);
}
async function request(path, cookie = '', body, status = 200, origin = base) {
  const response = await fetch(`${base}${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { Cookie: cookie, Origin: origin, 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(path === '/evolving-api/session' ? { ...body, avatarVersion: 2 } : body), signal: AbortSignal.timeout(5000),
  });
  assert.equal(response.status, status, `${path}: unexpected status`);
  return response;
}
const token = () => randomBytes(16).toString('hex');
try {
  const check = spawnSync('go', ['test', './internal/store', '-run', 'TestPreviewAppearance', '-count=1'], {
    env: { ...process.env, PREVIEW_TEST_DATABASE_URL: dsn }, encoding: 'utf8',
  });
  assert.equal(check.status, 0, check.stdout + check.stderr);
  await start();
  await request('/evolving-api/messages', '', undefined, 401);
  await request('/ws', '', undefined, 426);
  await request('/ws?recipes=2', '', undefined, 401);
  await request('/evolving-api/session', '', { name: 'check', seed: 1 }, 403, 'https://example.invalid');
  await request('/evolving-api/session', '', { name: '', seed: 1 }, 400);
  const aResponse = await request('/evolving-api/session', '', { name: 'Проверка', seed: 123 });
  const a = await aResponse.json();
  assert.equal(a.avatarVersion, 2); assert.equal(a.appearanceChoicePending, false);
  const header = aResponse.headers.get('set-cookie');
  assert.match(header, /HttpOnly/i); assert.match(header, /SameSite=Strict/i);
  const cookieA = header.split(';')[0];
  await request('/evolving-api/appearance', '', { seed: 20 }, 401);
  await request('/evolving-api/appearance', cookieA, { seed: 20 }, 403, 'https://example.invalid');
  await request('/evolving-api/appearance', cookieA, { seed: 20, keep: true }, 400);
  await request('/evolving-api/appearance', cookieA, { seed: 20 }, 409);
  const bResponse = await request('/evolving-api/session', '', { name: 'Проверка', seed: 456 });
  const b = await bResponse.json(); const cookieB = bResponse.headers.get('set-cookie').split(';')[0];
  assert.notEqual(a.id, b.id, 'same name is not same identity');
  assert.deepEqual(await (await request('/evolving-api/session', cookieA, { name: 'Подмена', seed: 999 })).json(), a);
  const body = { requestId: token(), text: 'Сообщение переживает перезапуск.' };
  const saved = await (await request('/evolving-api/messages', cookieA, body)).json();
  assert.equal(saved.playerId, a.id);
  const duplicates = await Promise.all(Array.from({ length: 4 }, () => request('/evolving-api/messages', cookieA, body).then(r => r.json())));
  assert.ok(duplicates.every(m => m.id === saved.id), 'concurrent retries must reuse one committed record');
  await request('/evolving-api/messages', cookieA, { ...body, text: 'Другой текст' }, 409);
  await request('/evolving-api/messages', cookieA, { requestId: token(), text: 'Слишком рано' }, 429);
  await request('/evolving-api/messages', cookieA, { requestId: token(), text: 'x'.repeat(201) }, 400);
  await request('/evolving-api/messages?after=-1', cookieB, undefined, 400);
  const ownKey = await (await request('/evolving-api/messages', cookieB, body)).json();
  assert.notEqual(ownKey.id, saved.id, 'idempotency key belongs to authenticated author');
  const after = await (await request(`/evolving-api/messages?after=${saved.id}`, cookieA)).json();
  assert.equal(after.filter(m => m.id === ownKey.id).length, 1);
  const before = await (await request(`/evolving-api/messages?before=${ownKey.id}`, cookieB)).json();
  assert.ok(before.some(m => m.id === saved.id));
  // Cross both the old 64-frame queue and our 100-record page boundary.
  // Real HTTP writes exercise the commit-order lock under two concurrent authors.
  for (let i = 0; i < 52; i++) {
    await delay(520);
    await Promise.all([cookieA,cookieB].map(cookie => request('/evolving-api/messages',cookie,
      {requestId:token(),text:`Проверка страницы истории: ${i + 1}/52`})));
  }
  const page = await (await request('/evolving-api/messages',cookieA)).json();
  assert.equal(page.length,100);
  assert.ok(page.every((m,i) => !i || BigInt(m.id)>BigInt(page[i-1].id)));
  const older = await (await request(`/evolving-api/messages?before=${page[0].id}`,cookieB)).json();
  assert.ok(older.some(m=>m.id===saved.id), 'old messages remain available beyond first page');
  const catchup = await (await request(`/evolving-api/messages?after=${saved.id}`,cookieA)).json();
  assert.equal(catchup.length,100);
  const tail = await (await request(`/evolving-api/messages?after=${catchup.at(-1).id}`,cookieA)).json();
  assert.equal(tail.length,5, 'cursor catch-up must neither skip nor duplicate concurrent commits');
  await stop(); await start();
  assert.deepEqual(await (await request('/evolving-api/session', cookieA)).json(), a);
  const restored = await (await request(`/evolving-api/messages?before=${ownKey.id}`, cookieB)).json();
  assert.equal(restored.filter(m => m.id === saved.id).length, 1);
  assert.equal((await (await request('/evolving-api/messages', cookieA, body)).json()).id, saved.id);
  console.log('PASS: guest ownership, same-name separation, CSRF/auth, validation, acknowledgement, concurrent deduplication, >100-message cursor catch-up, server restart.');
} finally { await stop(); }
