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
