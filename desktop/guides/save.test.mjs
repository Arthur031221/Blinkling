import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readdir, readFile, rm, mkdir } from "node:fs/promises";
import { readFileSync } from "node:fs";
import http from "node:http";
import https from "node:https";
import net from "node:net";
import { tmpdir } from "node:os";
import { join, relative, isAbsolute } from "node:path";
import { crc32, deflateSync } from "node:zlib";
import { safeFolderName, saveGuide } from "./save.mjs";
import { guideStrings, guideText } from "./strings.mjs";
import { LOCALES } from "../shared/i18n.mjs";

const NOW = new Date(2026, 9, 15, 14, 5, 30).getTime(); // local 2026-10-15 14:05
const STAMP = "2026-10-15 14.05";

function chunk(type, body) {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(body.length);
  head.write(type, 4, "latin1");
  const tail = Buffer.alloc(4);
  tail.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), body])));
  return Buffer.concat([head, body, tail]);
}
/** A real, valid RGBA PNG whose pixels depend on the seed. */
function png(seed, size = 4) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header.set([8, 6, 0, 0, 0], 8);
  const rows = Buffer.alloc((size * 4 + 1) * size);
  for (let i = 0; i < rows.length; i++)
    rows[i] = i % (size * 4 + 1) ? (i * 31 + seed * 17) & 255 : 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(rows)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}
const shot = (seed, extra = {}) => {
  const bytes = png(seed);
  return {
    bytes,
    shot: { data: bytes.toString("base64"), width: 4, height: 4, ...extra },
  };
};

async function sandbox(t) {
  const documents = await mkdtemp(join(tmpdir(), "blinkling-guides-"));
  t.after(() => rm(documents, { recursive: true, force: true }));
  const revealed = [];
  return {
    documents,
    revealed,
    options: {
      documents,
      reveal: (folder) => revealed.push(folder),
      now: () => NOW,
    },
  };
}

const guideOf = (overrides = {}) => ({
  title: "Booking a flight",
  explanation: "This page searches flights and lists the cheapest fares.",
  language: "en",
  steps: [
    { n: 1, title: "Pick the cities", text: "Type **From** and **To**." },
    {
      n: 2,
      title: "Choose dates",
      text: "Open the calendar.\n\nPick two days.",
    },
  ],
  screenshots: [],
  ...overrides,
});

test("writes the folder, guide.md and byte-exact PNGs, then reveals the folder once", async (t) => {
  const box = await sandbox(t);
  const a = shot(1);
  const result = await saveGuide(
    guideOf({ screenshots: [a.shot] }),
    box.options,
  );
  const root = join(box.documents, "Blinkling Guides");
  assert.equal(result.folder, join(root, `${STAMP} Booking a flight`));
  assert.equal(result.markdown, join(result.folder, "guide.md"));
  assert.deepEqual((await readdir(result.folder)).sort(), [
    "guide.md",
    "screen-1.png",
  ]);
  assert.ok(
    a.bytes.equals(await readFile(join(result.folder, "screen-1.png"))),
  );
  assert.deepEqual(box.revealed, [result.folder]);
  assert.equal(
    await readFile(result.markdown, "utf8"),
    [
      "# Booking a flight",
      "",
      "This page searches flights and lists the cheapest fares.",
      "",
      "![Screen 1](screen-1.png)",
      "",
      "## Steps",
      "",
      "### 1. Pick the cities",
      "",
      "Type **From** and **To**.",
      "",
      "### 2. Choose dates",
      "",
      "Open the calendar.",
      "",
      "Pick two days.",
      "",
    ].join("\n"),
  );
});

test("a screenshot that belongs to a step is named and linked under that step", async (t) => {
  const box = await sandbox(t);
  const one = shot(1, { step: 1 });
  const two = shot(2, { step: 2 });
  const overview = shot(3);
  const { folder, markdown } = await saveGuide(
    guideOf({ screenshots: [overview.shot, one.shot, two.shot] }),
    box.options,
  );
  assert.deepEqual((await readdir(folder)).sort(), [
    "guide.md",
    "screen-1.png",
    "step-1.png",
    "step-2.png",
  ]);
  assert.ok(one.bytes.equals(await readFile(join(folder, "step-1.png"))));
  assert.ok(two.bytes.equals(await readFile(join(folder, "step-2.png"))));
  const text = await readFile(markdown, "utf8");
  assert.match(text, /!\[Screen 1\]\(screen-1\.png\)/);
  assert.match(
    text,
    /### 1\. Pick the cities\n\nType \*\*From\*\* and \*\*To\*\*\.\n\n!\[Step 1\]\(step-1\.png\)\n\n### 2\./,
  );
  assert.doesNotMatch(text, /\]\((\/|[a-z]+:)/i, "image links stay relative");
});

