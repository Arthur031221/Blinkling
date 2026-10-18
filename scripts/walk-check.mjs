#!/usr/bin/env node
// The mechanical half of the acceptance walk. It reads the master checklist, the
// Playwright JSON report of the real-app acceptance suite and the recordings that
// suite wrote, runs the code checks of the rows no recording can show, and prints
// PASS or FAIL per row id. JUDGEMENT rows are PASS only when a person has also
// written what they saw into the notes file, so a model looks at the few frames
// that matter and nothing else.
//
//   node scripts/walk-check.mjs [--report /tmp/walk/report.json] [--since <epoch>]
//        [--notes <file>] [--out verify-324.md] [--tiles <row id>] [--json]
import { execFileSync, spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { checks } from "./walk-rows.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const arg = (name, fallback) => {
  const at = process.argv.indexOf(`--${name}`);
  return at < 0 ? fallback : (process.argv[at + 1] ?? true);
};
const R3 =
  process.env.BLINKLING_R3_DIR ?? "/home/levi/oss-engine/reports/glimpse-v3/r3";
const checklist = arg("checklist", join(R3, "checklist-324.md"));
const reportFile = arg("report", "/tmp/walk/report.json");
const since = Number(arg("since", 0));
const notesFile = arg("notes", join(R3, "walk-notes-324.json"));
const suffix = arg("suffix", "-324");

/** Rows only a person looking at the frame can decide; the rest a number, a box,
 * a pixel region, a text or a test assertion decides. */
const JUDGEMENT = new Set(
  (
    "answer_format costume_fit costume_scene effort_shows costume_combine guide_v1 guide_steps " +
    "guide_frames_card card_fade pick_light grumble hover_parts rig_style motion_rules brand_assets " +
    "readme_demos think_motion leave_motion user_right_ai_left card_surface edge_tilt eat_mouth " +
    "eat_edges translate_caption welcome_pages empty_card"
  ).split(" "),
);
/** Rows that are the walk itself or that only the chat or the release can set. */
const GATES = new Set(["verify", "chat_recheck", "release", "verify_gate"]);

const read = (file) => readFileSync(join(root, file), "utf8");
const files = (dir, test) =>
  readdirSync(join(root, dir), { recursive: true })
    .map(String)
    .filter((f) => test.test(f))
    .map((f) => join(dir, f));

const rows = [];
for (const line of readFileSync(checklist, "utf8").split("\n")) {
  const m = /^\| ([a-z0-9_]+) \|/.exec(line);
  if (!m || m[1] === "id") continue;
  const cols = line
    .trim()
    .replace(/^\||\|$/g, "")
    .split("|")
    .map((c) => c.trim());
  rows.push({ id: cols[0], platform: cols[cols.length - 1] });
}

// ---- the real-app suite -------------------------------------------------
const tests = [];
if (existsSync(reportFile)) {
  const walk = (suite) => {
    for (const spec of suite.specs ?? [])
      for (const t of spec.tests ?? [])
        tests.push({
          file: basename(spec.file),
          title: spec.title,
          ok: (t.results ?? []).at(-1)?.status === "passed",
        });
    for (const s of suite.suites ?? []) walk(s);
  };
  for (const s of JSON.parse(readFileSync(reportFile, "utf8")).suites ?? [])
    walk(s);
}
const specFiles = files("desktop/main/acceptance", /\.spec\.mjs$/);
const specText = Object.fromEntries(
  specFiles.map((f) => [basename(f), read(f)]),
);
const specsOf = (id) => {
  const strict = specsOfStrict(id);
  if (strict.length) return strict;
  return Object.entries(specText)
    .filter(([, text]) => new RegExp(`\\b${id}\\b`).test(text))
    .map(([f]) => f);
};
const specsOfStrict = (id) =>
  Object.entries(specText)
    .filter(
      ([, text]) =>
        new RegExp(`record\\(\\s*["'\`]${id}["'\`]`).test(text) ||
        new RegExp(`also:\\s*\\[[^\\]]*["'\`]${id}["'\`]`).test(text) ||
        new RegExp(`(^|[\`"'])${id}:`, "m").test(text),
    )
    .map(([f]) => f);

