/** Full-page capture from the browser companion: visible feedback at once, while
 * the browser scrolls, and when it ends. The pending message is always replaced,
 * whether the capture succeeds, fails or needs the companion. */
export const fullPageText = Object.freeze({
  starting: "整頁截圖中…",
  progress: (completed, total) => `整頁截圖中… ${completed}/${total}`,
  truncated: "頁面很長，只截取了前面的部分。",
  failed: "整頁截圖暫時無法完成，請再試一次。",
});

export async function runFullPage({
  host,
  status,
  attach,
  companionRequired,
  signal,
}) {
  // Before any await: the user sees the request was taken within a frame, not
  // after the browser has scrolled a long page.
  status({
    state: "capturing",
    kind: "full-page",
    message: fullPageText.starting,
  });
  let result;
  try {
    result = await host.fullPage(signal, ({ completed, total }) =>
      status({
        state: "capturing",
        kind: "full-page",
        message: fullPageText.progress(completed, total),
        completed,
        total,
      }),
    );
    if (!result.companionRequired)
      for (const tile of result.tiles ?? [result]) await attach(tile);
  } catch (error) {
    status({
      state: "failed",
      kind: "full-page",
      message: fullPageText.failed,
    });
    throw error;
  }
  if (result.companionRequired) {
    status({ state: "done", kind: "full-page" });
    companionRequired();
  } else if (result.truncated)
    status({
      state: "done",
      kind: "full-page",
      message: fullPageText.truncated,
    });
  else status({ state: "done", kind: "full-page" });
  return { ok: true };
}

/** What the notice should do for a shell event: show text, hide, or nothing. */
export function captureNotice(event) {
  if (event.type === "capture-status") {
    if (event.message) return { text: event.message };
    if (event.state === "done") return { hidden: true };
  }
  return undefined;
}
