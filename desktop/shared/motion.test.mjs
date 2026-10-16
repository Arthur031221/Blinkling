import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { scanCss, scanFile, scanJs } from "./motion-scan.mjs";
import { cssVariables, duration, easing, springs, timing } from "./motion.mjs";

const desktop = join(dirname(fileURLToPath(import.meta.url)), "..");
const SKIP_DIRS = new Set(["node_modules", "dist", "e2e", "fixtures", "test"]);
const SKIP_FILES = /\.test\.mjs$|^(motion|motion-scan)\.mjs$/;

function* sources(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name) && entry.name !== "acceptance")
        yield* sources(path);
    } else if (/\.(mjs|cjs|css|html)$/.test(entry.name)) {
      if (!SKIP_FILES.test(entry.name)) yield path;
    }
  }
}
const rules = (found) => found.map((f) => f.rule).sort();

test("the tokens are the ones the spec fixes", () => {
  assert.deepEqual({ ...duration }, { fast: 120, base: 200, slow: 320 });
  assert.deepEqual(Object.keys(springs).sort(), ["crisp", "soft"]);
  assert.deepEqual(Object.keys(easing).sort(), ["enter", "exit", "standard"]);
  for (const name of Object.keys(duration))
    assert.match(cssVariables(), new RegExp(`--motion-${name}: \\d+ms;`));
  for (const value of Object.values(timing))
    assert.ok(Number.isFinite(value) && value > 0);
});

test("a planted timer, duration, easing or spring literal fails the scan", () => {
  assert.deepEqual(rules(scanJs("setTimeout(go, 3000);")), ["timer"]);
  assert.deepEqual(rules(scanJs("setInterval(go, 2 * 250);")), ["timer"]);
  assert.deepEqual(rules(scanJs("w.setTimeout(() => {}, 800);")), ["timer"]);
  assert.deepEqual(rules(scanJs("setTimeout(go, 0);")), []);
  assert.deepEqual(rules(scanJs("const c = `setTimeout(go, 3000)`;")), [
    "timer",
  ]);
  assert.deepEqual(rules(scanJs("setTimeout(go, timing.menuRest);")), []);
  assert.deepEqual(
    rules(scanJs("el.animate([{ opacity: 0 }], { duration: 220 });")),
    ["literal"],
  );
  assert.deepEqual(
    rules(scanJs('el.animate([{ opacity: 0 }], { easing: "ease-out" });')),
    ["literal"],
  );
  assert.deepEqual(
    rules(scanJs("el.animate([{ opacity: 0 }], { duration: duration.base });")),
    [],
  );
  assert.deepEqual(rules(scanJs("const stagger = 40;")), ["literal"]);
  assert.deepEqual(rules(scanJs("const o = { delay: 90 };")), ["literal"]);
  assert.deepEqual(rules(scanJs("function f(frequency = 18) {}")), ["literal"]);
  assert.deepEqual(rules(scanJs("spring(a, b, v, dt, 18);")), ["spring"]);
  assert.deepEqual(rules(scanJs("stepSpring(s, t, 12, dt);")), ["spring"]);
  assert.deepEqual(rules(scanJs("spring(a, b, v, dt, springs.crisp);")), []);
  assert.deepEqual(
    rules(scanJs('el.style.transition = "opacity 200ms ease";')).sort(),
    ["easing", "literal"],
  );
  assert.deepEqual(rules(scanJs('const c = "cubic-bezier(0, 0, 1, 1)";')), [
    "easing",
  ]);
  assert.deepEqual(rules(scanJs("const c = `transition: all ${n}`;")), [
    "animated-property",
  ]);
  assert.deepEqual(
    rules(scanJs("el.animate([{ width: 1 }, { width: 2 }], opts);")),
    ["animated-property"],
  );
});

test("a planted stylesheet literal or animated layout property fails the scan", () => {
  assert.deepEqual(rules(scanCss("a { transition: opacity 200ms; }")), [
    "literal",
  ]);
  assert.deepEqual(
    rules(scanCss("a { animation: x var(--motion-base) ease-in; }")),
    ["easing"],
  );
  assert.deepEqual(
    rules(scanCss("a { transition: transform var(--motion-fast) linear; }")),
    ["easing"],
  );
  assert.deepEqual(
    rules(
      scanCss("a { transition-timing-function: cubic-bezier(0, 1, 0, 1); }"),
    ),
    ["easing"],
  );
  assert.deepEqual(
    rules(
      scanCss("a { transition: width var(--motion-fast) var(--ease-exit); }"),
    ),
    ["animated-property"],
  );
  assert.deepEqual(
    rules(
      scanCss("a { transition: all var(--motion-fast) var(--ease-exit); }"),
    ),
    ["animated-property"],
  );
  assert.deepEqual(
    rules(
      scanCss("@keyframes k { from { left: 0; opacity: 0 } to { left: 9px } }"),
    ),
    ["animated-property", "animated-property"],
  );
  assert.deepEqual(
    rules(scanCss("a { background: linear-gradient(red, blue); }")),
    [],
  );
  assert.deepEqual(
    rules(
      scanCss(
        `a { transition: opacity var(--motion-fast) var(--ease-exit), transform var(--motion-base) var(--ease-enter); }
         b { animation: k calc(var(--motion-slow) * 4) var(--ease-standard) infinite; }
         @keyframes k { 0% { transform: scale(1); opacity: 0 } 100% { transform: none } }
         @media (prefers-reduced-motion: reduce) { a { transition: none; } }`,
      ),
    ),
    [],
  );
  assert.deepEqual(
    rules(
      scanFile(
        "x.html",
        '<style>a{transition:opacity 1s}</style><i style="animation:k 2s">',
      ),
    ),
    ["literal", "literal"],
  );
});

test("no timing, easing or spring literal and no animated layout property outside shared/motion.mjs", () => {
  const found = [];
  let files = 0;
  for (const file of sources(desktop)) {
    files += 1;
    for (const v of scanFile(file, readFileSync(file, "utf8")))
      found.push(`${relative(desktop, file)}:${v.line} ${v.rule}: ${v.text}`);
  }
  assert.ok(files > 60, `scanned only ${files} files`);
  assert.deepEqual(found, []);
});

test("the eat is quick: the picture is in the mouth within 0.9 s of the press, before the card", () => {
  assert.ok(timing.eatLead + timing.genie <= 900);
  assert.ok(timing.genie >= 400, "still long enough to read as sucked in");
});
