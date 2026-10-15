import { inHelperRange } from "./helper-client";

/**
 * Only the bridge's own setup page, on a port the bridge can have bound, may
 * hand the extension its trust secret: not another page, not another extension.
 */
export function trustSender(
  sender: {
    id?: string;
    url?: string;
    tab?: unknown;
  },
  port: number,
  ownId: string,
): boolean {
  if (sender.id !== ownId || !sender.tab || !sender.url) return false;
  try {
    const url = new URL(sender.url);
    return (
      url.protocol === "http:" &&
      ["127.0.0.1", "localhost"].includes(url.hostname) &&
      url.pathname === "/install" &&
      Number(url.port) === port &&
      inHelperRange(port)
    );
  } catch {
    return false;
  }
}
