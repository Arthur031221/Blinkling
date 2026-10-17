import { createServer } from "node:http";
import { randomBytes, timingSafeEqual } from "node:crypto";
import { readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { privateDirectory, atomicJson } from "./install.mjs";
import { endpointPath, runtimeDirectory } from "./paths.mjs";
import { markQuit } from "./sessions.mjs";

const MAX_BODY = 24 * 1024 * 1024;
const turnIdValid = (id) =>
  typeof id === "string" && /^[a-f0-9-]{36}$/i.test(id);
const same = (a, b) =>
  typeof a === "string" &&
  a.length === b.length &&
  timingSafeEqual(Buffer.from(a), Buffer.from(b));
const json = (res, status, value) => {
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
  });
  res.end(JSON.stringify(value));
};
async function body(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY) throw new Error("Desktop request exceeds size limit");
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString());
}
function validateTurn(turn) {
  if (
    !turn ||
    !turnIdValid(turn.id) ||
    typeof turn.text !== "string" ||
    !turn.text.trim() ||
    turn.text.length > 64_000 ||
    turn.source !== "companion" ||
    !Array.isArray(turn.attachments) ||
    turn.attachments.length > 8
  )
    throw new Error("Invalid companion turn");
  for (const a of turn.attachments)
    if (
      !a ||
      typeof a.id !== "string" ||
      a.id.length > 100 ||
      typeof a.name !== "string" ||
      a.name.length > 300 ||
      !["image/png", "image/jpeg", "image/webp", "image/gif"].includes(
        a.mediaType,
      ) ||
      typeof a.data !== "string" ||
      a.data.length > 20 * 1024 * 1024 ||
      !/^[A-Za-z0-9+/]*={0,2}$/.test(a.data)
    )
      throw new Error("Invalid companion attachment");
}
async function* lines(stream) {
  const decoder = new TextDecoder();
  let pending = "";
  for await (const chunk of stream) {
    pending += decoder.decode(chunk, { stream: true });
    if (pending.length > 24 * 1024 * 1024 * 8)
      throw new Error("Full-page capture exceeds size limit");
    let end;
    while ((end = pending.indexOf("\n")) >= 0) {
      const line = pending.slice(0, end);
      pending = pending.slice(end + 1);
      if (line.trim()) yield line;
    }
  }
  if (pending.trim()) yield pending;
}
function validateTiles(value) {
  const { tiles, page } = value;
  if (!Array.isArray(tiles) || !tiles.length || tiles.length > 8)
    throw new Error("Invalid full-page capture");
  for (const tile of tiles)
    if (
      !tile?.image ||
      tile.image.mediaType !== "image/png" ||
      typeof tile.image.data !== "string" ||
      tile.image.data.length > 20 * 1024 * 1024 ||
      !Number.isSafeInteger(tile.pixelWidth) ||
      !Number.isSafeInteger(tile.pixelHeight) ||
      tile.pixelWidth < 1 ||
      tile.pixelHeight < 1
    )
      throw new Error("Invalid full-page capture");
  return {
    ...tiles[0],
    capturedAt: value.capturedAt,
    tiles,
    truncated: value.truncated === true,
    page,
  };
}
/** The most a mirrored line may carry. */
export const MIRROR_LIMIT = 20_000;

/** Main-process-only adapter. The shell supplies its one durable SessionBridge.
 * No credentials, file APIs or renderer access are exposed through this transport.
 */
