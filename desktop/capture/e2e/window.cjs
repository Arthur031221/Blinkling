// A separate application window for window-pick tests. It runs in its own
// process, so the capture service lists it like any other app's window.
const { app, BrowserWindow } = require("electron");
const spec = JSON.parse(process.env.BLINKLING_TEST_WINDOW);
app.whenReady().then(async () => {
  const win = new BrowserWindow({
    x: spec.x,
    y: spec.y,
    width: spec.width,
    height: spec.height,
    title: spec.title,
    frame: false,
    resizable: false,
    backgroundColor: spec.color,
  });
  win.on("page-title-updated", (event) => event.preventDefault());
  await win.loadURL(
    "data:text/html," +
      encodeURIComponent(
        `<title>${spec.title}</title><body style="margin:0;background:${spec.color}">`,
      ),
  );
  win.setBounds(spec);
  process.stdout.write("ready\n");
});
