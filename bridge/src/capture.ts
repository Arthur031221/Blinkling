import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, dirname, resolve } from "node:path";

const run = promisify(execFile);
type CaptureOptions = {
  timeout: number;
  maxBuffer?: number;
  signal?: AbortSignal;
};
async function captureRun(
  command: string,
  args: string[],
  options: CaptureOptions,
) {
  options.signal?.throwIfAborted();
  let resolveResult!: (value: { stdout: string }) => void;
  let rejectResult!: (error: Error) => void;
  const result = new Promise<{ stdout: string }>((resolveDone, reject) => {
    resolveResult = resolveDone;
    rejectResult = reject;
  });
  const child = execFile(
    command,
    args,
    { ...options, encoding: "utf8", windowsHide: true },
    (error, stdout) => {
      if (error) rejectResult(error);
      else resolveResult({ stdout });
    },
  );
  const closed = new Promise<void>((resolveClosed) =>
    child.once("close", () => resolveClosed()),
  );
  let forceTimer: NodeJS.Timeout | undefined;
  const forceStop = () => {
    forceTimer = setTimeout(() => child.kill("SIGKILL"), 1500);
  };
  options.signal?.addEventListener("abort", forceStop, { once: true });
  if (options.signal?.aborted) forceStop();
  try {
    return await result;
  } finally {
    if (child.exitCode === null && !forceTimer) forceStop();
    await closed;
    if (forceTimer) clearTimeout(forceTimer);
    options.signal?.removeEventListener("abort", forceStop);
  }
}
export type Target = "screen" | "window" | "region" | "last_selection";
export type Selection = { x: number; y: number; width: number; height: number };
export type CaptureAdapter = {
  supported: Record<Target, boolean>;
  capture(
    target: Target,
    signal?: AbortSignal,
  ): Promise<{ image: Buffer; selection?: Selection; source: string }>;
};

const here = dirname(resolve(process.argv[1] ?? process.cwd()));
const bundledRoot = process.env.CLAUDE_PLUGIN_ROOT ?? resolve(here, "..");
const has = async (command: string) => {
  try {
    await run("which", [command], { timeout: 1500 });
    return true;
  } catch {
    return false;
  }
};
const binary = async (...names: string[]) => {
  for (const name of names) if (await has(name)) return name;
  return undefined;
};

export async function createNativeAdapter(): Promise<CaptureAdapter> {
  const platform = process.platform;
  if (platform === "darwin")
    return {
      supported: {
        screen: true,
        window: true,
        region: true,
        last_selection: false,
      },
      capture: async (target, signal) =>
        withOutput(async (output) => {
          const args =
            target === "window"
              ? ["-w", output]
              : target === "region"
                ? ["-i", output]
                : [output];
          await captureRun("/usr/sbin/screencapture", args, {
            signal,
            timeout: 120_000,
            maxBuffer: 1024 * 1024,
          });
          return {
            image: await readFile(output),
            source: `macOS screencapture (${target})`,
          };
        }),
    };
  if (platform === "win32")
    return {
      supported: {
        screen: true,
        window: false,
        region: false,
        last_selection: false,
      },
      capture: async (target, signal) => {
        if (target !== "screen") throw unsupported(platform, target);
        return withOutput(async (output) => {
          const script = join(bundledRoot, "native", "capture-windows.ps1");
          await captureRun(
            "powershell.exe",
            [
              "-NoLogo",
              "-NoProfile",
              "-NonInteractive",
              "-ExecutionPolicy",
              "Bypass",
              "-File",
              script,
              "-OutputPath",
              output,
            ],
            { timeout: 20_000, maxBuffer: 1024 * 1024, signal },
          );
          return {
            image: await readFile(output),
            source: "Windows PowerShell screen capture",
          };
        });
      },
    };
  if (platform === "linux") {
    const wayland = Boolean(process.env.WAYLAND_DISPLAY);
    if (wayland) {
      const grim = await binary("grim"),
        slurp = await binary("slurp");
      if (grim && slurp) return linuxAdapter(grim, "wayland");
      if (grim) return linuxAdapter(grim, "wayland-screen-only");
      throw new Error(
        "Wayland capture needs grim; region capture also needs slurp.",
      );
    }
    const maim = await binary("maim"),
      scrot = await binary("scrot");
    if (maim) return linuxX11Adapter(maim, "maim");
    if (scrot) return linuxX11Adapter(scrot, "scrot");
    throw new Error("X11 capture needs maim or scrot.");
  }
  throw new Error(
    `Native capture is not supported on ${platform}. Supported platforms: macOS, Windows, Linux Wayland, Linux X11.`,
  );
}

