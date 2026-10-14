// Test entry point. The product entry point never imports this module.
if (process.env.GLIMPSELET_E2E !== "1") throw new Error("Test harness only");
process.env.GLIMPSELET_TEST_SESSION = "manual";
(async () => {
  await import("../../main/shell.mjs");
  const { BrowserWindow } = require("electron");
  const { readFile } = await import("node:fs/promises");
  const { DesktopSessionBridge, OwnedSession } = await import("../index.mjs");
  const { transcriptPath } = await import("../storage.mjs");
  const { redPng } = await import("./image.mjs");
  globalThis.startSessionTest = async ({ dir, fixture, nodeExecutable }) => {
    const bridge = new DesktopSessionBridge({
      userDataDir: dir,
      cwd: dir,
      executable: nodeExecutable,
      transportFactory: () =>
        new OwnedSession({ executableArgs: [fixture], remote: "on" }),
      readTranscript: async (cwd, id) => {
        try {
          return (
            await readFile(
              transcriptPath(cwd, id, cwd + "/.test-claude"),
              "utf8",
            )
          )
            .split("\n")
            .filter(Boolean)
            .map((line) => JSON.parse(line));
        } catch (error) {
          if (error.code === "ENOENT") return [];
          throw error;
        }
      },
      retry: { minMs: 10, maxMs: 30 },
    });
    globalThis.sessionUnderTest = bridge;
    bridge.subscribe((event) =>
      globalThis.glimpseletTest.blink.webContents.send(
        "glimpselet:event",
        event,
      ),
    );
    const background = new BrowserWindow({
      x: 0,
      y: 0,
      width: 1000,
      height: 600,
      frame: false,
      backgroundColor: "#204080",
      show: false,
    });
    await background.loadURL(
      "data:text/html," +
        encodeURIComponent('<body style="margin:0;background:#204080"></body>'),
    );
    background.show();
    await bridge.connect();
    await bridge.send({
      id: "11111111-1111-4111-8111-111111111111",
      text: "Hi",
      source: "composer",
      attachments: [
        {
          id: "image",
          name: "red.png",
          mediaType: "image/png",
          data: redPng,
        },
      ],
    });
  };
})();
