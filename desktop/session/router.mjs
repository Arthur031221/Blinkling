import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { chatMessage } from "./normalize.mjs";
import { userMessage } from "./protocol.mjs";
import { say } from "./strings.mjs";

/** Turns Blink runs for itself: they are answered by its own session and
 * never held in a chat. */
const INTERNAL = new Set(["guide", "companion"]);
const KEEP = 40;
const SETTLE_MS = 1500;
/** How long a question may go without the terminal session starting on it. */
const DELIVERY_MS = 10000;
/** A terminal that is busy takes the question when it is done, so Blink waits
 * for it that long at most before it answers by itself. */
const BUSY_WAIT_MS = 180000;
/** A busy mark with no word since is stale: an interrupted turn sends no Stop. */
const BUSY_FRESH_MS = 600000;
const MAIN = "blink";

/** What a terminal session is shown of a message typed in Blink: exactly the
 * words, nothing added. A picture or file travels as an attribute of the
 * event (see channelAttachments), so a chip's text arrives as the chip says it. */
export function channelText(message) {
  return message.content
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("\n\n")
    .trim();
}
/** How many pictures and which files a message carries, for the event's
 * attributes: the terminal fetches the pictures with a tool. */
export function channelAttachments(message) {
  return {
    pictures: message.content.filter((b) => b.type === "image").length,
    files: message.content
      .filter((b) => b.type === "document")
      .map((b) => b.title)
      .filter(Boolean),
  };
}

let writes = 0;
async function writeJson(file, value) {
  // One name per write: two saves in flight must not rename each other's file.
  const temporary = `${file}.${process.pid}.${writes++}.tmp`;
  try {
    await writeFile(temporary, JSON.stringify(value), { mode: 0o600 });
    await rename(temporary, file);
  } catch (error) {
    // Windows refuses a rename while another handle holds the file: never leave the temporary behind.
    await rm(temporary, { force: true });
    throw error;
  }
}

/** A chat that a Claude Code terminal session answers itself. It speaks the
 * same surface as the session bridge: the card cannot tell the two apart.
 * `deliver(frame)` sends a frame to that session and says whether it took it. */
