import test from 'node:test';
import assert from 'node:assert/strict';
import { checkedOrigin, createNativeWorld } from '../src/transport.js';

test('native requests stay on the pinned HTTPS world and never follow redirects', async () => {
  for (const value of ['http://opencraft1.com', 'https://opencraft1.com/', 'https://user@opencraft1.com', 'https://opencraft1.com/a', 'https://opencraft1.com?secret=x']) {
    assert.throws(() => checkedOrigin(value));
  }
  const calls = [];
  let status = 200;
  let redirect = false;
  const world = createNativeWorld('https://opencraft1.com', {
    async request(options) {
      calls.push(options);
      return { status, url: redirect ? 'https://evil.invalid' : options.url, data: { ticket: 'a'.repeat(64) } };
    },
  });
  const socket = await world.socket();
  assert.equal(socket.url, 'wss://opencraft1.com/evolving-api/socket?recipes=2');
  assert.deepEqual(socket.protocols, ['opencraft-guest.' + 'a'.repeat(64)]);
  assert(!socket.url.includes('a'.repeat(64)));
  assert.equal(calls[0].method, 'POST');
  assert.equal(calls[0].headers.Origin, 'https://opencraft1.com');
  assert.equal(calls[0].disableRedirects, true);
  assert.equal(calls[0].readTimeout, 5000);
  await world.request('/evolving-api/messages?after=10');
  assert.equal(calls[1].method, 'GET');
  const count = calls.length;
  for (const path of ['https://evil.invalid/evolving-api/session', '//evil.invalid', '/.env', '/evolving-api/../private', '/preview-info#x']) {
    await assert.rejects(world.request(path));
  }
  assert.equal(calls.length, count);
  status = 401;
  await assert.rejects(world.request('/evolving-api/session'), /^Error: 401$/);
  status = 200; redirect = true;
  await assert.rejects(world.request('/evolving-api/session'), /redirect/);
});

test('native socket refuses malformed tickets', async () => {
  const world = createNativeWorld('https://opencraft1.com', { request: async () => ({ status: 200, data: { ticket: 'bad' } }) });
  await assert.rejects(world.socket(), /Invalid socket ticket/);
});
