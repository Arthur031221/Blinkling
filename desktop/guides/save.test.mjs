import test, { mock } from "node:test";
import fsp from "node:fs/promises";
import assert from "node:assert/strict";
import http from "node:http";
import https from "node:https";
import net from "node:net";
import { deflateSync, crc32 } from "node:zlib";
import {
  mkdtempSync,
  readdirSync,
  readFileSync,
  existsSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { LOCALES } from "../shared/i18n.mjs";
import { saveGuide, safeTitle, folderName, GUIDES_DIR } from "./save.mjs";
import { STRINGS, guideStrings } from "./strings.mjs";

// A real, decodable RGBA PNG without a dependency.
const chunk = (type, body) => {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(body.length);
  head.write(type, 4, "latin1");
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), body])));
  return Buffer.concat([head, body, crc]);
};
const png = (w, h, shade) => {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr.set([8, 6, 0, 0, 0], 8);
  const row = Buffer.concat([Buffer.from([0]), Buffer.alloc(w * 4, shade)]);
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(Buffer.concat(Array(h).fill(row)))),
    chunk("IEND", Buffer.alloc(0)),
  ]);
};
const shot = (shade, width = 6, height = 4) => {
  const bytes = png(width, height, shade);
  return { bytes, data: bytes.toString("base64"), width, height };
};
const at = (minute) => () => new Date(2026, 9, 15, 9, minute).getTime();

function setup() {
  const documents = mkdtempSync(join(tmpdir(), "blinkling-docs-"));
  const revealed = [];
  return {
    documents,
    revealed,
    options: {
      documents,
      reveal: (folder) => revealed.push(folder),
      now: at(5),
    },
    done: () => rmSync(documents, { recursive: true, force: true }),
  };
}

const guide = (extra = {}) => ({
  title: "Set up the printer",
  explanation: "The printer settings page of the office router.",
  language: "en",
  steps: [
    { n: 1, title: "Open Devices", text: "Click **Devices** in the sidebar." },
    { n: 2, title: "Add printer", text: "Press Add, then pick the HP." },
  ],
  screenshots: [],
  ...extra,
});

test("the folder is Documents/Blinkling Guides/<date time> <title>", async () => {
  const s = setup();
  try {
    const { folder } = await saveGuide(guide(), s.options);
    assert.equal(
      folder,
      join(
        s.documents,
        "Blinkling Guides",
        "2026-10-15 09.05 Set up the printer",
      ),
    );
    assert.equal(GUIDES_DIR, "Blinkling Guides");
    assert.ok(existsSync(join(folder, "guide.md")));
  } finally {
    s.done();
  }
});

test("titles become safe folder names", () => {
  assert.equal(safeTitle('a/b\\c:d*e?f"g<h>i|j'), "a b c d e f g h i j");
  assert.equal(safeTitle("  spaced \n out\t title  "), "spaced out title");
  assert.equal(safeTitle("../../etc/passwd"), "etc passwd");
  assert.equal(safeTitle("ends with dots..."), "ends with dots");
  assert.equal(safeTitle("trailing dot. "), "trailing dot");
  assert.equal(safeTitle("nul\u0000byte\u001f"), "nul byte");
  for (const reserved of [
    "CON",
    "prn",
    "Aux",
    "NUL",
    "COM1",
    "lpt9",
    "con.txt",
  ])
    assert.doesNotMatch(
      safeTitle(reserved),
      /^(con|prn|aux|nul|com\d|lpt\d)(\..*)?$/i,
      reserved,
    );
  assert.equal(safeTitle("COM10"), "COM10");
  assert.equal(safeTitle("Console"), "Console");
  assert.equal(safeTitle("..."), "");
  assert.equal(safeTitle(undefined), "");
});

