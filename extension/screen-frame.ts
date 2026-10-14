export type SharedFrameOptions = {
  // Clear an obstructed monitor frame or the native selection hit rectangle.
  // Native clearance must be verified: hide returns true after confirming the
  // window is minimized, or closes the window. CSS opacity is insufficient.
  // Restore is called even if hide fails, so each hook must support rollback.
  // Browser/window crops can use only the selection relay, without hide.
  clearBubble?: {
    hide: () => Promise<boolean | void>;
    restore: () => Promise<void>;
    prepareSelection?: () => Promise<void>;
    relaySelection?: (host: HTMLElement, image: HTMLImageElement) => void;
  };
  signal?: AbortSignal;
  // A tab/window frame excludes PiP pixels, but its selection surface still
  // needs the native rectangle removed for desktop hit testing.
  clearForSelection?: boolean;
};

function trackCanvas(track: MediaStreamTrack | undefined) {
  return track && "canvas" in track && track.canvas instanceof HTMLCanvasElement
    ? track.canvas
    : undefined;
}

export function needsSharedFrameClearance(
  video: HTMLVideoElement,
  bubble: Document | null,
): boolean {
  const view = bubble?.defaultView;
  const track = (video.srcObject as MediaStream | null)?.getVideoTracks()[0];
  const surface = track?.getSettings().displaySurface;
  // Canvas tracks capture their backing element rather than the native desktop.
  // Other unidentified display tracks still require real clearance.
  return (
    Boolean(bubble && view && !view.closed) &&
    !trackCanvas(track) &&
    surface !== "browser" &&
    surface !== "window"
  );
}

export async function withBubbleCleared<T>(
  video: HTMLVideoElement,
  bubble: Document | null,
  options: SharedFrameOptions,
  capture: () => Promise<T>,
): Promise<T> {
  options.signal?.throwIfAborted();
  const view = bubble?.defaultView;
  const needsClearance =
    needsSharedFrameClearance(video, bubble) ||
    Boolean(options.clearForSelection && view && !view.closed);
  const clearBubble = needsClearance ? options.clearBubble : undefined;
  if (needsClearance && !clearBubble)
    throw new Error("capture_bubble_obstructed");
  const opacity = bubble?.body.style.opacity || "";
  try {
    if (clearBubble) {
      const hidden = await clearBubble.hide();
      // CSS opacity cannot hide the native window or its chrome. Do not accept
      // an ineffective hook as proof that the desktop is unobstructed.
      if (needsClearance && hidden !== true && !view?.closed)
        throw new Error("capture_bubble_obstructed");
    } else if (bubble) bubble.body.style.opacity = "0";
    options.signal?.throwIfAborted();
    return await capture();
  } finally {
    if (clearBubble) await clearBubble.restore();
    else if (bubble) bubble.body.style.opacity = opacity;
  }
}

function paintBeforeCapture(): Promise<void> {
  return new Promise((resolve) => {
    let first = 0;
    let second = 0;
    const finish = () => {
      window.clearTimeout(timer);
      cancelAnimationFrame(first);
      cancelAnimationFrame(second);
      resolve();
    };
    // A background opener may have suspended animation frames.
    const timer = window.setTimeout(finish, 80);
    first = requestAnimationFrame(() => {
      second = requestAnimationFrame(finish);
    });
  });
}

type TrackCapture = new (track: MediaStreamTrack) => {
  grabFrame: () => Promise<ImageBitmap>;
};

async function freshTrackBitmap(
  track: MediaStreamTrack,
  Capture: TrackCapture,
  signal?: AbortSignal,
): Promise<ImageBitmap> {
  // A hidden video can stop compositor callbacks even while its source is live.
  // A new ImageCapture sink requests frames directly from the shared track.
  // Use a clone so cancellation can release the sink without stopping sharing.
  const clone = track.clone();
  try {
    const capture = new Capture(clone);
    return await new Promise<ImageBitmap>((resolve, reject) => {
      let pending = true;
      const cleanup = () => {
        pending = false;
        window.clearTimeout(timer);
        signal?.removeEventListener("abort", aborted);
        track.removeEventListener("ended", ended);
      };
      const fail = (error: unknown) => {
        if (!pending) return;
        cleanup();
        reject(error);
      };
      const aborted = () => fail(signal?.reason);
      const ended = () => fail(new Error("share_ended"));
      const timer = window.setTimeout(
        () => fail(new Error("capture_failed")),
        2000,
      );
      signal?.addEventListener("abort", aborted, { once: true });
      track.addEventListener("ended", ended, { once: true });
      const grab = async () => {
        // Static display sources may stop emitting frames. Request a minimum
        // cadence on the disposable clone, preserving its other constraints.
        await clone.applyConstraints({
          ...clone.getConstraints(),
          frameRate: { min: 2, max: 2 },
        });
        if (!pending) return;
        // Discard any frame queued before native clearance, then read the next.
        for (let index = 0; index < 2; index++) {
          const bitmap = await capture.grabFrame();
          if (!pending || index === 0) bitmap.close();
          if (!pending) return;
          if (index === 1) {
            cleanup();
            resolve(bitmap);
          }
        }
      };
      if (signal?.aborted) aborted();
      else if (track.readyState === "ended") ended();
      else void grab().catch(() => fail(new Error("capture_failed")));
    });
  } finally {
    clone.stop();
  }
}

