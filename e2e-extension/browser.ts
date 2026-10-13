import { chromium, type BrowserType } from "@playwright/test";

type Options = Parameters<BrowserType["launchPersistentContext"]>[1];
let reportedBrowser = false;

// Stable Chrome no longer accepts --load-extension. Load through the browser
// CDP session in an isolated test profile, leaving production installs unchanged.
export async function launchExtensionContext(
  profile: string,
  options: Options,
) {
  const channel = process.env.PW_CHANNEL || "chromium";
  const branded = channel !== "chromium";
  const context = await chromium.launchPersistentContext(profile, {
    ...options,
    channel,
    ...(branded
      ? {
          ignoreDefaultArgs: ["--disable-extensions"],
          args: [
            ...(options?.args || []).filter(
              (arg) =>
                !arg.startsWith("--load-extension=") &&
                !arg.startsWith("--disable-extensions-except="),
            ),
            "--enable-unsafe-extension-debugging",
          ],
        }
      : {}),
  });
  if (!reportedBrowser) {
    console.log(
      `Extension browser: ${channel} ${context.browser()!.version()}`,
    );
    reportedBrowser = true;
  }
  const extension = options?.args
    ?.find((arg) => arg.startsWith("--load-extension="))
    ?.slice("--load-extension=".length);
  if (branded && extension) {
    try {
      const session = await context.browser()!.newBrowserCDPSession();
      try {
        await session.send("Extensions.loadUnpacked", { path: extension });
      } finally {
        await session.detach();
      }
    } catch (error) {
      await context.close();
      throw error;
    }
  }
  return context;
}
