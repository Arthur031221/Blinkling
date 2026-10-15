import { popupText, type PopupText } from "./strings";

/** What the background reports for the popup. */
export type PopupStatus = {
  trusted: boolean;
  connected: boolean;
  blink?: boolean;
  pageReadable: boolean;
};

export type StatusLine = { text: string; ok: boolean | undefined };

/** One line each: the link to Blinkling, Blink itself and the current page. */
export function statusLines(
  status: PopupStatus,
  text: PopupText,
): StatusLine[] {
  return [
    status.connected
      ? { text: text.connected, ok: true }
      : {
          text: status.trusted ? text.bridgeMissing : text.notSetUp,
          ok: false,
        },
    !status.connected
      ? { text: text.blinkUnknown, ok: undefined }
      : status.blink
        ? { text: text.blinkRunning, ok: true }
        : { text: text.blinkOff, ok: false },
    status.pageReadable
      ? { text: text.pageReadable, ok: true }
      : { text: text.pageRestricted, ok: false },
  ];
}

/** The drawn name: the same band of light and stars as the other surfaces. */
function drawTitle(heading: HTMLElement): void {
  const name = document.createElement("span");
  name.className = "sparkle-name";
  const word = document.createElement("span");
  word.className = "sparkle-text";
  word.textContent = "Blinkling";
  name.append(word);
  for (let star = 0; star < 3; star++) {
    const mark = document.createElement("i");
    mark.className = "sparkle-star";
    mark.setAttribute("aria-hidden", "true");
    name.append(mark);
  }
  heading.replaceChildren(name);
}

export async function mountPopup(root: Document = document): Promise<void> {
  const text = popupText(chrome.i18n.getUILanguage());
  const lines = root.getElementById("lines")!;
  const wake = root.getElementById("wake") as HTMLButtonElement;
  const note = root.getElementById("note")!;
  drawTitle(root.getElementById("title")!);
  root.documentElement.lang = chrome.i18n.getUILanguage();
  wake.textContent = text.wake;

  const refresh = async () => {
    const status = (await chrome.runtime
      .sendMessage({ type: "blinkling:status" })
      .catch(() => undefined)) as PopupStatus | undefined;
    const shown = status ?? {
      trusted: false,
      connected: false,
      pageReadable: false,
    };
    lines.replaceChildren(
      ...statusLines(shown, text).map((line) => {
        const item = document.createElement("li");
        item.textContent = line.text;
        if (line.ok !== undefined) item.dataset.ok = String(line.ok);
        return item;
      }),
    );
    wake.disabled = !shown.connected;
  };

  wake.addEventListener("click", async () => {
    wake.disabled = true;
    note.textContent = text.waking;
    const reply = (await chrome.runtime
      .sendMessage({ type: "blinkling:wake" })
      .catch(() => undefined)) as { ok?: boolean } | undefined;
    note.textContent = reply?.ok ? "" : text.wakeFailed;
    await refresh();
  });
  await refresh();
}

if (typeof document !== "undefined" && document.getElementById("lines"))
  void mountPopup();
