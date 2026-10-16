import { efforts } from "./models.mjs";
const imageTypes = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
]);
const fileTypes = new Set([
  "application/pdf",
  "text/plain",
  "text/markdown",
  "text/csv",
  "application/json",
]);
/** A failure the user can be told about. `code` names a key in strings.mjs
 * (`error-<code>`), so the view translates it and no display text lives here. */
/** Failures carry a code the card translates. The message is for logs and the
 * session layer, never shown to the user. */
const reasons = {
  "unsupported-file": "Unsupported attachment type",
  "too-large": "Attachment is larger than 20 MB",
  unreadable: "Attachment cannot be read",
  "too-many-files": "Too many attachments (8 at most)",
  "total-too-large": "Attachments are larger than 32 MB together",
  busy: "The previous answer is not finished",
  connecting: "Not connected to Claude Code yet",
  empty: "Nothing to send",
};
export const failure = (code) =>
  Object.assign(new Error(reasons[code] ?? code), { code });
export const attachmentLimits = Object.freeze({
  bytes: 20 * 1024 * 1024,
  totalBytes: 32 * 1024 * 1024,
  count: 8,
});
export const attachmentBytes = (a) =>
  (a.data.length * 3) / 4 -
  (a.data.endsWith("==") ? 2 : a.data.endsWith("=") ? 1 : 0);
export function validateAttachment(a) {
  if (
    !a ||
    typeof a.id !== "string" ||
    !a.id ||
    typeof a.name !== "string" ||
    a.name.length > 512 ||
    ![...imageTypes, ...fileTypes].includes(a.mediaType)
  )
    throw failure("unsupported-file");
  if (
    typeof a.data !== "string" ||
    a.data.length > Math.ceil(attachmentLimits.bytes / 3) * 4
  )
    throw failure("too-large");
  if (
    a.data.length % 4 !== 0 ||
    /[^A-Za-z0-9+/]/.test(a.data.replace(/={1,2}$/, "")) ||
    !a.data.length
  )
    throw failure("unreadable");
  if (attachmentBytes(a) > attachmentLimits.bytes) throw failure("too-large");
  return structuredClone(a);
}
/** What the mini composer hands the card when it grows: the conversation, its
 * unsent text and the chips (the picked regions). Checked in the main process
 * before it reaches the card, and again by the card as it applies it. */
export function validSeed(seed) {
  if (!seed || typeof seed !== "object" || Array.isArray(seed))
    throw failure("unreadable");
  const { conversationId, draft = "", attachments = [] } = seed;
  if (
    (conversationId !== undefined &&
      (typeof conversationId !== "string" || conversationId.length > 200)) ||
    typeof draft !== "string" ||
    draft.length > 100000 ||
    !Array.isArray(attachments)
  )
    throw failure("unreadable");
  if (attachments.length > attachmentLimits.count)
    throw failure("too-many-files");
  return {
    ...(conversationId !== undefined && { conversationId }),
    draft,
    attachments: attachments.map(validateAttachment),
  };
}
export async function readAttachment(
  file,
  { id = () => globalThis.crypto.randomUUID() } = {},
) {
  if (file.size > attachmentLimits.bytes) throw failure("too-large");
  const extension = file.name?.split(".").at(-1)?.toLowerCase();
  const inferred =
    !file.type || file.type === "application/octet-stream"
      ? ({
          md: "text/markdown",
          txt: "text/plain",
          csv: "text/csv",
          json: "application/json",
          pdf: "application/pdf",
          png: "image/png",
          jpg: "image/jpeg",
          jpeg: "image/jpeg",
          webp: "image/webp",
          gif: "image/gif",
        }[extension] ?? "")
      : file.type;
  if (!imageTypes.has(inferred) && !fileTypes.has(inferred))
    throw failure("unsupported-file");
  const data = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1]);
    reader.onerror = () => reject(failure("unreadable"));
    reader.readAsDataURL(file);
  });
  return validateAttachment({
    id: id(),
    name: file.name || "image.png",
    mediaType: inferred,
    data,
  });
}

