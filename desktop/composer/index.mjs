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
    throw new Error("不支援這個檔案格式");
  if (
    typeof a.data !== "string" ||
    a.data.length > Math.ceil(attachmentLimits.bytes / 3) * 4
  )
    throw new Error("附件太大，請選擇 20 MB 以下的檔案");
  if (
    a.data.length % 4 !== 0 ||
    /[^A-Za-z0-9+/]/.test(a.data.replace(/={1,2}$/, "")) ||
    !a.data.length
  )
    throw new Error("無法讀取附件");
  if (attachmentBytes(a) > attachmentLimits.bytes)
    throw new Error("附件太大，請選擇 20 MB 以下的檔案");
  return structuredClone(a);
}
export async function readAttachment(
  file,
  { id = () => globalThis.crypto.randomUUID() } = {},
) {
  if (file.size > attachmentLimits.bytes)
    throw new Error("附件太大，請選擇 20 MB 以下的檔案");
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
    throw new Error("不支援這個檔案格式");
  const data = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1]);
    reader.onerror = () => reject(Error("無法讀取附件"));
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
    if (next.size > maxAttachments) throw Error("最多可加入 8 個附件");
    if (
      [...next.values()].reduce((n, x) => n + attachmentBytes(x), 0) >
      attachmentLimits.totalBytes
    )
      throw Error("附件總大小超過 32 MB");
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
        if (busy) throw Error("請等回答完成");
        if (!session) throw Error("正在連線，請稍候");
        if (!t.text.trim() && !t.attachments.length)
          throw Error("請輸入問題或加入附件");
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
          error = "傳送失敗，內容已保留，請再試一次";
          notify();
          throw e;
        }
      });
    },
    select(next) {
      return enqueue(async () => {
        if (busy) throw Error("請等回答完成");
        if (!session) throw Error("正在連線，請稍候");
        selecting = true;
        error = "";
        notify();
        try {
          const applied = await session.select(structuredClone(next));
          if (
            !applied ||
            typeof applied.model !== "string" ||
            !["low", "medium", "high", "xhigh", "max"].includes(applied.effort)
          )
            throw Error("模型設定尚未確認");
          selection = structuredClone(applied);
          return structuredClone(selection);
        } catch (e) {
          error = "無法切換，已保留原本的模型";
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
        error = "暫時無法停止，請再試一次";
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
