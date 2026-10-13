export function listenForShiftCrop(
  view: Window,
  allowed: () => boolean,
  start: (initialPointer?: PointerEvent) => void,
): () => void {
  let timer: number | undefined;
  const clear = () => {
    view.clearTimeout(timer);
    timer = undefined;
  };
  const editable = (event: Event) =>
    event
      .composedPath()
      .some((target) =>
        (target as Element)?.closest?.(
          "input,textarea,select,[contenteditable]:not([contenteditable='false']),[role='textbox']",
        ),
      );
  const down = (event: KeyboardEvent) => {
    if (event.key !== "Shift") {
      clear();
      return;
    }
    if (
      event.repeat ||
      event.ctrlKey ||
      event.altKey ||
      event.metaKey ||
      editable(event) ||
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
  const pointerDown = (event: PointerEvent) => {
    const pending = timer !== undefined;
    clear();
    if (
      !pending ||
      !event.shiftKey ||
      event.button !== 0 ||
      event.ctrlKey ||
      event.altKey ||
      event.metaKey ||
      editable(event) ||
      !allowed()
    )
      return;
    // Claim the gesture before the host app sees it, then seed the overlay
    // synchronously with the original pointerdown coordinates and pointer id.
    event.preventDefault();
    event.stopImmediatePropagation();
    start(event);
  };
  view.addEventListener("keydown", down, true);
  view.addEventListener("keyup", up, true);
  view.addEventListener("blur", clear);
  view.addEventListener("pointerdown", pointerDown, true);
  return () => {
    clear();
    view.removeEventListener("keydown", down, true);
    view.removeEventListener("keyup", up, true);
    view.removeEventListener("blur", clear);
    view.removeEventListener("pointerdown", pointerDown, true);
  };
}
