/** The global capture hotkey (K2, N2.2): a default that stays clear of common
 * system and app shortcuts, validation for the settings field, and a registry
 * that never loses the working key when a new one is refused. */
import { readFile, writeFile, mkdir, rename, rm } from "node:fs/promises";
import { dirname } from "node:path";
import { randomUUID } from "node:crypto";

export const DEFAULT_HOTKEY = Object.freeze({
  darwin: "Command+Alt+Shift+X",
  win32: "Alt+Shift+X",
  linux: "Alt+Shift+X",
});

const MODIFIERS = {
  ctrl: "ctrl",
  control: "ctrl",
  commandorcontrol: "primary",
  cmdorctrl: "primary",
  alt: "alt",
  option: "alt",
  altgr: "altgr",
  shift: "shift",
  command: "meta",
  cmd: "meta",
  meta: "meta",
  super: "meta",
  win: "meta",
};
const KEY_ALIASES = {
  esc: "escape",
  del: "delete",
  return: "enter",
  prtsc: "printscreen",
  printscr: "printscreen",
  pgup: "pageup",
  pgdn: "pagedown",
  spacebar: "space",
};
const NAMED_KEYS = new Set([
  "space",
  "tab",
  "backspace",
  "delete",
  "insert",
  "enter",
  "up",
  "down",
  "left",
  "right",
  "home",
  "end",
  "pageup",
  "pagedown",
  "escape",
  "printscreen",
  "plus",
  ..."`-=[];',./\\".split(""),
]);
const isKey = (key) =>
  /^[a-z0-9]$/.test(key) ||
  /^f([1-9]|1\d|2[0-4])$/.test(key) ||
  NAMED_KEYS.has(key);
const isBareAllowed = (key) => /^f\d+$/.test(key) || key === "printscreen";

/** `{ modifiers: sorted list, key }` for an accelerator, or null when it cannot
 * be registered. "Primary" is Control, or Command on a Mac. */
export function parseHotkey(accelerator, platform = process.platform) {
  if (typeof accelerator !== "string") return null;
  const parts = accelerator.trim().toLowerCase().split("+");
  if (parts.some((part) => !part.trim())) return null;
  const modifiers = new Set();
  let key = null;
  for (const raw of parts) {
    const token = raw.trim();
    const modifier = MODIFIERS[token];
    if (modifier) {
      const resolved =
        modifier === "primary"
          ? platform === "darwin"
            ? "meta"
            : "ctrl"
          : modifier;
      if (modifiers.has(resolved)) return null;
      modifiers.add(resolved);
    } else {
      const name = KEY_ALIASES[token] ?? token;
      if (key !== null || !isKey(name)) return null;
      key = name;
    }
  }
  if (key === null) return null;
  return { modifiers: [...modifiers].sort(), key };
}

export function normalizeHotkey(accelerator, platform = process.platform) {
  const parsed = parseHotkey(accelerator, platform);
  return parsed ? [...parsed.modifiers, parsed.key].join("+") : null;
}

const common = [
  "Ctrl+Shift+S",
  "Ctrl+Shift+T",
  "Ctrl+Shift+N",
  "Ctrl+Shift+P",
  "Ctrl+Shift+I",
  "Ctrl+Shift+Esc",
  "Ctrl+Alt+Delete",
  "Ctrl+Alt+T",
  "Alt+F4",
  "Alt+Tab",
  "Alt+Esc",
  "Alt+Space",
  "PrintScreen",
  "Shift+PrintScreen",
  "Alt+PrintScreen",
  "Ctrl+PrintScreen",
];
/** Shortcuts the system or the most common apps already own, per platform. */
export const CLASHES = Object.freeze({
  linux: [
    ...common,
    "Super+L",
    "Super+D",
    "Super+Tab",
    "Super+Space",
    "Super+Shift+S",
    "Ctrl+Alt+L",
    "Ctrl+Alt+D",
    "Ctrl+Alt+Left",
    "Ctrl+Alt+Right",
    "Ctrl+Alt+Up",
    "Ctrl+Alt+Down",
  ],
  win32: [
    ...common,
    "Super+Shift+S",
    "Super+L",
    "Super+D",
    "Super+E",
    "Super+R",
    "Super+Tab",
    "Super+Space",
    "Super+V",
    "Super+Shift+Left",
    "Super+Shift+Right",
    "Ctrl+Shift+Alt+Win",
  ],
  darwin: [
    "Cmd+Shift+S",
    "Cmd+Shift+3",
    "Cmd+Shift+4",
    "Cmd+Shift+5",
    "Cmd+Shift+6",
    "Cmd+Shift+T",
    "Cmd+Shift+N",
    "Cmd+Shift+P",
    "Cmd+Shift+I",
    "Cmd+Space",
    "Cmd+Alt+Space",
    "Cmd+Tab",
    "Cmd+Shift+Tab",
    "Cmd+Q",
    "Cmd+W",
    "Cmd+H",
    "Cmd+M",
    "Cmd+Alt+Esc",
    "Cmd+Alt+D",
    "Ctrl+Cmd+Q",
    "Ctrl+Cmd+Space",
    "Ctrl+Space",
    "Ctrl+Alt+Space",
    "Ctrl+Up",
    "Ctrl+Down",
    "Ctrl+Left",
    "Ctrl+Right",
  ],
});