export class ChannelChat {
  constructor({
    directory,
    deliver,
    settleMs = SETTLE_MS,
    deliveryMs = DELIVERY_MS,
    busyWaitMs = BUSY_WAIT_MS,
    note = (key) => say("en")(key),
    now = Date.now,
  }) {
    this.directory = directory;
    this.file = join(directory, "channel.json");
    this.deliver = deliver;
    this.settleMs = settleMs;
    this.deliveryMs = deliveryMs;
    this.busyWaitMs = busyWaitMs;
    this.note = note;
    this.now = now;
    this.busy = false;
    this.busyAt = 0;
    this.sentAt = 0;
    this.turns = new Set();
    // Called with the turn when the session never took it (see `send`).
    this.onUndelivered = undefined;
    this.abandoned = new Set();
    this.listeners = new Set();
    this.messages = [];
    this.status = { type: "status", state: "connected" };
    this.state = {
      selection: { model: "terminal", effort: "medium" },
      messages: this.messages,
    };
    this.active = undefined;
    this.loaded = this.load();
    this.saving = Promise.resolve();
  }
  async load() {
    try {
      const value = JSON.parse(await readFile(this.file, "utf8"));
      if (Array.isArray(value.messages)) {
        const kept = value.messages.slice(-KEEP);
        this.messages.push(...kept);
        // A card that subscribed while this was being read has not seen them.
        for (const message of kept)
          this.emit({ type: "message", ...message, replay: true });
      }
    } catch {
      /* A new chat has nothing yet. */
    }
  }
  async write() {
    await mkdir(this.directory, { recursive: true, mode: 0o700 });
    await writeJson(this.file, { messages: this.messages.slice(-KEEP) });
  }
  /** Saves run one after another, so a later one never lands before an earlier one
   * and two never rename onto the file at once. */
  save() {
    this.saving = this.saving.then(() => this.write()).catch(() => {});
    return this.saving;
  }
  /** Resolves when every save so far has reached the disk. */
  flush() {
    return this.saving;
  }
  connect() {
    return this.loaded;
  }
  subscribe(listener) {
    this.listeners.add(listener);
    listener(structuredClone(this.status));
    for (const message of this.messages)
      listener({ type: "message", ...structuredClone(message) });
    return () => this.listeners.delete(listener);
  }
  emit(event) {
    for (const listener of this.listeners) {
      try {
        listener(structuredClone(event));
      } catch {
        /* A view cannot break the chat. */
      }
    }
  }
  /** The chat lines that came from the terminal or from the terminal's answer. */
  add(message, { persist = true } = {}) {
    const old = this.messages.findIndex((m) => m.id === message.id);
    if (old >= 0) this.messages[old] = message;
    else this.messages.push(message);
    if (this.messages.length > KEEP)
      this.messages.splice(0, this.messages.length - KEEP);
    this.emit({ type: "message", ...message });
    if (persist) this.save();
  }
  async send(turn) {
    await this.loaded;
    const message = chatMessage(userMessage(turn));
    this.images = message.content.filter((b) => b.type === "image");
    this.add({ id: message.id, role: "user", content: message.content });
    this.active = turn.id;
    this.turn = turn.id;
    this.replied = false;
    this.turns.add(turn.id);
    if (this.turns.size > KEEP)
      this.turns.delete(this.turns.values().next().value);
    this.sentAt = this.now();
    const taken = this.deliver({
      type: "turn",
      turn: turn.id,
      text: channelText(message),
      ...channelAttachments(message),
    });
    if (!taken) {
      this.closed();
      throw Object.assign(new Error("The terminal session is closed"), {
        code: "TERMINAL_CLOSED",
      });
    }
    this.arm(turn);
  }
  /** The line to the session was open but nothing came back: the channel may
   * be off, or the terminal may be at work on something else. A busy terminal
   * takes the question when it is done, so it is waited for. When the channel
   * is off the question is answered by Blink's own session, once, and anything
   * the terminal says to it later is dropped. */
  arm(turn) {
    clearTimeout(this.waiting);
    if (!this.onUndelivered) return;
    this.waiting = setTimeout(() => {
      if (this.working() && this.now() - this.sentAt < this.busyWaitMs)
        this.arm(turn);
      else this.giveUp(turn);
    }, this.deliveryMs);
    this.waiting.unref?.();
  }
  /** Whether the terminal is in the middle of a turn, from its hooks. */
  working() {
    return this.busy && this.now() - this.busyAt < BUSY_FRESH_MS;
  }
  setBusy(busy) {
    this.busy = Boolean(busy);
    this.busyAt = this.now();
    return true;
  }
  /** The session began on the question (a prompt hook) or answered it. */
  started() {
    clearTimeout(this.waiting);
    return this.active !== undefined;
  }
  giveUp(turn) {
    if (this.active !== turn.id) return;
    this.abandoned.add(turn.id);
    // No "done" here: the answer that follows ends the wait on the card.
    clearTimeout(this.timer);
    this.active = undefined;
    this.onUndelivered?.(turn);
  }
  /** The session is gone: a question still open is answered with that, so the
   * card does not wait for ever. */
  closed() {
    if (this.active === undefined) return;
    const turnId = this.active;
    this.settle();
    this.add({
      id: `closed-${turnId}`,
      role: "assistant",
      content: [
        {
          type: "text",
          text: this.note("closed"),
        },
      ],
    });
  }
  /** The pictures of the latest question, for the terminal session to look at. */
  latestImages() {
    return (this.images ?? []).map((b) => ({
      mediaType: b.source?.media_type ?? b.mediaType,
      data: b.source?.data ?? b.data,
    }));
  }
  /** The terminal session's answer. */
  reply(text, turn) {
    if (!text?.trim()) return false;
    const target = turn || this.turn;
    // A question Blink's own session already answered, or one never asked here.
    if (target === undefined || !this.turns.has(target)) return false;
    if (this.abandoned.has(target)) return "late";
    // One question has one answer: a later word on it takes the place of the
    // earlier one, and never adds a bubble next to it.
    this.add({
      id: `reply-${target}`,
      role: "assistant",
      content: [{ type: "text", text: text.trim() }],
    });
    // The answer to an earlier question changes that answer only.
    if (target !== this.turn) return true;
    clearTimeout(this.waiting);
    this.replied = true;
    // Another reply may follow in the same turn; the turn's end ends the wait.
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.settle(), this.settleMs);
    this.timer.unref?.();
    return true;
  }
  /** The terminal's turn ended. An answer written as plain text instead of
   * through the reply tool is still delivered, once. */
  turnEnd(text) {
    if (this.active === undefined) return false;
    if (!this.replied && text?.trim()) this.reply(text);
    this.settle();
    return true;
  }
  settle() {
    clearTimeout(this.timer);
    clearTimeout(this.waiting);
    const turnId = this.active;
    if (turnId === undefined) return;
    this.active = undefined;
    this.emit({ type: "done", turnId });
  }
  select(selection) {
    return Promise.resolve({ ...this.state.selection, ...selection });
  }
  async stop() {
    this.settle();
  }
  dispose() {
    clearTimeout(this.timer);
    clearTimeout(this.waiting);
    this.listeners.clear();
    return Promise.resolve();
  }
}

