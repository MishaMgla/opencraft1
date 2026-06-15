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

// Painter's-order depth: things further "south-east" in the world draw on top.
export function depth(wx: number, wy: number): number {
  return wx + wy;
}
