import { Application, Container, Graphics, Text, Sprite, Texture } from 'https://cdn.jsdelivr.net/npm/pixi.js@8.19.0/dist/pixi.min.mjs';
import { worldToScreen, depth, KX, KY } from './iso.js';
import { resolveTile, loadTexture, resolveCharacter, resolveEffect, type Manifest } from './assets.js';

const GROUND_STEP = 128; // world units between iso floor tiles
const WORLD_SIZE = 8192;
const SHAKE_DURATION_MS = 350;
const SHAKE_AMPLITUDE = 7;
const JUMP_DURATION_MS = 420;
const JUMP_HEIGHT = 30;
const REMOTE_LABEL_COLOR = 0xd9f2e6;
const LOCAL_LABEL_COLOR = 0xfff2a8;
const WORLD_BG = '#07110f';
const TILE_DARK = 0x0b1d18;
const TILE_LIGHT = 0x102821;
const TILE_EDGE = 0x3ddc84;
const TILE_MAJOR_EDGE = 0xf2cf5b;
const MARKER_OUTLINE = 0xfff2a8;
const MARKER_SHADOW = 0x020605;

function drawIsoDiamond(
  graphics: Graphics,
  cx: number,
  cy: number,
  hw: number,
  hh: number,
  fillColor: number,
  fillAlpha: number,
  strokeColor: number,
  strokeAlpha: number,
  strokeWidth: number,
): Graphics {
  return graphics
    .moveTo(cx, cy - hh)
    .lineTo(cx + hw, cy)
    .lineTo(cx, cy + hh)
    .lineTo(cx - hw, cy)
    .lineTo(cx, cy - hh)
    .fill({ color: fillColor, alpha: fillAlpha })
    .stroke({ color: strokeColor, alpha: strokeAlpha, width: strokeWidth });
}

function makeToken(name: string, color: number, labelColor = REMOTE_LABEL_COLOR): { container: Container; avatar: Container; label: Text } {
  const container = new Container();
  const avatar = new Container();

  const shadow = new Graphics()
    .rect(-12, 4, 24, 8)
    .fill({ color: MARKER_SHADOW, alpha: 0.65 });
  const body = new Graphics()
    .rect(-9, -13, 18, 18)
    .fill({ color })
    .stroke({ color: MARKER_OUTLINE, width: 2 })
    .rect(-4, -8, 8, 8)
    .fill({ color: MARKER_OUTLINE, alpha: 0.9 });
  const label = new Text({
    text: name,
    style: {
      fill: labelColor,
      fontFamily: '"Courier New", monospace',
      fontSize: 11,
      fontWeight: '700',
      align: 'center',
    },
  });
  label.anchor.set(0.5, 1);
  label.y = -17;

  avatar.addChild(body, label);
  container.addChild(shadow, avatar);
  return { container, avatar, label };
}

export interface Token {
  container: Container;
  avatar: Container;
  label: Text;
  rx: number;
  ry: number;
  tx: number;
  ty: number;
  shakeStartedAt: number;
  shakeUntil: number;
  jumpStartedAt: number;
  jumpUntil: number;
}

export interface Renderer {
  app: Application;
  addToken(id: number, name: string, color: number, x: number, y: number): Token;
  removeToken(token: Token): void;
  placeToken(token: Token): void;
  setLocal(x: number, y: number): void;
  paintTile(x: number, y: number, color: number): void;
  placeTile(x: number, y: number, name: string): Promise<void>;
  shakeLocal(): void;
  shakeToken(token: Token): void;
  jumpLocal(): void;
  jumpToken(token: Token): void;
  setLocalName(name: string): void;
  setZoom(scale: number): void;
  centerCamera(x: number, y: number): void;
  setSkin(token: Token, name: string): Promise<void>;
  playEffect(x: number, y: number, name: string): void;
}