/** Every chat Blink holds, and which one the card shows. The first is Blink's
 * own; each linked Claude Code session adds one. It is a drop-in for the
 * session bridge, so the card, auto explain and the guide use it unchanged. */
export class ChatRouter {
  constructor({
    main,
    makeBridge,
    makeChannel,
    deliver,
    basenameOf = basename,
    locale = () => "en",
  }) {
    this.locale = locale;
    this.main = main;
    this.makeBridge = makeBridge;
    this.makeChannel = makeChannel;
    this.deliver = deliver;
    this.basenameOf = basenameOf;
    this.chats = new Map([
      [MAIN, { key: MAIN, label: "Blink", live: true, impl: main }],
    ]);
    this.currentKey = MAIN;
    this.listeners = new Map();
    this.hooks = new Set();
  }
  get current() {
    return this.chats.get(this.currentKey);
  }
  get state() {
    return this.current.impl.state;
  }
  get active() {
    return this.current.impl.active;
  }
  get status() {
    return this.current.impl.status;
  }
  /** Blink's own conversation is the one with a remote identity. */
  identity() {
    return this.main.identity?.();
  }
  summary() {
    const others = [...this.chats.values()].some((c) => c.key !== MAIN);
    return {
      type: "chat",
      key: this.currentKey,
      channel: this.current.impl instanceof ChannelChat,
      // Blink's own chat drops out of the list once a session has one and it
      // has nothing in it.
      chats: [...this.chats.values()]
        .filter(
          (c) =>
            c.key !== MAIN ||
            !others ||
            c.key === this.currentKey ||
            this.main.state?.messages?.length,
        )
        .map(({ key, label, live }) => ({ key, label, live })),
    };
  }
  /** Connects a listener to one chat. What the chat replays on subscribing is
   * history, marked so no view treats it as new. */
  attach(listener, impl, visible, replay = true) {
    let live = false;
    const off = impl.subscribe(
      (event) => {
        if (!live) {
          if (replay)
            listener(
              event.type === "message" ? { ...event, replay: true } : event,
            );
          return;
        }
        listener(event);
      },
      { visible },
    );
    live = true;
    return off;
  }
  subscribe(listener, { visible = false } = {}) {
    const entry = { visible, offs: [] };
    this.listeners.set(listener, entry);
    this.wire(listener, entry);
    return () => {
      entry.offs.forEach((off) => off());
      this.listeners.delete(listener);
    };
  }
  wire(listener, entry, announce = false) {
    entry.offs.forEach((off) => off());
    entry.offs = [];
    if (announce || entry.visible) listener(this.summary());
    const impl = this.current.impl;
    entry.offs.push(this.attach(listener, impl, entry.visible));
    for (const line of this.current.lines ?? [])
      listener({ ...line, type: "message", replay: true });
    // A listener that collects Blink's own turns keeps hearing the main session
    // even while a terminal's chat is on screen.
    if (!entry.visible && impl !== this.main)
      entry.offs.push(this.attach(listener, this.main, false, false));
  }
  /** A change of the chat list or of the chat shown. */
  announce() {
    for (const [listener, entry] of this.listeners)
      if (entry.visible) listener(this.summary());
  }
  switchTo(key) {
    if (!this.chats.has(key) || key === this.currentKey) return false;
    this.currentKey = key;
    for (const [listener, entry] of this.listeners)
      this.wire(listener, entry, true);
    void this.current.impl.connect?.().catch?.(() => {});
    return true;
  }
  /** A Claude Code session joined or reconnected. */
  link({ session, cwd, channel }) {
    const label = this.labelFor(session, cwd);
    let chat = this.chats.get(session);
    if (chat && Boolean(chat.channel) !== Boolean(channel)) {
      // The same session came back the other way (it cannot, but a crash and
      // a new start under one id can): start its chat over.
      chat.impl.dispose?.();
      this.chats.delete(session);
      chat = undefined;
    }
    if (!chat) {
      const impl = channel
        ? this.makeChannel(session)
        : this.makeBridge(session, cwd);
      chat = { key: session, label, live: true, channel, impl };
      if (channel) impl.onUndelivered = (turn) => this.fallback(session, turn);
      this.chats.set(session, chat);
    }
    chat.live = true;
    chat.label = label;
    // The first session to join takes the card from an empty Blink chat.
    if (this.currentKey === MAIN && !this.main.state?.messages?.length)
      this.switchTo(session);
    else this.announce();
    return chat;
  }
  unlink(session) {
    const chat = this.chats.get(session);
    if (!chat) return;
    chat.live = false;
    chat.impl.closed?.();
    this.announce();
  }
  labelFor(session, cwd) {
    const base = (cwd && this.basenameOf(cwd)) || "Claude Code";
    const taken = [...this.chats.values()].filter(
      (c) => c.key !== session && c.label.replace(/ #\d+$/, "") === base,
    ).length;
    return taken ? `${base} #${taken + 1}` : base;
  }
  /** The session that opened Blink now has the card. */
  open(session) {
    if (session && this.chats.has(session)) this.switchTo(session);
  }
  /** A line typed or answered in a terminal session, for its chat. */
  mirror({ session, role, text, id }) {
    const chat = this.chats.get(session);
    if (!chat) return false;
    const message = {
      id: `terminal-${id}`,
      role,
      content: [{ type: "text", text }],
    };
    if (chat.impl instanceof ChannelChat) chat.impl.add(message);
    else {
      // The owned session does not keep terminal lines, so the chat does.
      chat.lines = [...(chat.lines ?? []), message].slice(-KEEP);
      chat.impl.emit({ type: "message", ...message, origin: "terminal" });
    }
    return true;
  }
  /** What the terminal session answers through the reply tool. */
  reply({ session, turn, text }) {
    const chat = this.chats.get(session);
    return chat?.impl instanceof ChannelChat
      ? chat.impl.reply(text, turn || undefined)
      : false;
  }
  /** The terminal session began or ended a turn: it is busy or free. */
  busy({ session, busy }) {
    const chat = this.chats.get(session);
    return chat?.impl instanceof ChannelChat ? chat.impl.setBusy(busy) : false;
  }
  turnStart({ session }) {
    const chat = this.chats.get(session);
    return chat?.impl instanceof ChannelChat ? chat.impl.started() : false;
  }
  /** A terminal session never took the question. Blink's own session answers
   * it, in Blink's chat, with one line saying why. */
  fallback(session, turn) {
    const note = {
      id: `undelivered-${turn.id}`,
      role: "assistant",
      content: [{ type: "text", text: say(this.locale())("undelivered") }],
    };
    const chat = this.chats.get(session);
    const main = this.chats.get(MAIN);
    // The card moves to Blink's chat first, so the line is shown there once
    // and is only kept in the terminal's chat.
    if (this.currentKey === session) this.switchTo(MAIN);
    chat?.impl.add(note);
    // Nobody awaits this: a failure ends the wait on the card. The line comes
    // after the question it explains.
    return main.impl
      .send(turn)
      .then(() => {
        main.lines = [...(main.lines ?? []), note].slice(-KEEP);
        main.impl.emit({ type: "message", ...note });
      })
      .catch(() => main.impl.emit({ type: "done", turnId: turn.id }));
  }
  turnEnd({ session, text }) {
    const chat = this.chats.get(session);
    return chat?.impl instanceof ChannelChat ? chat.impl.turnEnd(text) : false;
  }
  images(session) {
    const chat = this.chats.get(session);
    return chat?.impl instanceof ChannelChat ? chat.impl.latestImages() : [];
  }
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
    await this.admit(turn);
    const chat = INTERNAL.has(turn?.source)
      ? this.chats.get(MAIN)
      : this.current;
    return chat.impl.send(turn);
  }
  select(selection) {
    return this.current.impl.select(selection);
  }
  stop() {
    return this.current.impl.stop();
  }
  emit(event) {
    return this.current.impl.emit(event);
  }
  connect() {
    return this.main.connect();
  }
  async dispose() {
    await Promise.all([...this.chats.values()].map((c) => c.impl.dispose?.()));
  }
}

export const newChatKey = () => randomUUID();
