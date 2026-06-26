import { connect } from './net.js';
import { createInput } from './input.js';
import { createRenderer } from './render.js';
import { resolveWsUrl } from './config.js';
import { loadManifest, resolveHud, assetUrl } from './assets.js';
import type { Bounds } from './input.js';
import type { Token } from './render.js';

const MOVE_SPEED = 600; // world units / second
const INPUT_HZ = 15;
const ZOOM_STEP = 0.1;
const MIN_ZOOM = 0.5;
const MAX_ZOOM = 1.5;

document.getElementById('name-form')!.addEventListener('submit', async (e) => {
  e.preventDefault();
  const name = (document.getElementById('name') as HTMLInputElement).value.trim() || 'anon';
  document.getElementById('overlay')!.style.display = 'none';
  await start(name);
});

async function start(name: string): Promise<void> {
  const manifest = await loadManifest();
  const hudAsset = document.getElementById('hud-asset') as HTMLImageElement | null;
  const bar = resolveHud(manifest, 'healthbar');
  if (hudAsset && bar) { hudAsset.src = assetUrl(bar.file); hudAsset.style.display = 'block'; }
  const r = await createRenderer(manifest);
  const input = createInput();
  const hudStatus = document.getElementById('hud-status')!;
  const zoomOutButton = document.getElementById('zoom-out') as HTMLButtonElement;
  const zoomInButton = document.getElementById('zoom-in') as HTMLButtonElement;
  let zoom = 1;

  function setZoom(nextZoom: number): void {
    zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Number(nextZoom.toFixed(2))));
    r.setZoom(zoom);
    zoomOutButton.disabled = zoom <= MIN_ZOOM;
    zoomInButton.disabled = zoom >= MAX_ZOOM;
  }

  zoomOutButton.addEventListener('click', () => setZoom(zoom - ZOOM_STEP));
  zoomInButton.addEventListener('click', () => setZoom(zoom + ZOOM_STEP));
  setZoom(zoom);

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
      // Adopt the server's spawn position (restored for returning players, else
      // world center). Must happen before we stream input — the loop gates
      // sendInput on me.id so no frame leaves until this runs.
      me.x = m.x;
      me.y = m.y;
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
    paint(m) {
      r.paintTile(m.x, m.y, m.color);
    },
    shake(m) {
      if (m.id === me.id) {
        r.shakeLocal();
        return;
      }
      const o = others.get(m.id);
      if (o) r.shakeToken(o);
    },
  });

  let last = performance.now();
  let acc = 0;
  r.app.ticker.add(() => {
    const now = performance.now();
    const dt = (now - last) / 1000;
    last = now;

    input.step(me, MOVE_SPEED, dt, bounds);
    if (me.id !== 0 && input.consumePaint()) {
      net.sendInput(Math.round(me.x), Math.round(me.y));
      net.sendPaint();
    }
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
      // Don't stream input until Welcome has set our id + spawn position, or the
      // first frames would overwrite a returning player's restored position.
      if (me.id !== 0) net.sendInput(Math.round(me.x), Math.round(me.y));
    }

    hudStatus.textContent = `${name} · players nearby: ${others.size}`;
  });
}
