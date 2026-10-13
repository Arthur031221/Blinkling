// A native PiP cannot be made transparent to desktop input. Forward input from
// its document to the frozen selector underneath while the bubble is dimmed.
export function relayBubbleCropInput(floating: Window, host: HTMLElement) {
  const view = host.ownerDocument.defaultView!;
  const surface = host.shadowRoot!.querySelector<HTMLElement>(".surface")!;
  const position = (event: MouseEvent) => ({
    clientX:
      event.screenX - view.screenX - (view.outerWidth - view.innerWidth) / 2,
    clientY:
      event.screenY - view.screenY - (view.outerHeight - view.innerHeight),
  });
  const target = (event: MouseEvent) => {
    const p = position(event);
    return host.shadowRoot!.elementFromPoint(p.clientX, p.clientY) || surface;
  };
  const pointer = (event: PointerEvent) => {
    event.preventDefault();
    event.stopImmediatePropagation();
    if (event.type === "pointerdown")
      floating.document.body.setPointerCapture(event.pointerId);
    target(event).dispatchEvent(
      new PointerEvent(event.type, {
        ...position(event),
        pointerId: event.pointerId,
        pointerType: event.pointerType,
        button: event.button,
        buttons: event.buttons,
        isPrimary: event.isPrimary,
        bubbles: true,
        composed: true,
        cancelable: true,
      }),
    );
    if (
      (event.type === "pointerup" || event.type === "pointercancel") &&
      floating.document.body.hasPointerCapture(event.pointerId)
    )
      floating.document.body.releasePointerCapture(event.pointerId);
  };
  const click = (event: MouseEvent) => {
    event.preventDefault();
    event.stopImmediatePropagation();
    target(event).dispatchEvent(
      new MouseEvent("click", {
        ...position(event),
        bubbles: true,
        composed: true,
        cancelable: true,
      }),
    );
  };
  const key = (event: KeyboardEvent) => {
    event.preventDefault();
    event.stopImmediatePropagation();
    view.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: event.key,
        code: event.code,
        shiftKey: event.shiftKey,
        ctrlKey: event.ctrlKey,
        altKey: event.altKey,
        metaKey: event.metaKey,
        repeat: event.repeat,
        bubbles: true,
        cancelable: true,
      }),
    );
  };
  const pointerEvents = [
    "pointerdown",
    "pointermove",
    "pointerup",
    "pointercancel",
  ] as const;
  for (const type of pointerEvents)
    floating.addEventListener(type, pointer, true);
  floating.addEventListener("click", click, true);
  floating.addEventListener("keydown", key, true);
  return () => {
    for (const type of pointerEvents)
      floating.removeEventListener(type, pointer, true);
    floating.removeEventListener("click", click, true);
    floating.removeEventListener("keydown", key, true);
  };
}
