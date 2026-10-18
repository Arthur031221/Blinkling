// The code checks of the rows no recording can decide. Each entry is a list of
// functions that return "" for a pass or the reason for a fail, built from the kit
// walk-check.mjs passes in.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const READMES = [
  "README.md",
  ..."de es fr ja ko pt-BR zh-CN zh-TW".split(" ").map((l) => `README.${l}.md`),
];

export const checks = (k) => {
  const {
    spec,
    gif,
    has,
    hasNot,
    unit,
    run,
    mac,
    must,
    files,
    read,
    root,
    R3,
  } = k;
  const vitest = (file) => run("npx", ["vitest", "run", file], file);
  const text = (file) => read(file);
  const perf = () => {
    const file = join(R3, "perf.json");
    if (!existsSync(file)) return "perf.json is missing";
    const { scales = {}, budget = {} } = JSON.parse(readFileSync(file, "utf8"));
    const need = [
      "guide",
      "auto_explain",
      "fullpage",
      "typing",
      "drag_card",
      "language",
      "eat_left",
      "eat_right",
      "eat_top",
      "eat_bottom",
      "card_resize",
      "answer_code",
      "costume_low",
      "costume_medium",
      "costume_high",
      "costume_xhigh",
      "costume_max",
    ];
    const limit = budget.frame_p95_ms + budget.frame_p95_tolerance_ms;
    const bad = [];
    for (const scale of ["100%", "200%"])
      for (const row of need) {
        const r = scales[scale]?.[row];
        if (!r) bad.push(`${row} at ${scale} is missing`);
        else if (r.frame_p95_ms > limit || r.frames_over_50_ms > 0)
          bad.push(`${row} at ${scale} is over the budget`);
      }
    return bad.slice(0, 3).join("; ");
  };
  const launch = () => {
    const f = join(R3, "launch.md");
    if (!existsSync(f)) return "launch.md is missing";
    const t = readFileSync(f, "utf8");
    return /Blink not running/.test(t) && /Blink already running/.test(t)
      ? ""
      : "launch.md has no cold and warm numbers";
  };
  return {
    same_origin: [
      unit("desktop/main/placement.test.mjs"),
      must(
        () => has("desktop/main/placement.test.mjs", /\[25, 38\]/),
        "no (0,25) and (0,38) origin case",
      ),
      mac("same_origin"),
    ],
    costume_win_shape: [
      unit("desktop/main/shape.test.mjs"),
      mac("costume_win_shape"),
      spec("winbubbles.spec.mjs"),
    ],
    win_bubbles: [unit("desktop/main/shape.test.mjs"), mac("win_bubbles")],
    fullpage_extension: [
      must(
        () => existsSync(join(root, "e2e-extension/fullpage.spec.ts")),
        "e2e-extension/fullpage.spec.ts is missing",
      ),
      gif("fullpage_extension-324.gif"),
    ],
    capture_hide_linux: [
      spec("capturehide.spec.mjs"),
      gif("capture_hide_clean-324.gif"),
    ],
    capture_exclude: [
      unit("desktop/capture/exclusion.test.mjs"),
      must(
        () =>
          has(
            "desktop/capture/exclusion.mjs",
            /setContentProtection\(true\)/,
          ) &&
          has("desktop/capture/exclusion.mjs", /darwin/) &&
          has("desktop/capture/exclusion.mjs", /win32/),
        "content protection is not kept for darwin and win32",
      ),
      mac("capture_exclude"),
    ],
    readme_composer_text: [
      must(
        () =>
          [...READMES, "demo/index.html", "docs/FEATURES.md"].every(
            (f) =>
              !/small composer|mini composer|quick box|mini[- ]?box/i.test(
                text(f),
              ),
          ),
        "a README, the demo or FEATURES still names the small composer or quick box",
      ),
    ],
    mac_first_notice: [
      unit("desktop/main/startup.test.mjs"),
      unit("desktop/pick/install.test.mjs"),
      mac("mac_first_notice"),
    ],
    mac_bgclick_noperm: [
      unit("desktop/main/clickaway.test.mjs"),
      unit("desktop/pick/install.test.mjs"),
      mac("mac_bgclick_noperm"),
    ],
    keys_note: [unit("desktop/pick/install.test.mjs"), mac("keys_note")],
    hit_scale_test: [
      unit("desktop/main/hit-scale.test.mjs"),
      unit("desktop/main/cursor.test.mjs"),
      mac("hit_scale_test"),
    ],
    translate_caption: [
      must(
        () =>
          /translate/i.test(text("README.md")) &&
          existsSync(join(root, "assets/translate.webp")) &&
          existsSync(join(root, "assets/site/translate.mp4")),
        "the translate demo or its video is missing",
      ),
    ],
    webp_guard: [
      run(
        "python3",
        [".github/workflows/check-release.py"],
        "check-release.py",
      ),
      must(
        () =>
          has("scripts/store-assets.test.mjs", /README demo guard/) &&
          has(".github/workflows/webp_guard.py", /MIN_WIDTH = 1280/),
        "the demo size guard or its test is missing",
      ),
    ],
    readme_demos: [
      run(
        "python3",
        [".github/workflows/check-release.py"],
        "check-release.py",
      ),
      must(
        () =>
          ["pick", "ask", "translate", "tour"].every(
            (n) =>
              existsSync(join(root, `assets/${n}.webp`)) &&
              existsSync(join(root, `assets/site/${n}.mp4`)) &&
              existsSync(join(root, `assets/site/${n}.webm`)),
          ),
        "a demo is missing as WebP, MP4 or WebM",
      ),
    ],
    pick_light: [spec("pickframe.spec.mjs")],
    mcp_hints: [vitest("bridge/test/tool-annotations.test.ts")],
    perf_cover: [perf],
    launch_turn: [
      launch,
      unit("plugin/desktop/notice.test.mjs"),
      must(
        () =>
          has("plugin/desktop/notice.mjs", /openBlink\(payload\)/) &&
          has("hooks/hooks.json", /UserPromptSubmit/),
        "the UserPromptSubmit hook does not start Blink",
      ),
    ],
    pointing_nouns: [
      must(
        () => has("desktop/pointing/elements.mjs", /right after that name/),
        "the pointing instructions do not put the mark after the noun",
      ),
      unit("desktop/pointing/elements.test.mjs"),
    ],
    dead_css: [
      must(
        () =>
          hasNot("desktop", /\.css$/, /:has\(\.gl-guide\)/) &&
          hasNot("extension", /\.css$/, /:has\(\.gl-guide\)/),
        "a :has(.gl-guide) rule is left",
      ),
    ],
    no_length_limit: [
      vitest("bridge/test/answer-length.test.ts"),
      must(
        () =>
          hasNot(
            "desktop/pick",
            /strings\.mjs$/,
            /\b\d+\s+words?\b|\b(concise|briefly)\b/i,
          ) &&
          hasNot(
            "extension",
            /\.(ts|tsx|js|mjs)$/,
            /\b\d+\s+words?\b|\b(concise|briefly)\b/i,
          ),
        "a prompt string limits the length",
      ),
    ],
    brand_assets: [
      run(
        "python3",
        [".github/workflows/check-release.py"],
        "check-release.py",
      ),
      run("npm", ["run", "check:name"], "check:name"),
    ],
    no_mcp_badges: [
      must(
        () =>
          READMES.every(
            (f) =>
              !/smithery|glama\.ai|mcp\.so|pulsemcp|mcpservers\.org|mcp-badge/i.test(
                text(f),
              ),
          ) &&
          hasNot(
            "site",
            /\.(html|md|mjs)$/,
            /smithery|glama\.ai|mcp\.so|pulsemcp|mcpservers\.org/i,
          ),
        "a third party MCP directory listing or badge is claimed",
      ),
    ],
    rig_style: [spec("parts.spec.mjs"), spec("costumerows324.spec.mjs")],
    motion_rules: [
      spec("grumble.spec.mjs"),
      spec("hover.spec.mjs"),
      spec("motions.spec.mjs"),
      spec("eatmouth.spec.mjs"),
    ],
  };
};
