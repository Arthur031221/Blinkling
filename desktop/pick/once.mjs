import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

/** Things shown to the user exactly once: the first-Ctrl hint, the PDF reader
 * offer. Persisted, so a restart does not bring them back. */
export function createOnce(store) {
  return {
    seen: (key) => store.get(key) === true,
    take(key) {
      if (store.get(key) === true) return false;
      store.set(key, true);
      return true;
    },
  };
}

export function fileStore(file) {
  const read = () => {
    try {
      const data = JSON.parse(readFileSync(file, "utf8"));
      return data && typeof data === "object" ? data : {};
    } catch {
      return {};
    }
  };
  return {
    get: (key) => read()[key],
    set(key, value) {
      try {
        mkdirSync(dirname(file), { recursive: true });
        const temporary = `${file}.${process.pid}.tmp`;
        writeFileSync(temporary, JSON.stringify({ ...read(), [key]: value }));
        renameSync(temporary, file);
      } catch {
        // A hint that cannot be remembered may repeat; it must never break a pick.
      }
    },
  };
}
