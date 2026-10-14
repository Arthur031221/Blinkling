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
     <div style="margin-left:280px;padding:30px 40px 0 0"><h1 style="margin:0 0 14px;font-size:30px">Install</h1>${lines(3, 80)}<pre style="background:#f3f3f3;padding:14px;margin:14px 0">npm install glimpselet\nnpm run start</pre>${lines(4, 80)}</div>`,
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
    `glimpselet-fixture-${process.pid}-${++rendered}.html`,
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
