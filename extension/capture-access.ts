// Invoke directly from the click/key handler, before any await. HTTP/HTTPS
// origins alone allow scripting but do not authorize tabs.captureVisibleTab.
// Chrome remembers this optional grant; subsequent captures do not prompt.
export function requestCaptureAccess(): Promise<boolean> {
  return chrome.permissions.request({ origins: ["<all_urls>"] });
}
