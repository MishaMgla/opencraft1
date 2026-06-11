import { Application, Container, Graphics, Text } from 'https://cdn.jsdelivr.net/npm/pixi.js@8.19.0/dist/pixi.min.mjs';
import { worldToScreen, depth, KX, KY } from './iso.js';

const GROUND_STEP = 128; // world units between iso floor tiles

function makeToken(name, color) {
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

export async function createRenderer() {
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
      const token = { container, rx: x, ry: y, tx: x, ty: y };
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