export async function startDesktopHost({
  session,
  onOpen = () => {},
  onShutdown = () => {},
  onMirror = () => {},
  onLink = () => {},
  onUnlink = () => {},
  onReply = () => {},
  onTurnEnd = () => {},
  onTurnStart = () => {},
  onBusy = () => {},
  chatImages = async () => [],
  descriptor = endpointPath(),
  directory = runtimeDirectory(),
  version = "3.2.4",
} = {}) {
  await privateDirectory(directory);
  const token = randomBytes(32).toString("hex");
  let current = session,
    unsubscribe,
    companion,
    active,
    cancelled,
    finished,
    admitting = false,
    selecting = false,
    identity,
    selection;
  const streams = new Set();
  /** The Claude Code sessions that are linked to Blink: one open stream each,
   * held by that session's plugin server. `channel` says the session was
   * started with the channel flag, so Blink's chat can be answered by it. */
  const links = new Map();
  const sessionId = (value) =>
    typeof value === "string" && /^[\w-]{1,80}$/.test(value) ? value : "";
  const toLink = (session, frame) => {
    const link = links.get(session);
    if (!link?.channel || link.res.destroyed) return false;
    link.res.write(JSON.stringify(frame) + "\n");
    return true;
  };
  // Stop can arrive on another connection before the image body is fully read.
  // Keep bounded, short-lived UUID tombstones without interrupting other turns.
  const cancelledUploads = new Map();
  const recent = [];
  let sequence = 0;
  const emit = (event) => {
    if (event.type === "done" && event.turnId === active) {
      finished = active;
      if (!admitting) {
        active = undefined;
        cancelled = undefined;
      }
    }
    if (event.type === "identity") identity = event;
    if (event.type === "selection") selection = event.applied;
    const frame = { sequence: ++sequence, event };
    recent.push(frame);
    if (recent.length > 512) recent.shift();
    for (const res of streams) res.write(JSON.stringify(frame) + "\n");
  };
  const attach = (value) => {
    unsubscribe?.();
    current = value;
    unsubscribe = value?.subscribe(emit);
  };
  attach(session);
  const server = createServer((req, res) => {
    void (async () => {
      if (
        req.headers.host !== address.host ||
        req.headers.origin ||
        !same(req.headers.authorization, `Bearer ${token}`)
      ) {
        json(res, 403, { error: "Unauthorized desktop request" });
        return;
      }
      if (req.method === "GET" && req.url === "/status") {
        json(res, 200, {
          version,
          pid: process.pid,
          session: Boolean(current),
          companion: Boolean(companion),
          identity,
          selection,
        });
        return;
      }
      if (req.method === "GET" && /^\/events\?after=\d+$/.test(req.url || "")) {
        const after = Number(
          new URL(req.url, address.url).searchParams.get("after"),
        );
        res.writeHead(200, {
          "Content-Type": "application/x-ndjson",
          "Cache-Control": "no-store",
        });
        res.flushHeaders();
        for (const frame of recent)
          if (frame.sequence > after) res.write(JSON.stringify(frame) + "\n");
        streams.add(res);
        const heartbeat = setInterval(() => res.write("\n"), 10_000);
        res.on("close", () => {
          clearInterval(heartbeat);
          streams.delete(res);
        });
        return;
      }
      if (req.method === "GET" && /^\/link\?/.test(req.url || "")) {
        const query = new URL(req.url, address.url).searchParams;
        const id = sessionId(query.get("session"));
        if (!id) throw new Error("Invalid session");
        const link = {
          session: id,
          pid: Number.isSafeInteger(Number(query.get("pid")))
            ? Number(query.get("pid"))
            : 0,
          cwd: String(query.get("cwd") ?? "").slice(0, 500),
          channel: query.get("channel") === "1",
          res,
        };
        res.writeHead(200, {
          "Content-Type": "application/x-ndjson",
          "Cache-Control": "no-store",
        });
        res.flushHeaders();
        links.get(id)?.res.end();
        links.set(id, link);
        res.write(JSON.stringify({ type: "linked" }) + "\n");
        onLink({
          session: id,
          pid: link.pid,
          cwd: link.cwd,
          channel: link.channel,
        });
        const heartbeat = setInterval(() => res.write("\n"), 10_000);
        res.on("close", () => {
          clearInterval(heartbeat);
          if (links.get(id) === link) {
            links.delete(id);
            onUnlink({ session: id });
          }
        });
        return;
      }
      if (req.method !== "POST" || req.url !== "/rpc") {
        json(res, 404, { error: "Unknown desktop request" });
        return;
      }
      const message = await body(req);
      switch (message.method) {
        case "open":
          await onOpen({ session: sessionId(message.session) });
          json(res, 200, { ok: true });
          return;
        case "reply": {
          // The terminal session's answer to a chat held in Blink.
          const text = typeof message.text === "string" ? message.text : "";
          if (
            !sessionId(message.session) ||
            !text.trim() ||
            text.length > MIRROR_LIMIT
          )
            throw new Error("Invalid reply");
          const result = await onReply({
            session: message.session,
            turn: typeof message.turn === "string" ? message.turn : "",
            text,
          });
          // "late": Blink's own session already answered that question.
          json(res, 200, { ok: Boolean(result), late: result === "late" });
          return;
        }
        case "turn-start": {
          // A prompt hook: the linked session took Blink's question.
          if (!sessionId(message.session)) throw new Error("Invalid session");
          json(res, 200, {
            ok: await onTurnStart({ session: message.session }),
          });
          return;
        }
        case "busy": {
          // A prompt or Stop hook: the linked session is at work or free.
          if (!sessionId(message.session)) throw new Error("Invalid session");
          json(res, 200, {
            ok: await onBusy({
              session: message.session,
              busy: message.busy === true,
            }),
          });
          return;
        }
        case "turn-end": {
          // A Stop hook: the turn in a linked session ended with this text.
          if (!sessionId(message.session)) throw new Error("Invalid session");
          json(res, 200, {
            ok: await onTurnEnd({
              session: message.session,
              text:
                typeof message.text === "string"
                  ? message.text.slice(0, MIRROR_LIMIT)
                  : "",
            }),
          });
          return;
        }
        case "chat-images": {
          if (!sessionId(message.session)) throw new Error("Invalid session");
          json(res, 200, {
            images: await chatImages({ session: message.session }),
          });
          return;
        }
        case "reconnect":
          json(res, 200, { ok: true });
          return;
        case "mirror": {
          // A line typed or answered in the terminal, to show in Blink's chat.
          const { role, text, id } = message;
          if (
            (role !== "user" && role !== "assistant") ||
            typeof text !== "string" ||
            !text.trim() ||
            text.length > MIRROR_LIMIT ||
            typeof id !== "string" ||
            !/^[\w.:-]{1,160}$/.test(id)
          )
            throw new Error("Invalid mirrored line");
          onMirror({ role, text, id, session: sessionId(message.session) });
          json(res, 200, { ok: true });
          return;
        }
        case "shutdown":
          // A deliberate quit also switches off the "keep Blink running"
          // marker; only a crash or restart should make callers wait for a return.
          await rm(join(directory, "enabled.json"), { force: true });
          json(res, 200, { ok: true });
          queueMicrotask(onShutdown);
          return;
        case "companion": {
          const url = new URL(message.url);
          if (
            url.protocol !== "http:" ||
            url.hostname !== "127.0.0.1" ||
            !url.port ||
            url.pathname !== "/desktop-companion" ||
            url.search ||
            url.hash ||
            url.username ||
            url.password ||
            !/^[a-f0-9]{64}$/.test(message.token)
          )
            throw new Error("Invalid local companion endpoint");
          // Challenge the authenticated endpoint before using it for captures.
          const probe = await fetch(url, {
            headers: { Authorization: `Bearer ${message.token}` },
            redirect: "error",
            signal: AbortSignal.timeout(2500),
          });
          if (!probe.ok || (await probe.json()).companion !== true)
            throw new Error("Companion did not authenticate");
          companion = { url: url.href, token: message.token };
          json(res, 200, { ok: true });
          return;
        }
        case "select": {
          if (!current) {
            json(res, 503, { error: "Desktop session is reconnecting" });
            return;
          }
          if (active || selecting)
            throw new Error(
              "Wait for the current answer before changing the model",
            );
          const selection = message.selection;
          if (
            !selection ||
            typeof selection.model !== "string" ||
            selection.model.length > 100 ||
            !["low", "medium", "high", "xhigh", "max"].includes(
              selection.effort,
            )
          )
            throw new Error("Invalid session selection");
          selecting = true;
          try {
            const applied = await current.select(selection);
            emit({ type: "selection", applied });
            json(res, 200, applied);
          } finally {
            selecting = false;
          }
          return;
        }
        case "stop":
          if (!turnIdValid(message.turnId)) throw new Error("Invalid turn ID");
          cancelledUploads.set(message.turnId, Date.now());
          if (cancelledUploads.size > 128)
            cancelledUploads.delete(cancelledUploads.keys().next().value);
          if (active !== undefined && active === message.turnId) {
            cancelled = active;
            await current?.stop();
          }
          json(res, 200, { ok: true });
          return;
        case "send": {
          if (!current) {
            json(res, 503, { error: "Desktop session is reconnecting" });
            return;
          }
          validateTurn(message.turn);
          for (const [id, time] of cancelledUploads)
            if (Date.now() - time > 120_000) cancelledUploads.delete(id);
          if (cancelledUploads.has(message.turn.id))
            throw new Error("The answer stopped before sending");
          if (active || selecting) {
            json(res, 409, { error: "Desktop session is answering" });
            return;
          }
          active = message.turn.id;
          cancelled = undefined;
          finished = undefined;
          admitting = true;
          try {
            if (message.selection) {
              if (
                typeof message.selection.model !== "string" ||
                message.selection.model.length > 100 ||
                !["low", "medium", "high", "xhigh", "max"].includes(
                  message.selection.effort,
                )
              )
                throw new Error("Invalid session selection");
              const applied = await current.select(message.selection);
              emit({ type: "selection", applied });
            }
            if (cancelled === message.turn.id)
              throw new Error("The answer stopped before sending");
            await current.send(message.turn);
            json(res, 200, { ok: true });
          } catch (error) {
            active = undefined;
            cancelled = undefined;
            throw error;
          } finally {
            admitting = false;
            if (finished === message.turn.id) {
              active = undefined;
              cancelled = undefined;
            }
          }
          return;
        }
        default:
          throw new Error("Unknown desktop method");
      }
    })().catch((error) => {
      if (!res.headersSent) json(res, 400, { error: error.message });
      else res.end();
    });
  });
  server.requestTimeout = 15_000;
  server.headersTimeout = 10_000;
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const port = server.address().port;
  const address = {
    host: `127.0.0.1:${port}`,
    url: `http://127.0.0.1:${port}`,
    token,
    pid: process.pid,
    version,
  };
  try {
    await atomicJson(descriptor, address);
  } catch (error) {
    server.close();
    throw error;
  }
  /** One authenticated call to the bridge's companion endpoint; undefined when
   * there is no helper or the call failed. */
  async function callCompanion(body, signal, timeoutMs) {
    if (!companion) return undefined;
    try {
      const response = await fetch(companion.url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${companion.token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
        redirect: "error",
        signal: signal ?? AbortSignal.timeout(timeoutMs),
      });
      if (!response.ok) return undefined;
      return await response.json();
    } catch (error) {
      if (error instanceof TypeError && !signal?.aborted) companion = undefined;
      return undefined;
    }
  }
  return {
    address,
    attachSession: attach,
    /** The linked sessions, oldest first. */
    links: () =>
      [...links.values()].map(({ session, pid, cwd, channel }) => ({
        session,
        pid,
        cwd,
        channel,
      })),
    /** Sends one frame to a session started with the channel flag; false when
     * that session is not linked that way. */
    toSession: toLink,
    /** Blink is closing: sessions started with the channel flag get a notice
     * event, every other linked session (and a flagged one whose events are
     * dropped) is marked for the notice hook. */
    /** A session started with the channel flag never took a question sent to
     * it: its events are dropped, so it is told like any other session. */
    dropChannel(session) {
      const link = links.get(session);
      if (link) link.dropped = true;
    },
    async announceQuit() {
      const channels = [...links.values()]
        .filter((l) => l.channel && !l.dropped)
        .map((l) => l.session);
      for (const id of channels)
        toLink(id, {
          type: "notice",
          text: "Blink was closed. Its chat cannot reach this session until Blink is started again with /blinkling.",
        });
      await markQuit(directory, channels).catch(() => {});
      return channels.length;
    },
    /** The same frame to every session that can take it. */
    toChannels(frame) {
      let count = 0;
      for (const id of links.keys()) if (toLink(id, frame)) count++;
      return count;
    },
    /** Whether the helper answers right now. A registration is made once, so
     * the endpoint is asked again, and one that is gone is forgotten. */
    async companionConnected({ timeout = 400 } = {}) {
      const known = companion;
      if (!known) return false;
      try {
        const response = await fetch(known.url, {
          headers: { Authorization: `Bearer ${known.token}` },
          redirect: "error",
          signal: AbortSignal.timeout(timeout),
        });
        return response.ok && (await response.json()).companion === true;
      } catch (error) {
        if (error instanceof TypeError && companion === known)
          companion = undefined;
        return false;
      }
    },
    async openCompanionGuide() {
      if (!companion)
        throw new Error(
          "Open /blinkling:blinkling in Claude Code to load the optional browser helper guide.",
        );
      const response = await fetch(companion.url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${companion.token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ method: "open-guide" }),
        redirect: "error",
        signal: AbortSignal.timeout(15_000),
      });
      if (!response.ok)
        throw new Error("The browser helper guide could not open");
    },
    /** Page structure from the optional browser helper, or null when there is
     * no helper, no Chrome or Edge window under `point` (screen DIP), or the page
     * is restricted. Secure fields come back with no name or text. `fresh` skips the
     * helper's short cache, for the read a click depends on. */
    async elements({ point, signal, fresh } = {}) {
      const value = await callCompanion(
        { method: "elements", point, ...(fresh === true ? { fresh } : {}) },
        signal,
        8000,
      );
      return value?.result ?? null;
    },
    /** Translates the current page in place, or restores it with `on: false`. */
    async translatePage({ on = true, signal } = {}) {
      const value = await callCompanion(
        { method: "translate-page", on: on !== false },
        signal,
        31 * 60_000,
      );
      return { ok: value?.ok === true };
    },
    /** Opens the current browser PDF in the extension's reader. */
    async openPdfReader({ signal } = {}) {
      const value = await callCompanion(
        { method: "open-pdf-reader" },
        signal,
        10_000,
      );
      return { ok: value?.ok === true };
    },
    /** The page as tiles, top to bottom. `onProgress({completed, total})` follows
     * the browser while it scrolls. The result is the first tile's capture with
     * every tile in `tiles` (and `truncated` when the page was cut short). */
    async fullPage(signal, onProgress) {
      if (!companion) return { companionRequired: true };
      try {
        const result = await fetch(companion.url, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${companion.token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ method: "full-page" }),
          redirect: "error",
          signal: signal || AbortSignal.timeout(90_000),
        });
        if (!result.ok) throw new Error("Full-page companion capture failed");
        let value;
        for await (const line of lines(result.body)) {
          const frame = JSON.parse(line);
          if (frame.progress) {
            const { completed, total } = frame.progress;
            if (Number.isSafeInteger(completed) && Number.isSafeInteger(total))
              onProgress?.({ completed, total });
          } else value = frame;
        }
        if (!value) throw new Error("Full-page companion capture failed");
        if (value.companionRequired) return value;
        return validateTiles(value);
      } catch (error) {
        if (signal?.aborted) throw error;
        if (error instanceof TypeError) companion = undefined;
        return { companionRequired: true };
      }
    },
    async close() {
      unsubscribe?.();
      for (const res of streams) res.end();
      for (const link of links.values()) link.res.end();
      await new Promise((resolve) => {
        server.close(resolve);
        server.closeAllConnections();
      });
      try {
        const old = JSON.parse(await readFile(descriptor, "utf8"));
        if (old.token === token) await rm(descriptor);
      } catch (e) {
        if (e.code !== "ENOENT") throw e;
      }
    },
  };
}
