import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createGuideOffer } from "./offer.mjs";
import { GUIDES_DIR } from "./save.mjs";

// A real 1x1 RGBA PNG.
const PNG =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";

const result = (extra = {}) => ({
  title: "Set up the printer",
  explanation: "The printer settings page.",
  language: "zh-TW",
  steps: [
    { n: 1, title: "Open Devices", text: "Click **Devices**." },
    { n: 2, title: "Add printer", text: "Press Add." },
  ],
  shots: [{ data: PNG, width: 1, height: 1, step: 1 }],
  ...extra,
});

function setup(options = {}) {
  const documents = mkdtempSync(join(tmpdir(), "blinkling-offer-"));
  const events = [];
  const revealed = [];
  const offer = createGuideOffer({
    send: (event) => events.push(event),
    languages: ["zh-TW"],
    documents,
    reveal: (folder) => revealed.push(folder),
    now: () => new Date(2026, 9, 15, 9, 5).getTime(),
    ...options,
  });
  return {
    offer,
    events,
    revealed,
    documents,
    folders: () => {
      try {
        return readdirSync(join(documents, GUIDES_DIR));
      } catch {
        return [];
      }
    },
    done: () => rmSync(documents, { recursive: true, force: true }),
  };
}

test("the end of a guide offers one quiet 儲存導覽 bubble and writes nothing yet", () => {
  const t = setup();
  t.offer.offerSave(result());
  assert.deepEqual(t.events, [
    {
      type: "blink-offer",
      id: "guide-save",
      label: "儲存導覽",
      action: "save-guide",
    },
  ]);
  assert.deepEqual(t.folders(), []);
  t.done();
});

test("offering twice keeps one bubble: the id is the same and the newer guide wins", async () => {
  const t = setup();
  t.offer.offerSave(result({ title: "First" }));
  t.offer.offerSave(result({ title: "Second" }));
  assert.equal(new Set(t.events.map((e) => e.id)).size, 1);
  await t.offer.save();
  assert.match(t.folders()[0], /Second$/);
  t.done();
});

test("clicking writes Markdown and the annotated screenshots, reveals the folder and says so", async () => {
  const t = setup();
  t.offer.offerSave(result());
  t.events.length = 0;
  const saved = await t.offer.save();
  assert.equal(saved.ok, true);
  const [folder] = t.folders();
  assert.equal(folder, "2026-10-15 09.05 Set up the printer");
  const dir = join(t.documents, GUIDES_DIR, folder);
  const files = readdirSync(dir).sort();
  assert.ok(files.includes("guide.md"));
  assert.equal(files.filter((f) => f.endsWith(".png")).length, 1);
  const md = readFileSync(join(dir, "guide.md"), "utf8");
  assert.match(md, /Open Devices/);
  assert.match(md, /\.png/);
  assert.deepEqual(t.revealed, [dir]);
  assert.deepEqual(t.events, [
    { type: "blink-say", id: "guide-save", text: "導覽已儲存" },
  ]);
  t.done();
});

test("a double click saves once", async () => {
  const t = setup();
  t.offer.offerSave(result());
  const [a, b] = await Promise.all([t.offer.save(), t.offer.save()]);
  assert.equal(a.ok, true);
  assert.deepEqual(b, a, "the second click joins the first save");
  assert.equal(t.folders().length, 1);
  assert.equal((await t.offer.save()).ok, false, "nothing is left to save");
  assert.equal(t.folders().length, 1);
  t.done();
});

test("a failed save says so and keeps the offer so it can be retried", async () => {
  let broken = true;
  const t = setup({
    saveGuide: async (...args) => {
      if (broken) throw new Error("disk full");
      return (await import("./save.mjs")).saveGuide(...args);
    },
  });
  t.offer.offerSave(result());
  t.events.length = 0;
  const failed = await t.offer.save();
  assert.equal(failed.ok, false);
  assert.equal(t.events.length, 1);
  assert.equal(t.events[0].type, "blink-offer");
  assert.equal(t.events[0].id, "guide-save");
  assert.equal(t.events[0].action, "save-guide");
  assert.match(t.events[0].label, /無法儲存導覽/);
  broken = false;
  assert.equal((await t.offer.save()).ok, true);
  assert.equal(t.folders().length, 1);
  t.done();
});

test("a guide with nothing in it is not offered", () => {
  const t = setup();
  assert.equal(t.offer.offerSave(undefined), false);
  assert.equal(t.offer.offerSave({ title: "x", steps: [], shots: [] }), false);
  assert.deepEqual(t.events, []);
  t.done();
});

test("a bad screenshot is a failed save that creates no folder", async () => {
  const t = setup();
  t.offer.offerSave(result({ shots: [{ data: "not a png" }] }));
  assert.equal((await t.offer.save()).ok, false);
  assert.deepEqual(t.folders(), []);
  t.done();
});

test("saving with no offer made does nothing", async () => {
  const t = setup();
  assert.equal((await t.offer.save()).ok, false);
  assert.deepEqual(t.events, []);
  t.done();
});

test("there is no replay and no saved-guides list (N3.9)", async () => {
  const t = setup();
  assert.deepEqual(Object.keys(t.offer).sort(), [
    "dispose",
    "offerSave",
    "save",
  ]);
  const { readdirSync: ls } = await import("node:fs");
  const names = ls(new URL(".", import.meta.url));
  assert.deepEqual(
    names.filter((n) => /replay|list|history/i.test(n)),
    [],
  );
  t.done();
});

test("the save bubble follows a language chosen while Blink runs", () => {
  let language = "zh-TW";
  const t = setup({ languages: () => [language] });
  t.offer.offerSave(result({ language: undefined }));
  language = "en";
  t.offer.offerSave(result({ language: undefined }));
  assert.equal(t.events[0].label, "儲存導覽");
  assert.notEqual(t.events[1].label, "儲存導覽");
  t.done();
});
