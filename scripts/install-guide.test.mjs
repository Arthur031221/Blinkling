import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { installCommand } from "./install-command.mjs";
import {
  OS_IDS,
  chooseOs,
  detectOs,
  groupOf,
  parseOsParam,
} from "../site/install/os.mjs";
import {
  LANGUAGE_NAMES,
  LOCALES,
  TEXT,
  chooseLocale,
  pickLocale,
  translator,
} from "../site/install/strings.mjs";

const UA = {
  mac: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15",
  windows:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
  linux:
    "Mozilla/5.0 (X11; Linux x86_64; rv:130.0) Gecko/20100101 Firefox/130.0",
  ubuntu:
    "Mozilla/5.0 (X11; Ubuntu; Linux x86_64) AppleWebKit/537.36 Chrome/130.0.0.0 Safari/537.36",
  android:
    "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/130.0.0.0 Mobile Safari/537.36",
  iphone:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1",
  chromeos:
    "Mozilla/5.0 (X11; CrOS x86_64 14541.0.0) AppleWebKit/537.36 Chrome/130.0.0.0 Safari/537.36",
};

describe("detecting the visitor's computer", () => {
  it("knows Windows, Linux and Ubuntu", () => {
    expect(detectOs({ userAgent: UA.windows })).toBe("windows");
    expect(detectOs({ userAgent: UA.linux })).toBe("linux");
    expect(detectOs({ userAgent: UA.ubuntu })).toBe("linux");
  });

  it("tells the two kinds of Mac apart when the browser reveals the chip", () => {
    expect(detectOs({ userAgent: UA.mac, architecture: "arm" })).toBe(
      "mac-arm64",
    );
    expect(detectOs({ userAgent: UA.mac, architecture: "x86" })).toBe(
      "mac-intel",
    );
  });

  it("assumes Apple Silicon when a Mac does not say", () => {
    expect(detectOs({ userAgent: UA.mac })).toBe("mac-arm64");
  });

  it("does not preselect anything on a phone, a tablet or a Chromebook", () => {
    for (const userAgent of [UA.android, UA.iphone, UA.chromeos])
      expect(detectOs({ userAgent })).toBeUndefined();
    expect(detectOs({ userAgent: UA.mac, maxTouchPoints: 5 })).toBeUndefined();
  });

  it("returns an id the page has steps for", () => {
    for (const userAgent of [UA.mac, UA.windows, UA.linux])
      expect(OS_IDS).toContain(detectOs({ userAgent }));
  });
});

describe("?os= overrides detection", () => {
  it("accepts every id", () => {
    for (const id of OS_IDS) expect(parseOsParam(`?os=${id}`)).toBe(id);
  });

  it("accepts plain mac and honors the chip hint", () => {
    expect(parseOsParam("?os=mac")).toBe("mac-arm64");
    expect(parseOsParam("?os=mac", "x86")).toBe("mac-intel");
  });

  it("ignores values it does not know", () => {
    expect(parseOsParam("?os=beos")).toBeUndefined();
    expect(parseOsParam("")).toBeUndefined();
  });

  it("wins over the user agent", () => {
    expect(chooseOs({ search: "?os=linux", userAgent: UA.windows })).toBe(
      "linux",
    );
    expect(chooseOs({ search: "?os=nope", userAgent: UA.windows })).toBe(
      "windows",
    );
  });
});

describe("which steps each system shows", () => {
  it("shares one set of steps between the two Macs", () => {
    expect(groupOf("mac-arm64")).toBe("mac");
    expect(groupOf("mac-intel")).toBe("mac");
    expect(groupOf("windows")).toBe("windows");
    expect(groupOf("linux")).toBe("linux");
    expect(groupOf(undefined)).toBeUndefined();
  });
});

