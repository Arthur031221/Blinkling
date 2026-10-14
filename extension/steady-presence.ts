/** Connection state for display. A reconnect shorter than the grace period (the
 * bridge restarting, a brief network drop) never shows as offline; being online
 * is shown at once. */
export function steadyPresence(
  show: (online: boolean) => void,
  graceMs = 5000,
) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const cancel = () => {
    clearTimeout(timer);
    timer = undefined;
  };
  return {
    up() {
      cancel();
      show(true);
    },
    down() {
      timer ??= setTimeout(() => {
        timer = undefined;
        show(false);
      }, graceMs);
    },
    /** A definite answer with no grace, such as the first read at startup. */
    set(online: boolean) {
      cancel();
      show(online);
    },
    dispose: cancel,
  };
}
