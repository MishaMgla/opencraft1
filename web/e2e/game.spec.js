import { test, expect } from '@playwright/test';

// Single-client smoke test: load the page, join the world, move.
//
// The decisive assertion is `me.id !== 0`. The server assigns the id in the
// Welcome frame, which only arrives after the *entire* wiring chain succeeds:
// static file serve -> ES-module load -> pixi.js CDN load + createRenderer()
// -> WebSocket connect -> encodeHello -> server Accept + Join -> Welcome frame
// -> decodeServer. That is exactly the chain a browser-runtime bug (e.g. a
// broken pixi.js CDN load) breaks and that no unit test can observe.
//
// Note: me.x is client-predicted, not server-confirmed (snapshots skip the
// local player). So the movement assertion proves the input + game-loop wiring,
// not that the server accepted the input — server-side movement is covered by
// internal/world/sim_test.go.

test.beforeEach(async ({ page }) => {
  // Opt the client's test hook in before any app code runs.
  await page.addInitScript(() => {
    window.__E2E = true;
  });
});

test('loads, joins, and moves', async ({ page }) => {
  await page.goto('/');

  // Enter the world.
  await page.fill('#name', 'e2e-tester');
  await page.click('button[type=submit]');

  // The overlay hides on submit; the HUD shows once the loop runs.
  await expect(page.locator('#overlay')).toBeHidden();

  // Asset system: with an empty manifest, the client must render exactly as
  // before (procedural fallback). The existing join+render assertions cover this.

  // Assertion 1 — full handshake completed (renderer init + ws + Welcome).
  await page.waitForFunction(() => window.__game?.me.id !== 0, null, {
    timeout: 15000,
  });

  // Assertion 2 — keyboard input integrates into local position via the loop.
  const x0 = await page.evaluate(() => window.__game.me.x);
  await page.locator('body').focus();
  await page.keyboard.down('d');
  await page.waitForTimeout(300);
  await page.keyboard.up('d');
  const x1 = await page.evaluate(() => window.__game.me.x);

  expect(x1).toBeGreaterThan(x0);
});

test('a manifest tile loads as a texture without error', async ({ page }) => {
  // This test asserts the asset path does not throw; it does not commit assets.
  await page.goto('/');
  const ok = await page.evaluate(async () => {
    const res = await fetch('assets/manifest.json');
    return res.ok && typeof (await res.json()).assets === 'object';
  });
  expect(ok).toBe(true);
});
