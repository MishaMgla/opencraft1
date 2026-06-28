import { Application, Container, Graphics, Text, Sprite, Texture } from 'https://cdn.jsdelivr.net/npm/pixi.js@8.19.0/dist/pixi.min.mjs';
import { worldToScreen, depth, KX, KY } from './iso.js';
import { resolveTile, loadTexture, resolveCharacter, resolveEffect, assetUrl, type Manifest } from './assets.js';

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

const PAINT_TILE_BY_COLOR = new Map<number, string>([
  [0xe6194b, 'lava-tile'],
  [0x3cb44b, 'grass-tile'],
  [0xffe119, 'sand-tile'],
  [0x4363d8, 'water-tile'],
  [0xf58231, 'copper-tile'],
  [0x911eb4, 'crystal-tile'],
  [0x46f0f0, 'ice-tile'],
  [0xf032e6, 'flowers-tile'],
]);

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

// Animated character skin. Textures are preloaded once in setSkin so the
// per-frame tick is a synchronous texture swap (no async in the render loop).
interface SkinState {
  sprite: Sprite;
  fps: number;
  idle: Record<string, Texture>;          // facing -> still
  walk: Record<string, Texture[]> | null; // facing -> walk frames (null if none)
  anchorY: Record<string, number>;        // facing -> per-texture feet anchor (normalized)
  dir: string;                            // current facing (always a key present in `idle`)
  frame: number;                          // walk frame cursor
  acc: number;                            // ms accumulator toward the next frame
  last: number;                           // performance.now() at last tick
  prevX: number;                          // last sampled world pos (movement detection)
  prevY: number;
}

const SKIN_MOVE_EPS = 0.5; // world units; below this a token is "stationary" (idle pose)
const SKIN_FALLBACK_WALK_FPS = 8;
const SKIN_FALLBACK_WALK_BOB = 3;
const SKIN_FALLBACK_WALK_SWAY = 0.06;
const SKIN_FALLBACK_ANCHOR_Y = 0.9; // used when feet detection can't run

// Movement -> the iso-diagonal facing the character should show. Under this
// camera (iso.ts): world +X is screen south-east, +Y south-west, -X north-west,
// -Y north-east. The horse art is generated as those four diagonal (ordinal)
// facings, so the chosen facing matches the on-screen travel direction.
function dirOf(dvx: number, dvy: number): string {
  return Math.abs(dvx) > Math.abs(dvy)
    ? (dvx >= 0 ? 'south-east' : 'north-west')
    : (dvy >= 0 ? 'south-west' : 'north-east');
}

// Legacy fallback: older horse art shipped four CARDINAL slots. If a manifest
// only has cardinal facings, map the desired ordinal onto the nearest cardinal
// so pre-regeneration art still renders.
const ORDINAL_TO_CARDINAL: Record<string, string> = {
  'north-east': 'north', 'south-east': 'east', 'south-west': 'south', 'north-west': 'west',
};

// Resolve a desired facing against the facings actually present in the art.
function resolveFacing(available: Record<string, unknown>, want: string): string {
  if (available[want]) return want;
  const card = ORDINAL_TO_CARDINAL[want];
  if (card && available[card]) return card;
  if (available.south) return 'south';        // legacy default
  return Object.keys(available)[0];
}

// Feet detection: scan a sprite PNG's alpha for the lowest mostly-opaque row so
// the renderer grounds the character on the tile regardless of the transparent
// padding the generator leaves below the body. Cached per file — decodes the
// image once via an offscreen 2D canvas. Our PNGs are same-origin, so
// getImageData never taints. Returns a normalized anchor.y (feet row / height).
const feetAnchorCache = new Map<string, number>();
async function feetAnchorY(file: string): Promise<number> {
  const cached = feetAnchorCache.get(file);
  if (cached !== undefined) return cached;
  let anchor = SKIN_FALLBACK_ANCHOR_Y;
  try {
    const img = new Image();
    img.src = assetUrl(file);
    await img.decode();
    const w = img.naturalWidth, h = img.naturalHeight;
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (ctx && w && h) {
      ctx.drawImage(img, 0, 0);
      const data = ctx.getImageData(0, 0, w, h).data;
      const ALPHA = 24;                                    // ignore near-transparent fringe
      const minPixels = Math.max(2, Math.floor(w * 0.03)); // ignore sparse stray rows
      for (let y = h - 1; y >= 0; y--) {
        let count = 0;
        const row = y * w * 4;
        for (let x = 0; x < w; x++) { if (data[row + x * 4 + 3] > ALPHA) count++; }
        if (count >= minPixels) { anchor = (y + 1) / h; break; }
      }
    }
  } catch { /* keep fallback */ }
  feetAnchorCache.set(file, anchor);
  return anchor;
}

