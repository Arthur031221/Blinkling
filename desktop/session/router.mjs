import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { chatMessage } from "./normalize.mjs";
import { userMessage } from "./protocol.mjs";

/** Turns Blink runs for itself: they are answered by its own session and
 * never held in a chat. */
const INTERNAL = new Set(["guide", "companion"]);
const KEEP = 40;
const SETTLE_MS = 1500;
const MAIN = "blink";

/** What a terminal session is shown of a message typed in Blink: the words, a
 * count of pictures (it fetches them with a tool), and the name of anything
 * it cannot read. */
export function channelText(message) {
  const text = message.content
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("\n\n")
    .trim();
  const pictures = message.content.filter((b) => b.type === "image").length;
  const files = message.content
    .filter((b) => b.type === "document")
    .map((b) => b.title)
    .filter(Boolean);
  return [
    text,
    pictures
      ? `(${pictures} ${pictures === 1 ? "picture" : "pictures"} attached in Blink: call blinkling_chat_images to look at ${pictures === 1 ? "it" : "them"})`
      : "",
    files.length ? `(files attached in Blink: ${files.join(", ")})` : "",
  ]
    .filter(Boolean)
    .join("\n\n");
}

let writes = 0;
async function writeJson(file, value) {
  // One name per write: two saves in flight must not rename each other's file.
  const temporary = `${file}.${process.pid}.${writes++}.tmp`;
  await writeFile(temporary, JSON.stringify(value), { mode: 0o600 });
  await rename(temporary, file);
}

/** A chat that a Claude Code terminal session answers itself. It speaks the
 * same surface as the session bridge: the card cannot tell the two apart.
 * `deliver(frame)` sends a frame to that session and says whether it took it. */
export class ChannelChat {
  constructor({ directory, deliver, settleMs = SETTLE_MS, now = Date.now }) {
    this.directory = directory;
    this.file = join(directory, "channel.json");
    this.deliver = deliver;
    this.settleMs = settleMs;
    this.now = now;
    this.listeners = new Set();
    this.messages = [];
    this.status = { type: "status", state: "connected" };
    this.state = {
      selection: { model: "terminal", effort: "medium" },
      messages: this.messages,
    };
    this.active = undefined;
    this.replies = 0;
    this.loaded = this.load();
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
  async save() {
    await mkdir(this.directory, { recursive: true, mode: 0o700 });
    await writeJson(this.file, { messages: this.messages.slice(-KEEP) });
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
    if (persist) void this.save().catch(() => {});
  }
  async send(turn) {
    await this.loaded;
    const message = chatMessage(userMessage(turn));
    this.images = message.content.filter((b) => b.type === "image");
    this.add({ id: message.id, role: "user", content: message.content });
    this.active = turn.id;
    this.turn = turn.id;
    this.replied = false;
    const taken = this.deliver({
      type: "turn",
      turn: turn.id,
      text: channelText(message),
    });
    if (!taken) {
      this.settle();
      this.add({
        id: `closed-${turn.id}`,
        role: "assistant",
        content: [
          {
            type: "text",
            text: "The Claude Code session for this chat is closed. Start it again, or open Blink from another session.",
          },
        ],
      });
      throw Object.assign(new Error("The terminal session is closed"), {
        code: "TERMINAL_CLOSED",
      });
    }
  }
  /** The pictures of the latest question, for the terminal session to look at. */
  latestImages() {
    return (this.images ?? []).map((b) => ({
      mediaType: b.source?.media_type ?? b.mediaType,
      data: b.source?.data ?? b.data,
    }));
  }
  /** The terminal session's answer. */
  reply(text) {
    if (!text?.trim()) return false;
    this.replied = true;
    this.replies++;
    this.add({
      id: `reply-${this.turn ?? "x"}-${this.replies}`,
      role: "assistant",
      content: [{ type: "text", text: text.trim() }],
    });
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
  }) {
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
  reply({ session, text }) {
    const chat = this.chats.get(session);
    return chat?.impl instanceof ChannelChat ? chat.impl.reply(text) : false;
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
