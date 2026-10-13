// Capture the next shared frame after the floating controls have disappeared.
export async function freezeSharedFrame(
  video: HTMLVideoElement,
  bubble: Document | null,
): Promise<HTMLCanvasElement> {
  if (!video.videoWidth || !video.videoHeight) throw new Error("share_ended");
  const opacity = bubble?.body.style.opacity || "";
  if (bubble) bubble.body.style.opacity = "0";
  try {
    await Promise.race([
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
      new Promise<void>((resolve) => window.setTimeout(resolve, 80)),
    ]);
    await new Promise<void>((resolve) => {
      const timer = window.setTimeout(() => {
        video.cancelVideoFrameCallback(callback);
        resolve();
      }, 700);
      const callback = video.requestVideoFrameCallback(() => {
        window.clearTimeout(timer);
        resolve();
      });
    });
    const frame = document.createElement("canvas");
    frame.width = video.videoWidth;
    frame.height = video.videoHeight;
    const context = frame.getContext("2d");
    if (!context || !frame.width || !frame.height)
      throw new Error("capture_failed");
    context.drawImage(video, 0, 0);
    return frame;
  } finally {
    if (bubble) bubble.body.style.opacity = opacity;
  }
}