// ---- recordings ---------------------------------------------------------
const recordings = (id) =>
  readdirSync(R3)
    .filter((f) => f.endsWith(".gif"))
    .filter(
      (f) => f === `${id}${suffix}.gif` || f.startsWith(`${id}${suffix}-`),
    )
    .map((f) => join(R3, f));
const probe = (gif) => {
  const out = spawnSync(
    "ffprobe",
    [
      "-v",
      "error",
      "-count_frames",
      "-select_streams",
      "v:0",
      "-show_entries",
      "stream=width,height,nb_read_frames",
      "-of",
      "csv=p=0",
      gif,
    ],
    { encoding: "utf8" },
  ).stdout.trim();
  const [w, h, n] = out.split(",").map(Number);
  const stats = spawnSync(
    "ffmpeg",
    [
      "-v",
      "error",
      "-i",
      gif,
      "-vf",
      "signalstats,metadata=print:file=-",
      "-f",
      "null",
      "-",
    ],
    { encoding: "utf8", maxBuffer: 1 << 28 },
  ).stdout;
  const num = (key) =>
    [...stats.matchAll(new RegExp(`${key}=([0-9.]+)`, "g"))].map((m) => +m[1]);
  const dif = num("lavfi.signalstats.YDIF");
  const lo = num("lavfi.signalstats.YMIN");
  const hi = num("lavfi.signalstats.YMAX");
  const range = hi.length ? Math.max(...hi) - Math.min(...lo) : 0;
  return { w, h, n, moves: dif.some((d) => d > 0.05), range };
};
const recordingProblem = (id) => {
  const gifs = recordings(id);
  if (!gifs.length) return "no recording";
  for (const gif of gifs) {
    if (since && statSync(gif).mtimeMs / 1000 < since)
      return `stale recording ${basename(gif)}`;
    const p = probe(gif);
    if (!(p.n >= 5)) return `${basename(gif)} has ${p.n} frames`;
    if (!p.moves) return `${basename(gif)} never changes`;
    if (p.range < 20) return `${basename(gif)} is blank`;
  }
  return "";
};

// ---- code checks for the rows no recording can show --------------------
const has = (file, re) => re.test(read(file));
const hasNot = (dir, test, re) =>
  files(dir, test).every((f) => !re.test(read(f)));
const unit = (file) => () => {
  const r = spawnSync(
    process.execPath,
    ["--import", "./desktop/shared/test-env.mjs", "--test", file],
    { cwd: root, encoding: "utf8" },
  );
  return r.status === 0 ? "" : `${file} fails`;
};
const run = (cmd, args, label) => () => {
  const r = spawnSync(cmd, args, { cwd: root, encoding: "utf8" });
  return r.status === 0
    ? ""
    : `${label ?? cmd} fails: ${(r.stdout + r.stderr).trim().split("\n").at(-1)}`;
};
const mac = (key) => () =>
  new RegExp(`^- \\[.\\] ${key}\\b`, "m").test(
    readFileSync(join(R3, "mac-checks.md"), "utf8"),
  )
    ? ""
    : `mac-checks.md has no line for ${key}`;
const must = (ok, msg) => () => (ok() ? "" : msg);
/** A whole acceptance spec file passed in the report. */
const spec = (file) => () => {
  if (!tests.length) return "";
  const mine = tests.filter((t) => t.file === file);
  if (!mine.length) return `${file} did not run`;
  const bad = mine.filter((t) => !t.ok);
  return bad.length ? `${file}: ${bad[0].title.slice(0, 60)} failed` : "";
};
/** A recording by its file name, fresh and with something moving in it. */
const gif = (name) => () => {
  const f = join(R3, name);
  if (!existsSync(f)) return `${name} is missing`;
  if (since && statSync(f).mtimeMs / 1000 < since) return `${name} is stale`;
  const p = probe(f);
  return p.n >= 5 && p.moves && p.range >= 20 ? "" : `${name} shows nothing`;
};
const kit = {
  spec,
  gif,
  read,
  has,
  hasNot,
  unit,
  run,
  mac,
  must,
  files,
  root,
  R3,
};
const table = checks(kit);

