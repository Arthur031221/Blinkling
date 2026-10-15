import { describe, expect, it, vi, beforeEach } from "vitest";
import { mountPopup, statusLines } from "./popup";
import { popupText } from "./strings";
import { readFileSync } from "node:fs";

const text = popupText("en");

describe("popup status lines", () => {
  it("say what is connected and what is missing, one line each", () => {
    const all = statusLines(
      { trusted: true, connected: true, blink: true, pageReadable: true },
      text,
    );
    expect(all.map((l) => l.text)).toEqual([
      text.connected,
      text.blinkRunning,
      text.pageReadable,
    ]);
    const none = statusLines(
      { trusted: false, connected: false, pageReadable: false },
      text,
    );
    expect(none.map((l) => l.text)).toEqual([
      text.notSetUp,
      text.blinkUnknown,
      text.pageRestricted,
    ]);
    expect(
      statusLines(
        { trusted: true, connected: false, pageReadable: true },
        text,
      )[0]!.text,
    ).toBe(text.bridgeMissing);
    expect(
      statusLines(
        { trusted: true, connected: true, blink: false, pageReadable: true },
        text,
      )[1]!.text,
    ).toBe(text.blinkOff);
  });
});

describe("popup page", () => {
  let status: Record<string, unknown>;
  const sendMessage = vi.fn(async (message: { type: string }) =>
    message.type === "blinkling:wake" ? { ok: true } : status,
  );
  beforeEach(() => {
    status = {
      trusted: true,
      connected: true,
      blink: false,
      pageReadable: true,
    };
    sendMessage.mockClear();
    vi.stubGlobal("chrome", {
      i18n: { getUILanguage: () => "fr-FR" },
      runtime: { sendMessage },
    });
    document.body.innerHTML = readFileSync("extension/popup.html", "utf8")
      .match(/<body>([\s\S]*)<\/body>/)![1]!
      .replace(/<script.*<\/script>/, "");
  });

  it("draws the wordmark, lists the status in the browser language and wakes Blink", async () => {
    await mountPopup();
    expect(document.querySelectorAll("#title svg.bl-wordmark")).toHaveLength(1);
    expect(document.querySelector("#title svg title")!.textContent).toBe(
      "Blinkling",
    );
    const fr = popupText("fr");
    expect(
      [...document.querySelectorAll("#lines li")].map((li) => li.textContent),
    ).toEqual([fr.connected, fr.blinkOff, fr.pageReadable]);
    const wake = document.getElementById("wake") as HTMLButtonElement;
    expect(wake.textContent).toBe(fr.wake);
    expect(wake.disabled).toBe(false);
    wake.click();
    await vi.waitFor(() =>
      expect(sendMessage).toHaveBeenCalledWith({ type: "blinkling:wake" }),
    );
  });

  it("disables Wake Blink while the bridge is not connected", async () => {
    status = { trusted: true, connected: false, pageReadable: true };
    await mountPopup();
    expect(
      (document.getElementById("wake") as HTMLButtonElement).disabled,
    ).toBe(true);
  });

  it("says so when Blink does not wake", async () => {
    sendMessage
      .mockImplementationOnce(async () => status)
      .mockImplementationOnce(async () => ({ ok: false }));
    await mountPopup();
    (document.getElementById("wake") as HTMLButtonElement).click();
    await vi.waitFor(() =>
      expect(document.getElementById("note")!.textContent).toBe(
        popupText("fr").wakeFailed,
      ),
    );
  });
});