async function freshVideoFrame(
  video: HTMLVideoElement,
  signal?: AbortSignal,
): Promise<void> {
  const tracks =
    (video.srcObject as MediaStream | null)?.getVideoTracks() || [];
  if (
    !video.videoWidth ||
    !video.videoHeight ||
    tracks.some((track) => track.readyState === "ended")
  )
    throw new Error("share_ended");
  signal?.throwIfAborted();
  await paintBeforeCapture();
  signal?.throwIfAborted();
  await new Promise<void>((resolve, reject) => {
    let callback = 0;
    let firstMediaTime: number | undefined;
    const cleanup = () => {
      window.clearTimeout(timer);
      video.cancelVideoFrameCallback(callback);
      signal?.removeEventListener("abort", aborted);
      tracks.forEach((track) => track.removeEventListener("ended", ended));
    };
    const fail = (error: unknown) => {
      cleanup();
      reject(error);
    };
    const aborted = () => fail(signal?.reason);
    const ended = () => fail(new Error("share_ended"));
    // At the requested 2 fps, two genuinely new frames arrive within a second.
    // A stalled or ended stream must not silently reuse the old desktop frame.
    const timer = window.setTimeout(
      () => fail(new Error("capture_failed")),
      2000,
    );
    const next: VideoFrameRequestCallback = (_now, metadata) => {
      // The first callback can already be queued when the bubble disappears.
      // Discard it, then require a later media timestamp, not another callback
      // for the same frozen image.
      if (firstMediaTime === undefined) firstMediaTime = metadata.mediaTime;
      else if (metadata.mediaTime > firstMediaTime) {
        cleanup();
        resolve();
        return;
      }
      callback = video.requestVideoFrameCallback(next);
    };
    signal?.addEventListener("abort", aborted, { once: true });
    tracks.forEach((track) =>
      track.addEventListener("ended", ended, { once: true }),
    );
    if (tracks.some((track) => track.readyState === "ended")) ended();
    else callback = video.requestVideoFrameCallback(next);
  });
}

// Capture only after native PiP clearance (for monitor shares) and fresh video.
export async function freezeSharedFrame(
  video: HTMLVideoElement,
  bubble: Document | null,
  options: SharedFrameOptions = {},
): Promise<HTMLCanvasElement> {
  return withBubbleCleared(video, bubble, options, async () => {
    const track = (video.srcObject as MediaStream | null)?.getVideoTracks()[0];
    const canvasSource = trackCanvas(track);
    // lib.dom declares ImageCapture but currently omits grabFrame.
    const Capture = (window as unknown as { ImageCapture?: TrackCapture })
      .ImageCapture;
    let bitmap: ImageBitmap | undefined;
    try {
      if (canvasSource) {
        // A static canvas stream need not emit another video frame. Read its
        // current backing pixels directly, without waiting for a repaint.
        await paintBeforeCapture();
      } else if (track && Capture) {
        await paintBeforeCapture();
        options.signal?.throwIfAborted();
        if (track.readyState === "ended") throw new Error("share_ended");
        bitmap = await freshTrackBitmap(track, Capture, options.signal);
      } else await freshVideoFrame(video, options.signal);
      options.signal?.throwIfAborted();
      if (track?.readyState === "ended") throw new Error("share_ended");
      const frame = document.createElement("canvas");
      // A newly attached decoder can still report 0x0 while its shared track
      // is live. Direct snapshots supply their own authoritative dimensions;
      // only the video fallback depends on decoded metadata.
      frame.width = canvasSource?.width ?? bitmap?.width ?? video.videoWidth;
      frame.height =
        canvasSource?.height ?? bitmap?.height ?? video.videoHeight;
      const context = frame.getContext("2d");
      if (!context || !frame.width || !frame.height)
        throw new Error("capture_failed");
      context.drawImage(canvasSource || bitmap || video, 0, 0);
      return frame;
    } finally {
      bitmap?.close();
    }
  });
}
