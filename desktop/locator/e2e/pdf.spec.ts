import { test, expect } from "@playwright/test";
import { spawn, type ChildProcess } from "node:child_process";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { launch, shot, percentile, hoverRun, outline } from "./support.mjs";

type Rect = { x: number; y: number; width: number; height: number };
const report = join(process.cwd(), "..", "test-results", "locator");
const PAGE = `<!doctype html><meta charset="utf-8"><title>Quarterly</title>
<style>body{font:18px sans-serif;margin:24px}</style>
<h1>Quarterly figures</h1>
<p>Revenue grew in every region this quarter. The second sentence follows right here.</p>
<p>Costs stayed flat while the team shipped three releases and wrote the notes.</p>`;

test("hover locate over a real PDF viewer returns its text within 50 ms", async () => {
  const directory = await mkdtemp(join(tmpdir(), "blinkling-locator-pdf-"));
  let viewer: ChildProcess | undefined;
  let app: Awaited<ReturnType<typeof launch>> | undefined;
  try {
    await mkdir(report, { recursive: true });
    app = await launch();
    // The document is made by the app itself, so no fixture file is needed.
    const base64 = await app.evaluate(async ({ BrowserWindow }, html) => {
      const win = new BrowserWindow({ show: false });
      await win.loadURL(
        "data:text/html;charset=utf-8," + encodeURIComponent(html),
      );
      const buffer = await win.webContents.printToPDF({ pageSize: "A5" });
      win.destroy();
      return buffer.toString("base64");
    }, PAGE);
    const file = join(directory, "quarterly.pdf");
    await writeFile(file, Buffer.from(base64, "base64"));

    viewer = spawn("evince", [file], {
      env: { ...process.env, NO_AT_BRIDGE: "0", GTK_A11Y: "atspi" },
      stdio: "ignore",
    });
    const locate = (point: { x: number; y: number }) =>
      app!.evaluate(
        (_, p) => globalThis.blinklingTest.locator.locate(p),
        point,
      );
    // Wait for the viewer's window, then for its text to be published.
    const where = () =>
      app!.evaluate(async () => {
        const { locator } = globalThis.blinklingTest;
        for (let y = 60; y < 700; y += 80)
          for (let x = 60; x < 700; x += 80) {
            const w = await locator.windowAt({ x, y });
            if (w && /evince/i.test(w.app)) return w;
          }
        return null;
      });
    await expect.poll(where, { timeout: 30000 }).not.toBeNull();
    const win = (await where())!;
    const elements = () =>
      app!.evaluate(async (_, w) => {
        const list = await globalThis.blinklingTest.locator.elements(w);
        return list.map(
          (e: { kind: string; text?: string; bounds: Rect; id: string }) => ({
            kind: e.kind,
            text: e.text ?? "",
            bounds: e.bounds,
            id: e.id,
          }),
        );
      }, win);
    await expect
      .poll(
        async () => (await elements()).some((e) => /Quarterly/.test(e.text)),
        {
          timeout: 30000,
        },
      )
      .toBe(true);
    await new Promise((r) => setTimeout(r, 1500));

    const all = await elements();
    const text = all.filter((e) => e.text.trim() && e.kind !== "window");
    console.log(
      `pdf elements: ${all.length}, with text: ${text.length}`,
      JSON.stringify(
        text.slice(0, 6).map((e) => [e.kind, e.text.slice(0, 30)]),
      ),
    );
    const before = join(report, "pdf-page.png");
    await shot(app, before);

    // The viewer publishes a page at a time: hovering the page returns the
    // page, with its text and only the part of it that is on screen.
    const page = text.find((e) => /Quarterly figures/.test(e.text))!;
    expect(page).toBeTruthy();
    const mid = (r: Rect) => ({
      x: Math.round(r.x + r.width / 2),
      y: Math.round(r.y + r.height / 2),
    });
    const hit = await locate(mid(page.bounds));
    expect(hit).toMatchObject({ kind: "page", id: page.id });
    expect(hit.text).toContain("Quarterly figures");
    expect(hit.text).toContain("Revenue grew");
    const b = win.bounds;
    expect(hit.bounds.x + hit.bounds.width).toBeLessThanOrEqual(b.x + b.width);
    expect(hit.bounds.y + hit.bounds.height).toBeLessThanOrEqual(
      b.y + b.height,
    );
    // The toolbar and the sidebar are not the page.
    const toolbar = await locate({ x: b.x + 300, y: b.y + 20 });
    expect(toolbar?.kind).not.toBe("page");

    // Within the page, one sentence of it is found.
    const near = { x: hit.bounds.x + 60, y: hit.bounds.y + 160 };
    const sentence = await app.evaluate(
      (_, { element, point }) =>
        globalThis.blinklingTest.locator.sentenceAt(element, point),
      { element: hit, point: near },
    );
    expect(sentence?.text.length).toBeGreaterThan(5);
    expect(hit.text).toContain(sentence.text.trim());
    expect(sentence.bounds.height).toBeLessThan(hit.bounds.height / 2);

    // Hover across the document window.
    const points = [] as { x: number; y: number }[];
    for (let i = 0; i < 160; i++)
      points.push({
        x: b.x + 30 + ((i * 97) % (b.width - 60)),
        y: b.y + 60 + ((i * 53) % (b.height - 90)),
      });
    const run = await hoverRun(app, points, 40);
    const p50 = percentile(run.times, 0.5);
    const p95 = percentile(run.times, 0.95);
    const max = Math.max(...run.times);
    console.log(
      `pdf hover locate: n=${run.times.length} p50=${p50.toFixed(1)}ms p95=${p95.toFixed(1)}ms max=${max.toFixed(1)}ms`,
    );
    await writeFile(
      join(report, "pdf-timing.json"),
      JSON.stringify({ p50, p95, max, n: run.times.length }, null, 2),
    );
    expect(p95).toBeLessThanOrEqual(50);
    expect(run.results.filter(Boolean).length).toBeGreaterThan(
      points.length / 2,
    );

    const marked = outline(await shot(app, join(report, "pdf-after.png")), [
      hit.bounds,
      sentence.bounds,
    ]);
    await writeFile(join(report, "pdf-located.png"), marked);
  } finally {
    viewer?.kill();
    await app?.close().catch(() => {});
    await rm(directory, { recursive: true, force: true });
  }
});