// ---- tiles for the judgement rows --------------------------------------
if (arg("tiles", "")) {
  mkdirSync("/tmp/walk/tiles", { recursive: true });
  for (const gif of recordings(arg("tiles"))) {
    const out = `/tmp/walk/tiles/${basename(gif, ".gif")}.png`;
    execFileSync("ffmpeg", [
      "-v",
      "error",
      "-y",
      "-i",
      gif,
      "-vf",
      `select='not(mod(n\\,${Math.max(1, Math.floor(probe(gif).n / 6))}))',scale=640:-1,tile=3x2`,
      "-frames:v",
      "1",
      out,
    ]);
    console.log(out);
  }
  process.exit(0);
}

// ---- the table ----------------------------------------------------------
const notes = existsSync(notesFile)
  ? JSON.parse(readFileSync(notesFile, "utf8"))
  : {};
const out = [];
for (const row of rows) {
  const gate = GATES.has(row.id);
  const klass = gate
    ? "GATE"
    : JUDGEMENT.has(row.id)
      ? "JUDGEMENT"
      : "MECHANICAL";
  const why = [];
  const sp = specsOf(row.id);
  const ran = tests.filter((t) => sp.includes(t.file));
  if (sp.length && tests.length && !ran.length) why.push("spec did not run");
  for (const t of ran.filter((t) => !t.ok))
    why.push(`${t.file}: ${t.title.slice(0, 60)} failed`);
  const own = table[row.id] ?? [];
  if (!gate && (sp.length || recordings(row.id).length)) {
    const p = recordingProblem(row.id);
    if (p) why.push(p);
  }
  why.push(...own.map((c) => c()).filter(Boolean));
  if (!gate && !sp.length && !own.length)
    why.push("no check is defined for this row");
  if (klass === "JUDGEMENT" && !notes[row.id]) why.push("not looked at yet");
  out.push({
    ...row,
    klass,
    sp,
    recs: recordings(row.id).map((f) => basename(f)),
    result: gate ? "GATE" : why.length ? "FAIL" : "PASS",
    why,
    note: notes[row.id] ?? "",
  });
}

if (arg("json", false)) {
  console.log(JSON.stringify(out, null, 1));
} else {
  for (const r of out)
    console.log(
      `${r.result.padEnd(5)} ${r.klass.padEnd(10)} ${r.id.padEnd(28)} ${r.why.join("; ")}`,
    );
  const count = (k) => out.filter((r) => r.result === k).length;
  console.log(
    `\n${rows.length} rows: ${count("PASS")} PASS, ${count("FAIL")} FAIL, ${count("GATE")} gate`,
  );
}
const target = arg("out", "");
if (target) {
  const n = (k) => out.filter((r) => r.klass === k).length;
  const lines = [
    "# Verification walk (checklist-324.md)",
    "",
    `Row classification: MECHANICAL ${n("MECHANICAL")}, JUDGEMENT ${n("JUDGEMENT")}, GATE ${n("GATE")}. MECHANICAL rows are decided by \`node scripts/walk-check.mjs\` (the Playwright report of the real-app suite, a check of each recording, code checks). A JUDGEMENT row is PASS only with the note of a person who looked at its frames. GATE rows are set by the walk itself, the chat re-check and the release.`,
    "",
    "| row | class | platform | result | recordings | evidence |",
    "| --- | --- | --- | --- | --- | --- |",
    ...out.map(
      (r) =>
        `| ${r.id} | ${r.klass} | ${r.platform} | ${r.result} | ${r.recs.join(", ") || "-"} | ${(r.why.join("; ") || r.note || (r.sp.length ? `spec ${r.sp.join(", ")}` : "code check")).replace(/\|/g, "/")} |`,
    ),
    "",
  ];
  writeFileSync(target, lines.join("\n"));
}
process.exit(out.some((r) => r.result === "FAIL") ? 1 : 0);
