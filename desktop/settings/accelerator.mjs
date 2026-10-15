/** Turns the keys the user presses in the hotkey field into an Electron
 * accelerator, and an accelerator into the text shown next to it. The key is
 * read from the physical `code`, so Option+X on a Mac is X and not a symbol. */
const MODIFIER_CODES = /^(Control|Shift|Alt|Meta)(Left|Right)$|^OS(Left|Right)?$/;
const NAMED = Object.freeze({
  Space: "Space",
  Tab: "Tab",
  Backspace: "Backspace",
  Delete: "Delete",
  Insert: "Insert",
  Enter: "Enter",
  NumpadEnter: "Enter",
  ArrowUp: "Up",
  ArrowDown: "Down",
  ArrowLeft: "Left",
  ArrowRight: "Right",
  Home: "Home",
  End: "End",
  PageUp: "PageUp",
  PageDown: "PageDown",
  Escape: "Escape",
  PrintScreen: "PrintScreen",
  Backquote: "`",
  Minus: "-",
  Equal: "=",
  BracketLeft: "[",
  BracketRight: "]",
  Semicolon: ";",
  Quote: "'",
  Comma: ",",
  Period: ".",
  Slash: "/",
  Backslash: "\\",
});

function keyName(code) {
  if (NAMED[code]) return NAMED[code];
  if (/^Key[A-Z]$/.test(code)) return code.slice(3);
  if (/^Digit\d$/.test(code)) return code.slice(5);
  if (/^F([1-9]|1\d|2[0-4])$/.test(code)) return code;
  return null;
}

/** The accelerator for a finished key press, or null while only modifiers are
 * down or the key is not one a global shortcut can use. */
export function acceleratorFromKeyEvent(event, platform = process.platform) {
  const code = String(event.code ?? "");
  if (!code || MODIFIER_CODES.test(code)) return null;
  const key = keyName(code);
  if (!key) return null;
  const parts = [];
  if (event.metaKey) parts.push(platform === "darwin" ? "Command" : "Super");
  if (event.ctrlKey) parts.push("Control");
  if (event.altKey) parts.push("Alt");
  if (event.shiftKey) parts.push("Shift");
  return [...parts, key].join("+");
}

const MAC = { Command: "⌘", Control: "⌃", Alt: "⌥", Shift: "⇧" };
const ARROWS = { Up: "↑", Down: "↓", Left: "←", Right: "→" };

export function hotkeyLabel(accelerator, platform = process.platform) {
  const parts = String(accelerator).split("+");
  if (platform === "darwin")
    return parts.map((part) => MAC[part] ?? ARROWS[part] ?? part).join(" ");
  return parts
    .map((part) => (part === "Control" ? "Ctrl" : (ARROWS[part] ?? part)))
    .join(" + ");
}
