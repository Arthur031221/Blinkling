import { test, expect } from "@playwright/test";
import {
  mkdtemp,
  mkdir,
  rm,
  writeFile,
  readdir,
  readFile,
  stat,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PNG } from "pngjs";
import {
  native,
  launch,
  desktopShot,
  moveOn,
} from "../../main/e2e/support.mjs";

/** A screenshot with a drawn marker, as the pointing engine would return it. */
const annotated = () => {
  const image = new PNG({ width: 160, height: 90 });
  image.data.fill(240);
  for (let y = 30; y < 60; y++)
    for (let x = 60; x < 100; x++)
      image.data.set([44, 126, 137, 255], (y * 160 + x) * 4);
  return PNG.sync.write(image).toString("base64");
};

const guide = () => ({
  title: "Set up the printer",
  explanation: "The printer settings page of the office router.",
  language: "zh-TW",
  steps: [
    { n: 1, title: "Open Devices", text: "Click **Devices** in the sidebar." },
    { n: 2, title: "Add printer", text: "Press Add, then pick the HP." },
  ],
  shots: [
    { data: annotated(), width: 160, height: 90, step: 1 },
    { data: annotated(), width: 160, height: 90, step: 2 },
  ],
});

/** Electron resolves Documents from HOME, so a temp HOME keeps the real one
 * untouched. */
async function withHome(run) {
  const home = await mkdtemp(join(tmpdir(), "blinkling-home-"));
  // Electron reads Documents from user-dirs.dirs and falls back to HOME itself
  // when the file or the folder is missing.
  await mkdir(join(home, "Documents"));
  await mkdir(join(home, ".config"));
  await writeFile(
    join(home, ".config", "user-dirs.dirs"),
    `XDG_DOCUMENTS_DIR="${join(home, "Documents")}"\n`,
  );
  const keep = { ...process.env };
  Object.assign(process.env, {
    HOME: home,
    XDG_CONFIG_HOME: join(home, ".config"),
    XDG_DATA_HOME: join(home, ".local/share"),
    XDG_CACHE_HOME: join(home, ".cache"),
  });
  try {
    return await run(home);
  } finally {
    for (const key of Object.keys(process.env)) delete process.env[key];
    Object.assign(process.env, keep);
    await rm(home, { recursive: true, force: true });
  }
}

const deck = async (app) => {
  for (const w of await app.windows())
    if (w.url().includes("surface=card")) return w;
  return null;
};

test("K4-1 the end of a guide offers one 儲存導覽 action in the card; clicking it writes Documents/Blinkling Guides and reveals the folder", async () => {
  await withHome(async (home) => {
    expect(process.env.BLINKLING_REMOTE).toBe("0");
    const c = await launch();
    const { app, page } = c;
    try {
      await app.evaluate(
        (_e, result) => globalThis.blinklingTest.guideOffer.offerSave(result),
        guide(),
      );
      await expect.poll(async () => !!(await deck(app))).toBe(true);
      const bubbles = await deck(app);
      const messages = bubbles.locator(".gl-chat-message");
      const button = bubbles.locator(".gl-action-chip");
      await expect(button).toHaveCount(1);
      await expect(messages).toHaveCount(1);
      await expect(button).toHaveText("儲存導覽");
      // Offering again (a second guide end) still leaves one bubble.
      await app.evaluate(
        (_e, result) => globalThis.blinklingTest.guideOffer.offerSave(result),
        guide(),
      );
      await expect(messages).toHaveCount(1);
      await expect(button).toHaveCount(1);
      await moveOn(page);
      await desktopShot(app, "guide-save-offer");
      expect(
        await readdir(join(home, "Documents")).catch(() => []),
        "nothing is written before the click",
      ).toEqual([]);

      // A real pointer click, through the bubble window's click-through shape.
      const box = await button.boundingBox();
      const origin = await app.evaluate(() => {
        const b = globalThis.blinklingTest.composer.getBounds();
        return { x: b.x, y: b.y };
      });
      const at = [
        origin.x + box.x + box.width / 2,
        origin.y + box.y + box.height / 2,
      ];
      native(...at);
      await page.waitForTimeout(500);
      native(...at, "click");

      const root = join(home, "Documents", "Blinkling Guides");
      await expect.poll(() => readdir(root).catch(() => [])).toHaveLength(1);
      const [folder] = await readdir(root);
      expect(folder).toMatch(
        /^\d{4}-\d{2}-\d{2} \d{2}\.\d{2} Set up the printer$/,
      );
      const files = (await readdir(join(root, folder))).sort();
      expect(files.filter((f) => f.endsWith(".png"))).toHaveLength(2);
      expect(files).toContain("guide.md");
      const markdown = await readFile(join(root, folder, "guide.md"), "utf8");
      expect(markdown).toContain("# Set up the printer");
      expect(markdown).toContain("Open Devices");
      for (const png of files.filter((f) => f.endsWith(".png"))) {
        expect(markdown).toContain(png);
        const bytes = await readFile(join(root, folder, png));
        expect(PNG.sync.read(bytes).width).toBe(160);
        expect((await stat(join(root, folder, png))).size).toBeGreaterThan(100);
      }
      await expect
        .poll(() => app.evaluate(() => globalThis.blinklingTest.revealedGuides))
        .toEqual([join(root, folder)]);

      // The bubble says so and is no longer a button: no replay, no list.
      await expect(messages).toHaveCount(1);
      await expect(messages).toContainText("導覽已儲存");
      await expect(bubbles.locator(".gl-action-chip")).toHaveCount(0);
      await page.waitForTimeout(600);
      await desktopShot(app, "guide-save-done");
    } finally {
      await c.close();
    }
  });
});
