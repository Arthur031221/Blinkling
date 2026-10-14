/** A long page becomes a few readable tiles instead of one squeezed image. */
export const TILE_EDGE = 4096; // the bridge's long-edge cap
export const TILE_MIN_HEIGHT = 1568; // tall enough to stay unscaled by the model
export const MAX_TILES = 8; // the composer's attachment limit

export type TilePlan = {
  /** Image pixels per CSS pixel; at least 1 unless the page is wider than the cap. */
  scale: number;
  /** Height of every tile but the last, in CSS pixels. */
  tileHeight: number;
  count: number;
  /** Rows actually captured, in CSS pixels. */
  capturedHeight: number;
  /** The page is longer than MAX_TILES tiles can hold; the end is left out. */
  truncated: boolean;
};

export function planTiles(
  width: number,
  height: number,
  devicePixelRatio = 1,
): TilePlan {
  const scale = Math.min(
    Math.max(1, Math.min(2, devicePixelRatio || 1)),
    TILE_EDGE / width,
  );
  const wanted = Math.ceil((height * scale) / MAX_TILES);
  const tileHeight = Math.max(
    1,
    Math.floor(Math.min(TILE_EDGE, Math.max(TILE_MIN_HEIGHT, wanted)) / scale),
  );
  const count = Math.min(MAX_TILES, Math.ceil(height / tileHeight));
  const capturedHeight = Math.min(height, count * tileHeight);
  return {
    scale,
    tileHeight,
    count,
    capturedHeight,
    truncated: capturedHeight < height,
  };
}
