import { describe, expect, it } from "vitest";
import { MAX_TILES, TILE_EDGE, planTiles } from "./full-page-tiles";

describe("full-page tile plan", () => {
  it("keeps a short page as a single tile at 1x", () => {
    expect(planTiles(1280, 900)).toMatchObject({
      scale: 1,
      count: 1,
      capturedHeight: 900,
      truncated: false,
    });
  });

  it("splits a long page into tiles of at most the size cap without scaling it down", () => {
    for (const height of [3_000, 12_000, 30_000, 200_000]) {
      const plan = planTiles(1280, height);
      expect(plan.scale).toBeGreaterThanOrEqual(1);
      expect(plan.tileHeight * plan.scale).toBeLessThanOrEqual(TILE_EDGE);
      expect(plan.count).toBeLessThanOrEqual(MAX_TILES);
      expect(plan.truncated).toBe(plan.capturedHeight < height);
    }
    expect(planTiles(1280, 30_000).truncated).toBe(false);
    expect(planTiles(1280, 200_000)).toMatchObject({
      count: MAX_TILES,
      truncated: true,
    });
  });

  it("uses the device pixel ratio up to 2x and only shrinks pages wider than the cap", () => {
    expect(planTiles(1280, 5_000, 2).scale).toBe(2);
    expect(planTiles(1280, 5_000, 3).scale).toBe(2);
    expect(planTiles(6_000, 5_000).scale).toBeCloseTo(TILE_EDGE / 6_000);
  });
});
