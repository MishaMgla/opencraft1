# TypeScript Client Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate the `web/` client from JavaScript to TypeScript using `tsc` as a 1:1 type-strip compiler, with no bundler and no runtime dependencies, leaving the Go engine, deploy topology, and wire protocol untouched.

**Architecture:** Real `.ts` source in `web/src/` restricted to erasable syntax. `tsc` emits one structurally-identical `.js` per `.ts` *in place* (gitignored). The Go `http.FileServer(http.Dir("web"))`, `index.html`, Playwright, and Vercel static serving keep seeing `web/src/*.js` unchanged — the only new requirement is that `tsc` runs before anything loads the client. Migration is leaf-first so every `.ts` only ever imports other `.ts`; `allowJs` is **not** used (it collides with in-place emit), and each step deletes the old committed `.js` in the same commit that adds its `.ts`.

**Tech Stack:** TypeScript ≥5.8 (for `erasableSyntaxOnly`), Node 20, PixiJS 8.19 (CDN import, types via a types-only npm devDep), Vercel (static + `api/` functions), GitHub Actions.

**Conventions:**
- Source design doc: `docs/superpowers/specs/2026-06-15-ts-client-migration-design.md`.
- Every commit message ends with the trailer `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>` (shown in each commit step).
- After any devDependency change, run `npm install` (in `web/`) to refresh `package-lock.json` and commit the lockfile — CI uses `npm ci`, which requires the lock in sync.
- `cwd` for all `npm`/`npx`/`tsc` commands is `web/` unless stated otherwise.

---

## File Structure

**Created:**
- `web/tsconfig.json` — TS project config; emit-in-place, erasable-only, strict.
- `web/src/pixi-cdn.d.ts` — ambient type shim mapping the jsDelivr Pixi URL to the `pixi.js` npm types.
- `web/src/global.d.ts` — `Window` augmentation for the `__E2E` / `__game` e2e hooks.
- `web/src/wire.ts`, `iso.ts`, `config.ts`, `input.ts`, `net.ts`, `render.ts`, `main.ts` — ported modules (replace the `.js` originals).
- `web/test/wire.test.ts` — ported unit test (replaces `.js` original).
- `web/api/config.ts` — ported Vercel function (replaces `.js` original).

**Modified:**
- `web/package.json` — devDeps + `build`/`watch`/`test` scripts.
- `web/package-lock.json` — regenerated.
- `web/vercel.json` — add `"buildCommand": "tsc"`.
- `.gitignore` — ignore emitted `web/src/*.js` and `web/test/*.js`.
- `.github/workflows/test.yml` — `npm ci` + `npm test`; build before e2e.
- `.github/workflows/deploy-client.yml` — `npm ci` + `npm test` in the gate job.
- `AGENT_RULES.md`, `docs/project-map/**` — doc updates + changelog.

**Untouched (verify they are NOT edited):** `web/index.html`, `web/e2e/game.spec.js`, `web/playwright.config.js`, `internal/server/server.go`, `internal/wire/wire.go`, `web/test/wire_fixtures.json`.

> **Scoped decision — e2e stays JS.** `web/e2e/game.spec.js` and `web/playwright.config.js` remain JavaScript. They run under Playwright's own loader (not `tsc`), are never shipped to the browser, and typing the `window.__game` evaluate-callbacks would couple Playwright's tsconfig resolution to our `Window` augmentation for zero runtime benefit. Converting them is a trivial optional follow-up, explicitly out of scope here.

---

## Task 0: Create the feature branch

- [ ] **Step 1: Branch off main**

Run (from repo root):
```bash
git checkout -b ts-client-migration
```
Expected: `Switched to a new branch 'ts-client-migration'`.

---

## Task 1: Tooling scaffold + migrate `wire.ts` (first vertical slice)

This task establishes the toolchain and proves it end-to-end on the highest-value, golden-test-protected module. `tsc` needs at least one input `.ts`, so the scaffold and the first migration land together.

**Files:**
- Create: `web/tsconfig.json`, `web/src/pixi-cdn.d.ts`, `web/src/wire.ts`
- Modify: `web/package.json`, `web/package-lock.json`, root `.gitignore`
- Delete: `web/src/wire.js`

- [ ] **Step 1: Add devDependencies and scripts to `web/package.json`**

Replace the file with:
```json
{
  "name": "opencraft-web",
  "private": true,
  "type": "module",
  "description": "Web client. TypeScript, ES modules, no bundler — tsc type-strips each .ts to a sibling .js. Unit tests use Node's built-in test runner; e2e uses Playwright. No runtime npm dependencies (PixiJS loads from a CDN).",
  "scripts": {
    "build": "tsc",
    "watch": "tsc --watch",
    "test": "tsc && node --test test/",
    "test:e2e": "playwright test"
  },
  "devDependencies": {
    "@playwright/test": "^1.49.0",
    "@types/node": "^20.0.0",
    "pixi.js": "^8.19.0",
    "typescript": "^5.8.0"
  }
}
```

- [ ] **Step 2: Install to refresh the lockfile**

