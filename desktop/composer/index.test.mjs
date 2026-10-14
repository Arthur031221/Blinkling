import test from "node:test";
import assert from "node:assert/strict";
import {
  createComposer,
  attachmentBytes,
  validateAttachment,
  attachmentLimits,
} from "./index.mjs";
const image = {
  id: "image",
  name: "capture.png",
  mediaType: "image/png",
  data: "aGVsbG8=",
};
const defer = () => {
  let resolve, reject;
  const promise = new Promise((a, b) => {
    resolve = a;
    reject = b;
  });
  return { promise, resolve, reject };
};
const session = () => {
  const turns = [];
  let listener;
  return {
    turns,
    send: async (t) => turns.push(t),
    select: async (s) => s,
    stop: async () => {},
    subscribe: (fn) => {
      listener = fn;
      return () => {
        listener = null;
      };
    },
    emit: (e) => listener?.(e),
  };
};

test("capture quick ask sends actual attachment immediately and clears only after admission", async () => {
  const bridge = session();
  const c = createComposer({ session: bridge });
  c.attach(image);
  await c.send("這是什麼", "quick-ask");
  assert.equal(bridge.turns[0].source, "quick-ask");
  assert.deepEqual(bridge.turns[0].attachments, [image]);
  assert.equal(c.state().attachments.length, 0);
  assert.equal(c.state().busy, true);
  bridge.emit({ type: "done", turnId: bridge.turns[0].id });
  assert.equal(c.state().busy, false);
  c.dispose();
});

test("capture includes removable window text and sends only the retained chips", async () => {
  const bridge = session();
  const c = createComposer({ session: bridge });
  const text = {
    id: "window-text",
    name: "視窗文字.txt",
    mediaType: "text/plain",
    data: Buffer.from("Visible window text").toString("base64"),
  };
  c.capture({ image, text });
  assert.deepEqual(c.state().attachments, [image, text]);
  await c.send("這是什麼", "quick-ask");
  assert.deepEqual(bridge.turns[0].attachments, [image, text]);
  bridge.emit({ type: "done", turnId: bridge.turns[0].id });
  c.capture({ image, text });
  c.remove(text.id);
  await c.send("Image only");
  assert.deepEqual(bridge.turns[1].attachments, [image]);
  bridge.emit({ type: "done", turnId: bridge.turns[1].id });
  c.capture({ image });
  assert.deepEqual(c.state().attachments, [image]);
  c.dispose();
});

test("selection and turn admission serialize, displaying only acknowledged applied values", async () => {
  const bridge = session();
  const gate = defer();
  const calls = [];
  bridge.select = async (s) => {
    calls.push(s);
    return gate.promise;
  };
  const c = createComposer({
    session: bridge,
    selection: { model: "haiku", effort: "low" },
  });
  const selected = c.select({ model: "sonnet", effort: "high" });
  const sent = c.send("Hi");
  await new Promise((r) => setImmediate(r));
  assert.equal(c.state().selection.model, "haiku");
  assert.equal(c.state().selecting, true);
  assert.equal(bridge.turns.length, 0);
  gate.resolve({ model: "claude-sonnet-5-5", effort: "high" });
  await Promise.all([selected, sent]);
  assert.equal(c.state().selection.model, "claude-sonnet-5-5");
  assert.equal(bridge.turns.length, 1);
  assert.equal(calls.length, 1);
  await assert.rejects(c.select({ model: "haiku", effort: "low" }), /回答/);
  c.dispose();
});

test("failed selection keeps confirmed values and rejected send retains draft and attachments", async () => {
  const bridge = session();
  bridge.select = async () => {
    throw Error("Unsupported");
  };
  bridge.send = async () => {
    throw Error("Offline");
  };
  const c = createComposer({
    session: bridge,
    selection: { model: "haiku", effort: "low" },
  });
  await assert.rejects(c.select({ model: "bad", effort: "max" }));
  assert.deepEqual(c.state().selection, { model: "haiku", effort: "low" });
  c.attach(image);
  c.draft("Keep this");
  await assert.rejects(c.send());
  assert.equal(c.state().draft, "Keep this");
  assert.deepEqual(c.state().attachments, [image]);
  assert.equal(c.state().busy, false);
  assert.equal(c.state().error, "傳送失敗，內容已保留，請再試一次");
  c.dispose();
});

test("stop interrupts without admitting another paid turn until done", async () => {
  const bridge = session();
  let stopped = 0;
  bridge.stop = async () => {
    stopped++;
  };
  const c = createComposer({ session: bridge });
  await c.send("Hi");
  await c.stop();
  assert.equal(stopped, 1);
  assert.equal(c.state().busy, true);
  await assert.rejects(c.send("again"), /回答/);
  bridge.emit({ type: "done", turnId: bridge.turns[0].id });
  await c.send("again");
  assert.equal(bridge.turns.length, 2);
  c.dispose();
});

test("attachment validation bounds images, files, count and prevents silent dropped files", () => {
  const c = createComposer({ maxAttachments: 1 });
  c.attach(image);
  assert.throws(() => c.attach({ ...image, id: "two" }), /附件/);
  c.remove(image.id);
  assert.throws(
    () => c.attach({ ...image, mediaType: "application/x-msdownload" }),
    /格式/,
  );
  c.attach({ ...image, mediaType: "application/pdf", name: "paper.pdf" });
  assert.equal(c.turn("t", "Read").attachments[0].mediaType, "application/pdf");
  c.dispose();
});

test("edits and new attachments made during send admission survive the clear", async () => {
  const bridge = session();
  const gate = defer();
  bridge.send = () => gate.promise;
  const c = createComposer({ session: bridge });
  c.attach(image);
  c.draft("Original");
  const p = c.send("翻譯", "quick-ask");
  await new Promise((r) => setImmediate(r));
  c.draft("Next question");
  c.attach({ ...image, id: "next", data: "d29ybGQ=" });
  gate.resolve();
  await p;
  assert.equal(c.state().draft, "Next question");
  assert.deepEqual(
    c.state().attachments.map((a) => a.id),
    ["next"],
  );
  c.dispose();
});

test("remote answer activity disables selection and enables stop", async () => {
  const bridge = session();
  let interrupted = 0;
  bridge.stop = async () => {
    interrupted++;
  };
  const c = createComposer({ session: bridge });
  bridge.emit({ type: "delta", id: "remote", text: "Hi" });
  assert.equal(c.state().busy, true);
  await assert.rejects(c.select({ model: "sonnet", effort: "high" }), /回答/);
  await c.stop();
  assert.equal(interrupted, 1);
  bridge.emit({ type: "done", turnId: "remote" });
  assert.equal(c.state().busy, false);
  c.dispose();
});

test("attachment byte limits use decoded bytes including base64 padding", () => {
  assert.equal(attachmentBytes({ data: "aA==" }), 1);
  assert.equal(attachmentBytes({ data: "aGk=" }), 2);
  const data = Buffer.alloc(attachmentLimits.bytes).toString("base64");
  assert.equal(validateAttachment({ ...image, data }).data.length, data.length);
  assert.throws(
    () =>
      validateAttachment({
        ...image,
        data: Buffer.alloc(attachmentLimits.bytes + 1).toString("base64"),
      }),
    /太大/,
  );
});
