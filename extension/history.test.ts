import { describe, expect, it } from "vitest";
import { boundedHistory } from "./history";

describe("chat history retention", () => {
  it("keeps a pinned answer while removing old ordinary answers", () => {
    const history = Array.from({ length: 100 }, (_, id) => ({
      id,
      pinned: id === 0,
    }));
    const kept = boundedHistory(history);
    expect(kept).toHaveLength(40);
    expect(kept[0].id).toBe(0);
    expect(kept.at(-1)!.id).toBe(99);
    expect(kept.some((entry) => entry.id === 1)).toBe(false);
  });
  it("limits images independently so long conversations do not retain every screenshot", () => {
    const history = Array.from({ length: 20 }, (_, id) => ({
      id,
      image: `image-${id}`,
    }));
    const kept = boundedHistory(history);
    expect(kept).toHaveLength(20);
    expect(
      kept.filter((entry) => entry.image).map((entry) => entry.id),
    ).toEqual([12, 13, 14, 15, 16, 17, 18, 19]);
    expect(history[0].image).toBe("image-0");
  });
});
