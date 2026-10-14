import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { OwnedSession } from "./transport.mjs";
import { SessionStore, readTranscript, isUUID } from "./storage.mjs";
import { chatMessage, reconcileTranscript } from "./normalize.mjs";
import { userMessage } from "./protocol.mjs";

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
    this.listeners = new Set();
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
  subscribe(listener) {
    this.listeners.add(listener);
    listener(structuredClone(this.status));
    if (this.state) {
      if (this.state.remoteId) listener(this.identity());
      listener({ type: "selection", applied: { ...this.state.selection } });
      for (const message of this.state.messages)
        listener(structuredClone(message));
    }
    return () => this.listeners.delete(listener);
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
        this.setStatus("blocked", error.code ?? "saved-state");
        throw error;
      }
      this.setStatus("retrying");
      this.scheduleReconnect();
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
      // GLIMPSELET_REMOTE=0 returns no identity: keep whatever was saved.
      if (remote.bridge_session_id) {
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
      await this.store.save(this.state);
      if (this.state.remoteId) this.emit(this.identity());
      this.emit({ type: "selection", applied: { ...this.state.selection } });
      for (const message of this.state.messages) this.emit(message);
      this.emitRecoveredCompletion(previousTurns);
      this.ready = true;
      this.attempt = 0;
      initializing = false;
      for (const event of buffered) await this.handle(event);
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
  send(turn) {
    return this.enqueue(async () => {
      validateTurn(turn);
      const copy = structuredClone(turn);
      const prior = this.state.turns.find((item) => item.turn.id === copy.id);
      if (prior) {
        if (JSON.stringify(prior.turn) !== JSON.stringify(copy))
          throw new Error("Turn ID has different content");
        return;
      }
      const item = { turn: copy, state: "queued" };
      const message = chatMessage(userMessage(copy));
      this.state.turns.push(item);
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
        this.setStatus("connected");
        await this.pump();
      } else if (!["ready"].includes(event.state)) {
        this.ready = false;
        this.setStatus("retrying");
        this.scheduleReconnect();
      }
      return;
    }
    const message = chatMessage(event);
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
    }, 100);
  }
  upsert(message, emit = false) {
    if (!message) return;
    const index = this.state.messages.findIndex(
      (item) => item.id === message.id,
    );
    if (index < 0) this.state.messages.push(structuredClone(message));
    else this.state.messages[index] = structuredClone(message);
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
        if (isFatal(error)) this.setStatus("blocked", error.code);
        else {
          this.setStatus("retrying");
          this.scheduleReconnect();
        }
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
          if (!this.state.turns.some((item) => item.state === "uncertain"))
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
    !["low", "medium", "high", "xhigh", "max"].includes(selection.effort)
  )
    throw new Error("Invalid model or effort selection");
}
function confirmedSelection(value) {
  validateSelection(value);
  return { model: value.model, effort: value.effort };
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
function isFatal(error) {
  return (
    [
      "UNSUPPORTED_CLAUDE",
      "SESSION_LOCKED",
      "IDENTITY_CHANGED",
      "ENOENT",
    ].includes(error.code) ||
    /Invalid saved|Invalid model|Invalid session writer/.test(error.message)
  );
}

function modelMatches(requested, actual) {
  return (
    requested === actual ||
    (["haiku", "sonnet", "opus"].includes(requested) &&
      actual.startsWith(`claude-${requested}-`))
  );
}
