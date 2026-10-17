// Rewrites assets/recordings.json from the files the recorder and media.sh made.
// Usage: node assets/record/manifest.mjs
import { createHash } from "node:crypto";
import { copyFileSync, readFileSync, statSync, writeFileSync } from "node:fs";

const sha = (file) =>
  createHash("sha256").update(readFileSync(file)).digest("hex");
const path = "assets/recordings.json";
const manifest = JSON.parse(readFileSync(path, "utf8"));
const raw = {
  pick: "/tmp/hq/pick/pick.events.json",
  ask: "/tmp/hq/ask/ask.events.json",
  translate: "/tmp/hq/arabic/arabic.events.json",
  tour: "/tmp/hq/hard2/hard.events.json",
};
const cuts = {
  pick: [[2.5, 19]],
  ask: [[4.5, 18]],
  translate: [
    [3.5, 15],
    [23, 28.4],
  ],
  tour: [
    [1, 10],
    [19, 38.9],
  ],
};
const posters = { pick: 15, ask: 12, translate: 15.5, tour: 12 };

manifest.recordedAt = new Date().toISOString();
manifest.capture =
  "Real Blinkling desktop app built from this tree and a real Chromium window on an X11 desktop at 2x (2560x1600 showing a 1280x800 scene, 30 fps), driven by native XTest mouse and keyboard input";
for (const item of manifest.recordings) {
  const name = item.asset
    .split("/")
    .pop()
    .replace(/\.\w+$/, "");
  item.asset = `assets/${name}.webp`;
  item.sha256 = sha(item.asset);
  item.bytes = statSync(item.asset).size;
  item.width = 1280;
  item.fps = 30;
  item.segments = cuts[name];
  copyFileSync(raw[name], item.events);
  item.eventsSha256 = sha(item.events);
  item.site = ["mp4", "webm", "png"].map((extension) => {
    const file = `assets/site/${name}.${extension}`;
    return { file, sha256: sha(file), bytes: statSync(file).size };
  });
  item.posterSecond = posters[name];
}
writeFileSync(path, `${JSON.stringify(manifest, null, 2)}\n`);