// Advance a token's character animation one frame: walk-cycle while moving,
// idle still when stationary, facing the latest movement direction.
function tickSkin(token: Token): void {
  const s = token.skin;
  if (!s) return;
  const dvx = token.rx - s.prevX, dvy = token.ry - s.prevY;
  s.prevX = token.rx; s.prevY = token.ry;
  const now = performance.now();
  const moving = Math.hypot(dvx, dvy) > SKIN_MOVE_EPS;
  if (moving) s.dir = resolveFacing(s.idle, dirOf(dvx, dvy));
  // Ground every facing on the tile: anchor.y at the facing's detected feet row.
  s.sprite.anchor.set(0.5, s.anchorY[s.dir] ?? SKIN_FALLBACK_ANCHOR_Y);
  const seq = moving && s.walk ? s.walk[s.dir] : null;
  if (seq && seq.length) {
    s.acc += now - s.last;
    const stepMs = 1000 / (s.fps || 12);
    while (s.acc >= stepMs) { s.acc -= stepMs; s.frame++; }
    s.sprite.texture = seq[s.frame % seq.length];
    s.sprite.y = 0;
    s.sprite.rotation = 0;
  } else {
    s.sprite.texture = s.idle[s.dir] ?? s.idle.south;
    if (moving) {
      s.acc += now - s.last;
      const stepMs = 1000 / SKIN_FALLBACK_WALK_FPS;
      while (s.acc >= stepMs) { s.acc -= stepMs; s.frame++; }
      const phase = (s.frame % 2) === 0 ? 1 : -1;
      s.sprite.y = phase > 0 ? -SKIN_FALLBACK_WALK_BOB : 0;
      s.sprite.rotation = SKIN_FALLBACK_WALK_SWAY * phase;
    } else {
      s.frame = 0; s.acc = 0;
      s.sprite.y = 0;
      s.sprite.rotation = 0;
    }
  }
  s.last = now;
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
  skin?: SkinState;
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
  skinLocal(name: string): Promise<void>;
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
  const paintedTiles = new Map<string, Container | Graphics>();
  const tileSprites = new Map<string, Sprite>();
  const paintTileTextures = new Map<string, Texture>();

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

  await Promise.all([...PAINT_TILE_BY_COLOR.values()].map(async (name) => {
    const tile = resolveTile(manifest, name);
    if (!tile) return;
    const tex = await loadTexture(tile.file);
    if (tex) paintTileTextures.set(name, tex);
  }));

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
    tickSkin(token); // walk-cycle / idle swap, driven by movement since last frame
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

  function removePaintedTile(key: string): void {
    const tile = paintedTiles.get(key);
    if (tile) {
      world.removeChild(tile);
      tile.destroy({ children: true });
      paintedTiles.delete(key);
    }
    const sprite = tileSprites.get(key);
    if (sprite) {
      world.removeChild(sprite);
      sprite.destroy();
      tileSprites.delete(key);
    }
  }

  function drawFallbackPaintTile(x: number, y: number, color: number): Graphics {
    const c = worldToScreen(x, y);
    const tile = drawIsoDiamond(new Graphics(), c.x, c.y, hw, hh, color, 0.82, 0xfff2a8, 0.85, 2);
    drawIsoDiamond(tile, c.x, c.y, hw - 6, hh - 3, color, 0, 0x07110f, 0.5, 1);
    tile.zIndex = depth(x, y) - 500_000;
    return tile;
  }

  function drawTexturedPaintTile(x: number, y: number, color: number, tex: Texture): Container {
    const c = worldToScreen(x, y);
    const tile = new Container();
    const underlay = drawIsoDiamond(new Graphics(), c.x, c.y, hw, hh, color, 0.88, 0xfff2a8, 0.75, 2);
    const sprite = new Sprite(tex);
    sprite.anchor.set(0.5, 0.5);
    sprite.x = c.x;
    sprite.y = c.y;
    sprite.width = hw * 2;
    sprite.height = hh * 2;
    const mask = drawIsoDiamond(new Graphics(), c.x, c.y, hw - 1, hh - 1, 0xffffff, 1, 0xffffff, 0, 0);
    sprite.mask = mask;
    const outline = drawIsoDiamond(new Graphics(), c.x, c.y, hw, hh, 0xffffff, 0, 0xfff2a8, 0.85, 2);
    tile.addChild(underlay, sprite, mask, outline);
    tile.zIndex = depth(x, y) - 500_000;
    return tile;
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
      removePaintedTile(key);
      const tileName = PAINT_TILE_BY_COLOR.get(color);
      const texture = tileName ? paintTileTextures.get(tileName) : undefined;
      const tile = texture ? drawTexturedPaintTile(x, y, color, texture) : drawFallbackPaintTile(x, y, color);
      paintedTiles.set(key, tile);
      world.addChild(tile);
    },
    async placeTile(this: Renderer, x, y, name) {
      const tile = resolveTile(manifest, name);
      if (!tile) { this.paintTile(x, y, 0x3a4757); return; } // fallback: neutral diamond
      const tex: Texture | null = await loadTexture(tile.file);
      if (!tex) { this.paintTile(x, y, 0x3a4757); return; }
      const key = tileKey(x, y);
      removePaintedTile(key);
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
      // Preload every texture up front so the per-frame tick is a pure swap.
      const dirs = Object.keys(ch.frames);
      const idle: Record<string, Texture> = {};
      await Promise.all(dirs.map(async (d) => {
        const tex = await loadTexture(ch.frames[d]);
        if (tex) idle[d] = tex;
      }));
      if (!idle.south && !Object.keys(idle).length) return; // nothing loaded; keep procedural

      // Walk-cycle frames (prefer 'walk', else the first defined animation).
      const animDef = ch.animations?.walk ?? (ch.animations ? Object.values(ch.animations)[0] : undefined);
      let walk: Record<string, Texture[]> | null = null;
      let fps = 12;
      if (animDef) {
        fps = animDef.fps || 12;
        walk = {};
        await Promise.all(Object.entries(animDef.frames).map(async ([d, files]) => {
          const texes = (await Promise.all(files.map((f) => loadTexture(f)))).filter((t): t is Texture => !!t);
          if (texes.length) walk![d] = texes;
        }));
        if (!Object.keys(walk).length) walk = null;
      }

      // Per-facing feet anchor so each idle still sits on the tile (no hover);
      // detected once from each PNG's alpha, defaulting to the manifest anchor.
      const anchorY: Record<string, number> = {};
      await Promise.all(Object.keys(idle).map(async (d) => {
        anchorY[d] = await feetAnchorY(ch.frames[d]);
      }));

      const dvx = token.tx - token.rx, dvy = token.ty - token.ry;
      const startDir = resolveFacing(idle, dirOf(dvx, dvy));
      const sprite = new Sprite(idle[startDir]);
      sprite.anchor.set(0.5, anchorY[startDir] ?? ch.anchor.y);
      // Replace the procedural body (a Graphics in `avatar`) with the sprite AND
      // drop the procedural token shadow (a Graphics in `container`) so a skinned
      // horse isn't doubled with a detached gray rect underneath it — the
      // renderer grounds the sprite itself via the feet anchor above.
      for (const child of [...token.avatar.children]) {
        if (child instanceof Graphics) { token.avatar.removeChild(child); child.destroy(); }
      }
      for (const child of [...token.container.children]) {
        if (child instanceof Graphics) { token.container.removeChild(child); child.destroy(); }
      }
      token.avatar.addChildAt(sprite, 0);
      // Lift the name label clear above the sprite's tallest facing (a horse is
      // far taller than the procedural token the default label.y was sized for).
      const texH = idle[startDir].height || 0;
      const topAnchor = Math.max(...Object.values(anchorY), ch.anchor.y);
      token.label.y = -Math.round(topAnchor * texH) - 4;
      token.skin = {
        sprite, fps, idle, walk, anchorY, dir: startDir, frame: 0, acc: 0,
        last: performance.now(), prevX: token.rx, prevY: token.ry,
      };
    },
    skinLocal(this: Renderer, name) {
      return this.setSkin(localToken, name);
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
