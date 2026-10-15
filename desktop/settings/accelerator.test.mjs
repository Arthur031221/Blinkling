import test from "node:test";
import assert from "node:assert/strict";
import { acceleratorFromKeyEvent, hotkeyLabel } from "./accelerator.mjs";
import { parseHotkey } from "../capture/hotkey.mjs";

const press = (code, mods = {}) => ({
  code,
  ctrlKey: false,
  altKey: false,
  shiftKey: false,
  metaKey: false,
  ...mods,
});

test("a letter with modifiers becomes an accelerator the registry accepts", () => {
  const accelerator = acceleratorFromKeyEvent(
    press("KeyK", { altKey: true, shiftKey: true }),
  );
  assert.equal(accelerator, "Alt+Shift+K");
  assert.ok(parseHotkey(accelerator));
});

test("the key comes from the physical code, so Option+letter is not a dead-key symbol", () => {
  assert.equal(
    acceleratorFromKeyEvent(
      press("KeyX", { metaKey: true, altKey: true, shiftKey: true }),
      "darwin",
    ),
    "Command+Alt+Shift+X",
  );
  assert.equal(
    acceleratorFromKeyEvent(press("Digit7", { ctrlKey: true, altKey: true })),
    "Control+Alt+7",
  );
});

test("named keys, function keys and arrows map to the names the registry knows", () => {
  for (const [code, name] of [
    ["F9", "F9"],
    ["ArrowUp", "Up"],
    ["Space", "Space"],
    ["PageDown", "PageDown"],
    ["Backquote", "`"],
    ["Slash", "/"],
  ]) {
    const accelerator = acceleratorFromKeyEvent(press(code, { ctrlKey: true }));
    assert.equal(accelerator, `Control+${name}`);
    assert.ok(parseHotkey(accelerator), accelerator);
  }
});

test("pressing only modifiers is not a hotkey yet", () => {
  for (const code of ["ControlLeft", "ShiftRight", "AltLeft", "MetaLeft", "OS"])
    assert.equal(acceleratorFromKeyEvent(press(code, { ctrlKey: true })), null);
});

test("an unknown key gives nothing", () => {
  assert.equal(
    acceleratorFromKeyEvent(press("MediaPlayPause", { ctrlKey: true })),
    null,
  );
  assert.equal(acceleratorFromKeyEvent(press("")), null);
});

test("the Windows key is Super off the Mac", () => {
  assert.equal(
    acceleratorFromKeyEvent(
      press("KeyV", { metaKey: true, shiftKey: true }),
      "win32",
    ),
    "Super+Shift+V",
  );
});

test("the label reads naturally per platform", () => {
  assert.equal(hotkeyLabel("Command+Alt+Shift+X", "darwin"), "⌘ ⌥ ⇧ X");
  assert.equal(hotkeyLabel("Alt+Shift+X", "linux"), "Alt + Shift + X");
  assert.equal(hotkeyLabel("Control+Up", "linux"), "Ctrl + ↑");
});
