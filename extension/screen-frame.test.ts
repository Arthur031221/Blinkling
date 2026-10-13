import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { freezeSharedFrame, needsSharedFrameClearance } from "./screen-frame";

let video: HTMLVideoElement;
let track: MediaStreamTrack;
let callbacks: Map<number, VideoFrameRequestCallback>;
let sequence: number;
let draw: ReturnType<typeof vi.fn>;
let bubble: Document;
let closed: boolean;
let events: string[];

beforeEach(() => {
  vi.useFakeTimers();
  events = [];
  callbacks = new Map();
  sequence = 0;
  closed = false;
  bubble = {
    body: { style: { opacity: "0.8" } },
    defaultView: {
      get closed() {
        return closed;
      },
    },
  } as unknown as Document;
  track = Object.assign(new EventTarget(), {
    readyState: "live",
    getSettings: () => ({ displaySurface: "monitor" }),
  }) as unknown as MediaStreamTrack;
  video = document.createElement("video");
  Object.defineProperties(video, {
    videoWidth: { value: 1440 },
    videoHeight: { value: 1000 },
    srcObject: { value: { getVideoTracks: () => [track] } },
    requestVideoFrameCallback: {
      value: vi.fn((callback: VideoFrameRequestCallback) => {
        const id = ++sequence;
        callbacks.set(id, callback);
        return id;
      }),
    },
    cancelVideoFrameCallback: {
      value: vi.fn((id: number) => {
        callbacks.delete(id);
      }),
    },
  });
  draw = vi.fn(() => events.push("freeze"));
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
    drawImage: draw,
  } as unknown as CanvasRenderingContext2D);
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

async function nextFrame(mediaTime: number) {
  await vi.advanceTimersByTimeAsync(100);
  const entry = callbacks.entries().next().value;
  if (!entry) throw new Error("No pending video callback");
  const [id, callback] = entry;
  callbacks.delete(id);
  callback(performance.now(), {
    mediaTime,
    presentedFrames: mediaTime * 5,
  } as VideoFrameCallbackMetadata);
  await vi.advanceTimersByTimeAsync(0);
}

