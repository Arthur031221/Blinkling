import fsp from "node:fs/promises";
import { join } from "node:path";
import { guideStrings } from "./strings.mjs";

/** Saves a finished guide as plain files in the user's Documents. Local only:
 * no network, no replay data, no index of saved guides (N2.4). */
export const GUIDES_DIR = "Blinkling Guides";

const MAX_TITLE_CHARS = 60;
// 255 bytes is the common folder-name limit; leave room for the date stamp
// and a " (n)" suffix.
const MAX_TITLE_BYTES = 200;
const MAX_COPIES = 1000;
const PNG_SIGNATURE = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
]);
const RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\..*)?$/i;

const oneLine = (text) =>
  String(text ?? "")
    .replace(/\s+/g, " ")
    .trim();
const trimEnd = (text) => text.replace(/[. ]+$/, "");

/** A title that is safe as one folder name on macOS, Windows and Linux. */
export function safeTitle(title) {
  const words = String(title ?? "")
    .normalize("NFC")
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f\\/:*?"<>|]/g, " ")
    .split(/\s+/)
    .filter((word) => word && !/^\.+$/.test(word));
  let name = trimEnd(words.join(" "));
  const kept = [];
  let bytes = 0;
  for (const char of name) {
    bytes += Buffer.byteLength(char);
    if (kept.length >= MAX_TITLE_CHARS || bytes > MAX_TITLE_BYTES) break;
    kept.push(char);
  }
  name = trimEnd(kept.join(""));
  return RESERVED.test(name) ? `_${name}` : name;
}

const two = (n) => String(n).padStart(2, "0");

/** "2026-10-15 09.05 <title>" in local time; dots, since ":" is not allowed. */
export function folderName(title, date, fallback) {
  const stamp = `${date.getFullYear()}-${two(date.getMonth() + 1)}-${two(date.getDate())} ${two(date.getHours())}.${two(date.getMinutes())}`;
  return `${stamp} ${safeTitle(title) || fallback}`;
}

function decodePng(data, index) {
  const base64 = String(data ?? "")
    .replace(/^data:image\/png;base64,/i, "")
    .replace(/\s+/g, "");
  const bytes = /^[A-Za-z0-9+/]+={0,2}$/.test(base64)
    ? Buffer.from(base64, "base64")
    : Buffer.alloc(0);
  if (!bytes.subarray(0, 8).equals(PNG_SIGNATURE))
    throw new Error(`Screenshot ${index + 1} is not a base64 PNG`);
  return bytes;
}

/** Each screenshot is named for its step when it belongs to one and no other
 * screenshot already claimed that step; otherwise screen-<i>. */
function plan(guide, images) {
  const stepNumbers = (guide.steps ?? []).map((step, i) =>
    Number.isInteger(step?.n) && step.n > 0 ? step.n : i + 1,
  );
  const taken = new Set();
  return images.map((bytes, i) => {
    const step = guide.screenshots[i].step;
    const forStep = stepNumbers.includes(step) && !taken.has(step);
    if (forStep) taken.add(step);
    return {
      bytes,
      step: forStep ? step : null,
      file: forStep ? `step-${step}.png` : `screen-${i + 1}.png`,
      n: forStep ? step : i + 1,
    };
  });
}

function markdown(guide, files, t) {
  const alt = (key, n) => t(key, { n }).replace(/[[\]]/g, "");
  const image = (file, step) =>
    `![${alt(step ? "stepAlt" : "screenAlt", file.n)}](${file.file})`;
  const out = [`# ${oneLine(guide.title) || t("untitled")}`];
  const explanation = String(guide.explanation ?? "").trim();
  if (explanation) out.push(`## ${t("explanation")}\n\n${explanation}`);
  const screens = files.filter((file) => file.step === null);
  if (screens.length)
    out.push(
      `## ${t("screens")}\n\n${screens.map((file) => image(file, false)).join("\n\n")}`,
    );
  const steps = guide.steps ?? [];
  if (steps.length) {
    const lines = steps.map((step, i) => {
      const n = Number.isInteger(step?.n) && step.n > 0 ? step.n : i + 1;
      const indent = " ".repeat(String(n).length + 2);
      const title = oneLine(step?.title);
      const text = String(step?.text ?? "").trim();
      const body = [title ? `**${title}**` : "", ...(text ? [text] : [])].join(
        title && text ? "\n" : "",
      );
      const file = files.find((f) => f.step === n);
      const parts = [`${n}. ${body.replace(/\n/g, `\n${indent}`)}`];
      if (file) parts.push(`${indent}${image(file, true)}`);
      return parts.join("\n\n");
    });
    out.push(`## ${t("steps")}\n\n${lines.join("\n\n")}`);
  }
  return `${out.join("\n\n")}\n`;
}

async function makeFolder(parent, base) {
  await fsp.mkdir(parent, { recursive: true });
  for (let copy = 1; copy <= MAX_COPIES; copy++) {
    const folder = join(parent, copy === 1 ? base : `${base} (${copy})`);
    try {
      await fsp.mkdir(folder);
      return folder;
    } catch (error) {
      if (error.code !== "EEXIST") throw error;
    }
  }
  throw new Error(`Too many guides named ${base}`);
}

/** guide = { title, explanation, language, steps: [{ n, title, text }],
 * screenshots: [{ data, width, height, step? }] }, where data is a base64 PNG
 * already annotated by the pointing engine. Resolves { folder, markdown,
 * revealed }. */
export async function saveGuide(guide, options = {}) {
  const {
    now = Date.now,
    documents = (await import("electron")).app.getPath("documents"),
    reveal = (await import("electron")).shell.showItemInFolder,
  } = options;
  const t = guideStrings(guide.language ? [guide.language] : []);
  // Decode everything first so a bad screenshot creates nothing.
  const files = plan(
    guide,
    (guide.screenshots ?? []).map((shot, i) => decodePng(shot?.data, i)),
  );
  const text = markdown(guide, files, t);
  const folder = await makeFolder(
    join(documents, GUIDES_DIR),
    folderName(guide.title, new Date(now()), t("untitled")),
  );
  try {
    for (const file of files)
      await fsp.writeFile(join(folder, file.file), file.bytes);
    // Last, so a guide.md on disk means the images beside it are complete.
    await fsp.writeFile(join(folder, "guide.md"), text);
  } catch (error) {
    await fsp.rm(folder, { recursive: true, force: true });
    throw error;
  }
  let revealed = true;
  try {
    await reveal(folder);
  } catch {
    revealed = false;
  }
  return { folder, markdown: join(folder, "guide.md"), revealed };
}
