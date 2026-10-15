import { afterEach, describe, expect, it } from "vitest";
import { copyFile, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { syncDistribution } from "./sync-distribution.mjs";

const { version: releaseVersion } = JSON.parse(
  await readFile(join(process.cwd(), "package.json"), "utf8"),
);

const readmeFiles = [
  "README.md",
  "README.de.md",
  "README.es.md",
  "README.fr.md",
  "README.ja.md",
  "README.ko.md",
  "README.pt-BR.md",
  "README.zh-CN.md",
  "README.zh-TW.md",
];

const localizedLabels = [
  ["Install from the Chrome Web Store", "Install from Microsoft Edge Add-ons"],
  [
    "Im Chrome Web Store installieren",
    "Bei Microsoft Edge-Add-ons installieren",
  ],
  ["Instalar desde Chrome Web Store", "Instalar desde Microsoft Edge Add-ons"],
  [
    "Installer depuis le Chrome Web Store",
    "Installer depuis Microsoft Edge Add-ons",
  ],
  [
    "Chrome ウェブストアからインストール",
    "Microsoft Edge アドオンからインストール",
  ],
  ["Chrome 웹 스토어에서 설치", "Microsoft Edge 추가 기능에서 설치"],
  [
    "Instalar pela Chrome Web Store",
    "Instalar pelos Complementos do Microsoft Edge",
  ],
  ["从 Chrome 网上应用店安装", "从 Microsoft Edge 加载项安装"],
  ["從 Chrome 線上應用程式商店安裝", "從 Microsoft Edge Add-ons 安裝"],
];

let temporaryRoot;

async function makeCopy(config) {
  temporaryRoot = await mkdtemp(join(tmpdir(), "blinkling-distribution-"));
  await writeFile(join(temporaryRoot, "config.json"), JSON.stringify(config));
  for (const file of readmeFiles)
    await copyFile(join(process.cwd(), file), join(temporaryRoot, file));
  return temporaryRoot;
}

async function readReadmes(root) {
  return Promise.all(
    readmeFiles.map((file) => readFile(join(root, file), "utf8")),
  );
}

function advancedSection(content) {
  const start = content.indexOf("\n### ");
  expect(start).toBeGreaterThan(-1);
  const end = content.indexOf("\n## ", start + 1);
  return content.slice(start, end === -1 ? undefined : end);
}

// Run from a checkout, without relying on a marketplace or an installed plugin.
const sourceBootstrap = `npm ci
npm run build:plugin
claude plugin validate .
node -p "require('./.claude-plugin/plugin.json').version"
node -p "require('./dist-extension/manifest.json').version"
claude --plugin-dir "$PWD" plugin list
claude --plugin-dir "$PWD" plugin details blinkling
node -p "require('./bin/extension/manifest.json').version"
claude --plugin-dir "$PWD"`;

const automaticExplanationLabels = [
  "Auto explain",
  "Automatisch erklären",
  "Explicar automáticamente",
  "Explication automatique",
  "自動解説",
  "자동 설명",
  "Explicação automática",
  "自动解说",
  "自動解說",
];
const passwordFieldChecks = [
  /password/i,
  /Passwort/i,
  /contraseña/i,
  /mot de passe/i,
  /パスワード/,
  /비밀번호/,
  /senha/i,
  /密码/,
  /密碼/,
];

afterEach(async () => {
  if (temporaryRoot) await rm(temporaryRoot, { recursive: true, force: true });
  temporaryRoot = undefined;
});

describe("distribution README sync", () => {
  it.each(readmeFiles)(
    "provides a complete checkout plugin bootstrap in %s",
    async (file) => {
      const content = await readFile(join(process.cwd(), file), "utf8");
      const advanced = advancedSection(content);
      expect(advanced).toContain(sourceBootstrap);
      expect(advanced).toContain("/blinkling:blinkling");
      expect(advanced).toContain(releaseVersion);
      expect(advanced).toContain("~/Blinkling-extension");
      expect(advanced).toContain("chrome://extensions");
      expect(content.slice(0, content.indexOf("\n### "))).toContain(
        "/plugin marketplace add Arthur031221/Glimpselet",
      );
      expect(content.trimEnd().split("\n").at(-1)).toBe(
        "Assisted by Claude/Codex.",
      );
    },
  );

  it("provides the same checkout bootstrap in the detailed install guide", async () => {
    const content = await readFile(
      join(process.cwd(), "docs/INSTALL.md"),
      "utf8",
    );
    expect(content).toContain(sourceBootstrap);
    expect(content).toContain(releaseVersion);
  });

  it.each(readmeFiles)(
    "says in %s that the browser helper skips password fields and auto explain starts off",
    async (file) => {
      const content = await readFile(join(process.cwd(), file), "utf8");
      const privacy = content.slice(content.lastIndexOf("\n## "));
      const index = readmeFiles.indexOf(file);
      expect(privacy).toMatch(passwordFieldChecks[index]);
      expect(privacy).toContain(automaticExplanationLabels[index]);
    },
  );

  it("leaves all README bytes untouched when both store URLs are empty", async () => {
    const root = await makeCopy({ chromeWebStoreUrl: "", edgeAddonsUrl: "" });
    const before = await readReadmes(root);

    await syncDistribution({ root, configPath: join(root, "config.json") });

    expect(await readReadmes(root)).toEqual(before);
  });

  it("adds localized links, removes developer warnings, and preserves advanced source steps", async () => {
    const root = await makeCopy({
      chromeWebStoreUrl:
        "https://chromewebstore.google.com/detail/blinkling/example",
      edgeAddonsUrl:
        "https://microsoftedge.microsoft.com/addons/detail/blinkling/example",
    });

    await syncDistribution({ root, configPath: join(root, "config.json") });
    const synced = await readReadmes(root);

    expect(synced).toHaveLength(9);
    for (const [index, content] of synced.entries()) {
      expect(content).toContain("<!-- blinkling-store-install:start -->");
      expect(content).toContain(localizedLabels[index][0]);
      expect(content).toContain(localizedLabels[index][1]);
      expect(content).toContain(
        "chromewebstore.google.com/detail/blinkling/example",
      );
      expect(content).toContain(
        "microsoftedge.microsoft.com/addons/detail/blinkling/example",
      );
      expect(content).not.toMatch(
        new RegExp(`^[ \\t]*>.*${WARNING_MARKER.source}`, "im"),
      );
      const advancedStart = content.indexOf("###");
      const advancedEnd = content.indexOf("\n## ", advancedStart);
      const advanced = content.slice(advancedStart, advancedEnd);
      expect(advanced).toContain(sourceBootstrap);
      expect(advanced).toContain("~/Blinkling-extension");
      expect(advanced).toContain("chrome://extensions");
      expect(content.slice(0, advancedStart)).not.toContain("Load unpacked");
      expect(content.slice(0, advancedStart)).not.toContain("37115");
      expect(content.slice(0, advancedStart)).toContain("3.");
      // Store users update through their browser; source loading and manual
      // replacement belong only in Advanced after distribution is configured.
      expect(
        content.slice(0, advancedStart) + content.slice(advancedEnd),
      ).not.toContain("~/Blinkling-extension");
      expect(content.slice(advancedEnd)).not.toMatch(
        /developer banner|Entwicklermodus-Hinweis|개발자 배너|开发者提示|開發者提示/,
      );
      expect(content.trimEnd().endsWith("Assisted by Claude/Codex.")).toBe(
        true,
      );
    }

    await syncDistribution({ root, configPath: join(root, "config.json") });
    expect(await readReadmes(root)).toEqual(synced);
  });

  it("rejects non-HTTPS and non-store URLs before changing temporary READMEs", async () => {
    const root = await makeCopy({
      chromeWebStoreUrl: "http://chromewebstore.google.com/detail/example",
      edgeAddonsUrl: "",
    });
    const before = await readReadmes(root);

    await expect(
      syncDistribution({ root, configPath: join(root, "config.json") }),
    ).rejects.toThrow("approved HTTPS store URL");
    expect(await readReadmes(root)).toEqual(before);
  });
});

const WARNING_MARKER =
  /(?:developer mode|entwicklermodus|mode développeur|modo de desarrollador|デベロッパーモード|개발자 모드|modo de desenvolvedor|开发者模式|開發人員模式)/i;

function advancedSource(content) {
  const start = content.search(/^### /m);
  const following = content.slice(start).search(/\n## /);
  return content.slice(start, following < 0 ? undefined : start + following);
}

function expectCheckoutInstructions(content) {
  const advanced = advancedSource(content);
  const commands = [...advanced.matchAll(/```sh\n([\s\S]*?)\n```/g)]
    .map((match) => match[1])
    .join("\n");
  expect(commands).toMatch(/npm ci\s+\n?npm run build:plugin/);
  expect(commands).toContain("claude plugin validate .");
  expect(commands).toMatch(
    /node -p [^\n]*\.claude-plugin\/plugin\.json[^\n]*\.version/,
  );
  expect(commands).toMatch(
    /node -p [^\n]*dist-extension\/manifest\.json[^\n]*\.version/,
  );
  expect(commands).toContain('claude --plugin-dir "$PWD"');
  expect(commands.indexOf("npm run build:plugin")).toBeLessThan(
    commands.indexOf('claude --plugin-dir "$PWD"'),
  );
  expect(advanced).toContain("/blinkling:blinkling");
  expect(advanced).toContain(releaseVersion);
  expect(advanced).toContain("dist-extension");
  expect(content.trimEnd().endsWith("Assisted by Claude/Codex.")).toBe(true);
}

describe("source checkout instructions", () => {
  for (const file of readmeFiles) {
    it(`${file} builds and loads its local plugin before starting Blinkling`, async () => {
      expectCheckoutInstructions(
        await readFile(join(process.cwd(), file), "utf8"),
      );
    });
  }

  it("preserves the complete checkout recipe when store links are configured", async () => {
    const root = await makeCopy({
      chromeWebStoreUrl:
        "https://chromewebstore.google.com/detail/blinkling/example",
      edgeAddonsUrl:
        "https://microsoftedge.microsoft.com/addons/detail/blinkling/example",
    });
    await syncDistribution({ root, configPath: join(root, "config.json") });
    for (const content of await readReadmes(root))
      expectCheckoutInstructions(content);
  });
});