Run: `cd web && npm install`
Expected: installs `typescript`, `@types/node`, `pixi.js`; updates `package-lock.json`. No errors.

- [ ] **Step 3: Create `web/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "es2022",
    "module": "esnext",
    "moduleResolution": "bundler",
    "lib": ["es2022", "dom", "dom.iterable"],
    "types": ["node"],
    "strict": true,
    "verbatimModuleSyntax": true,
    "erasableSyntaxOnly": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "newLine": "lf"
  },
  "include": ["src/**/*.ts", "test/**/*.ts"],
  "exclude": ["node_modules", "api", "e2e", "playwright.config.js"]
}
```
Note: no `outDir`/`rootDir` → `tsc` emits each `.js` beside its `.ts`. `erasableSyntaxOnly` forbids enums/namespaces/parameter-properties so emit is a pure type-strip (verified against TS docs: option exists in TS ≥5.8, category Interop_Constraints).

- [ ] **Step 4: Create the PixiJS CDN type shim `web/src/pixi-cdn.d.ts`**

```ts
// Types the runtime CDN import of PixiJS by re-exporting the npm package's
// declarations. The URL is the real runtime module; `pixi.js` is a types-only
// devDependency pinned to the same version as the CDN URL below.
declare module 'https://cdn.jsdelivr.net/npm/pixi.js@8.19.0/dist/pixi.min.mjs' {
  export * from 'pixi.js';
}
```

- [ ] **Step 5: Ignore emitted artifacts in the root `.gitignore`**

Add these lines under the existing `node_modules/` block:
```gitignore
# tsc emit-in-place output (web client is compiled before serve/deploy)
web/src/*.js
web/test/*.js
```
(Already-tracked `.js` files stay tracked until each is `git rm`-ed in its own task.)

- [ ] **Step 6: Create `web/src/wire.ts` (port of `wire.js`)**

```ts
// Binary protocol mirror of internal/wire/wire.go. Little-endian, int16 positions.

const C_HELLO = 0x01;
const C_INPUT = 0x02;

const S_WELCOME = 0x81;
const S_SNAPSHOT = 0x82;
const S_ENTER = 0x83;
const S_LEAVE = 0x84;
const S_PONG = 0x85;

const enc = new TextEncoder();
const dec = new TextDecoder();

export interface Welcome {
  type: 'welcome';
  id: number;
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}
export interface SnapshotEnt {
  id: number;
  x: number;
  y: number;
}
export interface Snapshot {
  type: 'snapshot';
  tick: number;
  ents: SnapshotEnt[];
}
export interface Enter {
  type: 'enter';
  id: number;
  x: number;
  y: number;
  color: number;
  name: string;
}
export interface Leave {
  type: 'leave';
  id: number;
}
export interface Pong {
  type: 'pong';
  t: number;
}
export interface Unknown {
  type: 'unknown';
}
export type ServerMsg = Welcome | Snapshot | Enter | Leave | Pong | Unknown;

export function encodeHello(name: string): ArrayBuffer {
  const n = enc.encode(name.slice(0, 255));
  const b = new Uint8Array(2 + n.length);
  b[0] = C_HELLO;
  b[1] = n.length;
  b.set(n, 2);
  return b.buffer;
}

export function encodeInput(x: number, y: number): ArrayBuffer {
  const b = new ArrayBuffer(5);
  const v = new DataView(b);
  v.setUint8(0, C_INPUT);
  v.setInt16(1, x, true);
  v.setInt16(3, y, true);
  return b;
}

// view is a DataView over the received ArrayBuffer.
export function decodeServer(view: DataView): ServerMsg {
  const t = view.getUint8(0);
  switch (t) {
    case S_WELCOME:
      return {
        type: 'welcome',
        id: view.getUint32(1, true),
        minX: view.getInt16(5, true),
        minY: view.getInt16(7, true),
        maxX: view.getInt16(9, true),
        maxY: view.getInt16(11, true),
      };
    case S_SNAPSHOT: {
      const tick = view.getUint32(1, true);
      const count = view.getUint16(5, true);
      const ents: SnapshotEnt[] = [];
      let off = 7;
      for (let i = 0; i < count; i++) {
        ents.push({
          id: view.getUint32(off, true),
          x: view.getInt16(off + 4, true),
          y: view.getInt16(off + 6, true),
        });
        off += 8;
      }
      return { type: 'snapshot', tick, ents };
    }
    case S_ENTER: {
      const id = view.getUint32(1, true);
      const x = view.getInt16(5, true);
      const y = view.getInt16(7, true);
      const color = view.getUint32(9, true);
      const nlen = view.getUint8(13);
      const bytes = new Uint8Array(view.buffer, view.byteOffset + 14, nlen);
      return { type: 'enter', id, x, y, color, name: dec.decode(bytes) };
    }
    case S_LEAVE:
      return { type: 'leave', id: view.getUint32(1, true) };
    case S_PONG:
      return { type: 'pong', t: view.getUint32(1, true) };
  }
  return { type: 'unknown' };
}
```

- [ ] **Step 7: Delete the old `wire.js`**

