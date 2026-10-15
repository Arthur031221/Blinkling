// Regenerates white-pages.json and the PNGs next to it:
//   xvfb-run -a npx electron --no-sandbox desktop/autowatch/fixtures/record.cjs
// Each page is rendered at 1280x720 and reduced to the 32x18 BGRA sample the
// auto-explain watcher fingerprints, using the same nativeImage resize.
const { app, BrowserWindow } = require("electron");
const fs = require("node:fs");
const path = require("node:path");
const out = __dirname;
const base = "font:16px/1.5 sans-serif;color:#222;background:#fff;margin:0";
const page = (body) => `<!doctype html><body style="${base}">${body}</body>`;
const lines = (n, w = 70) =>
  Array.from(
    { length: n },
    (_, i) =>
      `<p style="margin:0 0 10px;width:${w - ((i * 7) % 15)}%">${"Lorem ipsum dolor sit amet consectetur ".repeat(3)}</p>`,
  ).join("");
const pages = {
  // An article: header bar, headline, body text, small figure.
  article: page(
    `<div style="padding:14px 40px;border-bottom:1px solid #ddd"><b>Daily Notes</b> &nbsp; Home &nbsp; Archive &nbsp; About</div>
     <div style="padding:30px 40px;width:760px"><h1 style="margin:0 0 16px;font-size:34px">How tide pools stay alive</h1>${lines(11)}</div>
     <div style="position:absolute;right:50px;top:120px;width:260px;height:170px;background:#eee"></div>`,
  ),
  // A shop listing: search field, product rows, blue button.
  listing: page(
    `<div style="padding:18px 40px"><input style="width:520px;height:34px;border:1px solid #999" value="walking shoes"><button style="margin-left:12px;height:36px;background:#1a73e8;color:#fff;border:0;padding:0 20px">Search</button></div>
     ${Array.from({ length: 6 }, (_, i) => `<div style="margin:0 40px;padding:14px 0;border-top:1px solid #ddd;height:62px"><b>Trail runner ${i + 1}</b><br>$${60 + i * 7}.00 &middot; free delivery</div>`).join("")}`,
  ),
  // Documentation: light sidebar, headline, code block.
  docs: page(
    `<div style="position:absolute;left:0;top:0;bottom:0;width:240px;background:#f6f8fa;padding:20px;box-sizing:border-box">Getting started<br>Install<br>Usage<br>API<br>FAQ</div>
     <div style="margin-left:280px;padding:30px 40px 0 0"><h1 style="margin:0 0 14px;font-size:30px">Install</h1>${lines(3, 80)}<pre style="background:#f3f3f3;padding:14px;margin:14px 0">npm install blinkling\nnpm run start</pre>${lines(4, 80)}</div>`,
  ),
};
const searchBox = (caretX, caret = true, clock = "12:00:01") =>
  page(
    `<div style="padding:30px 40px"><div style="position:relative;width:640px;height:40px;border:1px solid #aaa;padding:6px 10px;box-sizing:border-box">hello world
       ${caret ? `<span style="position:absolute;left:${caretX}px;top:8px;width:2px;height:22px;background:#000"></span>` : ""}</div>
     ${lines(8)}</div>
     <div style="position:absolute;right:14px;bottom:10px;font:18px monospace">${clock}</div>`,
  );
const variants = {
  textPage: searchBox(120),
  caretMoved: searchBox(240),
  caretOff: searchBox(120, false),
  clockTick: searchBox(120, true, "12:00:02"),
  scrolled: page(
    `<div style="padding:30px 40px;position:relative;top:-130px">${lines(24)}</div>`,
  ),
  scrolledBefore: page(`<div style="padding:30px 40px">${lines(24)}</div>`),
};
// One long document read in a 1280x720 window. Each section has its own
// shape (heading size, paragraph widths, a figure, a table, a code block), the
// way a real manual or paper does. A viewport is the document shifted up.
const paragraph = (words, width) =>
  `<p style="margin:0 0 14px;width:${width}%">${"Tides rise and fall with the pull of the moon and the sun ".repeat(words)}</p>`;
const section = (title, body) =>
  `<section style="height:720px;overflow:hidden"><h2 style="margin:0 0 18px;font-size:30px">${title}</h2>${body}</section>`;
