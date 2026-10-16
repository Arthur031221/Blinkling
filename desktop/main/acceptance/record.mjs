import { spawn, execFileSync } from "node:child_process";
import { mkdirSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/** Where the round 3 recordings go: one GIF per item, plus a before and an
 * after frame next to it. */
export const r3 =
  process.env.BLINKLING_R3_DIR ?? "/home/levi/oss-engine/reports/glimpse-v3/r3";
const phase = process.env.BLINKLING_R3_PHASE === "before" ? "before" : "after";
const size = () => {
  const out = execFileSync("xdpyinfo", [], { encoding: "utf8" });
  return /dimensions:\s+(\d+x\d+)/.exec(out)[1];
};
const grab = (args) =>
  execFileSync("ffmpeg", ["-v", "error", "-y", ...args], { stdio: "ignore" });

/** Starts an x11grab of the whole display. `frame(label)` saves a PNG now;
 * `stop()` ends the video and, for the after phase, writes the GIF. */
export function record(id, { fps = 15, suffix = "" } = {}) {
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
    async stop() {
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
      return gif;
    },
  };
}
