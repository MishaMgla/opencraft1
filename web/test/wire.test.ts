// Cross-language protocol parity tests. The TS decoder/encoder in src/wire.ts is
// a hand-written mirror of internal/wire/wire.go. These tests assert it agrees,
// byte-for-byte, with the golden vectors that the Go suite generates
// (wire_fixtures.json, regenerated via `go test ./internal/wire -update`).
// If the Go protocol changes without updating the TS mirror, this fails.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { encodeHello, encodeInput, decodeServer } from '../src/wire.js';

const here = dirname(fileURLToPath(import.meta.url));
const fixtures = JSON.parse(readFileSync(join(here, 'wire_fixtures.json'), 'utf8'));

function hexToBytes(hex: string): Uint8Array {
  const b = new Uint8Array(hex.length / 2);
  for (let i = 0; i < b.length; i++) b[i] = parseInt(hex.substr(i * 2, 2), 16);
  return b;
}

function bytesToHex(buf: ArrayBufferLike): string {
  const b = new Uint8Array(buf);
  return Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
}

const byName = (cases: any[]) => Object.fromEntries(cases.map((c) => [c.name, c]));
const server = byName(fixtures.server);
const client = byName(fixtures.client);

// --- server -> client: decode the Go-encoded golden bytes ---

test('decode welcome matches golden', () => {
  const f = server.welcome;
  const view = new DataView(hexToBytes(f.hex).buffer);
  assert.deepEqual(decodeServer(view), f.decoded);
});

test('decode snapshot matches golden (incl. negative coords)', () => {
  const f = server.snapshot;
  const view = new DataView(hexToBytes(f.hex).buffer);
  assert.deepEqual(decodeServer(view), f.decoded);
});

test('decode enter matches golden (incl. multi-byte UTF-8 name)', () => {
  const f = server.enter;
  const view = new DataView(hexToBytes(f.hex).buffer);
  assert.deepEqual(decodeServer(view), f.decoded);
});

test('decode leave matches golden', () => {
  const f = server.leave;
  const view = new DataView(hexToBytes(f.hex).buffer);
  assert.deepEqual(decodeServer(view), f.decoded);
});

test('decode pong matches golden', () => {
  const f = server.pong;
  const view = new DataView(hexToBytes(f.hex).buffer);
  assert.deepEqual(decodeServer(view), f.decoded);
});

// --- client -> server: TS-encoded bytes must equal the golden the Go parser reads ---

test('encode hello matches golden bytes', () => {
  assert.equal(bytesToHex(encodeHello(client.hello.decoded.name)), client.hello.hex);
});

test('encode input matches golden bytes (negative x)', () => {
  const { x, y } = client.input.decoded;
  assert.equal(bytesToHex(encodeInput(x, y)), client.input.hex);
});

// Names longer than 255 bytes must be capped to fit the single length byte,
// matching EncodeEnter's clamp on the Go side.
test('encode hello caps long names', () => {
  const buf = encodeHello('x'.repeat(300));
  const bytes = new Uint8Array(buf);
  assert.equal(bytes[1], 255, 'length prefix should clamp to 255');
  assert.equal(bytes.length, 2 + 255);
});