function makeTokenState(container: Container, avatar: Container, label: Text, x: number, y: number): Token {
  return {
    container,
    avatar,
    label,
    rx: x,
    ry: y,
    tx: x,
    ty: y,
    shakeStartedAt: 0,
    shakeUntil: 0,
    jumpStartedAt: 0,
    jumpUntil: 0,
  };
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

function jumpOffset(token: Token): number {
  const now = performance.now();
  if (now >= token.jumpUntil) return 0;
  const t = (now - token.jumpStartedAt) / JUMP_DURATION_MS;
  return Math.sin(t * Math.PI) * JUMP_HEIGHT;
}

export async function createRenderer(manifest: Manifest): Promise<Renderer> {
  const app = new Application();
  await app.init({
    background: WORLD_BG,
    resizeTo: window,
    antialias: false,
    autoDensity: true,
    resolution: Math.max(1, Math.floor(window.devicePixelRatio || 1)),
  });
  app.canvas.style.imageRendering = 'pixelated';
  document.body.appendChild(app.canvas);

  const world = new Container();
  world.sortableChildren = true;
  app.stage.addChild(world);
  const paintedTiles = new Map<string, Graphics>();
  const tileSprites = new Map<string, Sprite>();

  // Static isometric floor.
  const ground = new Graphics();
  const hw = KX * GROUND_STEP;
  const hh = KY * GROUND_STEP;
  for (let wx = 0; wx <= WORLD_SIZE; wx += GROUND_STEP) {
    for (let wy = 0; wy <= WORLD_SIZE; wy += GROUND_STEP) {
      const c = worldToScreen(wx, wy);
      const major = wx % (GROUND_STEP * 4) === 0 || wy % (GROUND_STEP * 4) === 0;
      drawIsoDiamond(
        ground,
        c.x,
        c.y,
        hw,
        hh,
        (wx / GROUND_STEP + wy / GROUND_STEP) % 2 === 0 ? TILE_DARK : TILE_LIGHT,
        0.9,
        major ? TILE_MAJOR_EDGE : TILE_EDGE,
        major ? 0.32 : 0.2,
        major ? 2 : 1,
      );
    }
  }
  ground.zIndex = -1_000_000;
  world.addChild(ground);

  // Local player token.
  const { container: localContainer, avatar: localAvatar, label: localLabel } = makeToken('you', 0xffffff, LOCAL_LABEL_COLOR);
  world.addChild(localContainer);
  const localToken = makeTokenState(localContainer, localAvatar, localLabel, 0, 0);

  function placeToken(token: Token): void {
    const p = worldToScreen(token.rx, token.ry);
    token.container.x = p.x + shakeOffset(token);
    token.container.y = p.y;
    token.avatar.y = -jumpOffset(token);
    token.container.zIndex = depth(token.rx, token.ry);
  }

  function shakeToken(token: Token): void {
    const now = performance.now();
    token.shakeStartedAt = now;
    token.shakeUntil = now + SHAKE_DURATION_MS;
  }

  function jumpToken(token: Token): void {
    const now = performance.now();
    token.jumpStartedAt = now;
    token.jumpUntil = now + JUMP_DURATION_MS;
  }

  return {
    app,
    addToken(this: Renderer, id: number, name: string, color: number, x: number, y: number) {
      const { container, avatar, label } = makeToken(name, color);
      world.addChild(container);
      const token = makeTokenState(container, avatar, label, x, y);
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
      const tile = drawIsoDiamond(new Graphics(), c.x, c.y, hw, hh, color, 0.82, 0xfff2a8, 0.85, 2);
      drawIsoDiamond(tile, c.x, c.y, hw - 6, hh - 3, color, 0, 0x07110f, 0.5, 1);
      tile.zIndex = depth(x, y) - 500_000;
      paintedTiles.set(key, tile);
      world.addChild(tile);
    },
    async placeTile(this: Renderer, x, y, name) {
      const tile = resolveTile(manifest, name);
      if (!tile) { this.paintTile(x, y, 0x3a4757); return; } // fallback: neutral diamond
      const tex: Texture | null = await loadTexture(tile.file);
      if (!tex) { this.paintTile(x, y, 0x3a4757); return; }
      const key = tileKey(x, y);
      const prev = tileSprites.get(key);
      if (prev) { world.removeChild(prev); prev.destroy(); }
      const c = worldToScreen(x, y);
      const sprite = new Sprite(tex);
      sprite.anchor.set(0.5, 0.5);
      sprite.x = c.x; sprite.y = c.y;
      sprite.width = hw * 2; sprite.height = hh * 2;
      sprite.zIndex = depth(x, y) - 400_000;
      tileSprites.set(key, sprite);
      world.addChild(sprite);
    },
    shakeLocal() {
      shakeToken(localToken);
    },
    shakeToken(token) {
      shakeToken(token);
    },
    jumpLocal() {
      jumpToken(localToken);
    },
    jumpToken(token) {
      jumpToken(token);
    },
    setLocalName(name) {
      localLabel.text = name;
    },
    setZoom(scale) {
      world.scale.set(scale);
    },
    centerCamera(x, y) {
      const p = worldToScreen(x, y);
      world.x = app.screen.width / 2 - p.x * world.scale.x;
      world.y = app.screen.height / 2 - p.y * world.scale.y;
    },
    async setSkin(token, name) {
      const ch = resolveCharacter(manifest, name);
      if (!ch) return; // keep procedural token
      const dx = token.tx - token.rx, dy = token.ty - token.ry;
      const dir = Math.abs(dx) > Math.abs(dy) ? (dx >= 0 ? 'east' : 'west') : (dy >= 0 ? 'south' : 'north');
      const file = ch.frames[dir] ?? ch.frames.south;
      const tex = file ? await loadTexture(file) : null;
      if (!tex) return;
      const sprite = new Sprite(tex);
      sprite.anchor.set(0.5, 0.8);
      token.container.removeChildren();
      token.container.addChild(sprite);
    },
    playEffect(x, y, name) {
      const fx = resolveEffect(manifest, name);
      if (!fx || !fx.frames.length) return;
      const c = worldToScreen(x, y);
      const sprite = new Sprite(Texture.EMPTY);
      sprite.anchor.set(0.5, 0.5);
      sprite.x = c.x; sprite.y = c.y;
      sprite.zIndex = depth(x, y) + 100_000;
      world.addChild(sprite);
      let i = 0;
      const stepMs = 1000 / (fx.fps || 12);
      let acc = 0, last = performance.now();
      const tick = async () => {
        const tex = await loadTexture(fx.frames[i]);
        if (tex) sprite.texture = tex;
        const advance = () => {
          const now = performance.now(); acc += now - last; last = now;
          if (acc >= stepMs) {
            acc = 0; i++;
            app.ticker.remove(advance);                 // remove self BEFORE ending or re-ticking
            if (i >= fx.frames.length) { world.removeChild(sprite); sprite.destroy(); return; }
            tick();
          }
        };
        app.ticker.add(advance);
      };
      tick();
    },
  };
}