const longDocument = [
  section(
    "1. Background",
    paragraph(6, 78) +
      paragraph(4, 62) +
      paragraph(7, 80) +
      paragraph(5, 70) +
      paragraph(6, 76) +
      paragraph(3, 55) +
      paragraph(7, 79) +
      paragraph(5, 66),
  ),
  section(
    "2. Method",
    paragraph(3, 70) +
      `<div style="width:520px;height:230px;background:#dfe6ee;margin:10px 0 18px"></div>` +
      paragraph(5, 74) +
      paragraph(2, 40),
  ),
  section(
    "3. Results",
    `<table style="border-collapse:collapse;width:80%;margin-bottom:18px">${Array.from(
      { length: 7 },
      (_, i) =>
        `<tr style="background:${i % 2 ? "#f4f4f4" : "#fff"}"><td style="border:1px solid #bbb;padding:10px">Site ${i + 1}</td><td style="border:1px solid #bbb;padding:10px">${12 + i * 3} species</td><td style="border:1px solid #bbb;padding:10px">${(i * 7.3 + 2).toFixed(1)}%</td></tr>`,
    ).join("")}</table>` + paragraph(5, 72),
  ),
  section(
    "4. Code",
    `<pre style="background:#272822;color:#f8f8f2;padding:16px;margin:0 0 18px;width:80%;height:300px">const pool = await survey("rocky-shore");\nfor (const site of pool.sites) {\n  report(site.species);\n}</pre>` +
      paragraph(4, 70),
  ),
].join("");
const reading = (offset) =>
  page(
    `<div style="padding:30px 40px;width:900px;position:relative;top:${-offset}px"><h1 style="margin:0 0 20px;font-size:38px">A field guide to tide pools</h1>${longDocument}</div>`,
  );
variants.docSection1 = reading(0);
variants.docNudge = reading(70);
variants.docSection2 = reading(760);
variants.docSection3 = reading(1520);
variants.docSection4 = reading(2280);
// Plain prose, no figures: lines of seeded random width, headings every screen.
// The hardest case for a thumbnail comparison, because every screen looks alike.
const prose = (() => {
  let seed = 7;
  const next = () =>
    (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
  return Array.from(
    { length: 4 },
    (_, s) =>
      `<h2 style="margin:0 0 16px;font-size:26px">Chapter ${s + 1}</h2>` +
      Array.from(
        { length: 11 },
        () =>
          `<p style="margin:0 0 12px;width:${40 + Math.round(next() * 45)}%">${"The harbour lights came on one by one and nobody spoke ".repeat(2 + Math.round(next() * 5))}</p>`,
      ).join(""),
  ).join("");
})();
const proseAt = (offset) =>
  page(
    `<div style="padding:30px 40px;width:900px;position:relative;top:${-offset}px">${prose}</div>`,
  );
variants.proseTop = proseAt(0);
variants.proseNudge = proseAt(70);
variants.proseNext = proseAt(700);
// A sparse reader view (a PDF page or a blog): grey 14px text in a narrow
// column. Screens differ little in brightness, the case a plain mean misses.
const sparse = Array.from({ length: 60 }, (_, i) => {
  const heading = i % 15 === 0;
  return heading
    ? `<h3 style="margin:34px 0 14px;font-size:20px;color:#333">Part ${i / 15 + 1}</h3>`
    : `<p style="margin:0 0 6px;color:#666;font-size:14px;line-height:1.7;width:${58 + ((i * 13) % 37)}%">${"A quiet afternoon on the river and the boats drifted past ".repeat(1 + (i % 3))}</p>`;
}).join("");
const sparseAt = (offset) =>
  page(
    `<div style="padding:30px 0 0 260px;width:560px;position:relative;top:${-offset}px">${sparse}</div>`,
  );
variants.sparseTop = sparseAt(0);
variants.sparseNudge = sparseAt(60);
variants.sparseNext = sparseAt(640);
let rendered = 0,
  win;
async function render(html) {
  win ??= new BrowserWindow({
    show: false,
    width: 1280,
    height: 720,
    useContentSize: true,
    webPreferences: { offscreen: false },
  });
  const file = path.join(
    require("node:os").tmpdir(),
    `blinkling-fixture-${process.pid}-${++rendered}.html`,
  );
  fs.writeFileSync(file, html);
  await win.loadFile(file);
  await new Promise((r) => setTimeout(r, 300));
  const image = await win.webContents.capturePage();
  return image;
}
app.whenReady().then(async () => {
  process.on("unhandledRejection", (e) => {
    console.error(e);
    app.exit(1);
  });
  const samples = {};
  for (const [name, html] of Object.entries({ ...pages, ...variants })) {
    const image = await render(html);
    if (name in pages)
      fs.writeFileSync(
        path.join(out, `${name}.png`),
        image.resize({ width: 640, height: 360 }).toPNG(),
      );
    samples[name] = image
      .resize({ width: 32, height: 18 })
      .toBitmap()
      .toString("base64");
  }
  fs.writeFileSync(path.join(out, "white-pages.json"), JSON.stringify(samples));
  win.destroy();
  app.quit();
});
