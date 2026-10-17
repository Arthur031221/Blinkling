import { test } from "node:test";
import vm from "node:vm";
import assert from "node:assert/strict";
import { canExclude, exclude, excluded } from "./exclusion.mjs";
import { SurfaceGuard, fadeScript } from "./core.mjs";

const none = {};
const window = (log, name) => ({
  isDestroyed: () => false,
  isVisible: () => true,
  setContentProtection: (on) => log.push(`${name} protect ${on}`),
});

test("macOS and Windows 10 2004 or later keep their own windows out of a screen read; Linux and older Windows cannot", () => {
  const can = (platform, version, env = none) =>
    canExclude({ platform, version, env });
  assert.equal(can("darwin", "24.6.0"), true);
  assert.equal(can("win32", "10.0.19041"), true);
  assert.equal(can("win32", "10.0.19045"), true);
  assert.equal(can("win32", "10.0.22631"), true);
  assert.equal(can("win32", "10.0.19040"), false);
  assert.equal(can("win32", "10.0.18363"), false);
  assert.equal(can("win32", "garbled"), false);
  assert.equal(can("linux", "7.0.0"), false);
});

test("an environment switch turns the exclusion off for a macOS that ignores it, and on for a test", () => {
  const env = (v) => ({ BLINKLING_CAPTURE_EXCLUDE: v });
  assert.equal(canExclude({ platform: "darwin", env: env("0") }), false);
  assert.equal(
    canExclude({ platform: "win32", version: "10.0.22631", env: env("0") }),
    false,
  );
  assert.equal(canExclude({ platform: "linux", env: env("1") }), true);
});

test("a window is asked to stay out of captures once, and only where the system can", () => {
  const log = [];
  const a = window(log, "a"),
    b = window(log, "b");
  assert.equal(exclude(a, true), true);
  assert.equal(exclude(b, false), false);
  assert.deepEqual(log, ["a protect true"]);
  assert.equal(excluded(a), true);
  assert.equal(excluded(b), false);
});

test("the guard leaves a protected window alone and hides the others, and waits for no frame when it hid nothing", async () => {
  const log = [];
  const blink = window(log, "blink"),
    card = window(log, "card");
  exclude(blink, true);
  const guard = new SurfaceGuard(() => [blink, card], {
    fade: async (w, to) => log.push(`fade ${to}`),
    settle: async () => log.push("settle"),
  });
  await guard.run(async () => log.push("read"));
  assert.deepEqual(log.slice(1), ["fade 0", "settle", "read", "fade 1"]);
  log.length = 0;
  const only = new SurfaceGuard(() => [blink], {
    fade: async (w, to) => log.push(`fade ${to}`),
    settle: async () => log.push("settle"),
  });
  await only.run(async () => log.push("read"));
  assert.deepEqual(log, ["read"]);
});

test("where windows must be hidden, out is at once and back in is a fade", async () => {
  const calls = [];
  const run = (script, animations) => {
    calls.length = 0;
    const root = {
      getAnimations: () => animations,
      animate: (frames, options) => {
        const a = {
          id: options.id,
          options,
          pause: () => calls.push("pause"),
          play: () => calls.push("play"),
          finish: () => calls.push("finish"),
          cancel: () => calls.push("cancel"),
          finished: Promise.resolve(),
        };
        animations.push(a);
        return a;
      },
    };
    return vm
      .runInNewContext(script, {
        document: { documentElement: root },
        matchMedia: () => ({ matches: false }),
      })
      .then(() => [...calls]);
  };
  const base = { duration: 120, easing: "ease", reduced: false, instant: true };
  const animations = [];
  assert.deepEqual(await run(fadeScript(0, base), animations), [
    "pause",
    "finish",
  ]);
  assert.equal(animations[0].options.duration, 120);
  assert.deepEqual(await run(fadeScript(1, base), animations), [
    "play",
    "cancel",
  ]);
  assert.equal(animations[0].playbackRate, -1);
});