describe("the commands on the page", () => {
  const config = JSON.parse(readFileSync("config/install.json", "utf8"));
  const html = readFileSync("site/install/index.html", "utf8");
  // Everything from one panel's opening tag to the next panel's.
  const panel = (name) => {
    const starts = [...html.matchAll(/data-panel="(\w+)"/g)];
    const at = starts.findIndex((match) => match[1] === name);
    return html.slice(starts[at].index, starts[at + 1]?.index);
  };
  const commands = (name) =>
    [
      ...panel(name).matchAll(/<code data-command\s*>([\s\S]*?)<\/code\s*>/g),
    ].map(([, text]) =>
      text.replace(/&amp;/g, "&").replace(/\s+/g, " ").trim(),
    );

  it("paste the line the READMEs and scripts use", () => {
    expect(commands("mac")[0]).toBe(installCommand(config));
    expect(commands("linux")[0]).toBe(installCommand(config));
  });

  it("paste the PowerShell form on Windows, where && is not a separator", () => {
    expect(commands("windows")[0]).toBe(
      installCommand(config, { powershell: true }),
    );
  });

  it("then run the plugin command once", () => {
    for (const name of ["mac", "windows", "linux"])
      expect(commands(name)[1]).toBe("/blinkling:blinkling");
  });

  it("have at most two copy buttons per computer", () => {
    for (const name of ["mac", "windows", "linux"])
      expect(commands(name).length).toBeLessThanOrEqual(2);
  });
});

describe("the page in nine languages", () => {
  const html = readFileSync("site/install/index.html", "utf8");
  const plain = (text) =>
    text
      .replace(/<[^>]+>/g, "")
      .replace(/&amp;/g, "&")
      .replace(/\s+/g, " ")
      .trim();
  const marked = [
    ...html.matchAll(/data-i18n="(\w+)"[^>]*>([\s\S]*?)<\/\w+\s*>/g),
  ].map(([, key, inner]) => [key, plain(inner)]);

  it("has a table for each locale with the same keys as English", () => {
    expect(Object.keys(TEXT)).toEqual([...LOCALES]);
    for (const locale of LOCALES)
      expect(Object.keys(TEXT[locale]).sort()).toEqual(
        Object.keys(TEXT.en).sort(),
      );
  });

  it("keeps English in the markup, word for word, so the page reads before the script runs", () => {
    expect(marked.length).toBeGreaterThan(30);
    for (const [key, text] of marked) expect(text, key).toBe(TEXT.en[key]);
  });

  it("uses only keys the table has, for text and labels", () => {
    const keys = [...html.matchAll(/data-i18n(?:-label)?="(\w+)"/g)].map(
      (match) => match[1],
    );
    for (const key of keys) expect(TEXT.en, key).toHaveProperty(key);
  });

  it("labels each animation in the page language too", () => {
    const labels = [
      ...html.matchAll(/data-i18n-label="(\w+)"\s+aria-label="([^"]*)"/g),
    ];
    expect(labels.length).toBeGreaterThanOrEqual(7);
    for (const [, key, text] of labels) expect(TEXT.en[key], key).toBe(text);
  });

  it("offers every locale in the picker, each in its own words", () => {
    const options = [...html.matchAll(/<option value="([^"]+)">([^<]+)</g)];
    expect(options.map((match) => match[1])).toEqual([...LOCALES]);
    for (const [, code, name] of options)
      expect(name).toBe(LANGUAGE_NAMES[code]);
  });

  it("leaves no translation empty or punctuated with a semicolon or dash", () => {
    for (const locale of LOCALES)
      for (const [key, text] of Object.entries(TEXT[locale])) {
        expect(text.trim(), `${locale} ${key}`).not.toBe("");
        expect(text, `${locale} ${key}`).not.toMatch(/[;—–]/);
      }
  });

  it("falls back to English for a missing locale and throws for an unknown key", () => {
    expect(translator("xx")("copy")).toBe("Copy");
    expect(translator("ja")("copy")).toBe("コピー");
    expect(() => translator("en")("nope")).toThrow();
  });

  it("picks the first language it speaks from the browser list", () => {
    expect(pickLocale(["fr-CA", "en"])).toBe("fr");
    expect(pickLocale(["zh-Hant-TW"])).toBe("zh-TW");
    expect(pickLocale(["zh-HK"])).toBe("zh-TW");
    expect(pickLocale(["zh-CN"])).toBe("zh-CN");
    expect(pickLocale(["pt-PT"])).toBe("pt-BR");
    expect(pickLocale(["xx", "ko-KR"])).toBe("ko");
    expect(pickLocale([])).toBe("en");
  });

  it("lets the link, then the saved choice, then the browser decide", () => {
    const languages = ["de-DE"];
    expect(chooseLocale({ languages })).toBe("de");
    expect(chooseLocale({ languages, saved: "ja" })).toBe("ja");
    expect(chooseLocale({ languages, saved: "ja", search: "?lang=es" })).toBe(
      "es",
    );
    expect(chooseLocale({ languages, search: "?lang=klingon" })).toBe("de");
    expect(chooseLocale({ languages, saved: "klingon" })).toBe("de");
  });
});
