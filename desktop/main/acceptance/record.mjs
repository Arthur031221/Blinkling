import { spawn, execFileSync } from "node:child_process";
import {
  mkdirSync,
  existsSync,
  rmSync,
  readdirSync,
  copyFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/** Where the round 3 recordings go: one GIF per item, plus a before and an
 * after frame next to it. */
export const r3 =
  process.env.BLINKLING_R3_DIR ?? "/home/levi/oss-engine/reports/glimpse-v3/r3";
const phase = process.env.BLINKLING_R3_PHASE === "before" ? "before" : "after";
const size = () => {
  // A loaded host can refuse a fork for a moment: ask again before failing.
  for (let attempt = 0; ; attempt++)
    try {
      const out = execFileSync("xdpyinfo", [], { encoding: "utf8" });
      return /dimensions:\s+(\d+x\d+)/.exec(out)[1];
    } catch (error) {
      if (error.code !== "EAGAIN" || attempt >= 20) throw error;
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 250);
    }
};
const grab = (args) => {
  // ffmpeg starts threads; a host at its process limit refuses one now and then.
  for (let attempt = 0; ; attempt++)
    try {
      return execFileSync("ffmpeg", ["-v", "error", "-y", ...args], {
        stdio: "ignore",
      });
    } catch (error) {
      if (attempt >= 8) throw error;
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 400);
    }
};

/** Starts an x11grab of the whole display. `frame(label)` saves a PNG now;
 * `stop()` ends the video and, for the after phase, writes the GIF. A clip
 * that proves more than one row of the checklist names the others in `also`
 * and is written under each of their ids too. */
export function record(id, { fps = 15, suffix = "", also = [] } = {}) {
  let stopped = null;
  mkdirSync(r3, { recursive: true });
  const work = join(tmpdir(), `r3-${id}-${phase}`);
  rmSync(work, { recursive: true, force: true });
  mkdirSync(work, { recursive: true });
  const video = join(work, "run.mkv");
  const run = spawn(
    "ffmpeg",
    [
      "-v",
      "error",
      "-y",
      "-f",
      "x11grab",
      "-framerate",
      String(fps),
      "-video_size",
      size(),
      "-i",
      process.env.DISPLAY,
      "-c:v",
      "libx264",
      "-preset",
      "ultrafast",
      video,
    ],
    { stdio: ["pipe", "ignore", "inherit"] },
  );
  const frames = [];
  const began = Date.now();
  return {
    work,
    frame(label, crop) {
      const file = join(r3, `${id}-${phase}-${label}.png`);
      grab([
        "-f",
        "x11grab",
        "-video_size",
        size(),
        "-i",
        process.env.DISPLAY,
        ...(crop ? ["-vf", `crop=${crop}`] : []),
        "-frames:v",
        "1",
        file,
      ]);
      frames.push(file);
      return file;
    },
    /** After stop(): every recorded frame as a PNG, in order. */
    sequence() {
      const dir = join(work, "frames");
      rmSync(dir, { recursive: true, force: true });
      mkdirSync(dir, { recursive: true });
      grab(["-i", video, join(dir, "%05d.png")]);
      return readdirSync(dir)
        .sort()
        .map((f) => join(dir, f));
    },
    async stop() {
      // A second stop (a test that ends the clip early, then stops in finally)
      // gets the file of the first.
      if (stopped) return stopped;
      return (stopped = this.finish());
    },
    async finish() {
      // ffmpeg needs a moment to open the display; a clip stopped before its
      // first frame has nothing to turn into a GIF.
      const wait = 2000 - (Date.now() - began);
      if (wait > 0) await new Promise((done) => setTimeout(done, wait));
      run.stdin.write("q");
      await new Promise((done) => run.on("close", done));
      if (!existsSync(video)) return null;
      const gif = join(
        r3,
        phase === "after" ? `${id}${suffix}.gif` : `${id}-before.gif`,
      );
      const palette = join(work, "palette.png");
      const filter = "fps=12,scale=720:-1:flags=lanczos";
      grab(["-i", video, "-vf", `${filter},palettegen`, palette]);
      grab([
        "-i",
        video,
        "-i",
        palette,
        "-lavfi",
        `${filter}[x];[x][1:v]paletteuse`,
        gif,
      ]);
      if (phase === "after")
        for (const other of also) {
          // "id|case" names one case of a row: <id><suffix>-<case>.gif
          const [row, kind] = other.split("|");
          copyFileSync(
            gif,
            join(r3, `${row}${suffix}${kind ? `-${kind}` : ""}.gif`),
          );
        }
      return gif;
    },
  };
}
