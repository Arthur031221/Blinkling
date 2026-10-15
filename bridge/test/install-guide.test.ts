import { afterEach, describe, expect, it, vi } from "vitest";
import { JSDOM } from "jsdom";
import { readFile } from "node:fs/promises";
import {
  INSTALL_GUIDE_SCRIPT,
  installGuide,
} from "../src/extension-install.js";
import { installLocales } from "../src/install-locales.js";

const documents: JSDOM[] = [];
async function openGuide(connected = false, locale = "en", store = false) {
  const dom = new JSDOM(
    installGuide("/home/reader/Blinkling-extension", {
      chromeWebStoreUrl: store
        ? "https://chromewebstore.google.com/detail/blinkling/id"
        : "",
      edgeAddonsUrl: "",
    }),
    {
      url: `http://127.0.0.1:4312/install?locale=${locale}#code=0123456789ABCDEF`,
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
        ? { connected, active: connected }
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
  const message = (type: string, event: Record<string, unknown> = {}) =>
    window.dispatchEvent(
      new window.MessageEvent("message", {
        origin: window.location.origin,
        source: window,
        data: { type },
        ...event,
      }),
    );
  const poll = async () => {
    const next = polls.shift();
    if (!next) throw new Error("No pending status poll");
    await next();
  };
  return { dom, window, document: window.document, fetch, post, message, poll };
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

describe("three step install guide", () => {
  it.each(Object.keys(installLocales))(
    "renders complete %s instructions and connection feedback",
    async (locale) => {
      const { document, message } = await openGuide(false, locale);
      const text = installLocales[locale as keyof typeof installLocales];
      expect(document.documentElement.lang).toBe(locale);
      expect(
        [...document.querySelectorAll("section h2 [data-i18n]")].map(
          (el) => el.textContent,
        ),
      ).toEqual([text.install, text.connect, text.open]);
      expect(document.querySelectorAll("section")).toHaveLength(3);
      expect(document.querySelector(".blink")?.getAttribute("alt")).toBe(
        "Blink",
      );
      expect(document.querySelector("#connection")?.textContent).toBe(
        text.waiting,
      );
      message("blinkling:paired");
      expect(document.querySelector("#connection")?.textContent).toBe(
        text.completed,
      );
      expect(Object.keys(text).sort()).toEqual(
        Object.keys(installLocales.en).sort(),
      );
      expect(Object.values(text).every((value) => value.trim())).toBe(true);
      expect(document.body.textContent).not.toMatch(
        /0123456789ABCDEF|4312|\bcode\b|practice|exercise|eight/i,
      );
    },
  );

  it("authenticates when the extension becomes ready, then opens only on the third step", async () => {
    const { document, message, post } = await openGuide();
    const open = document.querySelector<HTMLButtonElement>("#wake")!;
    expect(open.disabled).toBe(true);
    message("blinkling:extension-ready", {
      origin: "https://untrusted.example",
    });
    message("blinkling:extension-ready", { source: null });
    expect(post).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: "blinkling:pair" }),
      expect.anything(),
    );
    message("blinkling:extension-ready");
    message("blinkling:extension-ready");
    expect(
      post.mock.calls.filter(([value]) => value.type === "blinkling:pair"),
    ).toHaveLength(1);
    expect(post).toHaveBeenCalledWith(
      {
        type: "blinkling:pair",
        port: 4312,
        code: "0123456789ABCDEF",
        locale: "en",
      },
      "http://127.0.0.1:4312",
    );
    expect(open.disabled).toBe(true);
    message("blinkling:paired", { source: null });
    expect(open.disabled).toBe(true);
    message("blinkling:paired");
    expect(open.disabled).toBe(false);
    open.click();
    expect(post).toHaveBeenLastCalledWith(
      { type: "blinkling:wake", locale: "en" },
      "http://127.0.0.1:4312",
    );
  });

  it("retries a failed handshake without exposing a capability", async () => {
    const { document, message, post } = await openGuide();
    message("blinkling:extension-ready");
    message("blinkling:connection-failed");
    expect(document.querySelector("#connection")?.textContent).toBe(
      installLocales.en.connectionFailed,
    );
    expect(document.querySelector<HTMLButtonElement>("#wake")?.disabled).toBe(
      true,
    );
    document.querySelector<HTMLButtonElement>("#reconnect")!.click();
    expect(
      post.mock.calls.filter(([value]) => value.type === "blinkling:pair"),
    ).toHaveLength(2);
  });

  it("preserves connected status when changing language", async () => {
    const { document } = await openGuide(true);
    const language = document.querySelector<HTMLSelectElement>("#language")!;
    language.value = "zh-TW";
    language.dispatchEvent(new document.defaultView!.Event("change"));
    expect(document.querySelector("#connection")?.textContent).toBe(
      "已連到你的 Claude Code",
    );
    expect(document.querySelector<HTMLButtonElement>("#wake")?.disabled).toBe(
      false,
    );
  });

  it.each(Object.keys(installLocales))(
    "keeps completed %s setup truthful when the setup link expires",
    async (locale) => {
      const { document, fetch, poll, post } = await openGuide(true, locale);
      const text = installLocales[locale as keyof typeof installLocales];
      fetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: async () => ({}),
      });
      await poll();
      expect(document.querySelector("#connection")?.textContent).not.toBe(
        text.expired,
      );
      expect(document.querySelector("#connection")?.textContent).toBe(
        text.completed,
      );
      expect(
        document.querySelector("#connection")?.classList.contains("connected"),
      ).toBe(false);
      const open = document.querySelector<HTMLButtonElement>("#wake")!;
      expect(open.disabled).toBe(false);
      expect(
        document.querySelector<HTMLButtonElement>("#reconnect")?.hidden,
      ).toBe(true);
      open.click();
      expect(post).toHaveBeenLastCalledWith(
        { type: "blinkling:wake", locale },
        "http://127.0.0.1:4312",
      );
    },
  );

  it("expires an unpaired setup without enabling Wake Blink", async () => {
    const { document, fetch, poll } = await openGuide();
    fetch.mockResolvedValueOnce({
      ok: false,
      status: 401,
      json: async () => ({}),
    });
    await poll();
    expect(document.querySelector("#connection")?.textContent).toBe(
      installLocales.en.expired,
    );
    expect(document.querySelector<HTMLButtonElement>("#wake")?.disabled).toBe(
      true,
    );
  });

  it("distinguishes completed pairing from an active connection", async () => {
    const { document, fetch, poll } = await openGuide(true);
    fetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ connected: true, active: false }),
    });
    await poll();
    expect(document.querySelector("#connection")?.textContent).toBe(
      installLocales.en.completed,
    );
    expect(
      document.querySelector("#connection")?.classList.contains("connected"),
    ).toBe(false);
    fetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ connected: true, active: true }),
    });
    await poll();
    expect(document.querySelector("#connection")?.textContent).toBe(
      installLocales.en.connected,
    );
    expect(
      document.querySelector("#connection")?.classList.contains("connected"),
    ).toBe(true);
  });

  it.each(["http", "network", "unpaired"])(
    "does not claim a live connection after a %s poll failure and recovers",
    async (failure) => {
      const { document, fetch, poll } = await openGuide(failure !== "unpaired");
      if (failure === "network")
        fetch.mockRejectedValueOnce(new Error("Offline"));
      else
        fetch.mockResolvedValueOnce({
          ok: false,
          status: 503,
          json: async () => ({}),
        });
      await poll();
      expect(document.querySelector("#connection")?.textContent).toBe(
        installLocales.en.checkFailed,
      );
      expect(
        document.querySelector("#connection")?.classList.contains("connected"),
      ).toBe(false);
      expect(document.querySelector<HTMLButtonElement>("#wake")?.disabled).toBe(
        failure === "unpaired",
      );
      await poll();
      expect(document.querySelector("#connection")?.textContent).toBe(
        failure === "unpaired"
          ? installLocales.en.waiting
          : installLocales.en.connected,
      );
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
      installLocales.en.revealFailed,
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

  it("uses a configured store without adding steps or showing a source folder", async () => {
    const { document } = await openGuide(false, "en", true);
    expect(document.querySelector("#installation a")?.textContent).toBe(
      installLocales.en.store,
    );
    expect(document.querySelector("#manager")).toBeNull();
    expect(document.querySelectorAll("section")).toHaveLength(3);
  });
});
