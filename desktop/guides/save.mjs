import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { pickLocale } from "../shared/i18n.mjs";
import { guideText } from "./strings.mjs";

/** Save a guide (K4, narrowed by N2.4): a Markdown file and the annotated
 * screenshots under Documents/Blinkling Guides. Local only. Nothing about the
 * guide is kept for replay and no list of saved guides exists: the folder on
 * disk is the whole record. */
const FOLDER = "Blinkling Guides";
const MAX_NAME = 60;
const PNG_SIGNATURE = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
]);
const RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;

/** One safe folder level: no separators or characters Windows refuses, no
 * control characters, no leading or trailing dots or spaces, no reserved
 * Windows device name, at most MAX_NAME whole characters. */
export function safeFolderName(title, fallback) {
  const clean = (text) =>
    text
      .replace(/[\u0000-\u001f\u007f<>:"/\\|?*]/g, " ")
      .replace(/\s+/g, " ")
      .replace(/^[\s.]+|[\s.]+$/g, "");
  let name = clean(typeof title === "string" ? title : "");
  name = clean([...name].slice(0, MAX_NAME).join(""));
  if (!name) return fallback;
  return RESERVED.test(name.split(".")[0].trim()) ? `_${name}` : name;
}

const pad = (n) => String(n).padStart(2, "0");
function stamp(time) {
  const d = new Date(time);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}.${pad(d.getMinutes())}`;
}

function decodePng(shot, index) {
  if (!shot || typeof shot.data !== "string")
    throw new TypeError(`Screenshot ${index + 1} has no image data`);
  const bytes = Buffer.from(
    shot.data.replace(/^data:image\/png;base64,/i, ""),
    "base64",
  );
  if (
    bytes.length < 33 ||
    !bytes.subarray(0, 8).equals(PNG_SIGNATURE) ||
    bytes.toString("latin1", 12, 16) !== "IHDR"
  )
    throw new TypeError(`Screenshot ${index + 1} is not a PNG image`);
  return bytes;
}

/** Number the steps in order, keeping the guide's own `n` when it is a
 * positive whole number nobody used yet. */
function numberSteps(steps) {
  const used = new Set();
  let next = 1;
  return steps.map((step) => {
    let n = step?.n;
    if (!Number.isInteger(n) || n < 1 || used.has(n)) {
      while (used.has(next)) next++;
      n = next;
    }
    used.add(n);
    return {
      n,
      title: String(step?.title ?? "")
        .replace(/\s+/g, " ")
        .trim(),
      text: String(step?.text ?? "").trim(),
    };
  });
}

/** Decide every image's file name before anything is written. A screenshot
 * that names one of the steps goes beside it as step-<n>.png, the rest are
 * whole-screen overviews, screen-<i>.png. */
function planImages(screenshots, steps) {
  const stepNumbers = new Set(steps.map((s) => s.n));
  const taken = new Set();
  let screens = 0;
  return screenshots.map((shot, index) => {
    const bytes = decodePng(shot, index);
    if (stepNumbers.has(shot.step) && !taken.has(shot.step)) {
      taken.add(shot.step);
      return { bytes, step: shot.step, file: `step-${shot.step}.png` };
    }
    screens++;
    return { bytes, screen: screens, file: `screen-${screens}.png` };
  });
}

function render(guide, steps, images, title, t) {
  const lines = [`# ${title}`, ""];
  const explanation = String(guide.explanation ?? "").trim();
  if (explanation) lines.push(explanation, "");
  for (const image of images.filter((i) => i.screen))
    lines.push(`![${t("screenAlt", { n: image.screen })}](${image.file})`, "");
  if (steps.length) lines.push(`## ${t("steps")}`, "");
  for (const step of steps) {
    lines.push(`### ${step.n}. ${step.title}`.trimEnd(), "");
    if (step.text) lines.push(step.text, "");
    const image = images.find((i) => i.step === step.n);
    if (image)
      lines.push(`![${t("stepAlt", { n: step.n })}](${image.file})`, "");
  }
  return lines.join("\n");
}

/** A folder only this call created, never one that already exists. */
async function createFolder(root, name) {
  await mkdir(root, { recursive: true });
  for (let attempt = 1; attempt < 1000; attempt++) {
    const folder = join(root, attempt === 1 ? name : `${name} (${attempt})`);
    try {
      await mkdir(folder);
      return folder;
    } catch (error) {
      if (error.code !== "EEXIST") throw error;
    }
  }
  throw new Error("Could not find a free folder name for the guide");
}

export async function saveGuide(
  guide,
  { documents, reveal, now = Date.now } = {},
) {
  if (!guide || typeof guide !== "object")
    throw new TypeError("A guide is required");
  if (guide.steps !== undefined && !Array.isArray(guide.steps))
    throw new TypeError("steps must be a list");
  if (guide.screenshots !== undefined && !Array.isArray(guide.screenshots))
    throw new TypeError("screenshots must be a list");

  const t = guideText(pickLocale([guide.language]));
  const title =
    String(guide.title ?? "")
      .replace(/\s+/g, " ")
      .trim() || t("untitled");
  const steps = numberSteps(guide.steps ?? []);
  const images = planImages(guide.screenshots ?? [], steps);
  const markdown = render(guide, steps, images, title, t);

  if (documents === undefined || reveal === undefined) {
    const { app, shell } = await import("electron");
    documents ??= app.getPath("documents");
    reveal ??= (folder) => shell.showItemInFolder(folder);
  }
  const folder = await createFolder(
    join(documents, FOLDER),
    `${stamp(now())} ${safeFolderName(guide.title, t("untitled"))}`,
  );
  try {
    await Promise.all([
      writeFile(join(folder, "guide.md"), markdown, "utf8"),
      ...images.map((i) => writeFile(join(folder, i.file), i.bytes)),
    ]);
  } catch (error) {
    await rm(folder, { recursive: true, force: true });
    throw error;
  }
  let revealed = true;
  try {
    await reveal(folder);
  } catch {
    revealed = false; // the guide is saved either way
  }
  return { folder, markdown: join(folder, "guide.md"), revealed };
}