const clashSets = new Map();
const clashSet = (platform) => {
  if (!clashSets.has(platform))
    clashSets.set(
      platform,
      new Set(
        (CLASHES[platform] ?? CLASHES.linux).map((key) =>
          normalizeHotkey(key, platform),
        ),
      ),
    );
  return clashSets.get(platform);
};

/** { ok: true } or { ok: false, reason: "invalid" | "clash" }. */
export function validateHotkey(accelerator, platform = process.platform) {
  const parsed = parseHotkey(accelerator, platform);
  if (!parsed) return { ok: false, reason: "invalid" };
  if (clashSet(platform).has(normalizeHotkey(accelerator, platform)))
    return { ok: false, reason: "clash" };
  // A key that needs no modifier other than Shift would fire while typing.
  const guarded = parsed.modifiers.some((m) => m !== "shift");
  if (!guarded && !isBareAllowed(parsed.key))
    return { ok: false, reason: "invalid" };
  return { ok: true };
}

/** Owns the one global registration. A new key is registered before the old one
 * is released, so a refusal leaves the working key in place. */
export class HotkeyRegistry {
  current = null;
  constructor({
    shortcuts,
    platform = process.platform,
    initial,
    run,
    defaults = DEFAULT_HOTKEY,
    reserved = () => [],
  }) {
    this.defaults = defaults;
    this.reserved = reserved;
    this.shortcuts = shortcuts;
    this.platform = platform;
    this.initial = initial;
    this.run = run;
  }
  #register(accelerator) {
    try {
      return !!this.shortcuts.register(accelerator, () => this.run());
    } catch {
      return false;
    }
  }
  start() {
    const stored = validateHotkey(this.initial, this.platform).ok
      ? this.initial
      : this.defaults[this.platform];
    if (!this.#register(stored)) return { ok: false, reason: "unavailable" };
    this.current = stored;
    return { ok: true };
  }
  set(accelerator) {
    const check = validateHotkey(accelerator, this.platform);
    if (!check.ok) return check;
    // The key another feature already owns is refused, so one press never
    // starts two things.
    const same = normalizeHotkey(accelerator, this.platform);
    if (
      this.reserved().some(
        (key) => normalizeHotkey(key, this.platform) === same,
      )
    )
      return { ok: false, reason: "clash" };
    if (accelerator === this.current) return { ok: true };
    if (!this.#register(accelerator))
      return { ok: false, reason: "unavailable" };
    if (this.current) this.shortcuts.unregister(this.current);
    this.current = accelerator;
    return { ok: true };
  }
  dispose() {
    if (this.current) this.shortcuts.unregister(this.current);
    this.current = null;
  }
}

/** The key the user chose, kept next to the other per-user files. */
export class HotkeyStore {
  constructor(path) {
    this.path = path;
  }
  async read() {
    try {
      const { accelerator } = JSON.parse(await readFile(this.path, "utf8"));
      return typeof accelerator === "string" ? accelerator : undefined;
    } catch {
      return undefined;
    }
  }
  async write(accelerator) {
    await mkdir(dirname(this.path), { recursive: true });
    const temp = `${this.path}.${randomUUID()}.tmp`;
    try {
      await writeFile(temp, JSON.stringify({ accelerator }), { mode: 0o600 });
      await rename(temp, this.path);
    } finally {
      await rm(temp, { force: true });
    }
  }
}
