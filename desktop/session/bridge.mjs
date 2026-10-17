import { timing } from "../shared/motion.mjs";
import { createHash, randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { OwnedSession } from "./transport.mjs";
import { SessionStore, readTranscript, isUUID } from "./storage.mjs";
import {
  chatMessage,
  limitCleared,
  reconcileTranscript,
  usageLimit,
} from "./normalize.mjs";
import { permissionModes, userMessage } from "./protocol.mjs";
import { families } from "../composer/models.mjs";

const INTERNAL_SOURCES = new Set(["guide", "companion"]);

/** Main-process adapter for shared/contracts.ts. Renderers receive normalized events only. */
export class DesktopSessionBridge {
  constructor({
    userDataDir,
    cwd,
    executable = "claude",
    selection = { model: "haiku", effort: "low" },
    transportFactory = () => new OwnedSession(),
    readTranscript: read = readTranscript,
    retry = {},
    log = defaultLog,
  }) {
    if (!cwd) throw new Error("Session working directory is required");
    validateSelection(selection);
    this.store = new SessionStore(userDataDir);
    this.cwd = resolve(cwd);
    this.executable = executable;
    this.initialSelection = selection;
    this.factory = transportFactory;
    this.read = read;
    this.retry = { minMs: 500, maxMs: 30000, ...retry };
    this.log = log;
    this.listeners = new Set();
    this.hooks = new Set();
    this.idleWaiters = new Set();
    this.operations = Promise.resolve();
    this.events = Promise.resolve();
    this.closed = false;
    this.attempt = 0;
    this.generation = 0;
    this.status = { type: "status", state: "starting" };
    this.seen = new Set();
    this.emittedMessages = new Map();
  }
  /** `visible` is for chat views: turns Blinkling runs for itself (guide
   * analysis, browser companion requests) stay out of the bubbles and the
   * history, while Claude Code and Remote Control keep the full transcript.
   * Internal callers that collect their own turn subscribe unfiltered. */
  subscribe(listener, { visible = false } = {}) {
    const target = visible
      ? (event) => {
          if (!this.internalEvent(event)) listener(event);
        }
      : listener;
    this.listeners.add(target);
    target(structuredClone(this.status));
    if (this.state) {
      if (this.state.remoteId) target(this.identity());
      target({ type: "selection", applied: { ...this.state.selection } });
      for (const message of this.state.messages)
        if (message.content.length) target(structuredClone(message));
    }
    return () => this.listeners.delete(target);
  }
  /** Blink's own words for an Auto explain are not the reader's message: the
   * chat shows the picture that was sent and the answer, not the prompt. */
  withoutAutoPrompt(message) {
    if (message.role !== "user") return message;
    const turn = this.state?.turns.find((item) => item.turn.id === message.id);
    if (turn?.turn.source !== "auto-explain") return message;
    return {
      ...message,
      content: message.content.filter((block) => block.type !== "text"),
    };
  }
  internalTurn(turnId) {
    const turn = this.state?.turns.find((item) => item.turn.id === turnId);
    return INTERNAL_SOURCES.has(turn?.turn.source);
  }
  /** A turn's user message and every assistant message until the next user
   * message belong to it, so a prompt typed remotely makes the chat visible again. */
  internalMessageIds() {
    const ids = new Set();
    let internal = false;
    for (const message of this.state?.messages ?? []) {
      if (message.role === "user") internal = this.internalTurn(message.id);
      if (internal) ids.add(message.id);
    }
    return ids;
  }
  internalEvent(event) {
    if (event.type === "message")
      return this.internalMessageIds().has(event.id);
    if (event.type === "delta") return this.internalTurn(this.active);
    if (event.type === "done") return this.internalTurn(event.turnId);
    return false;
  }
  emit(event) {
    if (event.type === "message") {
      const fingerprint = JSON.stringify(event);
      if (this.emittedMessages.get(event.id) === fingerprint) return;
      this.emittedMessages.set(event.id, fingerprint);
    }
    for (const listener of this.listeners) {
      try {
        listener(structuredClone(event));
      } catch {
        /* A view listener cannot break session persistence or recovery. */
      }
    }
  }
  setStatus(state, detail) {
    this.status = { type: "status", state, ...(detail ? { detail } : {}) };
    this.emit(this.status);
  }
  identity() {
    return {
      type: "identity",
      localId: this.state.localId,
      remoteId: this.state.remoteId,
      url: this.state.url,
    };
  }
  connect() {
    // There is no already-authorized live push API in 2.1.296. Never resume the parent.
    if (this.closed) return Promise.reject(new Error("Session closed"));
    if (this.connecting) return this.connecting;
    this.connecting = this.start();
    return this.connecting;
  }
  async start() {
    this.log(`session start in ${this.cwd} with ${this.executable}`);
    try {
      await this.store.acquire();
      this.state = (await this.store.load()) ?? {
        schema: 1,
        localId: randomUUID(),
        remoteId: null,
        url: null,
        selection: { ...this.initialSelection },
        lastEventId: null,
        started: false,
        turns: [],
        messages: [],
      };
      // Resume in the original project even when another project's plugin opens Blink.
      this.cwd = this.state.cwd ?? this.cwd;
      if (typeof this.cwd !== "string" || !this.cwd)
        throw new Error("Invalid saved session working directory");
      this.state.cwd = this.cwd;
      validateSelection(this.state.selection);
      await this.store.save(this.state);
      await this.openTransport();
    } catch (error) {
      if (isFatal(error)) {
        this.reportProblem(error);
        this.setStatus("blocked", error.code ?? "saved-state");
        throw error;
      }
      this.transportFailed(error);
    }
  }
  async openTransport() {
    if (this.closed) throw new Error("Session closed");
    const records = await this.read(this.cwd, this.state.localId);
    if (this.closed) throw new Error("Session closed");
    // Claude cannot --resume a session before its first conversational record exists.
    // Reuse the reserved UUID and reattach the remote ID for an empty session instead.
    const resumable = records.some((record) => chatMessage(record));
    const generation = ++this.generation;
    const transport = this.factory();
    this.transport = transport;
    let initializing = true;
    const buffered = [];
    transport.on("event", (event) => {
      if (generation !== this.generation || this.closed) return;
      if (initializing) {
        buffered.push(event);
        return;
      }
      this.events = this.events
        .then(() => this.handle(event))
        .catch(() => this.fail("persistence"));
    });
    transport.on("fault", () => {
      if (!initializing && generation === this.generation && !this.closed)
        this.fail();
    });
    try {
      const remote = await transport.connect({
        cwd: this.cwd,
        executable: this.executable,
        localId: this.state.localId,
        sessionId:
          this.state.started && resumable ? this.state.localId : undefined,
        remoteId: this.state.remoteId,
        ...this.state.selection,
      });
      if (this.closed) throw new Error("Session closed");
      // Without Remote Control (BLINKLING_REMOTE=0) there is no remote identity;
      // an earlier one stays recorded so switching back reattaches the same session.
      if (remote.bridge_session_id && remote.session_url) {
        if (
          this.state.remoteId &&
          remote.bridge_session_id !== this.state.remoteId
        )
          throw Object.assign(new Error("Remote session identity changed"), {
            code: "IDENTITY_CHANGED",
          });
        this.state.remoteId = remote.bridge_session_id;
        this.state.url = remote.session_url;
      }
      this.state.started = true;
      this.state.selection = confirmedSelection(await transport.getSelection());
      await this.events;
      const previousTurns = new Map(
        this.state.turns.map((item) => [item.turn.id, item.state]),
      );
      const recovered = reconcileTranscript(
        await this.read(this.cwd, this.state.localId),
        this.state,
      );
      for (const message of recovered) this.upsert(message);
      // Records that only ever held an id (nothing is kept on disk) and that the
      // transcript no longer has are not messages.
      this.state.messages = this.state.messages.filter(
        (message) => message.content.length,
      );
      await this.store.save(this.state);
      if (this.state.remoteId) this.emit(this.identity());
      this.emit({ type: "selection", applied: { ...this.state.selection } });
      for (const message of this.state.messages) this.emit(message);
      this.emitRecoveredCompletion(previousTurns);
      this.ready = true;
      this.attempt = 0;
      initializing = false;
      for (const event of buffered) await this.handle(event);
      this.missing = false;
      this.problem = undefined;
      this.setStatus("connected");
      this.notifyIdle();
      await this.pump();
    } catch (error) {
      this.ready = false;
      await transport.dispose();
      if (this.transport === transport) this.transport = undefined;
      throw error;
    } finally {
      initializing = false;
    }
  }
  enqueue(operation) {
    const run = this.operations.then(() => {
      if (this.closed) throw new Error("Session closed");
      if (!this.state) throw new Error("Session is not connected");
      return operation();
    });
    this.operations = run.catch(() => {});
    return run;
  }
  /** Registers a veto over every turn, before it is queued or written. The hook
   * gets a copy and answers `false`, `{ ok: false, reason }` or nothing; a hook
   * that throws blocks too, because an unknown state must not leak a capture. */
  beforeSend(hook) {
    this.hooks.add(hook);
    return () => this.hooks.delete(hook);
  }
  async admit(turn) {
    for (const hook of this.hooks) {
      let verdict;
      try {
        verdict = await hook(structuredClone(turn));
      } catch {
        verdict = { ok: false, reason: "error" };
      }
      if (verdict === false || verdict?.ok === false)
        throw Object.assign(new Error("This turn was blocked before sending"), {
          code: "SEND_BLOCKED",
          reason: verdict?.reason,
        });
    }
  }
  async send(turn) {
    this.log(`send turn ${turn?.id} from ${turn?.source}`);
    await this.admit(turn);
    return this.enqueue(async () => {
      validateTurn(turn);
      const copy = structuredClone(turn);
      const prior = this.state.turns.find((item) => item.turn.id === copy.id);
      if (prior) {
        if (prior.digest && prior.digest !== digest(copy))
          throw new Error("Turn ID has different content");
        return;
      }
      const item = { turn: copy, state: "queued", digest: digest(copy) };
      this.state.turns.push(item);
      const message = this.withoutAutoPrompt(chatMessage(userMessage(copy)));
      this.upsert(message);
      try {
        await this.store.save(this.state);
      } catch (error) {
        this.state.turns = this.state.turns.filter((entry) => entry !== item);
        this.state.messages = this.state.messages.filter(
          (entry) => entry.id !== copy.id,
        );
        throw error;
      }
      this.emit(message);
      await this.pump();
    });
  }
  async pump() {
    if (
      !this.ready ||
      this.closed ||
      this.active ||
      this.pumping ||
      this.selecting ||
      this.stopping
    )
      return;
    const uncertain = this.state.turns.some(
      (item) => item.state === "uncertain",
    );
    if (uncertain) {
      this.setStatus("retrying", "reconciling");
      this.scheduleReconciliation();
      return;
    }
    const item = this.state.turns.find((item) => item.state === "queued");
    if (!item) {
      this.notifyIdle();
      return;
    }
    this.pumping = true;
    this.active = item.turn.id;
    try {
      item.state = "dispatching";
      await this.store.save(this.state); // Write-ahead fence, before the pipe can admit a paid turn.
      await this.transport.send(item.turn, this.state.localId);
    } catch {
      this.fail();
    } finally {
      this.pumping = false;
      // Nothing is kept after sending: a dispatched turn never replays, so its
      // pixels and text leave memory now. The digest still deduplicates the UUID.
      if (item.state !== "queued") item.turn = forget(item.turn);
    }
  }
  async handle(event) {
    if (event.uuid && this.seen.has(event.uuid)) return;
    if (event.uuid) {
      this.seen.add(event.uuid);
      this.state.lastEventId = event.uuid;
    }
    if (event.type === "system" && event.subtype === "bridge_state") {
      if (event.state === "connected") {
        this.ready = true;
        clearTimeout(this.timer);
        this.timer = undefined;
        this.problem = undefined;
        this.setStatus("connected");
        await this.pump();
      } else if (!["ready"].includes(event.state)) {
        this.ready = false;
        this.setStatus("retrying");
        this.scheduleReconnect();
      }
      return;
    }
    const limit = usageLimit(event);
    if (limit) this.noteLimit(limit);
    else if (limitCleared(event)) this.limit = undefined;
    // The API's own "you've hit your limit" text is not an answer to show.
    const message =
      limit && event.type === "assistant" ? null : chatMessage(event);
    if (message) {
      this.upsert(message, true);
      if (message.role === "user") {
        const item = this.state.turns.find(
          (item) => item.turn.id === message.id,
        );
        if (
          item &&
          ["queued", "dispatching", "accepted", "uncertain"].includes(
            item.state,
          )
        )
          item.state = "accepted";
        if (!item || !["done", "cancelled", "interrupted"].includes(item.state))
          this.active ??= message.id;
      }
    }
    if (event.type === "stream_event" && !event.parent_tool_use_id) {
      const stream = event.event;
      if (stream?.type === "message_start") {
        this.streamingId = stream.message.id;
        this.streamingBlocks = [];
      }
      if (stream?.type === "content_block_start" && this.streamingId)
        this.streamingBlocks[stream.index] = structuredClone(
          stream.content_block,
        );
      if (
        stream?.type === "content_block_delta" &&
        stream.delta?.type === "text_delta" &&
        this.streamingId
      ) {
        const block = (this.streamingBlocks[stream.index] ??= {
          type: "text",
          text: "",
        });
        block.text += stream.delta.text;
        this.upsert({
          type: "message",
          id: this.streamingId,
          role: "assistant",
          content: this.streamingBlocks.filter(Boolean),
        });
        this.emit({
          type: "delta",
          id: this.streamingId,
          text: stream.delta.text,
        });
      }
    }
    if (event.type === "result") {
      clearTimeout(this.checkpointTimer);
      this.checkpointTimer = undefined;
      const id = this.active;
      const item = this.state.turns.find((item) => item.turn.id === id);
      if (item) item.state = "done";
      this.active = undefined;
      this.streamingId = undefined;
      await this.store.save(this.state);
      if (id) this.emit({ type: "done", turnId: id });
      this.notifyIdle();
      await this.pump();
      return;
    }
    if (message) {
      clearTimeout(this.checkpointTimer);
      this.checkpointTimer = undefined;
      await this.store.save(this.state);
    } else if (event.type === "stream_event") this.scheduleCheckpoint();
  }
  scheduleCheckpoint() {
    if (this.checkpointTimer || this.closed) return;
    // Emit deltas immediately; do not rewrite every image in history for every token.
    this.checkpointTimer = setTimeout(() => {
      this.checkpointTimer = undefined;
      this.events = this.events
        .then(() => this.store.save(this.state))
        .catch(() => this.fail("persistence"));
    }, timing.checkpoint);
  }
  upsert(message, emit = false) {
    if (!message) return;
    message = this.withoutAutoPrompt(message);
    const index = this.state.messages.findIndex(
      (item) => item.id === message.id,
    );
    const kept = scrubbed(message);
    if (index < 0) this.state.messages.push(kept);
    else this.state.messages[index] = kept;
    if (emit) this.emit(message);
  }
  select(selection) {
    return this.enqueue(async () => {
      validateSelection(selection);
      await this.waitIdle();
      if (!this.ready) throw new Error("Session is reconnecting");
      this.selecting = true;
      const previous = { ...this.state.selection };
      try {
        const applied = confirmedSelection(
          await this.transport.select(selection),
        );
        if (
          applied.effort !== selection.effort ||
          (selection.permissionMode &&
            applied.permissionMode !== selection.permissionMode) ||
          !modelMatches(selection.model, applied.model)
        )
          throw new Error("Claude did not apply the requested selection");
        this.state.selection = applied;
        await this.store.save(this.state);
        this.emit({ type: "selection", applied });
        return { ...applied };
      } catch (error) {
        this.state.selection = previous;
        try {
          const restored = confirmedSelection(
            await this.transport.select(previous),
          );
          if (JSON.stringify(restored) !== JSON.stringify(previous))
            throw new Error("Selection rollback mismatch");
          await this.store.save(this.state);
        } catch {
          this.fail();
        }
        throw error;
      } finally {
        this.selecting = false;
        await this.pump();
      }
    });
  }
  waitIdle() {
    if (this.closed) return Promise.reject(new Error("Session closed"));
    if (
      !this.active &&
      !this.state.turns.some((item) =>
        ["queued", "dispatching", "accepted", "uncertain"].includes(item.state),
      )
    )
      return Promise.resolve();
    return new Promise((resolve, reject) =>
      this.idleWaiters.add({ resolve, reject }),
    );
  }
  notifyIdle() {
    if (
      this.active ||
      this.state.turns.some((item) =>
        ["queued", "dispatching", "accepted", "uncertain"].includes(item.state),
      )
    )
      return;
    for (const waiter of this.idleWaiters) waiter.resolve();
    this.idleWaiters.clear();
  }
  async stop() {
    if (this.closed) throw new Error("Session closed");
    if (!this.state) throw new Error("Session is not connected");
    this.stopping = true;
    // CLI result marks the running turn done. Queued turns are cancelled, never launched after Stop.
    for (const item of this.state.turns)
      if (["queued", "uncertain"].includes(item.state)) {
        item.state = "cancelled";
        if (this.active === item.turn.id) this.active = undefined;
        this.emit({ type: "done", turnId: item.turn.id });
      }
    try {
      await this.store.save(this.state);
      if (this.ready) await this.transport.stop();
    } finally {
      this.stopping = false;
      this.notifyIdle();
    }
  }
  /** One usage-limit episode is one event, however many signals the stream
   * sends for it. It is neither an error nor a reason to reconnect. */
  noteLimit({ resetAt }) {
    if (
      this.limit &&
      !(resetAt && this.limit.resetAt && resetAt !== this.limit.resetAt)
    ) {
      this.limit.resetAt ??= null;
      return;
    }
    this.limit = { resetAt };
    this.emit({ type: "usage-limit", resetAt });
  }
  /** A missing Claude is something to install, not a fault: say so once and
   * keep looking, so the next launch after installing needs no restart. */
  transportFailed(error) {
    this.log(`session transport failed: ${error?.message ?? error}`);
    if (isMissing(error)) {
      if (!this.missing) {
        this.missing = true;
        this.emit({ type: "claude-missing" });
      }
      this.setStatus("retrying", "claude-missing");
    } else {
      this.reportProblem(error);
      this.setStatus("retrying");
    }
    this.scheduleReconnect();
  }
  /** Every session failure reaches the log, and the user hears of it once in a
   * bubble (a changed reason is said again), never as silence. */
  reportProblem(error) {
    const code = error?.code ?? "failed";
    this.log(`session problem ${code}: ${error?.message ?? error}`);
    if (this.problem === code) return;
    this.problem = code;
    this.emit({ type: "session-problem", code });
  }
  fail(detail) {
    if (this.closed) return;
    this.ready = false;
    this.setStatus("retrying", detail);
    this.scheduleReconnect();
  }
  scheduleReconnect() {
    if (this.closed || this.timer || this.reconnectTask || !this.store.held)
      return;
    const base = Math.min(
      this.retry.maxMs,
      this.retry.minMs * 2 ** Math.min(this.attempt++, 20),
    );
    const delay = Math.min(
      this.retry.maxMs,
      Math.round(base * (0.75 + Math.random() * 0.5)),
    );
    this.timer = setTimeout(() => {
      this.timer = undefined;
      this.reconnectTask = this.reconnect().finally(() => {
        this.reconnectTask = undefined;
        if (!this.closed && !this.ready && this.status.state !== "blocked")
          this.scheduleReconnect();
      });
    }, delay);
  }
  async reconnect() {
    if (this.closed) return;
    this.ready = false;
    ++this.generation;
    await this.transport?.dispose();
    this.transport = undefined;
    await this.events;
    this.active = undefined;
    this.streamingId = undefined;
    try {
      await this.openTransport();
    } catch (error) {
      if (!this.closed) {
        if (isFatal(error)) {
          this.reportProblem(error);
          this.setStatus("blocked", error.code);
        } else this.transportFailed(error);
      }
    }
  }
  scheduleReconciliation() {
    if (this.reconcileTimer || this.closed) return;
    this.reconcileTimer = setTimeout(() => {
      this.reconcileTimer = undefined;
      this.events = this.events
        .then(async () => {
          const previousTurns = new Map(
            this.state.turns.map((item) => [item.turn.id, item.state]),
          );
          for (const message of reconcileTranscript(
            await this.read(this.cwd, this.state.localId),
            this.state,
          ))
            this.upsert(message, true);
          await this.store.save(this.state);
          this.emitRecoveredCompletion(previousTurns);
          this.problem = undefined;
          this.setStatus("connected");
          await this.pump();
        })
        .catch(() => this.fail("reconciliation"));
    }, this.retry.maxMs);
  }
  emitRecoveredCompletion(previous) {
    for (const item of this.state.turns)
      if (
        ["done", "interrupted"].includes(item.state) &&
        previous.get(item.turn.id) !== item.state
      )
        this.emit({ type: "done", turnId: item.turn.id });
  }
  async dispose() {
    if (this.disposal) return this.disposal;
    this.closed = true;
    this.ready = false;
    ++this.generation;
    clearTimeout(this.timer);
    clearTimeout(this.reconcileTimer);
    clearTimeout(this.checkpointTimer);
    for (const waiter of this.idleWaiters)
      waiter.reject(new Error("Session closed"));
    this.idleWaiters.clear();
    this.disposal = (async () => {
      await this.transport?.dispose();
      await this.reconnectTask;
      await this.connecting?.catch(() => {});
      await this.events;
      await this.operations;
      try {
        if (this.store.held && this.state) await this.store.save(this.state);
      } finally {
        await this.store.release();
        this.listeners.clear();
      }
    })();
    return this.disposal;
  }
}
function validateSelection(selection) {
  if (
    !selection ||
    typeof selection.model !== "string" ||
    !/^[a-zA-Z0-9][a-zA-Z0-9._:[\]-]{0,127}$/.test(selection.model) ||
    !["low", "medium", "high", "xhigh", "max"].includes(selection.effort) ||
    (selection.permissionMode !== undefined &&
      !permissionModes.includes(selection.permissionMode))
  )
    throw new Error("Invalid model or effort selection");
}
function confirmedSelection(value) {
  validateSelection(value);
  return {
    model: value.model,
    effort: value.effort,
    ...(value.permissionMode ? { permissionMode: value.permissionMode } : {}),
  };
}
function validateTurn(turn) {
  if (
    !turn ||
    !isUUID(turn.id) ||
    typeof turn.text !== "string" ||
    turn.text.length > 100000 ||
    !Array.isArray(turn.attachments) ||
    turn.attachments.length > 20 ||
    !["composer", "quick-ask", "guide", "auto-explain", "companion"].includes(
      turn.source,
    )
  )
    throw new Error("Invalid desktop turn");
  if (!turn.text.trim() && !turn.attachments.length)
    throw new Error("Empty desktop turn");
  userMessage(turn);
}
function defaultLog(line) {
  console.error(`[blinkling ${new Date().toISOString()}] ${line}`);
}
function isFatal(error) {
  return (
    ["UNSUPPORTED_CLAUDE", "SESSION_LOCKED", "IDENTITY_CHANGED"].includes(
      error.code,
    ) ||
    /Invalid saved|Invalid model|Invalid session writer/.test(error.message)
  );
}

function isMissing(error) {
  return (
    error.code === "ENOENT" &&
    /^spawn/.test(error.syscall ?? error.message ?? "")
  );
}
const digest = (turn) =>
  createHash("sha256").update(JSON.stringify(turn)).digest("hex");
function forget(turn) {
  return { id: turn.id, source: turn.source, text: "", attachments: [] };
}
/** The stored copy of a message never holds pixels; subscribers saw them live. */
function scrubbed(message) {
  const copy = structuredClone(message);
  copy.content = copy.content.filter((block) => block.type !== "image");
  return copy;
}

function modelMatches(requested, actual) {
  return (
    requested === actual ||
    (families.includes(requested) && actual.startsWith(`claude-${requested}-`))
  );
}
