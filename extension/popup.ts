import { bundles, chooseLocale } from "./i18n";

/** What the worker knows: whether Blink's bridge is paired and Blink itself is up. */
export type PopupState = { link: boolean; blink: boolean };

const locale = chooseLocale(navigator.languages ?? [navigator.language]);
const strings = bundles[locale];
const row = (name: string) =>
  document.querySelector<HTMLLIElement>(`li[data-row="${name}"]`)!;
const sites = document.querySelector<HTMLButtonElement>("#sites")!;
const wake = document.querySelector<HTMLButtonElement>("#wake")!;
const note = document.querySelector<HTMLElement>("#note")!;
const ALL_SITES = { origins: ["<all_urls>"] };

function show(name: string, ok: boolean, text: string): void {
  const item = row(name);
  item.dataset.ok = String(ok);
  item.lastElementChild!.textContent = text;
}

async function refresh(): Promise<void> {
  const [state, allowed] = await Promise.all([
    chrome.runtime
      .sendMessage({ type: "blinkling:status" })
      .catch(() => undefined) as Promise<PopupState | undefined>,
    chrome.permissions.contains(ALL_SITES).catch(() => false),
  ]);
  show(
    "link",
    Boolean(state?.link),
    state?.link ? strings.linkOn : strings.linkOff,
  );
  show(
    "blink",
    Boolean(state?.blink),
    state?.blink ? strings.blinkOn : strings.blinkOff,
  );
  show("sites", allowed, allowed ? strings.sitesOn : strings.sitesOff);
  sites.hidden = allowed;
  wake.disabled = !state?.link;
}

sites.textContent = strings.allowSites;
wake.textContent = strings.wake;
document.documentElement.lang = locale;

// The permission prompt needs the click's user gesture, so it is requested here
// and never from the worker.
sites.addEventListener("click", () => {
  void chrome.permissions
    .request(ALL_SITES)
    .catch(() => false)
    .then(refresh);
});
wake.addEventListener("click", () => {
  wake.disabled = true;
  note.textContent = strings.waking;
  void (
    chrome.runtime
      .sendMessage({ type: "blinkling:wake" })
      .catch(() => undefined) as Promise<{ ok?: boolean } | undefined>
  ).then(async (response) => {
    note.textContent = response?.ok ? strings.awake : strings.wakeFailed;
    await refresh();
  });
});
void refresh();
