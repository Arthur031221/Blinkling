import { test, expect } from "@playwright/test";
import { launch } from "./support.mjs";

test("the real composer delivers PDF and UTF-8 files through the durable session", async () => {
  const app = await launch();
  try {
    const blink = await app.firstWindow();
    await expect(blink.getByRole("img", { name: "Blink" })).toBeVisible();
    // The card, where files are attached, opens when Blink is waiting on a
    // permission request.
    await blink.evaluate(() =>
      window.blinkling.shell({ type: "click", permission: true }),
    );
    let card;
    await expect
      .poll(() => {
        card = app
          .windows()
          .find((page) => page.url().includes("surface=card"));
        return !!card;
      })
      .toBe(true);
    await expect(card.getByRole("textbox", { name: "輸入問題" })).toBeVisible();
    await expect
      .poll(
        () => app.evaluate(() => globalThis.blinklingTest.session.status.state),
        { timeout: 20000 },
      )
      .toBe("connected");
    const pdf = Buffer.from("%PDF-1.7\nfixture");
    const text = "日本語 **notes**";
    const chooser = card.waitForEvent("filechooser");
    await card.getByRole("button", { name: "加入附件" }).click();
    await (
      await chooser
    ).setFiles([
      { name: "paper.pdf", mimeType: "application/pdf", buffer: pdf },
      {
        name: "notes.md",
        mimeType: "text/markdown",
        buffer: Buffer.from(text),
      },
      {
        name: "removed.txt",
        mimeType: "text/plain",
        buffer: Buffer.from("Do not send this."),
      },
    ]);
    await expect(card.locator(".gl-attachment-chip")).toHaveCount(3);
    await card.getByRole("button", { name: "移除 removed.txt" }).click();
    await expect(card.locator(".gl-attachment-chip")).toHaveCount(2);
    await card
      .getByRole("textbox", { name: "輸入問題" })
      .fill("Explain the files.");
    await card.getByRole("textbox", { name: "輸入問題" }).press("Enter");
    await expect(
      card.locator(".gl-chat-message.gl-assistant").last(),
    ).toContainText("OK.");
    await expect
      .poll(() => app.evaluate(() => !!globalThis.blinklingTest.session.active))
      .toBe(false);
    const messages = await app.evaluate(
      () => globalThis.blinklingTest.session.state.messages,
    );
    const user = messages.find((message) => message.role === "user");
    expect(user.content).toEqual([
      {
        type: "document",
        title: "paper.pdf",
        source: {
          type: "base64",
          media_type: "application/pdf",
          data: pdf.toString("base64"),
        },
      },
      {
        type: "document",
        title: "notes.md",
        source: { type: "text", media_type: "text/plain", data: text },
      },
      { type: "text", text: "Explain the files." },
    ]);
    const turns = await app.evaluate(
      () => globalThis.blinklingTest.session.state.turns,
    );
    expect(turns).toHaveLength(1);
    expect(turns[0].state).toBe("done");
    // What was sent reached Claude (the documents above); Blinkling keeps no
    // copy of it once the turn is done (PV-2).
    expect(turns[0].turn.attachments).toEqual([]);
    await expect(card.locator(".gl-attachment-chip")).toHaveCount(0);
  } finally {
    await app.close();
  }
});