Run: `git rm web/src/wire.js`
Expected: `rm 'web/src/wire.js'`.

- [ ] **Step 8: Compile and run the golden parity test**

Run: `cd web && npm test`
Expected: `tsc` emits `web/src/wire.js` with no type errors; `node --test test/` runs `test/wire.test.js` (still JS), which imports the emitted `../src/wire.js`. All wire parity tests **pass** (decode welcome/snapshot/enter/leave/pong + encode hello/input + long-name cap).
If `tsc` reports an error, fix `wire.ts` before proceeding — do not edit the emitted `.js`.

- [ ] **Step 9: Commit**

```bash
git add web/package.json web/package-lock.json web/tsconfig.json web/src/pixi-cdn.d.ts web/src/wire.ts .gitignore
git rm --cached web/src/wire.js 2>/dev/null; true
git commit -m "refactor(web): add TS toolchain and migrate wire to TypeScript" \
  -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```
Expected: commit created; `git status` shows `web/src/wire.js` untracked & ignored.

---

## Task 2: Migrate `iso.ts`

**Files:** Create `web/src/iso.ts`; Delete `web/src/iso.js`.

- [ ] **Step 1: Create `web/src/iso.ts`**

```ts
// Isometric projection. The server is projection-agnostic (flat world units);
// this is the only place that knows the camera is isometric.

// Pixels per world unit along each screen axis. Classic 2:1 iso => KX = 2*KY.
export const KX = 0.5;
export const KY = 0.25;

export interface ScreenPoint {
  x: number;
  y: number;
}

// world (wx, wy) -> screen pixels, before camera offset.
export function worldToScreen(wx: number, wy: number): ScreenPoint {
  return { x: (wx - wy) * KX, y: (wx + wy) * KY };
}

// Painter's-order depth: things further "south-east" in the world draw on top.
export function depth(wx: number, wy: number): number {
  return wx + wy;
}
```

- [ ] **Step 2: Delete old file**

Run: `git rm web/src/iso.js`

- [ ] **Step 3: Typecheck**

Run: `cd web && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add web/src/iso.ts && git rm --cached web/src/iso.js 2>/dev/null; true
git commit -m "refactor(web): migrate iso projection to TypeScript" \
  -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 3: Migrate `config.ts`

**Files:** Create `web/src/config.ts`; Delete `web/src/config.js`.

- [ ] **Step 1: Create `web/src/config.ts`**

```ts
// Resolves the game server's WebSocket URL.
//
// In a split deployment the static client (Vercel) and the engine (Railway) run
// on different origins, so the client fetches /config.json — served by a Vercel
// function from the WS_URL env var — to learn the wss:// endpoint.
//
// Locally the Go server serves both halves and there is no /config.json, so any
// failure (404, network error, bad JSON, missing field) falls back to the same
// origin. That keeps local dev zero-config and the e2e smoke test unchanged.
export async function resolveWsUrl(): Promise<string> {
  try {
    const res = await fetch('/config.json', { cache: 'no-store' });
    if (res.ok) {
      const cfg = await res.json();
      if (cfg && typeof cfg.wsUrl === 'string' && cfg.wsUrl) {
        return cfg.wsUrl;
      }
    }
  } catch {
    // fall through to the same-origin default
  }
  const scheme = location.protocol === 'https:' ? 'wss' : 'ws';
  return `${scheme}://${location.host}/ws`;
}
```

- [ ] **Step 2: Delete old file** — Run: `git rm web/src/config.js`

- [ ] **Step 3: Typecheck** — Run: `cd web && npx tsc --noEmit` — Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add web/src/config.ts && git rm --cached web/src/config.js 2>/dev/null; true
git commit -m "refactor(web): migrate config (ws url resolver) to TypeScript" \
  -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 4: Migrate `input.ts`

**Files:** Create `web/src/input.ts`; Delete `web/src/input.js`.

- [ ] **Step 1: Create `web/src/input.ts`**

```ts
// Tracks held keys and integrates the local player's movement each frame.
// Movement is along world axes (appears diagonal under iso) — fine for MVP.

export interface Vec2 {
  x: number;
  y: number;
}
export interface Bounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}
export interface Input {
  // pos: {x,y} world units (mutated). speed: units/sec. dt: seconds.
  step(pos: Vec2, speed: number, dt: number, bounds: Bounds): boolean;
}

