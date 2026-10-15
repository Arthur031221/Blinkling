import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { bundles } from "./i18n";

const html = readFileSync("extension/popup.html", "utf8");
let messages: { type: string }[];
let replies: Record<string, unknown>;
let granted: boolean;
let request: ReturnType<typeof vi.fn>;

async function open(language = "en") {
  vi.resetModules();
  document.documentElement.innerHTML = html
    .replace(/<script[^>]*><\/script>/, "")
    .replace(/^[\s\S]*?<html[^>]*>/, "")
    .replace(/<\/html>\s*$/, "");
  Object.defineProperty(navigator, "languages", {
    value: [language],
    configurable: true,
  });
  await import("./popup");
  await vi.waitFor(() =>
    expect(document.querySelector("li[data-ok]")).not.toBeNull(),
  );
}
const line = (name: string) => row(name).lastElementChild!.textContent;
const row = (name: string) =>
  document.querySelector<HTMLElement>(`li[data-row="${name}"]`)!;

beforeEach(() => {
  messages = [];
  replies = {
    "blinkling:status": { link: true, blink: true },
    "blinkling:wake": { ok: true },
  };
  granted = true;
  request = vi.fn(async () => {
    granted = true;
    return true;
  });
  (globalThis as { chrome?: unknown }).chrome = {
    runtime: {
      sendMessage: vi.fn(async (message: { type: string }) => {
        messages.push(message);
        return replies[message.type];
      }),
    },
    permissions: {
      contains: vi.fn(async () => granted),
      request: (...a: unknown[]) => request(...a),
    },
  };
});

describe("status popup", () => {
  it("shows one line per fact and a Wake Blink button when everything is connected", async () => {
    await open();
    expect(row("link").dataset.ok).toBe("true");
    expect(line("link")).toBe(bundles.en.linkOn);
    expect(line("blink")).toBe(bundles.en.blinkOn);
    expect(line("sites")).toBe(bundles.en.sitesOn);
    expect(document.querySelector<HTMLButtonElement>("#sites")!.hidden).toBe(
      true,
    );
    const wake = document.querySelector<HTMLButtonElement>("#wake")!;
    expect(wake.textContent).toBe("Wake Blink");
    expect(wake.disabled).toBe(false);
  });

  it("says what is missing and offers the site permission when it is not granted", async () => {
    replies["blinkling:status"] = { link: false, blink: false };
    granted = false;
    await open();
    expect(row("link").dataset.ok).toBe("false");
    expect(line("link")).toContain("/blinkling:install");
    expect(line("blink")).toBe(bundles.en.blinkOff);
    expect(line("sites")).toBe(bundles.en.sitesOff);
    const sites = document.querySelector<HTMLButtonElement>("#sites")!;
    expect(sites.hidden).toBe(false);
    expect(document.querySelector<HTMLButtonElement>("#wake")!.disabled).toBe(
      true,
    );
    sites.click();
    expect(request).toHaveBeenCalledWith({ origins: ["<all_urls>"] });
    await vi.waitFor(() => expect(row("sites").dataset.ok).toBe("true"));
  });

  it("wakes Blink through the worker and reports the result", async () => {
    await open();
    document.querySelector<HTMLButtonElement>("#wake")!.click();
    expect(document.querySelector("#note")!.textContent).toBe(
      bundles.en.waking,
    );
    await vi.waitFor(() =>
      expect(document.querySelector("#note")!.textContent).toBe(
        bundles.en.awake,
      ),
    );
    expect(messages.map((m) => m.type)).toContain("blinkling:wake");
  });

  it("reports a failed wake", async () => {
    replies["blinkling:wake"] = { ok: false };
    await open();
    document.querySelector<HTMLButtonElement>("#wake")!.click();
    await vi.waitFor(() =>
      expect(document.querySelector("#note")!.textContent).toBe(
        bundles.en.wakeFailed,
      ),
    );
  });

  it.each(["zh-TW", "ja", "de"] as const)(
    "follows the browser language: %s",
    async (language) => {
      await open(language);
      expect(line("link")).toBe(bundles[language].linkOn);
      expect(document.querySelector("#wake")!.textContent).toBe(
        bundles[language].wake,
      );
      expect(document.documentElement.lang).toBe(language);
    },
  );
});
