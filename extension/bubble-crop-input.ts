// A native PiP cannot be made transparent to desktop input. Forward input from
// its document to the frozen selector underneath while the bubble is dimmed.
function contentOrigin(view: Window) {
  const border = (view.outerWidth - view.innerWidth) / 2;
  // The vertical gutter includes the bottom frame as well as the title bar.
  // This also handles Chrome's symmetric, invisible fullscreen frame.
  return {
    screenX: view.screenX + border,
    screenY: view.screenY + view.outerHeight - view.innerHeight - border,
  };
}

export function relayBubbleCropInput(
  floating: Window,
  host: HTMLElement,
  frozenImage?: HTMLImageElement,
) {
  const view = host.ownerDocument.defaultView!;
  const surface = host.shadowRoot!.querySelector<HTMLElement>(".surface")!;
  // PiP has no native alpha/click-through API. If it cannot be minimized,
  // replace its content with the exact frozen surface underneath, including
  // selection feedback. Keep it outside the faded body so pixels stay legible.
  const mirror = frozenImage
    ? floating.document.createElement("div")
    : undefined;
  const root = mirror?.attachShadow({ mode: "open" });
  let observer: MutationObserver | undefined;
  const refresh = () => {
    if (!root || !frozenImage) return;
    const stage = floating.document.createElement("div");
    const offset = position(contentOrigin(floating) as MouseEvent);
    stage.style.cssText = `position:absolute;width:${view.innerWidth}px;height:${view.innerHeight}px;transform:translate(${-offset.clientX}px,${-offset.clientY}px);transform-origin:0 0;`;
    const image = frozenImage.cloneNode() as HTMLImageElement;
    const bounds = frozenImage.getBoundingClientRect();
    image.style.position = "absolute";
    image.style.left = `${bounds.left}px`;
    image.style.top = `${bounds.top}px`;
    stage.append(image);
    for (const element of host.shadowRoot!.children)
      stage.append(element.cloneNode(true));
    root.replaceChildren(stage);
  };
  const position = (event: MouseEvent) => {
    const origin = contentOrigin(view);
    return {
      clientX: event.screenX - origin.screenX,
      clientY: event.screenY - origin.screenY,
    };
  };
  if (mirror) {
    mirror.dataset.glimpseletCropMirror = "true";
    mirror.style.cssText =
      "position:fixed;inset:0;overflow:hidden;z-index:2147483647;opacity:1;background:#171410;pointer-events:auto;cursor:crosshair";
    floating.document.documentElement.append(mirror);
    refresh();
    observer = new MutationObserver(refresh);
    observer.observe(host.shadowRoot!, {
      subtree: true,
      attributes: true,
      childList: true,
      characterData: true,
    });
    floating.addEventListener("resize", refresh);
    view.addEventListener("scroll", refresh, true);
  }
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
    observer?.disconnect();
    mirror?.remove();
    floating.removeEventListener("resize", refresh);
    view.removeEventListener("scroll", refresh, true);
    for (const type of pointerEvents)
      floating.removeEventListener(type, pointer, true);
    floating.removeEventListener("click", click, true);
    floating.removeEventListener("keydown", key, true);
  };
}
