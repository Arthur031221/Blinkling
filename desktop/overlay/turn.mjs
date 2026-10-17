/** Correlate completion with the admitted turn; status dots never become answers. */
export function collectTurn(session, turn, { signal, timeoutMs = 90000 } = {}) {
  return new Promise((resolve, reject) => {
    let full = "",
      delta = "",
      settled = false,
      timer,
      unsubscribe = () => {};
    const end = (error, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      unsubscribe();
      signal?.removeEventListener("abort", abort);
      if (error) reject(error);
      else resolve(value);
    };
    const abort = () => {
      end(signal.reason);
      void session.stop({ own: true }).catch(() => {});
    };
    if (signal?.aborted) {
      end(signal.reason);
      return;
    }
    unsubscribe = session.subscribe((event) => {
      if (event.type === "delta") delta += event.text;
      if (event.type === "message" && event.role === "assistant")
        full = event.content
          .filter((b) => b.type === "text")
          .map((b) => b.text)
          .join("\n");
      if (full.length + delta.length > 100000) {
        end(Error("Guide response too large"));
        return;
      }
      if (event.type === "done" && event.turnId === turn.id)
        end(null, full || delta);
    });
    timer = setTimeout(() => {
      end(Error("Guide response timed out"));
      void session.stop({ own: true }).catch(() => {});
    }, timeoutMs);
    signal?.addEventListener("abort", abort, { once: true });
    Promise.resolve()
      .then(() => session.send(turn))
      .catch((error) => end(error));
  });
}
