import { readFile, lstat, rm } from "node:fs/promises";
import { endpointPath } from "./paths.mjs";

/** `timeoutMs` bounds the liveness ping. With `removeStale`, an endpoint whose
 * port refuses connections (Blink was killed or crashed) is deleted, unless a
 * newer Blink has meanwhile replaced the file. */
export async function discoverDesktop(
  path = endpointPath(),
  { timeoutMs = 5000, removeStale = false } = {},
) {
  try {
    const stat = await lstat(path);
    if (
      !stat.isFile() ||
      stat.isSymbolicLink() ||
      stat.size > 4096 ||
      (process.platform !== "win32" &&
        (stat.uid !== process.getuid() || stat.mode & 0o077))
    )
      throw new Error("Unsafe desktop endpoint file");
    const endpoint = JSON.parse(await readFile(path, "utf8"));
    const url = new URL(endpoint.url);
    if (
      url.protocol !== "http:" ||
      url.hostname !== "127.0.0.1" ||
      !url.port ||
      url.pathname !== "/" ||
      url.username ||
      url.password ||
      url.hash ||
      url.search ||
      !/^[a-f0-9]{64}$/.test(endpoint.token)
    )
      throw new Error("Invalid desktop endpoint");
    const client = new DesktopClient(endpoint);
    try {
      const status = await client.status(timeoutMs);
      return { client, status };
    } catch (error) {
      if (removeStale && error?.cause?.code === "ECONNREFUSED")
        await removeIfSame(path, endpoint.token);
      throw error;
    }
  } catch (error) {
    if (
      error.code === "ENOENT" ||
      error instanceof TypeError ||
      error.name === "TimeoutError"
    )
      return undefined;
    throw error;
  }
}
async function removeIfSame(path, token) {
  try {
    if (JSON.parse(await readFile(path, "utf8")).token === token)
      await rm(path);
  } catch {
    /* Already gone or replaced by a newer Blink. */
  }
}
export class DesktopClient {
  constructor(endpoint) {
    this.endpoint = endpoint;
  }
  async request(path, options = {}) {
    const response = await fetch(this.endpoint.url + path, {
      ...options,
      headers: {
        ...options.headers,
        Authorization: `Bearer ${this.endpoint.token}`,
      },
      signal: options.signal || AbortSignal.timeout(5000),
      redirect: "error",
    });
    if (!response.ok) {
      const value = await response.json();
      throw new Error(
        value.error || `Desktop request failed (${response.status})`,
      );
    }
    return response;
  }
  async status(timeoutMs = 5000) {
    return (
      await this.request("/status", { signal: AbortSignal.timeout(timeoutMs) })
    ).json();
  }
  async rpc(method, value = {}, signal) {
    return (
      await this.request("/rpc", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ method, ...value }),
        signal,
      })
    ).json();
  }
  /** Holds the line a Claude Code session keeps open to Blink. Resolves when
   * it ends; `onEvent` gets each frame Blink sends this session. */
  link(params, onEvent, signal, onReady = () => {}) {
    const query = new URLSearchParams(
      Object.entries(params).map(([k, v]) => [k, String(v)]),
    );
    return this.events(onEvent, signal, 0, onReady, `/link?${query}`);
  }
  async events(
    onEvent,
    signal,
    after = 0,
    onReady = () => {},
    path = `/events?after=${after}`,
  ) {
    const response = await this.request(path, { signal });
    onReady();
    const reader = response.body.getReader(),
      decoder = new TextDecoder();
    let pending = "";
    try {
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        pending += decoder.decode(value, { stream: true });
        if (pending.length > 24 * 1024 * 1024)
          throw new Error("Desktop event exceeds size limit");
        for (let index; (index = pending.indexOf("\n")) >= 0; ) {
          const line = pending.slice(0, index);
          pending = pending.slice(index + 1);
          if (line) onEvent(JSON.parse(line));
        }
      }
      if (!signal.aborted) throw new Error("Desktop event stream ended");
    } finally {
      await reader.cancel().catch(() => {});
    }
  }
}