test("over-long titles are cut on whole characters and stay inside 255 bytes", () => {
  for (const title of [
    "x".repeat(500),
    "導覽".repeat(300),
    "😀".repeat(200),
    `${"a".repeat(59)}.${"b".repeat(100)}`,
  ]) {
    const name = folderName(title, new Date(2026, 9, 15, 9, 5), "Guide");
    assert.ok(Buffer.byteLength(name) <= 255, name);
    assert.doesNotMatch(
      name,
      /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/,
    );
    assert.doesNotMatch(name, /[. ]$/);
    assert.match(name, /^2026-10-15 09\.05 /);
  }
  assert.equal(
    folderName("😀".repeat(200), new Date(2026, 9, 15, 9, 5), "Guide"),
    `2026-10-15 09.05 ${"😀".repeat(50)}`,
  );
  assert.equal(
    folderName("導覽".repeat(300), new Date(2026, 9, 15, 9, 5), "Guide"),
    `2026-10-15 09.05 ${"導覽".repeat(30)}`,
  );
});

test("an empty or unusable title falls back to the localized word", async () => {
  const s = setup();
  try {
    const a = await saveGuide(guide({ title: "///" }), s.options);
    assert.match(a.folder, /2026-10-15 09\.05 Guide$/);
    const b = await saveGuide(guide({ title: "", language: "zh-TW" }), {
      ...s.options,
      now: at(6),
    });
    assert.match(b.folder, /2026-10-15 09\.06 導覽$/);
  } finally {
    s.done();
  }
});

test("a second save in the same minute gets its own folder and keeps the first", async () => {
  const s = setup();
  try {
    const a = await saveGuide(guide({ explanation: "first" }), s.options);
    const b = await saveGuide(guide({ explanation: "second" }), s.options);
    const c = await saveGuide(guide({ explanation: "third" }), s.options);
    assert.deepEqual(
      [a.folder, b.folder, c.folder].map((f) => f.split(/[\\/]/).pop()),
      [
        "2026-10-15 09.05 Set up the printer",
        "2026-10-15 09.05 Set up the printer (2)",
        "2026-10-15 09.05 Set up the printer (3)",
      ],
    );
    assert.match(readFileSync(a.markdown, "utf8"), /first/);
    assert.match(readFileSync(b.markdown, "utf8"), /second/);
  } finally {
    s.done();
  }
});

test("concurrent saves in one minute never share a folder", async () => {
  const s = setup();
  try {
    const all = await Promise.all(
      Array.from({ length: 6 }, (_, i) =>
        saveGuide(guide({ explanation: `n${i}` }), s.options),
      ),
    );
    assert.equal(new Set(all.map((r) => r.folder)).size, 6);
    for (const [i, r] of all.entries())
      assert.match(readFileSync(r.markdown, "utf8"), new RegExp(`n${i}`));
  } finally {
    s.done();
  }
});

test("guide.md has the title, the explanation, numbered steps and relative image links", async () => {
  const s = setup();
  try {
    const one = shot(40),
      two = shot(200, 8, 5),
      three = shot(120, 3, 3);
    const { markdown, folder } = await saveGuide(
      guide({
        screenshots: [
          { data: one.data, width: one.width, height: one.height, step: 1 },
          { data: two.data, width: two.width, height: two.height, step: 2 },
          { data: three.data, width: three.width, height: three.height },
        ],
      }),
      s.options,
    );
    assert.equal(markdown, join(folder, "guide.md"));
    const text = readFileSync(markdown, "utf8");
    assert.match(text, /^# Set up the printer\n/);
    assert.ok(
      text.includes(
        "## About this screen\n\nThe printer settings page of the office router.",
      ),
    );
    assert.match(text, /## Steps\n/);
    assert.match(text, /^1\. \*\*Open Devices\*\*/m);
    assert.match(text, /^2\. \*\*Add printer\*\*/m);
    assert.ok(text.includes("Click **Devices** in the sidebar."));
    assert.ok(text.includes("![Step 1](step-1.png)"));
    assert.ok(text.includes("![Step 2](step-2.png)"));
    assert.ok(text.includes("![Screen 3](screen-3.png)"));
    assert.ok(text.indexOf("## About this screen") < text.indexOf("## Steps"));
    assert.ok(text.indexOf("![Step 1]") < text.indexOf("2. **Add printer**"));
    for (const link of text.matchAll(/!\[[^\]]*\]\(([^)]+)\)/g)) {
      assert.doesNotMatch(link[1], /^([a-z]+:|\/|\.\.)/i);
      assert.ok(existsSync(join(folder, link[1])), link[1]);
    }
  } finally {
    s.done();
  }
});

