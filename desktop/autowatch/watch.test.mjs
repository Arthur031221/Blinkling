import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { AutoWatch } from "./index.mjs";
test("permission recovery resumes exactly one automatic explanation after typing stops", async () => {
  let idle = 0,
    done;
  const turns = [];
  const watch = new AutoWatch({
    session: {
      subscribe: (f) => {
        done = f;
        return () => {};
      },
      send: async (t) => turns.push(t),
    },
    capture: {
      screen: async (_id, _signal, options) => {
        assert.equal(options.kind, "auto-explain");
        return { image: { data: "resumed pixels" } };
      },
    },
    displayId: () => "2",
    sample: async () => Buffer.alloc(32 * 18 * 4, 20),
    idleSeconds: () => idle,
  });
  try {
    await watch.resume();
    assert.equal(turns.length, 0);
    idle = 5;
    await watch.tick();
    assert.equal(turns.length, 1);
    assert.equal(turns[0].attachments[0].data, "resumed pixels");
    done({ type: "done", turnId: turns[0].id });
    await watch.tick();
    await watch.tick();
    assert.equal(turns.length, 1);
  } finally {
    watch.dispose();
  }
});
test("auto explain sends actual image through the one session, holds admission until done, and stops cleanly", async () => {
  let value = 20,
    now = 0,
    idle = 5,
    event,
    screenCalls = 0;
  const turns = [];
  const capture = {
    busy: false,
    screen: async () => {
      screenCalls++;
      return {
        image: { id: "image", mediaType: "image/png", data: "real-pixels" },
      };
    },
  };
  const watch = new AutoWatch({
    session: {
      subscribe: (f) => {
        event = f;
        return () => (event = null);
      },
      send: async (t) => turns.push(t),
    },
    capture,
    displayId: () => "2",
    sample: async () => Buffer.alloc(32 * 18 * 4, value),
    idleSeconds: () => idle,
    now: () => now,
  });
  try {
    watch.enable();
    await watch.tick();
    value = 230;
    now = 6000;
    idle = 0;
    await watch.tick();
    assert.equal(screenCalls, 0);
    idle = 5;
    now = 12000;
    await watch.tick();
    now = 18000;
    await watch.tick();
    assert.equal(turns.length, 1);
    assert.equal(turns[0].source, "auto-explain");
    assert.equal(turns[0].attachments[0].data, "real-pixels");
    value = 30;
    now = 100000;
    await watch.tick();
    assert.equal(turns.length, 1);
    event({ type: "done", turnId: turns[0].id });
    await watch.tick();
    now = 106000;
    await watch.tick();
    assert.equal(turns.length, 2);
    watch.disable();
    assert.equal(typeof event, "function");
    await watch.tick();
    assert.equal(turns.length, 2);
  } finally {
    watch.dispose();
    assert.equal(event, null);
  }
});
test("disabling during a sample or capture never submits a late paid turn", async () => {
  let resolve,
    sends = 0;
  const watch = new AutoWatch({
    session: { subscribe: () => () => {}, send: () => sends++ },
    capture: { busy: false, screen: () => assert.fail() },
    displayId: () => "1",
    sample: () => new Promise((r) => (resolve = r)),
    idleSeconds: () => 5,
  });
  watch.enable();
  const tick = watch.tick();
  watch.disable();
  resolve(Buffer.alloc(32 * 18 * 4));
  await tick;
  assert.equal(sends, 0);
  watch.dispose();
});
test("a turn finishing while switched off releases admission on the next enable", async () => {
  let done,
    value = 20,
    now = 0;
  const turns = [];
  const watch = new AutoWatch({
    session: {
      subscribe: (f) => {
        done = f;
        return () => (done = null);
      },
      send: async (t) => turns.push(t),
    },
    capture: { screen: async () => ({ image: { data: "image" } }) },
    displayId: () => "1",
    sample: async () => Buffer.alloc(32 * 18 * 4, value),
    idleSeconds: () => 5,
    now: () => now,
  });
  try {
    watch.enable();
    await watch.tick();
    value = 230;
    await watch.tick();
    await watch.tick();
    assert.equal(turns.length, 1);
    watch.disable();
    done({ type: "done", turnId: turns[0].id });
    watch.enable();
    await watch.tick();
    value = 20;
    now = 50000;
    await watch.tick();
    await watch.tick();
    assert.equal(turns.length, 2);
  } finally {
    watch.dispose();
    assert.equal(done, null);
  }
});

test("A-1: AutoWatch explains a navigation between two white pages within one interval plus settle", async () => {
  const pages = JSON.parse(
    readFileSync(
      new URL("./fixtures/white-pages.json", import.meta.url),
      "utf8",
    ),
  );
  let current = "article";
  const turns = [];
  const watch = new AutoWatch({
    session: { subscribe: () => () => {}, send: async (t) => turns.push(t) },
    capture: { screen: async () => ({ image: { data: "pixels" } }) },
    displayId: () => "1",
    sample: async () => Buffer.from(pages[current], "base64"),
    idleSeconds: () => 10,
  });
  try {
    watch.enable();
    await watch.tick();
    current = "listing";
    await watch.tick();
    assert.equal(turns.length, 0);
    await watch.tick();
    assert.equal(turns.length, 1);
  } finally {
    watch.dispose();
  }
});
test("A-1: a blinking caret and a ticking clock never start an explanation", async () => {
  const pages = JSON.parse(
    readFileSync(
      new URL("./fixtures/white-pages.json", import.meta.url),
      "utf8",
    ),
  );
  const noise = ["textPage", "caretMoved", "caretOff", "clockTick"];
  let n = 0;
  const turns = [];
  const watch = new AutoWatch({
    session: { subscribe: () => () => {}, send: async (t) => turns.push(t) },
    capture: { screen: async () => ({ image: { data: "pixels" } }) },
    displayId: () => "1",
    sample: async () => Buffer.from(pages[noise[n++ % noise.length]], "base64"),
    idleSeconds: () => 10,
  });
  try {
    watch.enable();
    for (let i = 0; i < 12; i++) await watch.tick();
    assert.equal(turns.length, 0);
  } finally {
    watch.dispose();
  }
});
