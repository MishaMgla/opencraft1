import { connect } from './net.js';
import { createInput } from './input.js';
import { createRenderer } from './render.js';

const MOVE_SPEED = 600; // world units / second
const INPUT_HZ = 15;

document.getElementById('name-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const name = document.getElementById('name').value.trim() || 'anon';
  document.getElementById('overlay').style.display = 'none';
  await start(name);
});

async function start(name) {
  const r = await createRenderer();
  const input = createInput();
  const hud = document.getElementById('hud');

  const me = { id: 0, x: 2048, y: 2048 };
  const bounds = { minX: 0, minY: 0, maxX: 4095, maxY: 4095 };
  const others = new Map();

  // E2E test hook (inert in prod). These objects are mutated in place by the
  // game loop, so exposing the references once is enough for a test to read
  // live state. Enabled by an init script that sets window.__E2E before load.
  if (window.__E2E) window.__game = { me, others, bounds };

  const net = connect(`ws://${location.host}/ws`, name, {
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