export function createInput(): Input {
  const keys: Record<string, boolean> = Object.create(null);
  window.addEventListener('keydown', (e) => (keys[e.key.toLowerCase()] = true));
  window.addEventListener('keyup', (e) => (keys[e.key.toLowerCase()] = false));

  function clamp(v: number, lo: number, hi: number): number {
    return v < lo ? lo : v > hi ? hi : v;
  }

  return {
    step(pos, speed, dt, bounds) {
      let dx = 0;
      let dy = 0;
      if (keys['w'] || keys['arrowup']) dy -= 1;
      if (keys['s'] || keys['arrowdown']) dy += 1;
      if (keys['a'] || keys['arrowleft']) dx -= 1;
      if (keys['d'] || keys['arrowright']) dx += 1;
      if (dx !== 0 || dy !== 0) {
        const len = Math.hypot(dx, dy);
        dx /= len;
        dy /= len;
        pos.x = clamp(pos.x + dx * speed * dt, bounds.minX, bounds.maxX);
        pos.y = clamp(pos.y + dy * speed * dt, bounds.minY, bounds.maxY);
        return true;
      }
      return false;
    },
  };
}
```

- [ ] **Step 2: Delete old file** — Run: `git rm web/src/input.js`

- [ ] **Step 3: Typecheck** — Run: `cd web && npx tsc --noEmit` — Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add web/src/input.ts && git rm --cached web/src/input.js 2>/dev/null; true
git commit -m "refactor(web): migrate input handling to TypeScript" \
  -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 5: Migrate `net.ts`

Depends on `wire.ts` (Task 1). The server-frame dispatch indexes `handlers` by `msg.type`; because `msg.type` includes `'unknown'` (which has no handler) the index uses an `Exclude` cast, and the call casts to a common signature — both are erasable.

**Files:** Create `web/src/net.ts`; Delete `web/src/net.js`.

- [ ] **Step 1: Create `web/src/net.ts`**

```ts
import { encodeHello, encodeInput, decodeServer } from './wire.js';
import type { Welcome, Snapshot, Enter, Leave, Pong, ServerMsg } from './wire.js';

export interface Handlers {
  welcome?: (m: Welcome) => void;
  snapshot?: (m: Snapshot) => void;
  enter?: (m: Enter) => void;
  leave?: (m: Leave) => void;
  pong?: (m: Pong) => void;
  close?: () => void;
}

export interface NetControl {
  sendInput(x: number, y: number): void;
  close(): void;
}

// Opens a WebSocket, sends Hello on open, and dispatches decoded server
// frames to handlers[msg.type]. Returns a small control object.
export function connect(url: string, name: string, handlers: Handlers): NetControl {
  const ws = new WebSocket(url);
  ws.binaryType = 'arraybuffer';

  ws.onopen = () => ws.send(encodeHello(name));
  ws.onmessage = (ev) => {
    const msg = decodeServer(new DataView(ev.data));
    const h = handlers[msg.type as Exclude<keyof Handlers, 'close'>];
    if (h) (h as (m: ServerMsg) => void)(msg);
  };
  ws.onclose = () => handlers.close && handlers.close();

  return {
    sendInput(x, y) {
      if (ws.readyState === WebSocket.OPEN) ws.send(encodeInput(x, y));
    },
    close() {
      ws.close();
    },
  };
}
```

- [ ] **Step 2: Delete old file** — Run: `git rm web/src/net.js`

- [ ] **Step 3: Typecheck** — Run: `cd web && npx tsc --noEmit` — Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add web/src/net.ts && git rm --cached web/src/net.js 2>/dev/null; true
git commit -m "refactor(web): migrate net (websocket layer) to TypeScript" \
  -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 6: Migrate `render.ts`

Depends on `iso.ts` (Task 2) and the Pixi shim (Task 1). Pixi types come from the `pixi.js` devDep via the ambient module declaration. The `addToken(id, …)` parameter is intentionally unused (kept for call-site symmetry); `noUnusedParameters` is off, so this is fine.

**Files:** Create `web/src/render.ts`; Delete `web/src/render.js`.

- [ ] **Step 1: Create `web/src/render.ts`**

```ts
import { Application, Container, Graphics, Text } from 'https://cdn.jsdelivr.net/npm/pixi.js@8.19.0/dist/pixi.min.mjs';
import { worldToScreen, depth, KX, KY } from './iso.js';

const GROUND_STEP = 128; // world units between iso floor tiles

function makeToken(name: string, color: number): Container {
  const container = new Container();

  const shadow = new Graphics()
    .ellipse(0, 6, 12, 6)
    .fill({ color: 0x000000, alpha: 0.25 });
  const body = new Graphics().circle(0, 0, 10).fill({ color });
  const label = new Text({
    text: name,
    style: { fill: 0xffffff, fontSize: 12, fontFamily: 'system-ui' },
  });
  label.anchor.set(0.5, 1);
  label.y = -16;

  container.addChild(shadow, body, label);
  return container;
}

export interface Token {
  container: Container;
  rx: number;
  ry: number;
  tx: number;
  ty: number;
}

export interface Renderer {
  app: Application;
  addToken(id: number, name: string, color: number, x: number, y: number): Token;
  removeToken(token: Token): void;
  placeToken(token: Token): void;
  setLocal(x: number, y: number): void;
  centerCamera(x: number, y: number): void;
}

