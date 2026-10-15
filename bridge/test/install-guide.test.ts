import { afterEach, describe, expect, it, vi } from "vitest";
import { JSDOM } from "jsdom";
import { readFile } from "node:fs/promises";
import {
  INSTALL_GUIDE_SCRIPT,
  installGuide,
} from "../src/extension-install.js";
import { welcomeLocales } from "../src/welcome-locales.js";

const documents: JSDOM[] = [];
const secret = "9".repeat(64);
async function openGuide(connected = false, locale = "en", store = false) {
  const dom = new JSDOM(
    installGuide("/home/reader/Blinkling-extension", {
      chromeWebStoreUrl: store
        ? "https://chromewebstore.google.com/detail/blinkling/id"
        : "",
      edgeAddonsUrl: "",
    }),
    {
      url: `http://127.0.0.1:43827/install?locale=${locale}#code=0123456789ABCDEF`,
      runScripts: "outside-only",
    },
  );
  documents.push(dom);
  const { window } = dom;
  const fetch = vi.fn(async (input: string) => ({
    ok: true,
    status: 200,
    json: async () =>
      input.startsWith("/install/status")
        ? { connected }
        : input === "/install/trust"
          ? { secret, port: 43827 }
          : {},
  }));
  const polls: Array<() => Promise<void>> = [];
  Object.assign(window, {
    fetch,
    setTimeout: (callback: () => Promise<void>) => polls.push(callback),
  });
  const post = vi.spyOn(window, "postMessage").mockImplementation(() => {});
  window.eval(INSTALL_GUIDE_SCRIPT);
  await new Promise((resolve) => setTimeout(resolve, 0));
  const message = (type: string) =>
    window.dispatchEvent(
      new window.MessageEvent("message", {
        origin: window.location.origin,
        source: window,
        data: { type },
      }),
    );
  const poll = async () => {
    const next = polls.shift();
    if (!next) throw new Error("No pending status poll");
    await next();
  };
  const settle = () => new Promise((resolve) => setTimeout(resolve, 0));
  return {
    dom,
    window,
    document: window.document,
    fetch,
    post,
    message,
    poll,
    settle,
  };
}
afterEach(() => {
  for (const dom of documents.splice(0)) dom.window.close();
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe("documented plugin upgrades", () => {
  it.each([
    "README.md",
    "README.zh-TW.md",
    "README.zh-CN.md",
    "README.ja.md",
    "README.ko.md",
    "README.es.md",
    "README.fr.md",
    "README.de.md",
    "README.pt-BR.md",
  ])("%s keeps installation and upgrades current", async (file) => {
    const readme = await readFile(file, "utf8");
    for (const command of [
      "claude plugin marketplace update blinkling",
      "claude plugin update blinkling@blinkling",
      "/reload-plugins",
      "claude plugin list",
      "chrome://extensions",
      "~/Blinkling-extension",
    ])
      expect(readme).toContain(command);
  });
});

describe("two step companion setup", () => {
  it.each(Object.keys(welcomeLocales))(
    "renders complete %s instructions and connection feedback",
    async (locale) => {
      const { document, message } = await openGuide(false, locale);
      const text = welcomeLocales[locale as keyof typeof welcomeLocales];
      expect(document.documentElement.lang).toBe(locale);
      expect(
        [...document.querySelectorAll("section h2 [data-i18n]")].map(
          (el) => el.textContent,
        ),
      ).toEqual([text.install, text.connect]);
      expect(document.querySelectorAll("section")).toHaveLength(2);
      expect(document.querySelector(".blink")?.getAttribute("alt")).toBe(
        "Blink",
      );
      expect(document.querySelector("#connection")?.textContent).toBe(
        text.waiting,
      );
      message("blinkling:trusted");
      expect(document.querySelector("#connection")?.textContent).toBe(
        text.completed,
      );
      expect(Object.keys(text).sort()).toEqual(
        Object.keys(welcomeLocales.en).sort(),
      );
      expect(Object.values(text).every((value) => value.trim())).toBe(true);
      expect(document.body.textContent).not.toMatch(
        /0123456789ABCDEF|43827|Pairing code|code/i,
      );
    },
  );

  it("redeems the link code from the URL fragment once the extension answers, and hands the secret only to the page's own origin", async () => {
    const { fetch, message, post, settle } = await openGuide();
    expect(fetch).not.toHaveBeenCalledWith("/install/trust", expect.anything());
    message("blinkling:extension-ready");
    await settle();
    expect(fetch).toHaveBeenCalledWith("/install/trust", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: "0123456789ABCDEF" }),
    });
    expect(post).toHaveBeenCalledWith(
      { type: "blinkling:trust", secret, port: 43827 },
      "http://127.0.0.1:43827",
    );
    message("blinkling:extension-ready");
    await settle();
    expect(
      fetch.mock.calls.filter(([url]) => url === "/install/trust"),
    ).toHaveLength(1);
  });

  it("never asks for or shows a code", async () => {
    const { document } = await openGuide();
    expect(document.querySelector("input[type=text]:not(#manager)")).toBeNull();
    expect(document.body.textContent).not.toMatch(/pair|paste.*code/i);
  });

  it("shows a retry when the handshake fails and tries again", async () => {
    const { document, message, post, settle } = await openGuide();
    message("blinkling:extension-ready");
    await settle();
    message("blinkling:trust-failed");
    expect(document.querySelector("#connection")?.textContent).toBe(
      welcomeLocales.en.connectionFailed,
    );
    expect(
      document.querySelector<HTMLButtonElement>("#reconnect")?.hidden,
    ).toBe(false);
    document.querySelector<HTMLButtonElement>("#reconnect")!.click();
    expect(
      post.mock.calls.filter(([value]) => value.type === "blinkling:hello"),
    ).toHaveLength(2);
  });

  it("says the link expired when the bridge refuses the code", async () => {
    const { document, fetch, message, settle } = await openGuide();
    fetch.mockResolvedValueOnce({
      ok: false,
      status: 401,
      json: async () => ({}),
    });
    message("blinkling:extension-ready");
    await settle();
    expect(document.querySelector("#connection")?.textContent).toBe(
      welcomeLocales.en.expired,
    );
    expect(
      document.querySelector<HTMLButtonElement>("#reconnect")?.hidden,
    ).toBe(true);
  });

  it("preserves connected status when changing language", async () => {
    const { document, poll } = await openGuide(true);
    await poll();
    const language = document.querySelector<HTMLSelectElement>("#language")!;
    language.value = "zh-TW";
    language.dispatchEvent(new document.defaultView!.Event("change"));
    expect(document.querySelector("#connection")?.textContent).toBe(
      welcomeLocales["zh-TW"].connected,
    );
  });

  it.each(Object.keys(welcomeLocales))(
    "keeps completed %s setup truthful when the setup link expires",
    async (locale) => {
      const { document, fetch, message, poll, settle } = await openGuide(
        false,
        locale,
      );
      const text = welcomeLocales[locale as keyof typeof welcomeLocales];
      message("blinkling:extension-ready");
      await settle();
      message("blinkling:trusted");
      fetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: async () => ({}),
      });
      await poll();
      expect(document.querySelector("#connection")?.textContent).toBe(
        text.completed,
      );
      expect(
        document.querySelector("#connection")?.classList.contains("connected"),
      ).toBe(false);
    },
  );

  it("reveals the stable folder with an authenticated POST and offers manual recovery", async () => {
    const { document, fetch } = await openGuide();
    expect(document.querySelector(".path")?.textContent).toBe(
      "/home/reader/Blinkling-extension",
    );
    fetch.mockRejectedValueOnce(new Error("No desktop"));
    document.querySelector<HTMLButtonElement>("#reveal")!.click();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(fetch).toHaveBeenCalledWith(
      "/install/reveal?code=0123456789ABCDEF",
      { method: "POST" },
    );
    expect(document.querySelector("#folder-note")?.textContent).toBe(
      welcomeLocales.en.revealFailed,
    );
  });

  it("copies the browser manager address and selects it if clipboard is denied", async () => {
    const { document, window } = await openGuide();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(window.navigator, "clipboard", {
      value: { writeText },
    });
    document.querySelector<HTMLButtonElement>("#copy-manager")!.click();
    await Promise.resolve();
    expect(writeText).toHaveBeenCalledWith("chrome://extensions");
    writeText.mockRejectedValueOnce(new Error("Denied"));
    document.querySelector<HTMLButtonElement>("#copy-manager")!.click();
    await new Promise((resolve) => setTimeout(resolve, 0));
    const input = document.querySelector<HTMLInputElement>("#manager")!;
    expect(document.activeElement).toBe(input);
    expect([input.selectionStart, input.selectionEnd]).toEqual([
      0,
      input.value.length,
    ]);
  });

  it("uses Edge's manager when selected", async () => {
    vi.stubEnv("BLINKLING_BROWSER", "msedge");
    const { document } = await openGuide();
    expect(document.querySelector<HTMLInputElement>("#manager")?.value).toBe(
      "edge://extensions",
    );
  });

  it("offers no trial, download or remote install", async () => {
    const { document } = await openGuide();
    expect(document.querySelector("#try-zero")).toBeNull();
    expect(document.querySelector("#download")).toBeNull();
    expect(document.querySelector("#open-bubble")).toBeNull();
  });

  it("uses a configured store without adding steps or showing a source folder", async () => {
    const { document } = await openGuide(false, "en", true);
    expect(document.querySelector("#installation a")?.textContent).toBe(
      welcomeLocales.en.store,
    );
    expect(document.querySelector("#manager")).toBeNull();
    expect(document.querySelectorAll("section")).toHaveLength(2);
  });
});
