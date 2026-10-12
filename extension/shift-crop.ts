export function listenForShiftCrop(
  view: Window,
  allowed: () => boolean,
  start: () => void,
): () => void {
  let timer: number | undefined;
  const clear = () => {
    view.clearTimeout(timer);
    timer = undefined;
  };
  const down = (event: KeyboardEvent) => {
    if (event.key !== "Shift") {
      clear();
      return;
    }
    const target = event.target as Element | null;
    if (
      event.repeat ||
      event.ctrlKey ||
      event.altKey ||
      event.metaKey ||
      target?.closest?.(
        "input,textarea,select,[contenteditable]:not([contenteditable='false']),[role='textbox']",
      ) ||
      !allowed()
    )
      return;
    clear();
    timer = view.setTimeout(() => {
      timer = undefined;
      if (allowed()) start();
    }, 200);
  };
  const up = (event: KeyboardEvent) => {
    if (event.key === "Shift") clear();
  };
  view.addEventListener("keydown", down);
  view.addEventListener("keyup", up);
  view.addEventListener("blur", clear);
  view.addEventListener("pointerdown", clear);
  return () => {
    clear();
    view.removeEventListener("keydown", down);
    view.removeEventListener("keyup", up);
    view.removeEventListener("blur", clear);
    view.removeEventListener("pointerdown", clear);
  };
}