export async function createRenderer(): Promise<Renderer> {
  const app = new Application();
  await app.init({ background: '#11151c', resizeTo: window, antialias: true });
  document.body.appendChild(app.canvas);

  const world = new Container();
  world.sortableChildren = true;
  app.stage.addChild(world);

  // Static isometric floor.
  const ground = new Graphics();
  const hw = KX * GROUND_STEP;
  const hh = KY * GROUND_STEP;
  for (let wx = 0; wx <= 4096; wx += GROUND_STEP) {
    for (let wy = 0; wy <= 4096; wy += GROUND_STEP) {
      const c = worldToScreen(wx, wy);
      ground
        .moveTo(c.x, c.y - hh)
        .lineTo(c.x + hw, c.y)
        .lineTo(c.x, c.y + hh)
        .lineTo(c.x - hw, c.y)
        .lineTo(c.x, c.y - hh);
    }
  }
  ground.stroke({ color: 0x2a3340, width: 1 });
  ground.zIndex = -1_000_000;
  world.addChild(ground);

  // Local player token.
  const localContainer = makeToken('you', 0xffffff);
  world.addChild(localContainer);

  return {
    app,
    addToken(id, name, color, x, y) {
      const container = makeToken(name, color);
      world.addChild(container);
      const token: Token = { container, rx: x, ry: y, tx: x, ty: y };
      this.placeToken(token);
      return token;
    },
    removeToken(token) {
      world.removeChild(token.container);
      token.container.destroy({ children: true });
    },
    placeToken(token) {
      const p = worldToScreen(token.rx, token.ry);
      token.container.x = p.x;
      token.container.y = p.y;
      token.container.zIndex = depth(token.rx, token.ry);
    },
    setLocal(x, y) {
      const p = worldToScreen(x, y);
      localContainer.x = p.x;
      localContainer.y = p.y;
      localContainer.zIndex = depth(x, y);
    },
    centerCamera(x, y) {
      const p = worldToScreen(x, y);
      world.x = app.screen.width / 2 - p.x;
      world.y = app.screen.height / 2 - p.y;
    },
  };
}
```

- [ ] **Step 2: Delete old file** — Run: `git rm web/src/render.js`

- [ ] **Step 3: Typecheck** — Run: `cd web && npx tsc --noEmit`
Expected: no errors. This is the key proof the Pixi CDN shim resolves (`Application`, `Container`, `Graphics`, `Text` are typed). If you see "Cannot find module 'https://cdn.jsdelivr.net/...'", the shim path in `pixi-cdn.d.ts` must match the import URL **exactly** (including the `@8.19.0` version).

- [ ] **Step 4: Commit**

```bash
git add web/src/render.ts && git rm --cached web/src/render.js 2>/dev/null; true
git commit -m "refactor(web): migrate render (pixi layer) to TypeScript" \
  -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 7: Migrate `main.ts` + add `global.d.ts`

Depends on `net.ts`, `input.ts`, `render.ts`, `config.ts`. The `window.__E2E`/`window.__game` hooks are typed via a new `global.d.ts` so the e2e smoke test's contract stays explicit. DOM lookups that the original code assumes non-null get `!` / element casts (erasable).

**Files:** Create `web/src/global.d.ts`, `web/src/main.ts`; Delete `web/src/main.js`.

- [ ] **Step 1: Create `web/src/global.d.ts`**

```ts
import type { Token } from './render.js';
import type { Bounds } from './input.js';

declare global {
  interface Window {
    __E2E?: boolean;
    __game?: {
      me: { id: number; x: number; y: number };
      others: Map<number, Token>;
      bounds: Bounds;
    };
  }
}

export {};
```

- [ ] **Step 2: Create `web/src/main.ts`**

```ts
import { connect } from './net.js';
import { createInput } from './input.js';
import { createRenderer } from './render.js';
import { resolveWsUrl } from './config.js';
import type { Bounds } from './input.js';
import type { Token } from './render.js';

const MOVE_SPEED = 600; // world units / second
const INPUT_HZ = 15;

document.getElementById('name-form')!.addEventListener('submit', async (e) => {
  e.preventDefault();
  const name = (document.getElementById('name') as HTMLInputElement).value.trim() || 'anon';
  document.getElementById('overlay')!.style.display = 'none';
  await start(name);
});

async function start(name: string): Promise<void> {
  const r = await createRenderer();
  const input = createInput();
  const hud = document.getElementById('hud')!;

  const me = { id: 0, x: 2048, y: 2048 };
  const bounds: Bounds = { minX: 0, minY: 0, maxX: 4095, maxY: 4095 };
  const others = new Map<number, Token>();

  // E2E test hook (inert in prod). These objects are mutated in place by the
  // game loop, so exposing the references once is enough for a test to read
  // live state. Enabled by an init script that sets window.__E2E before load.
  if (window.__E2E) window.__game = { me, others, bounds };

  const net = connect(await resolveWsUrl(), name, {
    welcome(m) {
      me.id = m.id;
      bounds.minX = m.minX;
      bounds.minY = m.minY;
      bounds.maxX = m.maxX;
      bounds.maxY = m.maxY;
    },
    enter(m) {
      if (m.id === me.id) return;
      others.set(m.id, r.addToken(m.id, m.name, m.color, m.x, m.y));
    },
    leave(m) {
      const o = others.get(m.id);
      if (o) {
        r.removeToken(o);
        others.delete(m.id);
      }
    },
    snapshot(m) {
      for (const e of m.ents) {
        if (e.id === me.id) continue;
        const o = others.get(e.id);
        if (o) {
          o.tx = e.x;
          o.ty = e.y;
        }
      }
    },
  });

  let last = performance.now();
  let acc = 0;
  r.app.ticker.add(() => {
    const now = performance.now();
    const dt = (now - last) / 1000;
    last = now;

    input.step(me, MOVE_SPEED, dt, bounds);
    r.setLocal(me.x, me.y);

    for (const o of others.values()) {
      o.rx += (o.tx - o.rx) * 0.2; // smooth toward latest snapshot
      o.ry += (o.ty - o.ry) * 0.2;
      r.placeToken(o);
    }

    r.centerCamera(me.x, me.y);

    acc += dt;
    if (acc >= 1 / INPUT_HZ) {
      acc = 0;
      net.sendInput(Math.round(me.x), Math.round(me.y));
    }

    hud.textContent = `${name} · players nearby: ${others.size}`;
  });
}
```