function linuxAdapter(
  grim: string,
  flavor: "wayland" | "wayland-screen-only",
): CaptureAdapter {
  let lastSelection: Selection | undefined;
  const region = flavor === "wayland";
  return {
    supported: { screen: true, window: false, region, last_selection: region },
    capture: async (target, signal) =>
      withOutput(async (output) => {
        if (target === "last_selection") {
          if (!lastSelection)
            throw new Error(
              "No selected region is available yet. Capture a region first.",
            );
          await captureRun(
            grim,
            [
              "-g",
              `${lastSelection.x},${lastSelection.y} ${lastSelection.width}x${lastSelection.height}`,
              output,
            ],
            { timeout: 20_000, signal },
          );
          return {
            image: await readFile(output),
            source: "grim last selected region",
            selection: lastSelection,
          };
        }
        if (target === "region") {
          const picked = (
            await captureRun("slurp", [], {
              timeout: 120_000,
              maxBuffer: 4096,
              signal,
            })
          ).stdout.trim();
          const match = /^(-?\d+),(-?\d+)\s+(\d+)x(\d+)$/.exec(picked);
          if (!match) throw new Error("Region selection was empty or invalid.");
          const selection = {
            x: Number(match[1]),
            y: Number(match[2]),
            width: Number(match[3]),
            height: Number(match[4]),
          };
          if (
            !selection.width ||
            !selection.height ||
            selection.width * selection.height > 40_000_000
          )
            throw new Error("Selected region is empty or too large.");
          lastSelection = selection;
          await captureRun(grim, ["-g", picked, output], {
            timeout: 20_000,
            signal,
          });
          return {
            image: await readFile(output),
            source: "grim selected region",
            selection,
          };
        }
        if (target !== "screen") throw unsupported("Linux Wayland", target);
        await captureRun(grim, [output], { timeout: 20_000, signal });
        return { image: await readFile(output), source: "grim screen" };
      }),
  };
}

function linuxX11Adapter(
  captureBin: string,
  flavor: "maim" | "scrot",
): CaptureAdapter {
  return {
    supported: {
      screen: true,
      window: false,
      region: true,
      last_selection: false,
    },
    capture: async (target, signal) =>
      withOutput(async (output) => {
        if (target === "window")
          throw unsupported(`Linux X11 ${flavor}`, target);
        const args =
          target === "region"
            ? flavor === "maim"
              ? ["-s", output]
              : ["-s", "--overwrite", output]
            : flavor === "maim"
              ? [output]
              : ["--overwrite", output];
        await captureRun(captureBin, args, {
          signal,
          timeout: 120_000,
          maxBuffer: 1024 * 1024,
        });
        return { image: await readFile(output), source: `${flavor} ${target}` };
      }),
  };
}

async function withOutput<T>(fn: (output: string) => Promise<T>): Promise<T> {
  const directory = await mkdtemp(join(tmpdir(), "blinkling-"));
  try {
    return await fn(join(directory, "capture.png"));
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

function unsupported(platform: string, target: Target): Error {
  return new Error(
    `Capture target '${target}' is not supported on ${platform}. See screen_capture supported targets for this platform.`,
  );
}

export const adapterTestSeam = { withOutput, bundledRoot };
