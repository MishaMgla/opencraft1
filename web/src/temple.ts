// Fixed server-owned landmarks (the soviet-eclectic building set). World -Y
// reads as northeast under the isometric camera; footprints extend east (+X)
// and northeast (-Y) from the southwest tile center. MUST mirror the
// `landmarks` table in internal/world/sim.go — the server enforces the same
// collision independently.
export const TEMPLE_TILE_SIZE = 128;

export interface Landmark {
  name: string; // manifest sprite: tile:<name>
  swX: number;  // southwest tile center
  swY: number;
  w: number;    // tiles east (+X)
  h: number;    // tiles northeast (-Y)
}

export const LANDMARKS: Landmark[] = [
  { name: 'landmark-panelka-deity', swX: 2048, swY: 2048 - 2 * TEMPLE_TILE_SIZE, w: 2, h: 2 },
];

function tileCoord(value: number): number {
  return Math.round(value / TEMPLE_TILE_SIZE) * TEMPLE_TILE_SIZE;
}

// isTemplePosition reports whether a world point falls on ANY landmark tile
// (name kept from the single-temple era; all call sites mean "blocked").
export function isTemplePosition(x: number, y: number): boolean {
  const tileX = tileCoord(x);
  const tileY = tileCoord(y);
  return LANDMARKS.some((l) =>
    tileX >= l.swX && tileX < l.swX + l.w * TEMPLE_TILE_SIZE &&
    tileY <= l.swY && tileY > l.swY - l.h * TEMPLE_TILE_SIZE);
}
