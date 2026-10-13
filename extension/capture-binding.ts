export type CaptureBinding = {
  tabId: number;
  handle: string;
  origin: string;
  url: string;
  documentId: string;
};
type CaptureTrack = MediaStreamTrack & {
  getCaptureHandle?: () => { handle: string; origin?: string } | null;
};

export function inspectableCaptureUrl(url: string): boolean {
  return /^https?:\/\//i.test(url);
}

export function matchesCaptureBinding(
  track: MediaStreamTrack | undefined,
  binding: CaptureBinding | undefined,
  tabId: number | undefined,
): boolean {
  if (!track || !binding || binding.tabId !== tabId) return false;
  try {
    const handle = (track as CaptureTrack).getCaptureHandle?.();
    return (
      track.readyState === "live" &&
      !track.muted &&
      track.getSettings().displaySurface === "browser" &&
      handle?.handle === binding.handle &&
      handle?.origin === binding.origin
    );
  } catch {
    return false;
  }
}

export async function prepareCaptureBinding(
  tab: chrome.tabs.Tab,
): Promise<CaptureBinding | undefined> {
  if (!tab.id || !tab.url || !inspectableCaptureUrl(tab.url)) return;
  const binding = {
    tabId: tab.id,
    handle: crypto.randomUUID(),
    origin: new URL(tab.url).origin,
    url: tab.url,
  };
  try {
    const [result] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      world: "MAIN",
      args: [
        binding.handle,
        new URL(chrome.runtime.getURL("panel.html")).origin,
        tab.url,
      ],
      func: (handle: string, permittedOrigin: string, expectedUrl: string) => {
        const devices = navigator.mediaDevices as MediaDevices & {
          setCaptureHandleConfig?: (config: {
            handle: string;
            exposeOrigin: boolean;
            permittedOrigins: string[];
          }) => void;
        };
        if (!devices?.setCaptureHandleConfig || location.href !== expectedUrl)
          return false;
        devices.setCaptureHandleConfig({
          handle,
          exposeOrigin: true,
          permittedOrigins: [permittedOrigin],
        });
        return { origin: location.origin, url: location.href };
      },
    });
    if (
      result?.frameId === 0 &&
      result.documentId &&
      result.result &&
      result.result.origin === binding.origin &&
      result.result.url === binding.url
    )
      return { ...binding, documentId: result.documentId };
  } catch {
    // Sharing still works when this page cannot expose a capture handle.
  }
}
