import { readFileSync, writeFileSync, renameSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

const DEFAULTS = Object.freeze({ startWithClaudeCode: true });
const isBoolean = (value) => typeof value === "boolean";
const CHECKS = Object.freeze({ startWithClaudeCode: isBoolean });

function load(file) {
  try {
    const saved = JSON.parse(readFileSync(file, "utf8"));
    const kept = {};
    for (const [key, check] of Object.entries(CHECKS))
      if (check(saved?.[key])) kept[key] = saved[key];
    return { ...DEFAULTS, ...kept };
  } catch {
    // Missing, unfinished or foreign: the defaults. Nothing here turns Blink off.
    return { ...DEFAULTS };
  }
}

/** The settings that live in one small file in the user data directory,
 * `settings.json`. The plugin's launcher reads the same file when Claude Code
 * starts a session, so `startWithClaudeCode` is the real switch for that start.
 * (The pick key and the global hotkey keep their own files next to it.) */
export function createSettingsStore(file, { onError = () => {} } = {}) {
  let current = load(file);
  return {
    get: () => ({ ...current }),
    set(patch) {
      for (const [key, value] of Object.entries(patch)) {
        if (!CHECKS[key]) throw new Error(`Unknown setting: ${key}`);
        if (!CHECKS[key](value)) throw new Error(`Invalid value for ${key}`);
      }
      current = { ...current, ...patch };
      try {
        mkdirSync(dirname(file), { recursive: true });
        const temporary = `${file}.tmp`;
        writeFileSync(
          temporary,
          JSON.stringify({ schemaVersion: 1, ...current }),
          { mode: 0o600 },
        );
        renameSync(temporary, file);
      } catch (error) {
        onError(error);
      }
      return { ...current };
    },
  };
}