Note: `Token` is imported from `./render.js` (not `./input.js`) — `render.ts` is the module that exports it.

- [ ] **Step 3: Delete old file** — Run: `git rm web/src/main.js`

- [ ] **Step 4: Typecheck** — Run: `cd web && npx tsc --noEmit`
Expected: no errors. The handler object literal infers `m` as `Welcome`/`Enter`/`Leave`/`Snapshot` from `Handlers`; `me` (shape `{id,x,y}`) is structurally a `Vec2` for `input.step`; `window.__game` matches `global.d.ts`.

- [ ] **Step 5: Commit**

```bash
git add web/src/main.ts web/src/global.d.ts && git rm --cached web/src/main.js 2>/dev/null; true
git commit -m "refactor(web): migrate main entry + e2e window hooks to TypeScript" \
  -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 8: Migrate the unit test `test/wire.test.ts`

Behavior-preserving port (per AGENT_RULES "no unsolicited tests" — same assertions, just typed and `.ts`). After compile, `node --test test/` runs the emitted `test/wire.test.js`, which imports the emitted `../src/wire.js` and validates against the unchanged `wire_fixtures.json`.

**Files:** Create `web/test/wire.test.ts`; Delete `web/test/wire.test.js`.

- [ ] **Step 1: Create `web/test/wire.test.ts`**

```ts
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
```

- [ ] **Step 2: Delete old file** — Run: `git rm web/test/wire.test.js`

- [ ] **Step 3: Compile + run unit tests** — Run: `cd web && npm test`
Expected: `tsc` clean; all parity tests **pass** against `wire_fixtures.json`.

- [ ] **Step 4: Commit**

```bash
git add web/test/wire.test.ts && git rm --cached web/test/wire.test.js 2>/dev/null; true
git commit -m "refactor(web): migrate wire parity test to TypeScript" \
  -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 9: Migrate the Vercel function `api/config.ts` + `vercel.json` buildCommand

`api/` is excluded from the main tsconfig (so our `tsc` never emits `api/config.js`, avoiding a dual `.ts`/`.js` ambiguity for Vercel). Vercel's Node builder compiles `api/config.ts` natively. `buildCommand: "tsc"` makes `vercel build` produce `web/src/*.js` before packaging; with no `outputDirectory` and no `public/`, Vercel serves the project root (`web/`) — confirmed against Vercel docs (default `public` → root fallback). `git.deploymentEnabled:false` and the `/config.json` rewrite are unchanged.

**Files:** Create `web/api/config.ts`; Modify `web/vercel.json`, `web/package.json`, `web/package-lock.json`; Delete `web/api/config.js`.

- [ ] **Step 1: Add `@vercel/node` types**

Run: `cd web && npm install -D @vercel/node`
Expected: adds `@vercel/node` to devDependencies; updates `package-lock.json`.

- [ ] **Step 2: Create `web/api/config.ts`**

```ts
import type { VercelRequest, VercelResponse } from '@vercel/node';

// Vercel serverless function. Returns the game server's WebSocket URL to the
// client at runtime, sourced from the WS_URL project env var — so the engine
// endpoint can change without a client rebuild and never lives in git.
// Reached via the /config.json rewrite in vercel.json.
export default function handler(_req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'no-store');
  res.status(200).json({ wsUrl: process.env.WS_URL || '' });
}
```

- [ ] **Step 3: Delete old file** — Run: `git rm web/api/config.js`

- [ ] **Step 4: Add `buildCommand` to `web/vercel.json`**

Replace the file with:
```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "buildCommand": "tsc",
  "rewrites": [
    { "source": "/config.json", "destination": "/api/config" }
  ],
  "git": {
    "deploymentEnabled": false
  }
}
```

- [ ] **Step 5: Verify the function typechecks in isolation**

Run: `cd web && npx tsc --noEmit -p tsconfig.json && npx tsc --noEmit --strict --skipLibCheck --moduleResolution bundler --module esnext --types node api/config.ts`
Expected: both clean. (The second command typechecks the excluded function file directly; `@vercel/node` provides `VercelRequest`/`VercelResponse`, `@types/node` provides `process`.)

- [ ] **Step 6: Commit**