test("headings follow the guide's language", async () => {
  const s = setup();
  try {
    const { markdown } = await saveGuide(guide({ language: "ja" }), s.options);
    const text = readFileSync(markdown, "utf8");
    assert.ok(text.includes("## この画面について"));
    assert.ok(text.includes("## 手順"));
    assert.doesNotMatch(text, /## Steps/);
  } finally {
    s.done();
  }
});

test("PNGs are written byte for byte", async () => {
  const s = setup();
  try {
    const a = shot(10, 9, 7),
      b = shot(250, 4, 4);
    const { folder } = await saveGuide(
      guide({
        screenshots: [
          { data: a.data, width: 9, height: 7, step: 1 },
          { data: b.data, width: 4, height: 4 },
        ],
      }),
      s.options,
    );
    assert.ok(readFileSync(join(folder, "step-1.png")).equals(a.bytes));
    assert.ok(readFileSync(join(folder, "screen-2.png")).equals(b.bytes));
    assert.deepEqual(readdirSync(folder).sort(), [
      "guide.md",
      "screen-2.png",
      "step-1.png",
    ]);
  } finally {
    s.done();
  }
});

test("data URLs and surrounding whitespace in the screenshot data are accepted", async () => {
  const s = setup();
  try {
    const a = shot(77);
    const { folder } = await saveGuide(
      guide({
        screenshots: [
          { data: `data:image/png;base64,${a.data}\n`, width: 6, height: 4 },
        ],
      }),
      s.options,
    );
    assert.ok(readFileSync(join(folder, "screen-1.png")).equals(a.bytes));
  } finally {
    s.done();
  }
});

test("the folder is revealed exactly once, after everything is written", async () => {
  const s = setup();
  try {
    const seen = [];
    const { folder } = await saveGuide(guide({ screenshots: [shot(1)] }), {
      ...s.options,
      reveal: (f) => seen.push([f, readdirSync(f).sort()]),
    });
    assert.deepEqual(seen, [[folder, ["guide.md", "screen-1.png"]]]);
  } finally {
    s.done();
  }
});

test("a reveal that fails does not turn a saved guide into a failure", async () => {
  const s = setup();
  try {
    const result = await saveGuide(guide(), {
      ...s.options,
      reveal: () => {
        throw new Error("no file manager");
      },
    });
    assert.ok(existsSync(result.markdown));
    assert.equal(result.revealed, false);
    const ok = await saveGuide(guide(), s.options);
    assert.equal(ok.revealed, true);
  } finally {
    s.done();
  }
});

test("a bad screenshot rejects and leaves no half-written folder", async () => {
  const s = setup();
  try {
    for (const data of [
      "not base64 at all!!",
      Buffer.from("GIF89a....").toString("base64"),
      "",
    ])
      await assert.rejects(
        saveGuide(
          guide({ screenshots: [shot(5), { data, width: 1, height: 1 }] }),
          s.options,
        ),
        /screenshot/i,
      );
    assert.deepEqual(readdirSync(s.documents), []);
    assert.deepEqual(s.revealed, []);
  } finally {
    s.done();
  }
});

test("a write that fails halfway removes the folder and reveals nothing", async () => {
  const s = setup();
  let calls = 0;
  const original = fsp.writeFile;
  const failing = mock.method(fsp, "writeFile", async (...args) => {
    if (++calls === 2) throw new Error("disk full");
    return original(...args);
  });
  try {
    await assert.rejects(
      saveGuide(guide({ screenshots: [shot(5), shot(6)] }), s.options),
      /disk full/,
    );
    assert.equal(calls, 2);
    assert.deepEqual(readdirSync(join(s.documents, "Blinkling Guides")), []);
    assert.deepEqual(s.revealed, []);
  } finally {
    failing.mock.restore();
    s.done();
  }
});

test("two screenshots for one step do not overwrite each other", async () => {
  const s = setup();
  try {
    const a = shot(1),
      b = shot(2);
    const { folder } = await saveGuide(
      guide({
        screenshots: [
          { data: a.data, step: 2 },
          { data: b.data, step: 2 },
          { data: b.data, step: 9 },
        ],
      }),
      s.options,
    );
    assert.deepEqual(readdirSync(folder).sort(), [
      "guide.md",
      "screen-2.png",
      "screen-3.png",
      "step-2.png",
    ]);
    assert.ok(readFileSync(join(folder, "step-2.png")).equals(a.bytes));
    assert.ok(readFileSync(join(folder, "screen-2.png")).equals(b.bytes));
  } finally {
    s.done();
  }
});

test("a guide with no steps or explanation still saves a readable file", async () => {
  const s = setup();
  try {
    const { markdown } = await saveGuide(
      { title: "Bare", language: "en" },
      s.options,
    );
    const text = readFileSync(markdown, "utf8");
    assert.match(text, /^# Bare\n/);
    assert.doesNotMatch(text, /## Steps/);
    assert.doesNotMatch(text, /undefined/);
  } finally {
    s.done();
  }
});

test("markdown from model text cannot break out of its line", async () => {
  const s = setup();
  try {
    const { markdown } = await saveGuide(
      guide({
        title: "Line one\n# injected heading",
        steps: [{ n: 1, title: "A\n2. fake", text: "ok" }],
      }),
      s.options,
    );
    const text = readFileSync(markdown, "utf8");
    assert.equal(text.match(/^# /gm).length, 1);
    assert.match(text, /^# Line one # injected heading$/m);
    assert.match(text, /^1\. \*\*A 2\. fake\*\*/m);
  } finally {
    s.done();
  }
});

test("saving needs no network and writes no replay data or list of guides", async () => {
  const s = setup();
  const boom = () => {
    throw new Error("network used");
  };
  const saved = [
    ["fetch", globalThis, "fetch"],
    ["http.request", http, "request"],
    ["http.get", http, "get"],
    ["https.request", https, "request"],
    ["https.get", https, "get"],
    ["net.connect", net, "connect"],
    ["net.createConnection", net, "createConnection"],
  ].map(([, object, key]) => [object, key, object[key]]);
  try {
    for (const [object, key] of saved) object[key] = boom;
    const a = shot(3);
    await saveGuide(
      guide({ screenshots: [{ data: a.data, width: 6, height: 4, step: 1 }] }),
      s.options,
    );
    await saveGuide(guide(), s.options);
  } finally {
    for (const [object, key, original] of saved) object[key] = original;
    // Walk everything written: only guide.md and PNGs, no json, no index.
    const files = [];
    const walk = (dir) => {
      for (const e of readdirSync(dir, { withFileTypes: true }))
        if (e.isDirectory()) walk(join(dir, e.name));
        else files.push(e.name);
    };
    walk(s.documents);
    assert.ok(files.length >= 3);
    assert.ok(
      files.every((f) => /^(guide\.md|(step|screen)-\d+\.png)$/.test(f)),
      files.join(),
    );
    assert.deepEqual(readdirSync(s.documents), ["Blinkling Guides"]);
    s.done();
  }
  const source = readFileSync(new URL("./save.mjs", import.meta.url), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/.*$/gm, "");
  assert.doesNotMatch(
    source,
    /\b(fetch|XMLHttpRequest|WebSocket)\b|node:(https?|net|dgram|tls)/,
  );
  assert.doesNotMatch(source, /replay|readdir|readFile/i);
});

test("every locale has the same keys and slots as English", () => {
  assert.deepEqual(Object.keys(STRINGS).sort(), [...LOCALES].sort());
  const slots = (text) =>
    [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
  for (const locale of LOCALES) {
    assert.deepEqual(
      Object.keys(STRINGS[locale]),
      Object.keys(STRINGS.en),
      locale,
    );
    for (const [key, text] of Object.entries(STRINGS[locale])) {
      assert.ok(text.trim(), `${locale}.${key}`);
      assert.deepEqual(slots(text), slots(STRINGS.en[key]), `${locale}.${key}`);
      assert.doesNotMatch(text, /布林克林|ブリンクリング/);
    }
  }
  assert.equal(STRINGS["zh-TW"].save, "儲存導覽");
  assert.equal(guideStrings(["zh-TW"])("save"), "儲存導覽");
  assert.equal(guideStrings(["pt_BR"])("save"), "Salvar guia");
  assert.equal(guideStrings(["xx"])("save"), "Save guide");
  assert.equal(guideStrings(["fr"])("stepAlt", { n: 3 }), "Étape 3");
});
