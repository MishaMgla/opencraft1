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
  consumePaint(): boolean;
}

type KeyboardTarget = Pick<Window, 'addEventListener'>;

function isPaintKey(e: KeyboardEvent): boolean {
  return e.code === 'Space' || e.key === ' ' || e.key === 'Spacebar';
}

export function createInput(target: KeyboardTarget = window): Input {
  const keys: Record<string, boolean> = Object.create(null);
  let paintRequested = false;
  target.addEventListener(
    'keydown',
    (e) => {
      if (isPaintKey(e)) {
        e.preventDefault();
        if (!e.repeat) paintRequested = true;
        return;
      }
      keys[e.key.toLowerCase()] = true;
    },
    { capture: true },
  );
  target.addEventListener(
    'keyup',
    (e) => {
      if (isPaintKey(e)) {
        e.preventDefault();
        return;
      }
      keys[e.key.toLowerCase()] = false;
    },
    { capture: true },
  );

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
    consumePaint() {
      if (!paintRequested) return false;
      paintRequested = false;
      return true;
    },
  };
}
