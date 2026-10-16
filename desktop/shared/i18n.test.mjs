import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import {
  LOCALES,
  pickLocale,
  translator,
  systemLocale,
  resetSystemLocale,
  documentLocale,
  setDocumentLocale,
} from "./i18n.mjs";

const fakeApp = ({ preferred = [], locale = "en-US", lang } = {}) => {
  const calls = { preferred: 0, locale: 0 };
  return {
    calls,
    commandLine: { hasSwitch: (name) => name === "lang" && Boolean(lang) },
    getPreferredSystemLanguages: () => (calls.preferred++, preferred),
    getLocale: () => (calls.locale++, locale),
  };
};

const fakeDocument = ({ dataset = {}, languages } = {}) => ({
  documentElement: { dataset },
  defaultView: languages ? { navigator: { languages } } : null,
});

beforeEach(() => resetSystemLocale());

test("pickLocale maps system tags onto the shipped locales", () => {
  assert.equal(pickLocale(["zh-Hant-TW"]), "zh-TW");
  assert.equal(pickLocale(["zh_HK"]), "zh-TW");
  assert.equal(pickLocale(["zh-Hans-CN"]), "zh-CN");
  assert.equal(pickLocale(["pt-PT"]), "pt-BR");
  assert.equal(pickLocale(["ja_JP"]), "ja");
  assert.equal(pickLocale(["xx", "de-AT"]), "de");
  assert.equal(pickLocale([]), "en");
  assert.equal(pickLocale(), "en");
  assert.ok(LOCALES.includes(pickLocale(["ko-KR"])));
});

test("translator falls back to English and fills variables", () => {
  const table = { en: { a: "Hi {name}", b: "B" }, ja: { a: "やあ {name}" } };
  assert.equal(translator(table, "ja")("a", { name: "X" }), "やあ X");
  assert.equal(translator(table, "ja")("b"), "B");
  assert.throws(() => translator(table, "ja")("c"), /Missing string: c/);
});

test("systemLocale is the first language of the user's list", () => {
  const app = fakeApp({ preferred: ["zh-TW", "en-US"], locale: "en-US" });
  assert.equal(systemLocale({ app, env: {} }), "zh-TW");
});

test("systemLocale falls back to Chromium's locale when the list is empty", () => {
  // Electron launched with --lang empties the preferred list.
  const app = fakeApp({ preferred: [], locale: "ja" });
  assert.equal(systemLocale({ app, env: {} }), "ja");
});

test("the language chosen in settings wins over the computer's, and the environment over both", () => {
  const app = fakeApp({ preferred: ["zh-TW"], locale: "zh-TW" });
  assert.equal(systemLocale({ app, env: {}, chosen: "de" }), "de");
  resetSystemLocale();
  assert.equal(
    systemLocale({ app, env: { BLINKLING_LOCALE: "ja" }, chosen: "de" }),
    "ja",
  );
  resetSystemLocale();
  // "system" and anything unknown leave the computer's language in charge.
  for (const chosen of ["system", "xx", undefined]) {
    resetSystemLocale();
    assert.equal(systemLocale({ app, env: {}, chosen }), "zh-TW");
  }
});

test("an explicit --lang wins over the user's list", () => {
  // On Linux the list still comes from the environment next to the switch.
  const app = fakeApp({
    preferred: ["en-US", "en"],
    locale: "ja",
    lang: "ja",
  });
  assert.equal(systemLocale({ app, env: {} }), "ja");
});

test("systemLocale skips languages Blinkling has no table for", () => {
  const app = fakeApp({ preferred: ["xx-YY", "fr-CA"], locale: "en-US" });
  assert.equal(systemLocale({ app, env: {} }), "fr");
});

test("systemLocale is English when nothing is known", () => {
  assert.equal(systemLocale({ app: fakeApp(), env: {} }), "en");
  assert.equal(systemLocale({ env: {} }), "en");
});

test("BLINKLING_LOCALE overrides the system", () => {
  const app = fakeApp({ preferred: ["de"] });
  assert.equal(
    systemLocale({ app, env: { BLINKLING_LOCALE: "zh_TW" } }),
    "zh-TW",
  );
  assert.equal(app.calls.preferred, 0, "the override never asks the system");
});

test("systemLocale resolves once and every caller gets the same answer", () => {
  const app = fakeApp({ preferred: ["ko-KR"] });
  assert.equal(systemLocale({ app, env: {} }), "ko");
  // A later caller with a different app or env still sees the one answer.
  assert.equal(
    systemLocale({
      app: fakeApp({ preferred: ["de"] }),
      env: { BLINKLING_LOCALE: "fr" },
    }),
    "ko",
  );
  assert.equal(app.calls.preferred, 1);
  resetSystemLocale();
  assert.equal(
    systemLocale({ app: fakeApp({ preferred: ["de"] }), env: {} }),
    "de",
  );
});

test("a document takes the locale main sent it", () => {
  const doc = fakeDocument({ languages: ["en-US"] });
  setDocumentLocale(doc, "zh-TW");
  assert.equal(documentLocale(doc), "zh-TW");
});

test("a document that was never told falls back to its own languages", () => {
  assert.equal(documentLocale(fakeDocument({ languages: ["ja-JP"] })), "ja");
  assert.equal(documentLocale(fakeDocument()), "en");
  assert.equal(documentLocale(null), "en");
});

test("setDocumentLocale ignores a locale it does not ship", () => {
  const doc = fakeDocument({ languages: ["de"] });
  setDocumentLocale(doc, undefined);
  assert.equal(documentLocale(doc), "de");
});

test("only shared/i18n.mjs asks the system for a language (N3.10)", () => {
  const desktop = fileURLToPath(new URL("..", import.meta.url));
  const skip = new Set(["node_modules", "vendor", "dist", "out", "e2e"]);
  const hits = [];
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      if (skip.has(name)) continue;
      const path = join(dir, name);
      if (statSync(path).isDirectory()) walk(path);
      else if (
        /\.(mjs|cjs|js|html)$/.test(name) &&
        !name.endsWith(".test.mjs")
      ) {
        const source = readFileSync(path, "utf8");
        if (
          /getPreferredSystemLanguages|\.getLocale\(|navigator\??\.language/.test(
            source,
          )
        )
          hits.push(relative(desktop, path).split(sep).join("/"));
      }
    }
  };
  walk(desktop);
  assert.deepEqual(hits, ["shared/i18n.mjs"]);
});

test("a language chosen later replaces the resolved one, and a setting given as a function is read on each use", async () => {
  const { changeSystemLocale, systemLocale, resetSystemLocale, live } =
    await import("./i18n.mjs");
  resetSystemLocale();
  assert.equal(systemLocale({ chosen: "fr", env: {} }), "fr");
  assert.equal(systemLocale({ chosen: "de", env: {} }), "fr", "cached");
  assert.equal(changeSystemLocale({ chosen: "de", env: {} }), "de");
  assert.equal(systemLocale({ env: {} }), "de");
  let now = "ja";
  const read = () => now;
  assert.equal(live(read), "ja");
  now = "ko";
  assert.equal(live(read), "ko");
  assert.equal(live("en"), "en");
  resetSystemLocale();
});
