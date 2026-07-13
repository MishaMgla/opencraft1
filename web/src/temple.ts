// Fixed server-owned temple landmark. World -Y reads as northeast under the
// isometric camera, so the nearest (southwest) temple tile sits two -Y steps
// from spawn and leaves the tile between them clear.
export const TEMPLE_TILE_SIZE = 128;
export const TEMPLE_SIZE = 3;
export const TEMPLE_SOUTHWEST_X = 2048;
export const TEMPLE_SOUTHWEST_Y = 2048 - 2 * TEMPLE_TILE_SIZE;
export const TEMPLE_CENTER_X = TEMPLE_SOUTHWEST_X + TEMPLE_TILE_SIZE;
export const TEMPLE_CENTER_Y = TEMPLE_SOUTHWEST_Y - TEMPLE_TILE_SIZE;
export const TEMPLE_FRONT_X = TEMPLE_SOUTHWEST_X + (TEMPLE_SIZE - 1) * TEMPLE_TILE_SIZE;
export const TEMPLE_FRONT_Y = TEMPLE_SOUTHWEST_Y;
export const TEMPLE_IDLE_NAMES = [
  'temple-idle-0',
  'temple-idle-1',
  'temple-idle-2',
  'temple-idle-3',
] as const;

function tileCoord(value: number): number {
  return Math.round(value / TEMPLE_TILE_SIZE) * TEMPLE_TILE_SIZE;
}

export function isTemplePosition(x: number, y: number): boolean {
  const tileX = tileCoord(x);
  const tileY = tileCoord(y);
  return tileX >= TEMPLE_SOUTHWEST_X &&
    tileX < TEMPLE_SOUTHWEST_X + TEMPLE_SIZE * TEMPLE_TILE_SIZE &&
    tileY <= TEMPLE_SOUTHWEST_Y &&
    tileY > TEMPLE_SOUTHWEST_Y - TEMPLE_SIZE * TEMPLE_TILE_SIZE;
}
