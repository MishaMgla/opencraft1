// Explicit allowlist: preview by default, production only with that argument.
// Leaves one named test guest; never modifies existing guests or messages.
import assert from 'node:assert/strict';

assert.ok(!process.argv[2] || process.argv[2] === 'production', 'expected production or no argument');
const origin = process.argv[2] === 'production'
  ? 'https://opencraft1.com'
  : 'https://evolving-preview-evolving-preview.up.railway.app';
const request = (path, options = {}) => fetch(origin + path, { signal: AbortSignal.timeout(10000), ...options });
const headers = { origin, 'content-type': 'application/json' };
const entry = await request('/', { redirect: 'manual' });
assert.equal(entry.status, 200, 'entry must open directly, without a redirect');
assert.equal(entry.headers.get('www-authenticate'), null, 'no browser password prompt');
assert.match(await entry.text(), /id="entry-form"/);
assert.equal((await request('/healthz')).status, 200);
assert.equal((await request('/evolving/')).status, 200);
assert.equal((await request('/evolving-api/session')).status, 401);
assert.equal((await request('/ws', { headers: { origin } })).status, 426);
assert.equal((await request('/ws?recipes=2', { headers: { origin } })).status, 401);
assert.equal((await request('/ws?recipes=2', { headers: { origin: 'https://foreign.invalid' } })).status, 403);
assert.equal((await request('/ws?recipes=2')).status, 403);
assert.deepEqual(await (await request('/preview-info', { headers })).json(), {
  apiVersion: 2, mode: 'evolving-preview', persistent: true,
});
assert.equal((await request('/evolving-api/session', {
  method: 'POST', headers: { ...headers, origin: 'https://foreign.invalid' },
  body: JSON.stringify({ name: 'Hosted smoke', seed: 123 }),
})).status, 403);
const created = await request('/evolving-api/session', {
  method: 'POST', headers, body: JSON.stringify({ name: 'Hosted smoke', seed: 123, avatarVersion: 2 }),
});
assert.equal(created.status, 200);
const setCookie = created.headers.get('set-cookie');
assert.match(setCookie, /; Secure/i);
assert.match(setCookie, /; HttpOnly/i);
assert.match(setCookie, /; SameSite=Strict/i);
const cookie = setCookie.split(';')[0];
const guest = await created.json();
assert.equal(guest.name, 'Hosted smoke');
assert.equal(guest.avatarVersion, 2);
assert.equal(guest.appearanceChoicePending, false);
assert.deepEqual(await (await request('/evolving-api/session', { headers: { ...headers, cookie } })).json(), guest);
// A valid guest reaches the WS upgrade check without Basic auth (400/426
// because this is an ordinary HTTP GET), rather than an auth challenge.
assert.ok([400, 426].includes((await request('/ws?recipes=2', { headers: { origin, cookie } })).status));
assert.equal((await request('/ws?recipes=2', { headers: { origin, cookie: 'opencraft_preview_guest=invalid' } })).status, 401);
assert.equal((await request('/preview-vendor/three.module.js', { headers })).status, 200);
assert.equal((await request('/.env.preview.railway.local', { headers })).status, 404);
console.log('PASS: direct public entry without password, origin, secure guest, WS cookie gate and assets');
