import { launchExtensionContext } from "./browser";
import {
  chromium,
  expect,
  test,
  type Browser,
  type BrowserContext,
  type Page,
} from "@playwright/test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { once } from "node:events";
import {
  chmod,
  cp,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import en from "../extension/locales/en.json" with { type: "json" };

async function freePort() {
  const server = createServer();
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("No test port");
  await new Promise<void>((done) => server.close(() => done()));
  return address.port;
}

async function connectTrial(port: number) {
  await expect
    .poll(
      async () => {
        try {
          return (await fetch(`http://127.0.0.1:${port}/json/version`)).status;
        } catch {
          return 0;
        }
      },
      { timeout: 90_000 },
    )
    .toBe(200);
  return chromium.connectOverCDP(`http://127.0.0.1:${port}`);
}

async function pairFromWelcome(welcome: Page, context: BrowserContext) {
  const opened = context.waitForEvent("page");
  await welcome
    .getByRole("button", { name: "Pair extension", exact: true })
    .click();
  const owner = await opened;
  await expect(
    owner.getByRole("button", { name: en.consentAccept, exact: true }),
  ).toBeVisible();
  const pipOpened = context.waitForEvent("page");
  await owner
    .getByRole("button", { name: en.consentAccept, exact: true })
    .click();
  const panel = await pipOpened;
  await expect(panel.locator(".app.in-pip")).toBeVisible();
  await expect(panel.locator(".connection")).toHaveClass(/online/);
  await expect(welcome.locator("#pair-controls")).toBeHidden();
  return { owner, panel };
}

async function askQuestion(panel: Page, question: string) {
  const answers = panel.locator(".message .answer");
  const previousAnswers = await answers.count();
  const withoutPage = panel.getByRole("button", {
    name: en.askWithoutPage,
    exact: true,
  });
  await panel
    .getByRole("textbox", { name: en.question, exact: true })
    .fill(question);
  await panel.locator(".composer .send").click();
  // A returning browser can now have the welcome page selected as its source.
  // Handle its real page-context result instead of assuming every ask is blank.
  await expect
    .poll(
      async () =>
        (await withoutPage.isVisible()) ||
        (await answers.count()) > previousAnswers,
    )
    .toBe(true);
  if (await withoutPage.isVisible()) await withoutPage.click();
  await expect(answers).toHaveCount(previousAnswers + 1);
  await expect(answers.last()).toContainText("Your notebook can be exported");
}

for (const ordinaryPaired of [true, false]) {
  test(`${ordinaryPaired ? "ordinary pairing then trial" : "fresh trial only"} authenticates an independent actual browser profile`, async ({
    browserName,
  }, info) => {
    test.setTimeout(180_000);
    expect(browserName).toBe("chromium");
    const directory = await mkdtemp(
      join(tmpdir(), "glimpselet-trial-pairing-e2e-"),
    );
    const client = new Client({ name: "trial-pairing-test", version: "1.0.0" });
    let ordinary: BrowserContext | undefined;
    let trial: Browser | undefined;
    let pluginErrors = "";
    try {
      const plugin = join(directory, "plugin");
      await cp(resolve("bin"), join(plugin, "bin"), { recursive: true });
      await cp(resolve("package.json"), join(plugin, "package.json"));
      const runtime = join(directory, "runtime");
      await mkdir(join(runtime, "node_modules"), { recursive: true });
      await symlink(
        resolve("node_modules/playwright"),
        join(runtime, "node_modules/playwright"),
      );
      const commands = join(directory, "commands");
      await mkdir(commands);
      const mockClaude = join(commands, "claude");
      await writeFile(
        mockClaude,
        "#!/usr/bin/env node\n" +
          (await readFile(resolve("e2e-extension/mock-claude.cjs"), "utf8")),
      );
      await chmod(mockClaude, 0o755);
      const debuggingPort = await freePort();
      const executable = join(directory, "chromium.cjs");
      await writeFile(
        executable,
        `#!/usr/bin/env node
const { spawn } = require('node:child_process');
const child = spawn(${JSON.stringify(chromium.executablePath())}, [
  ...process.argv.slice(2), '--remote-debugging-port=${debuggingPort}',
  '--enable-unsafe-extension-debugging', '--no-sandbox'
], { stdio: ['inherit', 'inherit', 'inherit', 3, 4] });
for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, () => child.kill(signal));
child.on('exit', code => process.exit(code ?? 1));
`,
      );
      await chmod(executable, 0o755);
      const env: NodeJS.ProcessEnv = {
        ...process.env,
        HOME: directory,
        GLIMPSELET_PORT: String(await freePort()),
        PATH: `${commands}:${process.env.PATH || ""}`,
        GLIMPSELET_DISABLE_BROWSER_OPEN: "1",
        GLIMPSELET_RUNTIME_DIR: runtime,
        GLIMPSELET_PROFILE_DIR: join(directory, "trial-profile"),
        GLIMPSELET_CHROMIUM_PATH: executable,
      };
      delete env.SSH_CONNECTION;
      const transport = new StdioClientTransport({
        command: process.execPath,
        args: [join(plugin, "bin/glimpselet.cjs")],
        cwd: directory,
        env: Object.fromEntries(
          Object.entries(env).filter((entry) => entry[1] !== undefined),
        ),
        stderr: "pipe",
      });
      transport.stderr?.on("data", (chunk) => {
        pluginErrors = (pluginErrors + chunk.toString()).slice(-8000);
      });
      await client.connect(transport);
      const opened = await client.callTool({
        name: "panel_open",
        arguments: {},
      });
      const text = (opened.content as { text: string }[])[0].text;
      const sourceUrl =
        /http:\/\/127\.0\.0\.1:\d+\/install#code=[A-F0-9]{16}/.exec(text)?.[0];
      if (!sourceUrl) throw new Error(`Missing welcome URL: ${text}`);
      const sourceCode = new URLSearchParams(
        new URL(sourceUrl).hash.slice(1),
      ).get("code")!;
      const origin = new URL(sourceUrl).origin;
      const status = async (code: string) =>
        (await fetch(`${origin}/install/status?code=${code}`)).json();
      const extension = join(directory, ".glimpselet/extension");
      ordinary = await launchExtensionContext(
        join(directory, "ordinary-profile"),
        {
          headless: false,
          viewport: null,
          args: ordinaryPaired
            ? [
                `--disable-extensions-except=${extension}`,
                `--load-extension=${extension}`,
                "--no-sandbox",
              ]
            : ["--no-sandbox"],
        },
      );
      const welcome = ordinary.pages()[0];
      await welcome.goto(sourceUrl);
      let ordinaryToken: string | undefined;
      let ordinaryPanel: Page | undefined;
      let ordinaryOwner: Page | undefined;
      if (ordinaryPaired) {
        const paired = await pairFromWelcome(welcome, ordinary);
        ordinaryPanel = paired.panel;
        ordinaryOwner = paired.owner;
        await askQuestion(ordinaryPanel, "What can I do here?");
        const worker = ordinary.serviceWorkers()[0];
        ordinaryToken = (
          await worker.evaluate(() =>
            chrome.storage.session.get(["bridgeToken"]),
          )
        ).bridgeToken;
        expect(ordinaryToken).toMatch(/^[a-f0-9]{64}$/);
      }
      expect((await status(sourceCode)).connected).toBe(ordinaryPaired);

      await welcome.bringToFront();
      await welcome
        .getByRole("button", { name: "Try without installing", exact: true })
        .click();
      trial = await connectTrial(debuggingPort);
      const trialContext = trial.contexts()[0];
      await expect
        .poll(() =>
          trialContext.pages().some((page) => {
            const target = new URL(page.url());
            return target.origin === origin && target.pathname === "/install";
          }),
        )
        .toBe(true);
      const trialWelcome = trialContext.pages().find((page) => {
        const target = new URL(page.url());
        return target.origin === origin && target.pathname === "/install";
      })!;
      const trialUrl = new URL(trialWelcome.url());
      const trialCode = new URLSearchParams(trialUrl.hash.slice(1)).get(
        "code",
      )!;
      const trialWorker =
        trialContext.serviceWorkers()[0] ||
        (await trialContext.waitForEvent("serviceworker"));
      const trialStorage = await trialWorker.evaluate(() =>
        chrome.storage.session.get(["bridgeToken"]),
      );
      const trialStatus = await status(trialCode);
      const sourceStatus = await status(sourceCode);
      const pairingEvidence = info.outputPath("pairing-state.json");
      await writeFile(
        pairingEvidence,
        JSON.stringify(
          {
            ordinaryPaired,
            samePairingCode: trialCode === sourceCode,
            trialHasToken: typeof trialStorage.bridgeToken === "string",
            trialConnected: trialStatus.connected,
            ordinaryConnected: sourceStatus.connected,
          },
          null,
          2,
        ),
      );
      await info.attach("separate-profile-pairing-state", {
        path: pairingEvidence,
        contentType: "application/json",
      });
      await trialWelcome.screenshot({
        path: info.outputPath("trial-before-pairing.png"),
        fullPage: true,
      });
      expect(trialUrl.origin).toBe(origin);
      expect(trialCode).toMatch(/^[A-F0-9]{16}$/);
      expect(trialCode).not.toBe(sourceCode);
      expect(trialUrl.searchParams.get("locale")).toBe("en");
      expect(trialStorage).toEqual({});
      expect(trialStatus.connected).toBe(false);
      expect(sourceStatus.connected).toBe(ordinaryPaired);
      await expect(trialWelcome.locator("#pair-controls")).toBeVisible();
      await expect(trialWelcome.locator("#connect")).toBeVisible();

      const { panel: trialPanel } = await pairFromWelcome(
        trialWelcome,
        trialContext,
      );
      const trialToken = (
        await trialWorker.evaluate(() =>
          chrome.storage.session.get(["bridgeToken"]),
        )
      ).bridgeToken;
      expect(trialToken).toMatch(/^[a-f0-9]{64}$/);
      expect(trialToken).not.toBe(ordinaryToken);
      expect((await status(trialCode)).connected).toBe(true);
      expect((await status(sourceCode)).connected).toBe(ordinaryPaired);
      // Exercise single-use enforcement from the real extension origin. A
      // second socket must fail without replacing either authenticated browser.
      const duplicatePair = await trialWorker.evaluate(
        ({ origin, code }) =>
          new Promise<Record<string, unknown>>((resolve, reject) => {
            const socket = new WebSocket(
              `${origin.replace("http:", "ws:")}/extension`,
            );
            const timer = setTimeout(() => {
              socket.close();
              reject(new Error("Duplicate pairing did not return a result"));
            }, 5000);
            socket.addEventListener("open", () =>
              socket.send(JSON.stringify({ type: "pair", code })),
            );
            socket.addEventListener("message", (event) => {
              clearTimeout(timer);
              socket.close();
              resolve(JSON.parse(String(event.data)));
            });
            socket.addEventListener("error", () => {
              clearTimeout(timer);
              reject(new Error("Duplicate pairing socket could not connect"));
            });
          }),
        { origin, code: trialCode },
      );
      expect(duplicatePair).toMatchObject({
        type: "error",
        code: "pairing_expired",
      });
      expect((await status(trialCode)).connected).toBe(true);
      expect((await status(sourceCode)).connected).toBe(ordinaryPaired);
      await askQuestion(trialPanel, "What can I do in this independent chat?");
      await trialWelcome.screenshot({
        path: info.outputPath("trial-after-pairing.png"),
        fullPage: true,
      });

      if (ordinaryPanel) {
        await expect(ordinaryPanel.locator(".connection")).toHaveClass(
          /online/,
        );
        await ordinaryPanel.bringToFront();
        await askQuestion(
          ordinaryPanel,
          "Can this original browser still ask a follow-up?",
        );
        await ordinaryPanel
          .getByRole("button", { name: en.settings, exact: true })
          .click();
        const replayOpened = ordinary.waitForEvent("page");
        await ordinaryPanel
          .getByRole("button", { name: en.replayTour, exact: true })
          .click();
        const replay = await replayOpened;
        await expect(replay).toHaveURL(`${origin}/install?locale=en#tour`);
        expect(new URL(replay.url()).searchParams.has("code")).toBe(false);
        expect(new URL(replay.url()).hash).toBe("#tour");
        await expect(replay.locator("#pairing")).toBeHidden();
        await expect(replay.locator("#installation")).toBeHidden();
        await expect(replay.locator("#pair")).not.toBeVisible();
        expect(
          await ordinaryOwner!.evaluate(() => {
            const owner = window as Window & {
              documentPictureInPicture: { window?: Window };
              replayFloatPiP?: Window;
            };
            owner.replayFloatPiP = owner.documentPictureInPicture.window;
            return Boolean(
              owner.replayFloatPiP && !owner.replayFloatPiP.closed,
            );
          }),
        ).toBe(true);
        const pagesBeforeSample = ordinary.pages().length;
        const sampleOpened = ordinary.waitForEvent("page");
        await replay
          .getByRole("button", {
            name: "Open sample + request float",
            exact: true,
          })
          .click();
        const sample = await sampleOpened;
        await expect(sample.locator("#tour-request")).toContainText("step 1");
        // Float is already practiced in this native bubble. The replay must
        // acknowledge that window without requiring or creating another one.
        await expect(replay.locator(".step").first()).toHaveClass(/done/);
        expect(ordinaryPanel.isClosed()).toBe(false);
        await expect(ordinaryPanel.locator(".app.in-pip")).toBeVisible();
        await expect(ordinaryPanel.locator(".float-start")).toHaveCount(0);
        expect(ordinary.pages()).toHaveLength(pagesBeforeSample + 1);
        expect(
          await ordinaryOwner!.evaluate(() => {
            const owner = window as Window & {
              documentPictureInPicture: { window?: Window };
              replayFloatPiP?: Window;
            };
            const floating = owner.documentPictureInPicture.window;
            return {
              samePiP: floating === owner.replayFloatPiP,
              open: Boolean(floating && !floating.closed),
              appInPiP: Boolean(
                floating?.document.querySelector(".app.in-pip"),
              ),
            };
          }),
        ).toEqual({ samePiP: true, open: true, appInPiP: true });
        await expect(ordinaryPanel.locator(".connection")).toHaveClass(
          /online/,
        );
        await replay.screenshot({
          path: info.outputPath("connected-replay.png"),
          fullPage: true,
        });
      }
    } finally {
      await info.attach("plugin-stderr", {
        body: pluginErrors,
        contentType: "text/plain",
      });
      await ordinary?.close();
      await trial?.close();
      await client.close();
      await rm(directory, { recursive: true, force: true });
    }
  });
}
