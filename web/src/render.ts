import { Application, Container, Graphics, Text } from 'https://cdn.jsdelivr.net/npm/pixi.js@8.19.0/dist/pixi.min.mjs';
import { worldToScreen, depth, KX, KY } from './iso.js';

const GROUND_STEP = 128; // world units between iso floor tiles
const SHAKE_DURATION_MS = 350;
const SHAKE_AMPLITUDE = 7;

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
  shakeStartedAt: number;
  shakeUntil: number;
}

export interface Renderer {
  app: Application;
  addToken(id: number, name: string, color: number, x: number, y: number): Token;
  removeToken(token: Token): void;
  placeToken(token: Token): void;
  setLocal(x: number, y: number): void;
  paintTile(x: number, y: number, color: number): void;
  shakeLocal(): void;
  shakeToken(token: Token): void;
  centerCamera(x: number, y: number): void;
}

function makeTokenState(container: Container, x: number, y: number): Token {
  return { container, rx: x, ry: y, tx: x, ty: y, shakeStartedAt: 0, shakeUntil: 0 };
}

function tileKey(x: number, y: number): string {
  return `${x},${y}`;
}

function shakeOffset(token: Token): number {
  const now = performance.now();
  if (now >= token.shakeUntil) return 0;
  const age = now - token.shakeStartedAt;
  const decay = 1 - age / SHAKE_DURATION_MS;
  return Math.sin(age * 0.18) * SHAKE_AMPLITUDE * decay;
}

export async function createRenderer(): Promise<Renderer> {
  const app = new Application();
  await app.init({ background: '#11151c', resizeTo: window, antialias: true });
  document.body.appendChild(app.canvas);

  const world = new Container();
  world.sortableChildren = true;
  app.stage.addChild(world);
  const paintedTiles = new Map<string, Graphics>();

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
  const localToken = makeTokenState(localContainer, 0, 0);

  function placeToken(token: Token): void {
    const p = worldToScreen(token.rx, token.ry);
    token.container.x = p.x + shakeOffset(token);
    token.container.y = p.y;
    token.container.zIndex = depth(token.rx, token.ry);
  }

  function shakeToken(token: Token): void {
    const now = performance.now();
    token.shakeStartedAt = now;
    token.shakeUntil = now + SHAKE_DURATION_MS;
  }

  return {
    app,
    addToken(this: Renderer, id: number, name: string, color: number, x: number, y: number) {
      const container = makeToken(name, color);
      world.addChild(container);
      const token = makeTokenState(container, x, y);
      this.placeToken(token);
      return token;
    },
    removeToken(token) {
      world.removeChild(token.container);
      token.container.destroy({ children: true });
    },
    placeToken(token) {
      placeToken(token);
    },
    setLocal(x, y) {
      localToken.rx = x;
      localToken.ry = y;
      localToken.tx = x;
      localToken.ty = y;
      placeToken(localToken);
    },
    paintTile(x, y, color) {
      const key = tileKey(x, y);
      const existing = paintedTiles.get(key);
      if (existing) {
        world.removeChild(existing);
        existing.destroy();
      }
      const c = worldToScreen(x, y);
      const tile = new Graphics()
        .moveTo(c.x, c.y - hh)
        .lineTo(c.x + hw, c.y)
        .lineTo(c.x, c.y + hh)
        .lineTo(c.x - hw, c.y)
        .lineTo(c.x, c.y - hh)
        .fill({ color, alpha: 0.65 })
        .stroke({ color: 0xffffff, alpha: 0.25, width: 1 });
      tile.zIndex = depth(x, y) - 500_000;
      paintedTiles.set(key, tile);
      world.addChild(tile);
    },
    shakeLocal() {
      shakeToken(localToken);
    },
    shakeToken(token) {
      shakeToken(token);
    },
    centerCamera(x, y) {
      const p = worldToScreen(x, y);
      world.x = app.screen.width / 2 - p.x;
      world.y = app.screen.height / 2 - p.y;
    },
  };
}
