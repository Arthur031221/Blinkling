import { describe, expect, it } from "vitest";
import {
  inspectableCaptureUrl,
  matchesCaptureBinding,
} from "./capture-binding";

describe("passive screen source binding", () => {
  const binding = {
    tabId: 7,
    handle: "private-token",
    origin: "https://public.test",
    url: "https://public.test/",
    documentId: "document-seven",
  };
  const track = (handle: unknown = binding, surface = "browser") =>
    ({
      readyState: "live",
      getSettings: () => ({ displaySurface: surface }),
      getCaptureHandle: () => handle,
    }) as unknown as MediaStreamTrack;
  it("accepts only the inspected captured browser tab", () => {
    expect(matchesCaptureBinding(track(), binding, 7)).toBe(true);
  });
  it.each([
    [undefined, binding, 7],
    [track(null), binding, 7],
    [track(), undefined, 7],
    [track(), binding, 8],
    [track({ ...binding, handle: "different" }), binding, 7],
    [track({ ...binding, origin: "https://private.test" }), binding, 7],
    [track(binding, "monitor"), binding, 7],
    [track(binding, "window"), binding, 7],
  ])(
    "withholds an unknown or mismatched source %#",
    (source, expected, tabId) => {
      expect(matchesCaptureBinding(source, expected, tabId)).toBe(false);
    },
  );
  it.each([
    "file:///private.txt",
    "data:text/html,private",
    "about:blank",
    "chrome://settings",
    "chrome-extension://id/reader.html",
  ])("cannot inspect %s", (url) => {
    expect(inspectableCaptureUrl(url)).toBe(false);
  });
  it.each(["http://localhost/", "https://public.test/"])(
    "can inspect %s",
    (url) => {
      expect(inspectableCaptureUrl(url)).toBe(true);
    },
  );
});