```bash
git add web/api/config.ts web/vercel.json web/package.json web/package-lock.json && git rm --cached web/api/config.js 2>/dev/null; true
git commit -m "refactor(web): migrate vercel config function to TypeScript; add tsc buildCommand" \
  -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 10: Update CI workflows

The web unit job and the deploy gate must install devDeps and run `npm test` (which compiles first). The e2e job must compile before booting the Go server (which serves `web/src/*.js`). The deploy job is unchanged — `vercel build` now runs `tsc` via `buildCommand`.

**Files:** Modify `.github/workflows/test.yml`, `.github/workflows/deploy-client.yml`.

- [ ] **Step 1: Update the `web` job in `test.yml`**

Find:
```yaml
      # No runtime deps — Node's built-in test runner. Validates the JS protocol
      # mirror against the same golden fixtures the Go suite generates.
      - run: node --test test/
        working-directory: web
```
Replace with:
```yaml
      # Install the build-time TS toolchain (no runtime deps ship). `npm test`
      # type-checks (tsc) then runs Node's built-in test runner against the
      # emitted JS, validating the protocol mirror vs the Go golden fixtures.
      - run: npm ci
        working-directory: web
      - run: npm test
        working-directory: web
```

- [ ] **Step 2: Add a build step to the `e2e` job in `test.yml`**

Find:
```yaml
      - run: npm ci
        working-directory: web
      - run: npx playwright install --with-deps chromium
        working-directory: web
```
Replace with:
```yaml
      - run: npm ci
        working-directory: web
      # Compile TS -> JS so the Go FileServer can serve web/src/*.js.
      - run: npm run build
        working-directory: web
      - run: npx playwright install --with-deps chromium
        working-directory: web
```

- [ ] **Step 3: Update the gate `test` job in `deploy-client.yml`**

Find:
```yaml
      - run: node --test test/
        working-directory: web
```
Replace with:
```yaml
      - run: npm ci
        working-directory: web
      - run: npm test
        working-directory: web
```

- [ ] **Step 4: Sanity-check YAML**

Run (from repo root): `python3 -c "import yaml,sys; [yaml.safe_load(open(f)) for f in ['.github/workflows/test.yml','.github/workflows/deploy-client.yml']]; print('ok')"`
Expected: `ok`.

- [ ] **Step 5: Commit**

```bash
git add .github/workflows/test.yml .github/workflows/deploy-client.yml
git commit -m "ci(web): build/typecheck TypeScript in test, e2e, and deploy gate" \
  -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 11: Update documentation

**Files:** Modify `AGENT_RULES.md`; relevant `docs/project-map/**` leaf doc; `docs/project-map/README.md` (changelog).

- [ ] **Step 1: Update the web-client testing layout line in `AGENT_RULES.md`**

Find:
```
- **web client (unit):** Node's built-in test runner (`node --test test/`) — no framework, zero runtime dependencies. tests live in `web/test/*.test.js`; run from `web/`. `web/package.json` marks the modules ESM and exposes `npm test`; the only dependency it pulls in is Playwright, used solely for the e2e job below.
```
Replace with:
```
- **web client (unit):** TypeScript, type-stripped to ESM by `tsc` (no bundler). tests live in `web/test/*.test.ts`; run `cd web && npm test` (compiles, then `node --test test/` over the emitted JS). The shipped client has **zero runtime npm dependencies** (PixiJS loads from a CDN); the build-time devDeps are `typescript`, `@types/node`, `pixi.js` (types only), `@vercel/node` (types only), and Playwright (e2e).
```

- [ ] **Step 2: Update the dev-command line in `AGENT_RULES.md`**

Find:
```
- `cd web && node --test test/` — run the web client unit tests (zero runtime deps).
```
Replace with:
```
- `cd web && npm test` — type-check + run the web client unit tests (compiles TS, then runs Node's test runner on the emitted JS).
- `cd web && npm run build` — type-strip `web/src/*.ts` → sibling `.js` (required before running the Go server locally, which serves `web/`).
- `cd web && npm run watch` — same as build, in watch mode for local dev.
```

- [ ] **Step 3: Update the relevant project-map leaf doc**

Run (from repo root): `grep -rl "web/src" docs/project-map | head`
Open the leaf doc that documents the web client (e.g. a `docs/project-map/.../web*.md`). Update any references that say the client is JavaScript / `web/src/*.js` to TypeScript / `web/src/*.ts` (compiled in place to `.js`), and note the `npm run build` requirement for local serving. Keep edits factual and minimal; do not restructure the doc.

- [ ] **Step 4: Prepend a changelog entry in `docs/project-map/README.md`**

Add as the newest entry under the `## changelog` section:
```
- 2026-06-15: web client migrated to TypeScript (tsc type-strip, no bundler; emitted `.js` are gitignored build artifacts). Local dev/e2e now require `cd web && npm run build` first.
```

- [ ] **Step 5: Commit**

```bash
git add AGENT_RULES.md docs/project-map
git commit -m "docs: reflect web client TypeScript migration in rules + project map" \
  -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 12: Full verification + open PR (preview-deploy gate)

This task runs every suite the same way CI will, then opens the PR so `deploy-client.yml` produces a **preview deploy** — the authoritative check that the Vercel `buildCommand` + root-serving works in production-like conditions.

- [ ] **Step 1: Clean build from scratch**

Run:
```bash
cd web && rm -f src/*.js test/*.js && npm ci && npm run build
```
Expected: install clean; `tsc` emits `web/src/{wire,iso,config,input,net,render,main}.js` and no `api/config.js` (api excluded). No type errors.

- [ ] **Step 2: Unit tests** — Run: `cd web && npm test` — Expected: all wire parity tests pass.

- [ ] **Step 3: Go suite still green (golden parity unchanged)**

Run (from repo root): `go build ./... && go vet ./... && go test ./...`
Expected: pass, including `TestWireFixtures` (proves `wire.ts`→`wire.js` still matches the Go-generated fixtures).

- [ ] **Step 4: Browser e2e smoke test**

Run: `cd web && npx playwright install chromium && npm run build && npm run test:e2e`
Expected: the `loads, joins, and moves` spec passes — proves module load, Pixi CDN load, WebSocket handshake, and the input loop all work with the compiled TS output. (Playwright boots `go run ./cmd/server`, which serves the freshly built `web/src/*.js`.)

- [ ] **Step 5: Confirm no stray artifacts are tracked**

Run (from repo root): `git status --porcelain && git ls-files web/src web/test | grep -E '\.js$' || echo "no tracked .js under web/src or web/test — good"`
Expected: working tree clean; **no** `.js` files tracked under `web/src/` or `web/test/`.

- [ ] **Step 6: Push and open the PR**

Run (from repo root):
```bash
git push -u origin ts-client-migration
gh pr create --title "Migrate web client to TypeScript (tsc type-strip, no bundler)" \
  --body "$(cat <<'EOF'
Migrates the `web/` client from JS to TypeScript per docs/superpowers/specs/2026-06-15-ts-client-migration-design.md.

- Real `.ts` source; `tsc` type-strips 1:1 to sibling `.js` (gitignored). No bundler, no runtime deps (Pixi stays a CDN import).
- Go engine, wire protocol, golden fixtures, and deploy topology unchanged.
- CI gains a `tsc` typecheck gate; `vercel.json` gets `buildCommand: "tsc"`.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```
Expected: PR created; `deploy-client.yml` runs the gate (`npm test`) and posts a `🔭 Client preview: <url>` comment.

- [ ] **Step 7: Verify the preview deploy (authoritative Vercel check)**

Open the preview URL from the PR comment. Confirm:
1. The page loads (no console errors; Pixi canvas renders the iso floor).
2. Entering a name joins the world (token appears, HUD shows).
3. `/config.json` returns `{"wsUrl": "..."}` (the TS Vercel function works).

If the preview fails to serve `web/src/*.js` (e.g. Vercel served an empty/`public` output instead of root), fall back to building explicitly in CI: add a `npm ci && npm run build` step (working-directory `web`) to the `deploy` job of `deploy-client.yml` **before** `vercel build`, and remove `buildCommand` from `vercel.json`. Re-push and re-verify.

---

## Self-Review

**Spec coverage:**
- Approach A (tsc type-strip, no bundler) → Tasks 1–9. ✓
- Emit-in-place, gitignored → Task 1 (.gitignore), all migration tasks. ✓
- Go server / index.html / Playwright / Vercel static unchanged → enforced by "Untouched" list + Task 12 checks. ✓
- Tooling (tsconfig, typescript + pixi types devDeps, Pixi shim) → Task 1. ✓
- Tests on compiled JS, no Node bump → Tasks 8, 10, 12 (Node 20 throughout). ✓
- Cross-language golden parity preserved → Tasks 1, 8, 12 Step 3. ✓
- CI gate + `buildCommand` → Tasks 9, 10. ✓
- Migration order wire→leaves→net/input→render→main→tests→api → Tasks 1–9. ✓
- `api/config.ts` migrated → Task 9. ✓
- Local-dev cost documented → Task 11. ✓
- Risks (erasable syntax, Vercel buildCommand, gitignore/incremental overlap) → addressed via erasableSyntaxOnly, Task 12 Step 7 fallback, leaf-first + per-task `git rm`. ✓

**Type consistency:** `ServerMsg`/`Welcome`/`Snapshot`/`Enter`/`Leave`/`Pong`/`SnapshotEnt` (wire.ts) ↔ `Handlers` (net.ts) ↔ handler literal (main.ts) align. `Token` (render.ts), `Bounds`/`Vec2`/`Input` (input.ts), `ScreenPoint` (iso.ts), `Renderer`/`NetControl` consistent across consumers. **Correction baked into Task 7 Step 2:** `Token` is exported by `render.ts`, not `input.ts` — the import block must be `import type { Bounds } from './input.js'` + `import type { Token } from './render.js'`.

**Placeholder scan:** no TBD/TODO; every code step has full content; Task 11 Step 3 uses a `grep` discovery (path varies by repo) with explicit edit intent rather than a guessed path.
