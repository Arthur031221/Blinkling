import { afterEach, describe, expect, it } from "vitest";
import { copyFile, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { syncDistribution } from "./sync-distribution.mjs";

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
  temporaryRoot = await mkdtemp(join(tmpdir(), "glimpselet-distribution-"));
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

afterEach(async () => {
  if (temporaryRoot) await rm(temporaryRoot, { recursive: true, force: true });
  temporaryRoot = undefined;
});

describe("distribution README sync", () => {
  it("leaves all README bytes untouched when both store URLs are empty", async () => {
    const root = await makeCopy({ chromeWebStoreUrl: "", edgeAddonsUrl: "" });
    const before = await readReadmes(root);

    await syncDistribution({ root, configPath: join(root, "config.json") });

    expect(await readReadmes(root)).toEqual(before);
  });

  it("adds localized links, removes developer warnings, and preserves advanced source steps", async () => {
    const root = await makeCopy({
      chromeWebStoreUrl:
        "https://chromewebstore.google.com/detail/glimpselet/example",
      edgeAddonsUrl:
        "https://microsoftedge.microsoft.com/addons/detail/glimpselet/example",
    });

    await syncDistribution({ root, configPath: join(root, "config.json") });
    const synced = await readReadmes(root);

    expect(synced).toHaveLength(9);
    for (const [index, content] of synced.entries()) {
      expect(content).toContain("<!-- glimpselet-store-install:start -->");
      expect(content).toContain(localizedLabels[index][0]);
      expect(content).toContain(localizedLabels[index][1]);
      expect(content).toContain(
        "chromewebstore.google.com/detail/glimpselet/example",
      );
      expect(content).toContain(
        "microsoftedge.microsoft.com/addons/detail/glimpselet/example",
      );
      expect(content).not.toMatch(
        new RegExp(`^[ \\t]*>.*${WARNING_MARKER.source}`, "im"),
      );
      const advancedStart = content.indexOf("###");
      const advancedEnd = content.indexOf("\n## ", advancedStart);
      const advanced = content.slice(advancedStart, advancedEnd);
      expect(advanced).toContain("~/.glimpselet/extension");
      expect(advanced).toContain("chrome://extensions");
      expect(content.slice(0, advancedStart)).not.toContain("Load unpacked");
      expect(content.slice(0, advancedStart)).not.toContain("37115");
      expect(content.slice(0, advancedStart)).toContain("3.");
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
