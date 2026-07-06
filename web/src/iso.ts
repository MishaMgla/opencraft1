// Isometric projection. The server is projection-agnostic (flat world units);
// this is the only place that knows the camera is isometric.

// Pixels per world unit along each screen axis. Classic 2:1 iso => KX = 2*KY.
export const KX = 0.5;
export const KY = 0.25;

export interface ScreenPoint {
  x: number;
  y: number;
}

// world (wx, wy) -> screen pixels, before camera offset.
export function worldToScreen(wx: number, wy: number): ScreenPoint {
  return { x: (wx - wy) * KX, y: (wx + wy) * KY };
}

// screen pixels, before camera offset -> world (wx, wy).
export function screenToWorld(sx: number, sy: number): ScreenPoint {
  const xPart = sx / KX;
  const yPart = sy / KY;
  return { x: (xPart + yPart) / 2, y: (yPart - xPart) / 2 };
}

// Painter's-order depth: things further "south-east" in the world draw on top.
export function depth(wx: number, wy: number): number {
  return wx + wy;
}