/** Serializes controls with turn admission, independent of any window lifecycle. */
export function createComposer({
  session,
  selection = null,
  maxAttachments = attachmentLimits.count,
  uuid = () => globalThis.crypto.randomUUID(),
} = {}) {
  const attachments = new Map(),
    listeners = new Set();
  let draft = "",
    busy = false,
    selecting = false,
    stopping = false,
    error = "",
    pendingId,
    chatKey,
    tail = Promise.resolve(),
    disposed = false;
  const state = () => ({
    attachments: structuredClone([...attachments.values()]),
    draft,
    busy,
    selecting,
    stopping,
    error,
    selection: selection && structuredClone(selection),
  });
  const notify = () => {
    if (!disposed) for (const fn of listeners) fn(state());
  };
  const enqueue = (fn) => {
    const p = tail.then(() => {
      if (disposed) throw Error("Composer closed");
      return fn();
    });
    tail = p.catch(() => {});
    return p;
  };
  const unsubscribe = session?.subscribe((event) => {
    // A question left open in the chat the card has left is not this chat's.
    if (event.type === "chat" && event.key !== chatKey) {
      if (chatKey !== undefined) {
        busy = false;
        stopping = false;
        pendingId = undefined;
      }
      chatKey = event.key;
    }
    if (event.type === "delta") busy = true;
    if (event.type === "done" && (!pendingId || event.turnId === pendingId)) {
      busy = false;
      stopping = false;
      pendingId = undefined;
    }
    if (event.type === "selection" && event.applied)
      selection = structuredClone(event.applied);
    notify();
  });
  const turn = (id, text = draft, source = "composer") => ({
    id,
    text,
    attachments: structuredClone([...attachments.values()]),
    source,
  });
  const attach = (values) => {
    const next = new Map(attachments);
    for (const value of values) {
      const a = validateAttachment(value);
      next.set(a.id, a);
    }
    if (next.size > maxAttachments) throw failure("too-many-files");
    if (
      [...next.values()].reduce((n, x) => n + attachmentBytes(x), 0) >
      attachmentLimits.totalBytes
    )
      throw failure("total-too-large");
    attachments.clear();
    for (const [id, a] of next) attachments.set(id, a);
    notify();
  };
  return {
    state,
    turn,
    draft(value) {
      draft = String(value);
      notify();
    },
    attach(value) {
      attach([value]);
    },
    capture(value) {
      attach([value.image ?? value, ...(value.text ? [value.text] : [])]);
    },
    /** Replace the draft and the chips as one step: the mini composer grows
     * into the card carrying both. A bad seed changes nothing. */
    seed({ draft: text = "", attachments: values = [] } = {}) {
      const before = new Map(attachments);
      attachments.clear();
      try {
        attach(values);
      } catch (e) {
        for (const [id, a] of before) attachments.set(id, a);
        throw e;
      }
      draft = String(text);
      error = "";
      notify();
    },
    remove(id) {
      attachments.delete(id);
      notify();
    },
    clear() {
      attachments.clear();
      notify();
    },
    error(value) {
      error = value;
      notify();
    },
    send(text = draft, source = "composer") {
      // Freeze the draft and attachments at the user's gesture, before queued controls.
      const t = turn(uuid(), text, source);
      const draftAtGesture = draft;
      return enqueue(async () => {
        if (busy) throw failure("busy");
        if (!session) throw failure("connecting");
        if (!t.text.trim() && !t.attachments.length) throw failure("empty");
        busy = true;
        pendingId = t.id;
        error = "";
        notify();
        try {
          await session.send(t);
          for (const a of t.attachments)
            if (attachments.get(a.id)?.data === a.data)
              attachments.delete(a.id);
          if (draft === draftAtGesture) draft = "";
          notify();
          return t;
        } catch (e) {
          busy = false;
          pendingId = undefined;
          error = "send-failed";
          notify();
          throw e;
        }
      });
    },
    select(next) {
      return enqueue(async () => {
        if (busy) throw failure("busy");
        if (!session) throw failure("connecting");
        selecting = true;
        error = "";
        notify();
        try {
          const applied = await session.select(structuredClone(next));
          if (
            !applied ||
            typeof applied.model !== "string" ||
            !efforts.includes(applied.effort)
          )
            throw failure("switch-failed");
          selection = structuredClone(applied);
          return structuredClone(selection);
        } catch (e) {
          error = "switch-failed";
          throw e;
        } finally {
          selecting = false;
          notify();
        }
      });
    },
    async stop() {
      if (!busy || stopping) return;
      stopping = true;
      notify();
      try {
        await session.stop();
      } catch (e) {
        stopping = false;
        error = "stop-failed";
        notify();
        throw e;
      }
    },
    subscribe(fn) {
      listeners.add(fn);
      fn(state());
      return () => listeners.delete(fn);
    },
    dispose() {
      disposed = true;
      unsubscribe?.();
      listeners.clear();
    },
  };
}
