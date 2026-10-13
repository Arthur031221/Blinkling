import { afterEach, describe, expect, it, vi } from "vitest";
import { JSDOM } from "jsdom";
import { readFile } from "node:fs/promises";
import {
  INSTALL_GUIDE_SCRIPT,
  installGuide,
} from "../src/extension-install.js";
import { welcomeLocales } from "../src/welcome-locales.js";

const documents: JSDOM[] = [];
async function openGuide(
  mode = "direct",
  connected = false,
  locale = "en",
  store = false,
) {
  const dom = new JSDOM(
    installGuide("/home/reader/Glimpselet-extension", {
      chromeWebStoreUrl: store
        ? "https://chromewebstore.google.com/detail/glimpselet/id"
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
    json: async () =>
      input.startsWith("/install/status") ? { connected, mode } : {},
  }));
  Object.assign(window, { fetch, setTimeout: () => 0 });
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
  return { dom, window, document: window.document, fetch, post, message };
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
      "claude plugin marketplace update glimpselet",
      "claude plugin update glimpselet@glimpselet",
      "/reload-plugins",
      "claude plugin list",
      "chrome://extensions",
      "~/Glimpselet-extension",
    ])
      expect(readme).toContain(command);
  });
});

describe("three step welcome", () => {
  it.each(Object.keys(welcomeLocales))(
    "renders complete %s instructions and connection feedback",
    async (locale) => {
      const { document, message } = await openGuide("direct", false, locale);
      const text = welcomeLocales[locale as keyof typeof welcomeLocales];
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
      expect(document.querySelector("#try-zero")?.textContent).toBe(text.try);
      expect(document.querySelector("#connection")?.textContent).toBe(
        text.waiting,
      );
      message("glimpselet:paired");
      expect(document.querySelector("#connection")?.textContent).toBe(
        text.connected,
      );
      expect(Object.keys(text).sort()).toEqual(
        Object.keys(welcomeLocales.en).sort(),
      );
      expect(Object.values(text).every((value) => value.trim())).toBe(true);
      expect(document.body.textContent).not.toMatch(
        /0123456789ABCDEF|4312|Pairing code|practice|exercise|eight/i,
      );
    },
  );

  it("authenticates when the extension becomes ready, then opens only on the third step", async () => {
    const { document, message, post } = await openGuide();
    const open = document.querySelector<HTMLButtonElement>("#open-bubble")!;
    expect(open.disabled).toBe(true);
    message("glimpselet:extension-ready", {
      origin: "https://untrusted.example",
    });
    message("glimpselet:extension-ready", { source: null });
    expect(post).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: "glimpselet:pair" }),
      expect.anything(),
    );
    message("glimpselet:extension-ready");
    message("glimpselet:extension-ready");
    expect(
      post.mock.calls.filter(([value]) => value.type === "glimpselet:pair"),
    ).toHaveLength(1);
    expect(post).toHaveBeenCalledWith(
      {
        type: "glimpselet:pair",
        port: 4312,
        code: "0123456789ABCDEF",
        locale: "en",
      },
      "http://127.0.0.1:4312",
    );
    expect(open.disabled).toBe(true);
    message("glimpselet:paired", { source: null });
    expect(open.disabled).toBe(true);
    message("glimpselet:paired");
    expect(open.disabled).toBe(false);
    open.click();
    expect(post).toHaveBeenLastCalledWith(
      { type: "glimpselet:open-bubble", locale: "en" },
      "http://127.0.0.1:4312",
    );
  });

  it("retries a failed handshake without exposing a capability", async () => {
    const { document, message, post } = await openGuide();
    message("glimpselet:extension-ready");
    message("glimpselet:connection-failed");
    expect(document.querySelector("#connection")?.textContent).toBe(
      welcomeLocales.en.expired,
    );
    expect(
      document.querySelector<HTMLButtonElement>("#open-bubble")?.disabled,
    ).toBe(true);
    document.querySelector<HTMLButtonElement>("#reconnect")!.click();
    expect(
      post.mock.calls.filter(([value]) => value.type === "glimpselet:pair"),
    ).toHaveLength(2);
  });

  it("preserves connected status when changing language", async () => {
    const { document } = await openGuide("direct", true);
    const language = document.querySelector<HTMLSelectElement>("#language")!;
    language.value = "zh-TW";
    language.dispatchEvent(new document.defaultView!.Event("change"));
    expect(document.querySelector("#connection")?.textContent).toBe(
      "已連到你的 Claude Code",
    );
    expect(
      document.querySelector<HTMLButtonElement>("#open-bubble")?.disabled,
    ).toBe(false);
  });

  it("reveals the stable folder with an authenticated POST and offers manual recovery", async () => {
    const { document, fetch } = await openGuide();
    expect(document.querySelector(".path")?.textContent).toBe(
      "/home/reader/Glimpselet-extension",
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

  it.each(["direct", "tunnel"])(
    "copies the browser manager address in %s mode and selects it if clipboard is denied",
    async (mode) => {
      const { document, window } = await openGuide(mode);
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
    },
  );

  it("uses Edge's manager when selected", async () => {
    vi.stubEnv("GLIMPSELET_BROWSER", "msedge");
    const { document } = await openGuide();
    expect(document.querySelector<HTMLInputElement>("#manager")?.value).toBe(
      "edge://extensions",
    );
  });

  it("starts a trial in the chosen language and keeps failures retryable", async () => {
    const { document, fetch } = await openGuide("direct", false, "ja");
    const button = document.querySelector<HTMLButtonElement>("#try-zero")!;
    button.click();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(fetch).toHaveBeenCalledWith(
      "/install/try?code=0123456789ABCDEF&locale=ja",
      { method: "POST" },
    );
    expect(document.querySelector("#try-note")?.textContent).toBe(
      welcomeLocales.ja.tried,
    );
    fetch.mockRejectedValueOnce(new Error("No browser"));
    button.click();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(document.querySelector("#try-note")?.textContent).toBe(
      welcomeLocales.ja.tryFailed,
    );
    expect(button.disabled).toBe(false);
  });

  it("shows a download for remote installs, hides the server path and disables a remote trial", async () => {
    const { document } = await openGuide("tunnel");
    expect(document.querySelector<HTMLElement>("#install-local")?.hidden).toBe(
      true,
    );
    expect(document.querySelector<HTMLElement>("#install-remote")?.hidden).toBe(
      false,
    );
    expect(document.querySelector("#download")?.getAttribute("href")).toBe(
      "/install/extension.zip?code=0123456789ABCDEF",
    );
    expect(
      document.querySelector<HTMLButtonElement>("#try-zero")?.disabled,
    ).toBe(true);
    expect(document.querySelector("#tunnel-command")).toBeNull();
  });

  it("uses a configured store without adding steps or showing a source folder", async () => {
    const { document } = await openGuide("direct", false, "en", true);
    expect(document.querySelector("#installation a")?.textContent).toBe(
      welcomeLocales.en.store,
    );
    expect(document.querySelector("#manager")).toBeNull();
    expect(document.querySelectorAll("section")).toHaveLength(3);
  });
});
