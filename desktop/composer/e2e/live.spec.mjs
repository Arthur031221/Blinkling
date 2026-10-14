import { test, expect, _electron as electron } from "@playwright/test";
import { fileURLToPath } from "node:url";
import { mkdir, writeFile } from "node:fs/promises";
import { png } from "./image.mjs";
const report =
  process.env.BLINKLING_REPORT_DIR ??
  fileURLToPath(
    new URL("../../../test-results/conversation-artifacts/", import.meta.url),
  );
test("real Claude Remote Control session: confirmed controls, image and UTF-8 file turns", async () => {
  await mkdir(report, { recursive: true });
  const env = {
    ...process.env,
    BLINKLING_LIVE: "1",
    BLINKLING_REMOTE: process.env.BLINKLING_REMOTE ?? "test",
  };
  delete env.CLAUDECODE;
  const app = await electron.launch({
    args: [
      fileURLToPath(new URL("./fixture.cjs", import.meta.url)),
      "--no-sandbox",
    ],
    env,
  });
  try {
    const card = await app.firstWindow();
    await expect
      .poll(() => app.evaluate(() => Boolean(globalThis.conversationTest)))
      .toBe(true);
    const model = card.getByRole("combobox", { name: "模型", exact: true });
    const effort = card.getByRole("combobox", { name: "思考程度" });
    await expect(model).toHaveValue(/haiku/);
    await expect(effort).toHaveValue("low");
    await model.selectOption("sonnet");
    await expect(model).toHaveValue(/sonnet/, { timeout: 15000 });
    await effort.selectOption("medium");
    await expect(effort).toHaveValue("medium", { timeout: 15000 });
    await model.selectOption("haiku");
    await expect(model).toHaveValue(/haiku/, { timeout: 15000 });
    await effort.selectOption("low");
    await expect(effort).toHaveValue("low", { timeout: 15000 });
    await app.evaluate(
      (_electron, data) =>
        globalThis.conversationTest.capture({
          id: "live-screen",
          name: "screen.png",
          mediaType: "image/png",
          data,
        }),
      png,
    );
    const input = card.getByRole("textbox", { name: "輸入問題" });
    await input.fill("Name image color. One word.");
    await input.press("Enter");
    await expect(card.locator(".gl-assistant")).toHaveCount(1, {
      timeout: 45000,
    });
    await expect(card.getByRole("button", { name: "停止回答" })).toBeHidden({
      timeout: 45000,
    });
    expect(await card.locator(".gl-assistant").first().innerText()).toMatch(
      /red/i,
    );
    await app.evaluate(() => globalThis.conversationTest.card());
    const chooser = card.waitForEvent("filechooser");
    await card.getByRole("button", { name: "加入附件" }).click();
    await (
      await chooser
    ).setFiles({
      name: "note.txt",
      mimeType: "text/plain",
      buffer: Buffer.from("Token: sparrow"),
    });
    await input.fill("Reply with file token. One word.");
    await input.press("Enter");
    await expect(card.locator(".gl-assistant")).toHaveCount(2, {
      timeout: 45000,
    });
    await expect(card.getByRole("button", { name: "停止回答" })).toBeHidden({
      timeout: 45000,
    });
    expect(await card.locator(".gl-assistant").last().innerText()).toMatch(
      /sparrow/i,
    );
    await expect(card.locator(".gl-user .gl-document")).toHaveText(
      "📎 note.txt",
    );
    const evidence = await app.evaluate(() => ({
      remoteUrl: globalThis.conversationTest.remoteUrl,
      applied: globalThis.conversationTest.selection(),
      turns: globalThis.conversationTest.turns.map((t) => ({
        id: t.id,
        text: t.text,
        contentTypes: t.content.map((c) => c.type),
      })),
      mouthMoved: globalThis.conversationTest.activities.some(
        (a) => a.speaking,
      ),
    }));
    if (env.BLINKLING_REMOTE !== "0")
      expect(evidence.remoteUrl).toMatch(/^https:\/\/claude\.ai\/code\//);
    expect(evidence.turns.map((t) => t.contentTypes)).toEqual([
      ["image"],
      ["document"],
    ]);
    expect(evidence.mouthMoved).toBe(true);
    evidence.answers = await card.locator(".gl-assistant").allInnerTexts();
    await writeFile(
      `${report}/live-session.json`,
      JSON.stringify(evidence, null, 2),
    );
    await card.screenshot({ path: `${report}/live-session.png` });
  } finally {
    await app.close();
  }
});