describe("shared desktop frame clearance", () => {
  it.each(["browser", "window"])(
    "keeps the floating window open for an unobstructed %s source even when hooks are supplied",
    async (surface) => {
      Object.assign(track, {
        getSettings: () => ({ displaySurface: surface }),
      });
      const clearBubble = {
        hide: vi.fn(async () => {
          closed = true;
        }),
        restore: vi.fn(async () => {
          closed = false;
        }),
      };
      const result = freezeSharedFrame(video, bubble, { clearBubble });
      await nextFrame(1);
      await nextFrame(2);
      await result;
      expect(clearBubble.hide).not.toHaveBeenCalled();
      expect(clearBubble.restore).not.toHaveBeenCalled();
      expect(closed).toBe(false);
      expect(bubble.body.style.opacity).toBe("0.8");
      expect(draw).toHaveBeenCalledOnce();
    },
  );

  it("does not run native-clearance hooks for a canvas source", async () => {
    const canvas = document.createElement("canvas");
    canvas.width = 1440;
    canvas.height = 1000;
    Object.assign(track, { canvas });
    const clearBubble = {
      hide: vi.fn(async () => {
        closed = true;
      }),
      restore: vi.fn(async () => {
        closed = false;
      }),
    };
    const result = freezeSharedFrame(video, bubble, { clearBubble });
    await vi.advanceTimersByTimeAsync(100);
    await result;
    expect(clearBubble.hide).not.toHaveBeenCalled();
    expect(clearBubble.restore).not.toHaveBeenCalled();
    expect(draw).toHaveBeenCalledWith(canvas, 0, 0);
    expect(bubble.body.style.opacity).toBe("0.8");
  });

  it.each(["absent", "already closed"])(
    "does not request a reopen gesture when the floating window is %s",
    async (state) => {
      const currentBubble = state === "absent" ? null : bubble;
      closed = state === "already closed";
      const clearBubble = {
        hide: vi.fn(async () => {}),
        restore: vi.fn(async () => {}),
      };
      const result = freezeSharedFrame(video, currentBubble, { clearBubble });
      await nextFrame(1);
      await nextFrame(2);
      await result;
      expect(clearBubble.hide).not.toHaveBeenCalled();
      expect(clearBubble.restore).not.toHaveBeenCalled();
      expect(draw).toHaveBeenCalledOnce();
    },
  );

  it("refuses a monitor capture with native PiP still covering it instead of treating body opacity as exclusion", async () => {
    expect(needsSharedFrameClearance(video, bubble)).toBe(true);
    const result = freezeSharedFrame(video, bubble);
    const rejection = expect(result).rejects.toThrow(
      "capture_bubble_obstructed",
    );
    await vi.advanceTimersByTimeAsync(3000);
    await rejection;
    expect(draw).not.toHaveBeenCalled();
    expect(bubble.body.style.opacity).toBe("0.8");
  });

  it("requires native clearance for an unidentified display source", async () => {
    Object.assign(track, { getSettings: () => ({}) });
    expect(needsSharedFrameClearance(video, bubble)).toBe(true);
    await expect(freezeSharedFrame(video, bubble)).rejects.toThrow(
      "capture_bubble_obstructed",
    );
    expect(draw).not.toHaveBeenCalled();
    expect(bubble.body.style.opacity).toBe("0.8");
  });

  it("clears the real bubble before reading fresh pixels and restores it afterward", async () => {
    const clearBubble = {
      hide: vi.fn(async () => {
        events.push("hide");
        closed = true;
      }),
      restore: vi.fn(async () => {
        events.push("restore");
        closed = false;
      }),
    };
    const result = freezeSharedFrame(video, bubble, { clearBubble });
    await nextFrame(1);
    expect(draw).not.toHaveBeenCalled();
    await nextFrame(2);
    const frame = await result;
    expect([frame.width, frame.height]).toEqual([1440, 1000]);
    expect(events).toEqual(["hide", "freeze", "restore"]);
    expect(closed).toBe(false);
    expect(callbacks.size).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("rejects a clearance hook that only changes CSS opacity", async () => {
    const clearBubble = {
      hide: vi.fn(async () => {
        bubble.body.style.opacity = "0";
      }),
      restore: vi.fn(async () => {
        bubble.body.style.opacity = "0.8";
      }),
    };
    await expect(
      freezeSharedFrame(video, bubble, { clearBubble }),
    ).rejects.toThrow("capture_bubble_obstructed");
    expect(draw).not.toHaveBeenCalled();
    expect(clearBubble.restore).toHaveBeenCalledOnce();
    expect(bubble.body.style.opacity).toBe("0.8");
  });

  it("restores the bubble even if hiding it fails partway through", async () => {
    const clearBubble = {
      hide: vi.fn(async () => {
        closed = true;
        throw new Error("clearance_failed");
      }),
      restore: vi.fn(async () => {
        closed = false;
      }),
    };
    await expect(
      freezeSharedFrame(video, bubble, { clearBubble }),
    ).rejects.toThrow("clearance_failed");
    expect(clearBubble.restore).toHaveBeenCalledOnce();
    expect(closed).toBe(false);
  });
});

describe("shared frame freshness and cleanup", () => {
  it("freezes a live shared track before the video decoder has metadata", async () => {
    const decoder = document.createElement("video");
    decoder.srcObject = video.srcObject;
    expect([decoder.videoWidth, decoder.videoHeight]).toEqual([0, 0]);
    const clone = {
      stop: vi.fn(),
      getConstraints: () => ({}),
      applyConstraints: vi.fn(async () => {}),
    };
    Object.assign(track, { clone: vi.fn(() => clone) });
    const queued = { width: 1440, height: 1000, close: vi.fn() };
    const fresh = { width: 1440, height: 1000, close: vi.fn() };
    const grabFrame = vi
      .fn()
      .mockResolvedValueOnce(queued)
      .mockResolvedValueOnce(fresh);
    vi.stubGlobal(
      "ImageCapture",
      vi.fn(function () {
        return { grabFrame };
      }),
    );
    const outcome = freezeSharedFrame(decoder, null).then(
      (frame) => ({ frame }),
      (error) => ({ error }),
    );
    await vi.advanceTimersByTimeAsync(100);
    expect(await outcome).toMatchObject({
      frame: { width: 1440, height: 1000 },
    });
    expect(draw).toHaveBeenCalledWith(fresh, 0, 0);
    expect(queued.close).toHaveBeenCalledOnce();
    expect(fresh.close).toHaveBeenCalledOnce();
    expect(clone.stop).toHaveBeenCalledOnce();
    expect(track.readyState).toBe("live");
    expect(vi.getTimerCount()).toBe(0);
  });

  it("reads current canvas pixels even when its stream stopped emitting frames", async () => {
    const canvas = document.createElement("canvas");
    canvas.width = 1440;
    canvas.height = 1000;
    Object.assign(track, {
      canvas,
      getSettings: () => ({}),
    });
    const result = freezeSharedFrame(video, bubble);
    // Keep a rejection handled while fake time exposes a stalled-video bug.
    const outcome = result.then(
      (frame) => ({ frame }),
      (error) => ({ error }),
    );
    await vi.advanceTimersByTimeAsync(3000);
    const settled = await outcome;
    expect(settled).toHaveProperty("frame");
    expect(draw).toHaveBeenCalledWith(canvas, 0, 0);
    expect(video.requestVideoFrameCallback).not.toHaveBeenCalled();
    expect(bubble.body.style.opacity).toBe("0.8");
  });

  it("requests fresh track snapshots when hidden video rendering has stopped", async () => {
    const clone = {
      stop: vi.fn(),
      getConstraints: () => ({ width: { ideal: 1440 } }),
      applyConstraints: vi.fn(async () => {}),
    };
    Object.assign(track, { clone: vi.fn(() => clone) });
    const queued = { width: 1440, height: 1000, close: vi.fn() };
    const fresh = { width: 1440, height: 1000, close: vi.fn() };
    const grabFrame = vi
      .fn()
      .mockResolvedValueOnce(queued)
      .mockResolvedValueOnce(fresh);
    const ImageCapture = vi.fn(function () {
      return { grabFrame };
    });
    vi.stubGlobal("ImageCapture", ImageCapture);
    const result = freezeSharedFrame(video, null);
    await vi.advanceTimersByTimeAsync(100);
    const frame = await result;
    expect(ImageCapture).toHaveBeenCalledWith(clone);
    expect(clone.applyConstraints).toHaveBeenCalledWith({
      width: { ideal: 1440 },
      frameRate: { min: 2, max: 2 },
    });
    expect(clone.applyConstraints.mock.invocationCallOrder[0]).toBeLessThan(
      grabFrame.mock.invocationCallOrder[0],
    );
    expect(grabFrame).toHaveBeenCalledTimes(2);
    expect(draw).toHaveBeenCalledWith(fresh, 0, 0);
    expect(queued.close).toHaveBeenCalledOnce();
    expect(fresh.close).toHaveBeenCalledOnce();
    expect(clone.stop).toHaveBeenCalledOnce();
    expect(track.readyState).toBe("live");
    expect([frame.width, frame.height]).toEqual([1440, 1000]);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("stops a stalled snapshot clone and closes a bitmap arriving after timeout", async () => {
    const clone = {
      stop: vi.fn(),
      getConstraints: () => ({ width: { ideal: 1440 } }),
      applyConstraints: vi.fn(async () => {}),
    };
    Object.assign(track, { clone: vi.fn(() => clone) });
    let deliver!: (frame: unknown) => void;
    const grabFrame = vi.fn(
      () =>
        new Promise((resolve) => {
          deliver = resolve;
        }),
    );
    vi.stubGlobal(
      "ImageCapture",
      vi.fn(function () {
        return { grabFrame };
      }),
    );
    const result = freezeSharedFrame(video, null);
    const rejection = expect(result).rejects.toThrow("capture_failed");
    await vi.advanceTimersByTimeAsync(3000);
    await rejection;
    const late = { close: vi.fn() };
    deliver(late);
    await vi.advanceTimersByTimeAsync(0);
    expect(late.close).toHaveBeenCalledOnce();
    expect(clone.stop).toHaveBeenCalledOnce();
    expect(grabFrame).toHaveBeenCalledOnce();
    expect(draw).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("cancels a pending track snapshot when the original share ends", async () => {
    const clone = {
      stop: vi.fn(),
      getConstraints: () => ({ width: { ideal: 1440 } }),
      applyConstraints: vi.fn(async () => {}),
    };
    Object.assign(track, { clone: vi.fn(() => clone) });
    vi.stubGlobal(
      "ImageCapture",
      vi.fn(function () {
        return { grabFrame: () => new Promise(() => {}) };
      }),
    );
    const result = freezeSharedFrame(video, null);
    const rejection = expect(result).rejects.toThrow("share_ended");
    await vi.advanceTimersByTimeAsync(100);
    track.dispatchEvent(new Event("ended"));
    await rejection;
    expect(clone.stop).toHaveBeenCalledOnce();
    expect(draw).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("discards the queued pre-clearance frame and repeated media timestamps", async () => {
    const result = freezeSharedFrame(video, null);
    await nextFrame(10);
    expect(draw).not.toHaveBeenCalled();
    await nextFrame(10);
    expect(draw).not.toHaveBeenCalled();
    await nextFrame(11);
    await result;
    expect(draw).toHaveBeenCalledOnce();
    expect(callbacks.size).toBe(0);
  });

  it("fails instead of freezing stale pixels when the video stalls", async () => {
    const result = freezeSharedFrame(video, null);
    const rejection = expect(result).rejects.toThrow("capture_failed");
    await vi.advanceTimersByTimeAsync(3000);
    await rejection;
    expect(draw).not.toHaveBeenCalled();
    expect(video.cancelVideoFrameCallback).toHaveBeenCalled();
    expect(callbacks.size).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("cancels pending callbacks and restores the bubble when sharing ends", async () => {
    const clearBubble = {
      hide: vi.fn(async () => {
        closed = true;
      }),
      restore: vi.fn(async () => {
        closed = false;
      }),
    };
    const result = freezeSharedFrame(video, bubble, { clearBubble });
    const rejection = expect(result).rejects.toThrow("share_ended");
    await vi.advanceTimersByTimeAsync(100);
    track.dispatchEvent(new Event("ended"));
    await rejection;
    expect(draw).not.toHaveBeenCalled();
    expect(callbacks.size).toBe(0);
    expect(clearBubble.restore).toHaveBeenCalledOnce();
  });

  it("supports explicit cancellation while waiting for a frame", async () => {
    const controller = new AbortController();
    const result = freezeSharedFrame(video, null, {
      signal: controller.signal,
    });
    const rejection = expect(result).rejects.toThrow("cancelled_capture");
    await vi.advanceTimersByTimeAsync(100);
    controller.abort(new Error("cancelled_capture"));
    await rejection;
    expect(callbacks.size).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
  });
});
