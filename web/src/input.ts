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
  setMoveDestination(destination: Vec2, bounds: Bounds): boolean;
  clearMoveDestination(): void;
  requestPaint(held?: boolean): void;
  releasePaint(): void;
  requestUlt(): void;
  requestJump(): void;
  requestBomb(): void;
  consumePaint(): boolean;
  isPaintHeld(): boolean;
  consumeUlt(): boolean;
  consumeJump(): boolean;
  consumeBomb(): boolean;
}

type KeyboardTarget = Pick<Window, 'addEventListener'>;

function isPaintKey(e: KeyboardEvent): boolean {
  return e.code === 'KeyF' || e.key.toLowerCase() === 'f';
}

function isJumpKey(e: KeyboardEvent): boolean {
  return e.code === 'Space' || e.key === ' ' || e.key === 'Spacebar';
}

function isUltKey(e: KeyboardEvent): boolean {
  return e.code === 'KeyE' || e.key.toLowerCase() === 'e';
}

function isBombKey(e: KeyboardEvent): boolean {
  return e.code === 'KeyB' || e.key.toLowerCase() === 'b';
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

function inBounds(pos: Vec2, bounds: Bounds): boolean {
  return pos.x >= bounds.minX && pos.x <= bounds.maxX && pos.y >= bounds.minY && pos.y <= bounds.maxY;
}

export function createInput(target: KeyboardTarget = window): Input {
  const keys: Record<string, boolean> = Object.create(null);
  let paintRequested = false;
  let paintHeld = false;
  let ultRequested = false;
  let jumpRequested = false;
  let bombRequested = false;
  let moveDestination: Vec2 | null = null;

  function requestPaint(held = false): void {
    paintRequested = true;
    if (held) paintHeld = true;
  }

  function releasePaint(): void {
    paintHeld = false;
  }

  function requestUlt(): void {
    ultRequested = true;
  }

  function requestJump(): void {
    jumpRequested = true;
  }

  function requestBomb(): void {
    bombRequested = true;
  }

  target.addEventListener(
    'keydown',
    (e) => {
      if (isPaintKey(e)) {
        e.preventDefault();
        if (!e.repeat) requestPaint(true);
        else paintHeld = true;
        return;
      }
      if (isJumpKey(e)) {
        e.preventDefault();
        if (!e.repeat) requestJump();
        return;
      }
      if (isUltKey(e)) {
        e.preventDefault();
        if (!e.repeat) requestUlt();
        return;
      }
      if (isBombKey(e)) {
        e.preventDefault();
        if (!e.repeat) requestBomb();
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
        releasePaint();
        return;
      }
      if (isJumpKey(e)) {
        e.preventDefault();
        return;
      }
      if (isUltKey(e)) {
        e.preventDefault();
        return;
      }
      if (isBombKey(e)) {
        e.preventDefault();
        return;
      }
      keys[e.key.toLowerCase()] = false;
    },
    { capture: true },
  );

  return {
    step(pos, speed, dt, bounds) {
      let dx = 0;
      let dy = 0;
      if (keys['w'] || keys['arrowup']) dy -= 1;
      if (keys['s'] || keys['arrowdown']) dy += 1;
      if (keys['a'] || keys['arrowleft']) dx -= 1;
      if (keys['d'] || keys['arrowright']) dx += 1;
      if (dx !== 0 || dy !== 0) {
        moveDestination = null;
        const len = Math.hypot(dx, dy);
        dx /= len;
        dy /= len;
        pos.x = clamp(pos.x + dx * speed * dt, bounds.minX, bounds.maxX);
        pos.y = clamp(pos.y + dy * speed * dt, bounds.minY, bounds.maxY);
        return true;
      }
      if (moveDestination) {
        if (!inBounds(moveDestination, bounds)) {
          moveDestination = null;
          return false;
        }
        const tx = moveDestination.x - pos.x;
        const ty = moveDestination.y - pos.y;
        const dist = Math.hypot(tx, ty);
        const stepDist = speed * dt;
        if (dist <= Math.max(stepDist, 1)) {
          const moved = Math.hypot(pos.x - moveDestination.x, pos.y - moveDestination.y) > 0;
          pos.x = moveDestination.x;
          pos.y = moveDestination.y;
          moveDestination = null;
          return moved;
        }
        pos.x = clamp(pos.x + (tx / dist) * stepDist, bounds.minX, bounds.maxX);
        pos.y = clamp(pos.y + (ty / dist) * stepDist, bounds.minY, bounds.maxY);
        return true;
      }
      return false;
    },
    setMoveDestination(destination, bounds) {
      if (!inBounds(destination, bounds)) {
        moveDestination = null;
        return false;
      }
      moveDestination = { x: destination.x, y: destination.y };
      return true;
    },
    clearMoveDestination() {
      moveDestination = null;
    },
    requestPaint,
    releasePaint,
    requestUlt,
    requestJump,
    requestBomb,
    consumePaint() {
      if (!paintRequested) return false;
      paintRequested = false;
      return true;
    },
    isPaintHeld() {
      return paintHeld;
    },
    consumeUlt() {
      if (!ultRequested) return false;
      ultRequested = false;
      return true;
    },
    consumeJump() {
      if (!jumpRequested) return false;
      jumpRequested = false;
      return true;
    },
    consumeBomb() {
      if (!bombRequested) return false;
      bombRequested = false;
      return true;
    },
  };
}