test("the guide is written in the guide's language", async (t) => {
  const box = await sandbox(t);
  const { markdown } = await saveGuide(
    guideOf({
      language: "zh-TW",
      title: "訂機票",
      screenshots: [shot(1).shot],
    }),
    box.options,
  );
  const text = await readFile(markdown, "utf8");
  assert.match(text, /^# 訂機票\n/);
  assert.match(text, /!\[畫面 1\]\(screen-1\.png\)/);
  assert.match(text, /\n## 步驟\n/);
});

test("folder names are safe: separators, reserved names, dots, length", () => {
  const fallback = "Guide";
  assert.equal(safeFolderName("a/b\\c", fallback), "a b c");
  assert.equal(safeFolderName('x<y>:"z"|?*', fallback), "x y z");
  assert.equal(safeFolderName("../../etc/passwd", fallback), "etc passwd");
  assert.equal(safeFolderName("Report...", fallback), "Report");
  assert.equal(
    safeFolderName("  spaced   out \t title ", fallback),
    "spaced out title",
  );
  assert.equal(
    safeFolderName("line\nbreak\u0000nul", fallback),
    "line break nul",
  );
  for (const name of [
    "CON",
    "con",
    "PRN",
    "Aux",
    "NUL",
    "COM1",
    "lpt9",
    "con.txt",
  ])
    assert.notEqual(
      safeFolderName(name, fallback).split(".")[0].toUpperCase(),
      name.split(".")[0].toUpperCase(),
      `${name} is reserved on Windows`,
    );
  assert.equal(
    safeFolderName("Console", fallback),
    "Console",
    "only exact reserved names change",
  );
  assert.equal(safeFolderName("", fallback), fallback);
  assert.equal(safeFolderName("...", fallback), fallback);
  assert.equal(safeFolderName("///", fallback), fallback);
  assert.equal(safeFolderName(undefined, fallback), fallback);
  const long = safeFolderName("x".repeat(500), fallback);
  assert.equal(long.length, 60);
  const emoji = safeFolderName("🙂".repeat(100), fallback);
  assert.equal([...emoji].length, 60, "cut on whole characters");
  assert.doesNotMatch(emoji, /[\ud800-\udbff](?![\udc00-\udfff])/);
  assert.equal(
    safeFolderName("a".repeat(59) + ". tail", fallback),
    "a".repeat(59),
    "no trailing dot after the cut",
  );
});

test("a hostile title cannot leave the guides folder", async (t) => {
  const box = await sandbox(t);
  for (const title of [
    "../../outside",
    "/etc/passwd",
    "C:\\Windows\\x",
    "CON",
    ".",
  ]) {
    const { folder } = await saveGuide(guideOf({ title }), box.options);
    const inside = relative(join(box.documents, "Blinkling Guides"), folder);
    assert.ok(inside && !inside.startsWith("..") && !isAbsolute(inside), title);
    assert.doesNotMatch(inside, /[\\/]/, "one folder level");
  }
  assert.deepEqual(await readdir(box.documents), ["Blinkling Guides"]);
});

test("a second save in the same minute gets its own folder", async (t) => {
  const box = await sandbox(t);
  const first = await saveGuide(guideOf({ explanation: "one" }), box.options);
  const second = await saveGuide(guideOf({ explanation: "two" }), box.options);
  const third = await saveGuide(guideOf({ explanation: "three" }), box.options);
  assert.equal(second.folder, `${first.folder} (2)`);
  assert.equal(third.folder, `${first.folder} (3)`);
  assert.match(await readFile(first.markdown, "utf8"), /\none\n/);
  assert.match(await readFile(second.markdown, "utf8"), /\ntwo\n/);
  assert.match(await readFile(third.markdown, "utf8"), /\nthree\n/);
});

test("saves started together still get distinct folders", async (t) => {
  const box = await sandbox(t);
  const results = await Promise.all(
    Array.from({ length: 5 }, (_, i) =>
      saveGuide(guideOf({ explanation: `save ${i}` }), box.options),
    ),
  );
  assert.equal(new Set(results.map((r) => r.folder)).size, 5);
  for (const [i, r] of results.entries())
    assert.match(
      await readFile(r.markdown, "utf8"),
      new RegExp(`save ${i}\\n`),
    );
});

test("a bad screenshot saves nothing and leaves no half-written folder", async (t) => {
  const box = await sandbox(t);
  const good = shot(1);
  await assert.rejects(
    saveGuide(
      guideOf({
        screenshots: [
          good.shot,
          { data: Buffer.from("not a png").toString("base64") },
        ],
      }),
      box.options,
    ),
    /PNG/,
  );
  assert.deepEqual(
    await readdir(box.documents),
    [],
    "validated before any write",
  );
  assert.deepEqual(box.revealed, []);
  await assert.rejects(
    saveGuide(guideOf({ steps: "nope" }), box.options),
    TypeError,
  );
  await assert.rejects(saveGuide(null, box.options), TypeError);
});

test("a data URL prefix on the image is accepted", async (t) => {
  const box = await sandbox(t);
  const a = shot(4);
  const { folder } = await saveGuide(
    guideOf({
      screenshots: [
        { ...a.shot, data: `data:image/png;base64,${a.shot.data}` },
      ],
    }),
    box.options,
  );
  assert.ok(a.bytes.equals(await readFile(join(folder, "screen-1.png"))));
});

test("duplicate or missing step numbers still write distinct files", async (t) => {
  const box = await sandbox(t);
  const a = shot(1, { step: 1 });
  const b = shot(2, { step: 1 });
  const { folder, markdown } = await saveGuide(
    guideOf({
      steps: [
        { n: 1, title: "A", text: "a" },
        { n: 1, title: "B", text: "b" },
        { title: "C", text: "c" },
      ],
      screenshots: [a.shot, b.shot],
    }),
    box.options,
  );
  const text = await readFile(markdown, "utf8");
  assert.deepEqual(
    [...text.matchAll(/^### (\d+)\. /gm)].map((m) => m[1]),
    ["1", "2", "3"],
  );
  assert.ok(a.bytes.equals(await readFile(join(folder, "step-1.png"))));
  assert.ok(
    (await readdir(folder)).includes("screen-1.png"),
    "the second image for step 1 is kept as a screen",
  );
  assert.ok(b.bytes.equals(await readFile(join(folder, "screen-1.png"))));
});

test("a reveal that fails does not undo the save", async (t) => {
  const box = await sandbox(t);
  const result = await saveGuide(guideOf(), {
    ...box.options,
    reveal: () => {
      throw new Error("no file manager");
    },
  });
  assert.equal(result.revealed, false);
  assert.match(await readFile(result.markdown, "utf8"), /^# Booking a flight/);
});

test("only the guide itself is written: no replay data, no list of saved guides (N2.4)", async (t) => {
  const box = await sandbox(t);
  await saveGuide(
    guideOf({ screenshots: [shot(1).shot, shot(2, { step: 2 }).shot] }),
    box.options,
  );
  await saveGuide(guideOf({ title: "Another" }), box.options);
  const root = join(box.documents, "Blinkling Guides");
  const entries = await readdir(root, { withFileTypes: true });
  assert.equal(entries.length, 2);
  assert.ok(
    entries.every((e) => e.isDirectory()),
    "no index or list file next to the guides",
  );
  for (const entry of entries)
    for (const file of await readdir(join(root, entry.name)))
      assert.match(file, /^(guide\.md|screen-\d+\.png|step-\d+\.png)$/);
  const source = readFileSync(new URL("./save.mjs", import.meta.url), "utf8");
  assert.doesNotMatch(
    source,
    /readdir|opendir|readFile|replay\.json|index\.json/,
  );
});

test("an existing folder from another run is never overwritten", async (t) => {
  const box = await sandbox(t);
  const taken = join(
    box.documents,
    "Blinkling Guides",
    `${STAMP} Booking a flight`,
  );
  await mkdir(taken, { recursive: true });
  const result = await saveGuide(guideOf(), box.options);
  assert.equal(result.folder, `${taken} (2)`);
  assert.deepEqual(await readdir(taken), []);
});

test("saving makes no network call", async (t) => {
  const box = await sandbox(t);
  const boom = () => {
    throw new Error("network used");
  };
  const saved = {
    fetch: globalThis.fetch,
    http: [http.request, http.get],
    https: [https.request, https.get],
    net: [net.connect, net.createConnection, net.Socket.prototype.connect],
  };
  globalThis.fetch = boom;
  http.request = http.get = boom;
  https.request = https.get = boom;
  net.connect = net.createConnection = net.Socket.prototype.connect = boom;
  try {
    await saveGuide(guideOf({ screenshots: [shot(1).shot] }), box.options);
  } finally {
    globalThis.fetch = saved.fetch;
    [http.request, http.get] = saved.http;
    [https.request, https.get] = saved.https;
    [net.connect, net.createConnection, net.Socket.prototype.connect] =
      saved.net;
  }
  const source = readFileSync(new URL("./save.mjs", import.meta.url), "utf8");
  assert.doesNotMatch(
    source,
    /\bfetch\b|node:(https?|net|tls|dns|dgram)|XMLHttpRequest/,
  );
});

test("every locale carries every guide string, and the name is never translated", () => {
  const keys = Object.keys(guideStrings.en).sort();
  for (const locale of LOCALES) {
    assert.deepEqual(Object.keys(guideStrings[locale]).sort(), keys, locale);
    for (const value of Object.values(guideStrings[locale]))
      assert.ok(value.trim(), `${locale} has no empty string`);
  }
  assert.equal(guideText("zh-TW")("saveBubble"), "儲存導覽");
  assert.equal(guideText("en")("screenAlt", { n: 3 }), "Screen 3");
  assert.equal(
    guideText("xx")("steps"),
    "Steps",
    "unknown locale falls back to English",
  );
});
